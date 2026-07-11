// Telegram membatasi pesan maks ~4096 karakter. Ringkasan berita 2-3 paragraf
// per item (apalagi 5 item) gampang melebihi itu, jadi kita pecah per batas
// paragraf (bukan potong di tengah kalimat) supaya tetap enak dibaca.
const DEFAULT_MAX_CHARS = 3500;

/**
 * Pecah teks panjang jadi beberapa bagian, dipotong di batas baris kosong
 * (antar paragraf/antar item) kalau memungkinkan, bukan sembarang tempat.
 * @param {string} text
 * @param {number} [maxChars]
 * @returns {string[]}
 */
export function chunkText(text, maxChars = DEFAULT_MAX_CHARS) {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const p of paragraphs) {
    const candidate = current ? `${current}\n\n${p}` : p;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = p;
    } else if (candidate.length > maxChars) {
      // Satu paragraf saja sudah melebihi batas -> potong paksa.
      chunks.push(candidate.slice(0, maxChars));
      current = candidate.slice(maxChars);
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Kirim satu chunk pesan. Coba dengan format Markdown dulu (rapi buat teks
 * biasa); kalau Telegram menolak karena parsing entitas gagal (khas terjadi
 * saat isi pesan ada kode - underscore/asterisk di kode dianggap format oleh
 * parser Markdown lama Telegram, lalu SELURUH pesan ditolak), kirim ulang
 * sebagai teks polos supaya isi tetap sampai walau tanpa format tebal/miring.
 * @param {import('node-telegram-bot-api')} bot
 * @param {number|string} chatId
 * @param {string} chunk
 */
async function sendChunkSafely(bot, chatId, chunk) {
  try {
    await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
  } catch (err) {
    const isParseError = err.response?.body?.description?.includes("can't parse entities");
    if (!isParseError) throw err;
    console.warn('[Telegram] Markdown gagal di-parse (kemungkinan isi pesan ada kode), kirim ulang sebagai teks polos.');
    await bot.sendMessage(chatId, chunk); // tanpa parse_mode = teks apa adanya, tidak pernah ditolak Telegram
  }
}

/**
 * Kirim teks panjang ke Telegram sebagai beberapa pesan berurutan kalau perlu.
 * @param {import('node-telegram-bot-api')} bot
 * @param {number|string} chatId
 * @param {string} text
 */
export async function sendLongTelegramMessage(bot, chatId, text) {
  const chunks = chunkText(text, 3500);
  for (const chunk of chunks) {
    await sendChunkSafely(bot, chatId, chunk);
  }
}
