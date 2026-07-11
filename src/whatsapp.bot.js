import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth } = pkg;
import { MongoStore } from 'wwebjs-mongo';
import mongoose from 'mongoose';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { getAINews } from './news.service.js';
import { setQr, setStatus } from './qr.state.js';
import { logEvent } from './logger.service.js';

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

    // --- KODE PENCARI ID GRUP (SEMENTARA) ---
    try {
        console.log('Mencari daftar grup...');
        const chats = await client.getChats();
        
        // Memfilter agar hanya menampilkan obrolan grup
        const groups = chats.filter(chat => chat.isGroup);
        
        console.log('\n=== DAFTAR ID GRUP WHATSAPP ===');
        groups.forEach((group, index) => {
            console.log(`${index + 1}. Nama Grup: "${group.name}"`);
            console.log(`   ID Grup  : ${group.id._serialized}`);
            console.log('-------------------------------');
        });
        console.log('===============================\n');
        
    } catch (error) {
        console.error('Gagal mengambil daftar grup:', error);
    }
    // --- AKHIR KODE PENCARI ID GRUP ---
});

  // Listener kecil untuk mengetahui ID saat diinvite ke grup baru
  client.on('message', async msg => {
    if (msg.body === '!groupinfo' && msg.author) {
      msg.reply(`ID Grup ini: ${msg.from}`);
    }
  });

  console.log('[WhatsAppBot] Memulai inisialisasi Client...');
  await client.initialize();
  return client;
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
