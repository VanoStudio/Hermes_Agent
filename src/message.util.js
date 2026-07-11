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
 * Kirim teks panjang ke Telegram sebagai beberapa pesan berurutan kalau perlu.
 * @param {import('node-telegram-bot-api')} bot
 * @param {number|string} chatId
 * @param {string} text
 */
export async function sendLongTelegramMessage(bot, chatId, text) {
  const chunks = chunkText(text, 3500);
  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
  }
}
