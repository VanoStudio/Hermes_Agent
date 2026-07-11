import 'dotenv/config';
import mongoose from 'mongoose';
import { initTelegramBot } from './telegram.bot.js';
import { initWhatsAppBot } from './whatsapp.bot.js';
import { startServer } from './server.js';

console.log('=============================================');
console.log('🚀 Hermes Agent - Dual Bot is booting up');
console.log('=============================================');

async function bootstrap() {
  // Jalankan server HTTP terlebih dahulu (untuk /qr, /status, /logs, /health)
  // agar tetap bisa diakses walau MongoDB/WhatsApp belum siap.
  startServer();

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    console.warn('⚠️ [Init] MONGODB_URI tidak ditemukan. Proses tetap berjalan tapi bot WA mungkin gagal.');
  } else {
    try {
      console.log('🗄️ [Init] Menghubungkan ke MongoDB Atlas...');
      await mongoose.connect(MONGODB_URI, {
        serverApi: {
          version: '1',
          strict: true,
          deprecationErrors: true,
        }
      });
      console.log('✅ [Init] MongoDB berhasil terhubung.');
    } catch (error) {
      console.error('❌ [Init] Gagal menghubungkan ke MongoDB:', error.message);
      process.exit(1);
    }
  }

  // Inisialisasi Bot secara paralel tanpa saling memblokir (Non-Blocking)
  console.log('🤖 [Init] Memulai layanan Telegram dan WhatsApp secara paralel...');
  
  Promise.all([
    initTelegramBot(),
    initWhatsAppBot()
  ]).then(() => {
    console.log('🌟 [Init] Semua bot berhasil diinisialisasi.');
  }).catch(err => {
    console.error('❌ [Init] Terjadi kesalahan saat inisialisasi bot:', err);
  });
}

// Menangkap rejeksi promise yang tidak ditangani agar container tidak crash
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

// Menangkap exception tak tertangani dari dependency pihak ketiga (mis. stream
// error internal whatsapp-web.js/wwebjs-mongo) supaya proses tidak langsung mati
// dan memicu restart-loop Chromium yang menghabiskan memori container.
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

bootstrap();
