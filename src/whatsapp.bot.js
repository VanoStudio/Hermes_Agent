import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import mongoose from 'mongoose';
import cron from 'node-cron';
import { getAINews, attachFullText } from './news.service.js';
import { summarizeNewsArticles } from './ai.service.js';
import { setQr, setStatus } from './qr.state.js';
import { logEvent } from './logger.service.js';
import { setClient } from './wa.state.js';
import { Group } from './group.model.js';
import { useMongoAuthState } from './wa.mongo.auth.js';
import { chunkText } from './message.util.js';

// Logger senyap untuk Baileys - hemat memori & tidak membanjiri log Railway.
const logger = pino({ level: 'silent' });

let broadcastScheduled = false;

export async function initWhatsAppBot() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.warn('[WhatsAppBot] MONGODB_URI missing. WhatsApp service is disabled.');
    return null;
  }

  // Auth-state disimpan di MongoDB (koleksi wa_auth) supaya sesi awet lintas restart.
  const authColl = mongoose.connection.db.collection('wa_auth');
  const { state, saveCreds, clearState } = await useMongoAuthState(authColl);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[WhatsAppBot] Baileys pakai WA version ${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false, // QR ditampilkan lewat endpoint /qr sebagai gambar
    syncFullHistory: false,   // tidak perlu sync seluruh riwayat -> jauh lebih ringan
    markOnlineOnConnect: false,
    browser: ['Hermes Agent', 'Chrome', '1.0.0']
  });

  setClient(sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      setQr(qr);
      logEvent('whatsapp', 'qr', 'QR baru digenerate. Buka /qr di URL Railway untuk scan.');
    }

    if (connection === 'open') {
      setStatus('ready');
      logEvent('whatsapp', 'ready', 'Bot WhatsApp (Baileys) berhasil terhubung!');
      // Sekali terhubung, isi registry grup langsung (ringan, tanpa browser).
      refreshGroups(sock).catch(() => {});
      if (!broadcastScheduled) {
        scheduleDailyBroadcast(sock);
        broadcastScheduled = true;
      }
    }

    if (connection === 'connecting') {
      setStatus('connecting');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      setStatus(loggedOut ? 'logged_out' : 'disconnected');
      logEvent('whatsapp', 'disconnected', `Koneksi tertutup (code=${statusCode}, loggedOut=${loggedOut})`, 'warn');

      if (loggedOut) {
        // Sesi tidak valid lagi -> bersihkan state supaya deploy berikutnya
        // memunculkan QR baru untuk scan ulang.
        await clearState().catch(() => {});
        logEvent('whatsapp', 'logged_out', 'Sesi dihapus. Perlu scan QR ulang di /qr.', 'warn');
      } else {
        // Gangguan sementara -> reconnect.
        logEvent('whatsapp', 'reconnect', 'Mencoba menyambung ulang...', 'info');
        setTimeout(() => initWhatsAppBot().catch((e) => console.error('[WhatsAppBot] Reconnect gagal:', e.message)), 3000);
      }
    }
  });

  // Tangkap grup secara pasif + tangani perintah !groupinfo.
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      const from = msg.key?.remoteJid;
      if (!from || !from.endsWith('@g.us')) continue;

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';

      if (body.trim() === '!groupinfo') {
        try {
          await sock.sendMessage(from, { text: `ID Grup ini: ${from}` });
          logEvent('whatsapp', 'groupinfo', `Balas !groupinfo untuk ${from}`);
        } catch (err) {
          logEvent('whatsapp', 'groupinfo', 'Gagal balas !groupinfo: ' + err.message, 'warn');
        }
      }

      // Simpan grup ke registry. ID gratis dari remoteJid; nama grup diisi
      // oleh refreshGroups() (punya subject), jadi di sini cukup pastikan ada.
      try {
        await Group.updateOne(
          { _id: from },
          { $set: { updatedAt: new Date() }, $setOnInsert: { _id: from } },
          { upsert: true }
        );
      } catch (err) {
        logEvent('whatsapp', 'group_upsert', 'Gagal simpan grup: ' + err.message, 'warn');
      }
    }
  });

  console.log('[WhatsAppBot] Inisialisasi Baileys selesai, menunggu koneksi...');
  return sock;
}

/**
 * Ambil semua grup yang diikuti langsung dari server WhatsApp (ringan, tanpa
 * browser) dan simpan nama + ID-nya ke MongoDB. Baileys menyediakan ini native.
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @returns {Promise<number>} jumlah grup yang tersimpan
 */
export async function refreshGroups(sock) {
  const groups = await sock.groupFetchAllParticipating();
  const entries = Object.values(groups || {});
  await Promise.all(
    entries.map((g) =>
      Group.updateOne(
        { _id: g.id },
        { $set: { name: g.subject || '', updatedAt: new Date() }, $setOnInsert: { _id: g.id } },
        { upsert: true }
      )
    )
  );
  logEvent('whatsapp', 'groups_refreshed', `Registry grup diperbarui: ${entries.length} grup.`);
  return entries.length;
}

const WA_DAILY_NEWS_COUNT = 3;

/**
 * CronJob broadcast berita teknologi & AI harian ke WA_GROUP_ID (08:00 WIB),
 * ringkasan 2-3 paragraf per berita berdasarkan isi artikel penuh.
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 */
function scheduleDailyBroadcast(sock) {
  const WA_GROUP_ID = process.env.WA_GROUP_ID;
  if (!WA_GROUP_ID) {
    console.warn('[WhatsAppBot] WA_GROUP_ID tidak ada. Broadcast harian dinonaktifkan.');
    return;
  }

  console.log(`[WhatsAppBot] Cron Broadcast aktif untuk grup: ${WA_GROUP_ID} (08:00 WIB)`);
  cron.schedule('0 8 * * *', async () => {
    console.log('[WhatsAppBot] Cron: menyiapkan ringkasan berita AI/teknologi...');
    try {
      const newsList = await getAINews(WA_DAILY_NEWS_COUNT);
      let body;
      if (newsList.length === 0) {
        body = '⚠️ Tidak ada berita AI/teknologi terbaru hari ini.';
      } else {
        const enriched = await attachFullText(newsList);
        body = await summarizeNewsArticles(enriched);
      }

      const greeting = `🤖 *Hermes Daily Tech & AI Briefing*\nSelamat Pagi! Berikut ${newsList.length} berita teknologi & AI hari ini:\n\n`;
      for (const chunk of chunkText(greeting + body, 4000)) {
        await sock.sendMessage(WA_GROUP_ID, { text: chunk });
      }
      logEvent('whatsapp', 'broadcast', 'Broadcast harian terkirim.');
    } catch (error) {
      logEvent('whatsapp', 'broadcast', 'Broadcast gagal: ' + error.message, 'error');
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });
}
