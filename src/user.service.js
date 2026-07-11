import { UserProfile } from './user.model.js';

const MAX_NOTES = 15;

/**
 * Ambil profil pengguna (nickname + fakta durable lain). Tidak pernah null -
 * kalau belum ada, dianggap profil kosong.
 * @param {string} userId Telegram user id
 */
export async function getProfile(userId) {
  const doc = await UserProfile.findById(String(userId));
  return {
    nickname: doc?.nickname || null,
    notes: doc?.notes || []
  };
}

/**
 * Pastikan dokumen profil ada & username Telegram-nya up to date.
 * Dipanggil tiap pesan masuk supaya profil selalu tercatat sejak interaksi pertama.
 */
export async function ensureProfile(userId, telegramUsername) {
  await UserProfile.updateOne(
    { _id: String(userId) },
    { $set: { telegramUsername: telegramUsername || null, updatedAt: new Date() }, $setOnInsert: { _id: String(userId) } },
    { upsert: true }
  );
}

/**
 * Simpan/ubah nama panggilan yang diminta user sendiri.
 */
export async function setNickname(userId, nickname) {
  await UserProfile.updateOne(
    { _id: String(userId) },
    { $set: { nickname: nickname.trim().slice(0, 50), updatedAt: new Date() } },
    { upsert: true }
  );
}

/**
 * Tambah satu fakta durable tentang user (mis. preferensi, konteks penting).
 * Dibatasi MAX_NOTES terbaru supaya tidak membengkak tak terbatas.
 */
export async function addNote(userId, note) {
  const trimmed = note.trim().slice(0, 200);
  if (!trimmed) return;
  await UserProfile.updateOne(
    { _id: String(userId) },
    {
      $push: { notes: { $each: [trimmed], $slice: -MAX_NOTES } },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );
}
