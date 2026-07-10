import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth } = pkg;
import { MongoStore } from 'wwebjs-mongo';
import mongoose from 'mongoose';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { getAINews } from './news.service.js';

export async function initWhatsAppBot() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.warn('[WhatsAppBot] MONGODB_URI missing. WhatsApp service is disabled.');
    return null;
  }

  // Wwebjs-mongo membutuhkan koneksi mongoose yang sudah terbuka
  const store = new MongoStore({ mongoose: mongoose });

  const client = new Client({
    authStrategy: new RemoteAuth({
        store: store,
        backupSyncIntervalMs: 300000
    }),
    // TAMBAHKAN BLOK PUPPETEER INI:
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

  client.on('qr', (qr) => {
    console.log('\n[WhatsAppBot] KODE QR WHATSAPP DIBUTUHKAN!');
    console.log('Tolong scan kode QR di bawah ini dalam waktu 30 detik:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('remote_session_saved', () => {
    console.log('[WhatsAppBot] Sesi telah diamankan di MongoDB (RemoteAuth).');
  });

  client.on('ready', async () => {
    console.log('Bot WhatsApp berhasil terhubung!');

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
