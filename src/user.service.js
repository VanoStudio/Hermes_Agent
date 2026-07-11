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
    assistantName: doc?.assistantName || null,
    notes: doc?.notes || []
  };
}

/**
 * Pastikan dokumen profil ada & username Telegram-nya up to date, SEKALIGUS
 * kembalikan profil terkini - digabung jadi satu round-trip Mongo (bukan
 * ensureProfile lalu getProfile terpisah) supaya tiap pesan masuk lebih cepat.
 * @returns {Promise<{nickname: string|null, assistantName: string|null, notes: string[]}>}
 */
export async function ensureProfile(userId, telegramUsername) {
  const doc = await UserProfile.findOneAndUpdate(
    { _id: String(userId) },
    { $set: { telegramUsername: telegramUsername || null, updatedAt: new Date() }, $setOnInsert: { _id: String(userId) } },
    { upsert: true, new: true }
  );
  return {
    nickname: doc?.nickname || null,
    assistantName: doc?.assistantName || null,
    notes: doc?.notes || []
  };
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
 * Simpan/ubah nama panggilan AI ini KHUSUS untuk user tersebut (tidak
 * mempengaruhi user lain sama sekali - tiap orang bisa kasih nama beda).
 */
export async function setAssistantName(userId, name) {
  await UserProfile.updateOne(
    { _id: String(userId) },
    { $set: { assistantName: name.trim().slice(0, 50), updatedAt: new Date() } },
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
