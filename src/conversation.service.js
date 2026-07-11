import { Conversation } from './conversation.model.js';

// Berapa banyak pesan terakhir (gabungan user+assistant) yang diikutkan
// sebagai konteks ke AI. Cukup besar untuk percakapan wajar, cukup kecil
// supaya tetap hemat token di model gratis (ada rate limit harian).
const HISTORY_LIMIT = 20;

/**
 * Ambil riwayat percakapan terakhir untuk sebuah chat, urut dari lama ke baru.
 * @param {string} chatId
 * @returns {Promise<Array<{role: 'user'|'assistant', content: string}>>}
 */
export async function getRecentHistory(chatId) {
  const docs = await Conversation.find({ chatId: String(chatId) })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT);
  return docs.reverse().map((d) => ({ role: d.role, content: d.content }));
}

/**
 * Simpan satu giliran percakapan (user atau assistant) dan pangkas riwayat
 * lama supaya koleksi tidak terus membengkak.
 * @param {string} chatId
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
export async function saveMessage(chatId, role, content) {
  await Conversation.create({ chatId: String(chatId), role, content });

  const excess = await Conversation.find({ chatId: String(chatId) })
    .sort({ createdAt: -1 })
    .skip(HISTORY_LIMIT)
    .select('_id');
  if (excess.length > 0) {
    await Conversation.deleteMany({ _id: { $in: excess.map((d) => d._id) } });
  }
}
