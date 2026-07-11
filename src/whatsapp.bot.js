import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth } = pkg;
import { MongoStore } from 'wwebjs-mongo';
import mongoose from 'mongoose';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { getAINews } from './news.service.js';
import { setQr, setStatus } from './qr.state.js';
import { logEvent } from './logger.service.js';
import { setClient } from './wa.state.js';
import { Group } from './group.model.js';

export async function initWhatsAppBot() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.warn('[WhatsAppBot] MONGODB_URI missing. WhatsApp service is disabled.');
    return null;
  }

  // Wwebjs-mongo membutuhkan koneksi mongoose yang sudah terbuka
  const store = new MongoStore({ mongoose: mongoose });

  const puppeteerConfig = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      // NOTE: '--single-process' sengaja dihapus - flag ini sering menyebabkan
      // Chromium crash di container Railway sebelum event 'qr' sempat muncul.
      // Flag di bawah ini mematikan fitur Chromium yang tidak dipakai bot,
      // supaya jejak memorinya lebih kecil di container Railway.
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--mute-audio',
      '--no-default-browser-check'
    ]
  };

  // Gunakan Chromium bawaan OS (diinstall via apt di Dockerfile)
  // Fallback: cek ENV, lalu cek path default Debian
  const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
  puppeteerConfig.executablePath = chromiumPath;
  // Naikkan batas waktu protokol CDP (default Puppeteer bisa kepotong duluan
  // di CPU Railway yang terbatas, terutama saat evaluate berat seperti getChats()).
  puppeteerConfig.protocolTimeout = 180000; // 3 menit
  console.log(`[WhatsAppBot] Menggunakan Chromium di: ${chromiumPath}`);

  const client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000, // Sinkronisasi setiap 5 menit
      // KRUSIAL: wwebjs-mongo (MongoStore.save) membaca file zip session
      // dari path relatif ke process.cwd() ("RemoteAuth.zip"), sedangkan
      // whatsapp-web.js (RemoteAuth) menulisnya ke `${dataPath}/RemoteAuth.zip`.
      // Kalau dataPath dibiarkan default ('./.wwebjs_auth/'), kedua path itu
      // tidak pernah cocok -> ENOENT saat backup pertama -> proses crash.
      // Set dataPath ke root project supaya keduanya menunjuk file yang sama.
      dataPath: '.'
    }),
    puppeteer: puppeteerConfig
  });

  client.on('qr', (qr) => {
    setQr(qr);
    logEvent('whatsapp', 'qr', 'QR code baru digenerate. Buka endpoint /qr di URL Railway untuk scan.');
    // ASCII QR di console cuma berguna untuk dev lokal - di production (Railway)
    // karakter blok Unicode-nya sering rusak di log viewer, jadi dimatikan.
    if (process.env.NODE_ENV !== 'production') {
      qrcode.generate(qr, { small: true });
    }
  });

  client.on('authenticated', () => {
    setStatus('authenticated');
    logEvent('whatsapp', 'authenticated', 'Autentikasi berhasil, menunggu client siap.');
  });

  client.on('auth_failure', (msg) => {
    setStatus('auth_failure');
    logEvent('whatsapp', 'auth_failure', msg, 'error');
  });

  client.on('disconnected', (reason) => {
    setStatus('disconnected');
    logEvent('whatsapp', 'disconnected', reason, 'warn');
  });

  client.on('remote_session_saved', () => {
    logEvent('whatsapp', 'remote_session_saved', 'Sesi telah diamankan di MongoDB (RemoteAuth).');
  });

  client.on('ready', async () => {
    setStatus('ready');
    logEvent('whatsapp', 'ready', 'Bot WhatsApp berhasil terhubung!');
    // Daftar grup tidak lagi di-fetch otomatis di sini (berat & rawan timeout
    // tepat setelah reconnect). Ambil kapan saja lewat endpoint GET /groups.
  });

  // Tangkap grup secara PASIF dari setiap pesan grup dan simpan ke MongoDB.
  // Pola ini jauh lebih andal daripada scan browser (getChats/evaluate massal)
  // yang gampang timeout di Railway: kita cuma menumpang event yang memang
  // sudah dikirim WA Web saat halaman sempat, tanpa memaksa scan saat sibuk.
  // msg.from sudah berisi JID grup secara gratis (tanpa panggilan ke browser).
  client.on('message_create', async msg => {
    const from = msg.from;
    if (!from || !from.endsWith('@g.us')) return;

    // Balasan on-demand: ketik "!groupinfo" di grup target -> bot balas ID-nya.
    if (msg.body === '!groupinfo') {
      try {
        await msg.reply(`ID Grup ini: ${from}`);
      } catch (err) {
        logEvent('whatsapp', 'groupinfo', 'Gagal balas !groupinfo: ' + err.message, 'warn');
      }
    }

    try {
      // Simpan ID dulu (dijamin ada). Nama diisi best-effort lewat pembacaan
      // SATU chat saja (bukan scan semua) dan tanpa menyentuh groupMetadata.
      let name = await getGroupNameLight(client, from);
      await Group.updateOne(
        { _id: from },
        { $set: { updatedAt: new Date(), ...(name ? { name } : {}) }, $setOnInsert: { _id: from } },
        { upsert: true }
      );
    } catch (err) {
      // Jangan sampai gagal simpan grup mengganggu alur pesan lain.
      logEvent('whatsapp', 'group_upsert', 'Gagal simpan grup: ' + err.message, 'warn');
    }
  });

  setClient(client);

  console.log('[WhatsAppBot] Memulai inisialisasi Client...');
  await client.initialize();
  return client;
}

/**
 * Membaca nama SATU grup langsung dari Store WhatsApp Web (bukan scan semua chat),
 * tanpa menyentuh groupMetadata (yang lazy & memicu request jaringan berat).
 * Dibungkus race timeout pendek supaya kalau halaman lagi sibuk, kita tidak
 * menggantung - cukup kembalikan null dan pakai ID saja.
 * @param {import('whatsapp-web.js').Client} client
 * @param {string} groupId JID grup, contoh: xxxx@g.us
 * @returns {Promise<string|null>}
 */
async function getGroupNameLight(client, groupId) {
  if (!client.pupPage) return null;
  try {
    return await Promise.race([
      client.pupPage.evaluate((gid) => {
        try {
          const Store = window.require('WAWebCollections');
          const wid = window.require('WAWebWidFactory').createWid(gid);
          const chat = Store.Chat.get(wid);
          if (!chat) return null;
          return chat.formattedTitle || chat.name || null;
        } catch (e) {
          return null;
        }
      }, groupId),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000))
    ]);
  } catch (e) {
    return null;
  }
}

/**
 * Setup CronJob untuk Broadcast Berita Harian via WhatsApp
 * @param {Client} client 
 */
function scheduleDailyBroadcast(client) {
  const WA_GROUP_ID = process.env.WA_GROUP_ID;

  if (!WA_GROUP_ID) {
    console.warn('[WhatsAppBot] WA_GROUP_ID tidak ditemukan. Broadcast harian dinonaktifkan.');
    return;
  }

  console.log(`[WhatsAppBot] Cron Broadcast diaktifkan untuk grup: ${WA_GROUP_ID} (Jadwal: 08:00 WIB)`);

  // Jadwal setiap jam 08:00 (Waktu Server / UTC biasanya, perlu disesuaikan jika ingin timezone tertentu)
  // Untuk waktu Asia/Jakarta (WIB), asumsikan node-cron bisa set timezone
  cron.schedule('0 8 * * *', async () => {
    console.log('[WhatsAppBot] Cron Triggered: Memulai fetch berita AI untuk broadcast...');
    try {
      const newsList = await getAINews(2);
      
      let newsMsg = '';
      if (newsList.length > 0) {
        newsMsg = newsList.map((n, i) => `*${i+1}. ${n.title}*\n_${n.description}_\n🔗 ${n.url}`).join('\n\n');
      } else {
        newsMsg = '⚠️ Tidak ada berita AI terbaru hari ini.';
      }
      
      const greeting = `🤖 *Automated Hermes Broadcast*\nSelamat Pagi! Berikut ringkasan AI hari ini:\n\n`;
      const finalMsg = greeting + newsMsg;

      await client.sendMessage(WA_GROUP_ID, finalMsg);
      console.log('[WhatsAppBot] Broadcast Harian Berhasil Dikirim!');
    } catch (error) {
      console.error('[WhatsAppBot] Broadcast Gagal:', error.message);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Jakarta"
  });
}
