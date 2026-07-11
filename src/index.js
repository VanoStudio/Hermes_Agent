import 'dotenv/config';
import mongoose from 'mongoose';
import { initTelegramBot } from './telegram.bot.js';
import { initWhatsAppBot } from './whatsapp.bot.js';
import { startServer } from './server.js';
import { acquireLockOrWait, releaseLock } from './instance.lock.js';

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

  // KRUSIAL: pastikan hanya SATU instance yang pegang sesi WhatsApp & polling
  // Telegram. Kalau ada instance lain masih hidup (mis. overlap saat Railway
  // redeploy), tunggu di sini - JANGAN start bot dulu. Tanpa ini, dua instance
  // akan berebut sesi WA (kunci enkripsi desync) dan polling Telegram (409).
  if (MONGODB_URI) {
    console.log('🔒 [Init] Menunggu giliran jadi instance aktif (leader lock)...');
    await acquireLockOrWait((attempt) => {
      console.log(`⏳ [Init] Instance lain masih aktif, menunggu... (percobaan ke-${attempt})`);
    });
    console.log('✅ [Init] Lock didapat, instance ini yang aktif.');
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

// Saat Railway mengirim sinyal berhenti (mis. sebelum redeploy), lepas lock
// segera supaya instance BARU tidak perlu menunggu sampai lock basi (30 detik).
async function gracefulShutdown(signal) {
  console.log(`[Init] Menerima ${signal}, melepas lock instance...`);
  await releaseLock().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Menangkap rejeksi promise yang tidak ditangani agar container tidak crash
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

// Menangkap exception tak tertangani dari dependency pihak ketiga supaya
// proses tidak langsung mati dan memicu restart-loop di container.
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

bootstrap();
