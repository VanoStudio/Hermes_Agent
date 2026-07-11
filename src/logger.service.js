import mongoose from 'mongoose';
import { Log } from './log.model.js';

// Mencatat event ke console DAN ke MongoDB (kalau koneksi Mongo sedang tersedia),
// supaya riwayat status bot tidak hilang saat log Railway rotate/restart.
export async function logEvent(source, event, message, level = 'info') {
  const line = `[${source}] ${event}: ${message ?? ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  if (mongoose.connection.readyState !== 1) return; // belum konek, skip simpan ke DB

  try {
    await Log.create({ source, event, message, level });
  } catch (err) {
    console.error('[Logger] Gagal menyimpan log ke MongoDB:', err.message);
  }
}
