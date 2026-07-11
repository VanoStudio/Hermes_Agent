// Membuat interaksi bot terasa "hidup" selama proses panjang, supaya user
// tidak mengira bot diam/macet ketika sebenarnya masih bekerja.

const TYPING_REFRESH_MS = 4000; // indikator "mengetik..." Telegram hilang ~5s kalau tidak di-refresh

/**
 * Jaga indikator "mengetik..." tetap hidup selama proses berjalan.
 * @param {import('node-telegram-bot-api')} bot
 * @param {number|string} chatId
 * @returns {() => void} panggil untuk menghentikan
 */
export function startTypingLoop(bot, chatId) {
  let active = true;
  const tick = () => {
    if (active) bot.sendChatAction(chatId, 'typing').catch(() => {});
  };
  tick();
  const interval = setInterval(tick, TYPING_REFRESH_MS);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

/**
 * Kirim pesan status sementara yang bisa di-update/dihapus - dipakai untuk
 * kasih tahu user progres tugas panjang (mis. "mengambil berita...",
 * "meringkas dengan AI...") tanpa membanjiri chat dengan banyak pesan baru.
 * @param {import('node-telegram-bot-api')} bot
 * @param {number|string} chatId
 * @param {string} text
 */
export async function sendStatusMessage(bot, chatId, text) {
  const msg = await bot.sendMessage(chatId, text);
  return {
    async update(newText) {
      try {
        await bot.editMessageText(newText, { chat_id: chatId, message_id: msg.message_id });
      } catch {
        // Gagal edit (mis. isi sama persis, atau pesan sudah lama) - tidak fatal, abaikan.
      }
    },
    async remove() {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
      } catch {
        // Pesan mungkin sudah terhapus/kadaluarsa - tidak fatal, abaikan.
      }
    }
  };
}
