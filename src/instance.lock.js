import mongoose from 'mongoose';
import crypto from 'crypto';

// Mencegah DUA instance aktif bersamaan (mis. saat Railway redeploy dan
// container lama+baru sempat overlap). Tanpa ini, dua instance akan
// berebut sesi WhatsApp yang sama (WA menendang salah satu -> kunci
// enkripsi desync) dan berebut polling Telegram yang sama (409 Conflict).
//
// Mekanisme: satu dokumen lock di Mongo, dipegang oleh holderId (acak per
// proses) dengan heartbeat berkala. Instance lain hanya boleh mengambil alih
// kalau heartbeat pemegang lock sudah basi (dianggap mati).
const HEARTBEAT_MS = 10000;
const STALE_AFTER_MS = 30000; // 3x heartbeat -> dianggap instance lama sudah mati
const holderId = crypto.randomUUID();

let heartbeatTimer = null;

function coll() {
  return mongoose.connection.db.collection('instance_lock');
}

/**
 * Coba ambil lock singleton. Return true kalau berhasil (boleh start bot),
 * false kalau instance lain masih hidup memegangnya.
 */
async function tryAcquire() {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_AFTER_MS);

  try {
    const result = await coll().findOneAndUpdate(
      {
        _id: 'singleton',
        $or: [{ holderId }, { heartbeatAt: { $lt: staleThreshold } }, { holderId: { $exists: false } }]
      },
      { $set: { holderId, heartbeatAt: now } },
      { upsert: true, returnDocument: 'after' }
    );

    return result?.holderId === holderId;
  } catch (err) {
    // E11000: filter di atas tidak match dokumen yang sudah ada (dipegang
    // instance lain & belum basi), tapi Mongo tetap coba upsert-insert dan
    // bentrok dengan _id yang sudah dipakai. Ini bukan error fatal - artinya
    // memang instance lain masih pegang lock, jadi anggap gagal ambil.
    if (err.code === 11000) return false;
    throw err;
  }
}

/**
 * Tunggu sampai lock berhasil diambil (retry berkala), lalu mulai heartbeat.
 * Dipanggil sekali di awal boot sebelum menyalakan Telegram/WhatsApp.
 * @param {(attempt: number) => void} [onWaiting] callback tiap kali gagal ambil lock
 */
export async function acquireLockOrWait(onWaiting) {
  let attempt = 0;
  while (!(await tryAcquire())) {
    attempt++;
    onWaiting?.(attempt);
    await new Promise((r) => setTimeout(r, 5000));
  }

  heartbeatTimer = setInterval(async () => {
    try {
      await coll().updateOne({ _id: 'singleton', holderId }, { $set: { heartbeatAt: new Date() } });
    } catch {
      // Kegagalan heartbeat sesaat tidak fatal - siklus berikutnya akan coba lagi.
    }
  }, HEARTBEAT_MS);
}

/** Lepas lock secara eksplisit (dipanggil saat proses akan berhenti). */
export async function releaseLock() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  try {
    await coll().deleteOne({ _id: 'singleton', holderId });
  } catch {
    // Kalau gagal, lock akan otomatis dianggap basi setelah STALE_AFTER_MS.
  }
}
