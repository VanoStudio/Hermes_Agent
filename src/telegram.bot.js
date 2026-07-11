import TelegramBot from 'node-telegram-bot-api';
import { processMessageWithAI } from './ai.service.js';
import { addCalendarEvent } from './google.service.js';
import { getGlobalNews } from './news.service.js';
import { getRecentHistory, saveMessage } from './conversation.service.js';

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN missing, Telegram service is disabled.');
    return;
  }

  // Polling mode lebih cocok di container tanpa mengekspos webhook
  const bot = new TelegramBot(token, { polling: true });
  console.log('[TelegramBot] Polling started successfully.');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const username = msg.from.username || msg.from.first_name || 'User';

    if (!text) return;

    if (text.startsWith('/start')) {
      bot.sendMessage(chatId, `Halo ${username}! Saya Hermes, AI assistant Anda. Ada yang bisa saya bantu?`);
      return;
    }

    try {
      bot.sendChatAction(chatId, 'typing');

      // 0. Ambil riwayat percakapan supaya AI tidak "amnesia" tiap pesan
      const history = await getRecentHistory(chatId);

      // 1. Dapatkan Tool Call JSON dari AI
      const toolCall = await processMessageWithAI(text, history);
      let finalResponse = toolCall.message;

      // 2. Eksekusi Tool (Aksi)
      switch (toolCall.action) {
        case 'calendar':
          finalResponse = await addCalendarEvent(toolCall.params);
          break;
        case 'news': {
          const newsList = await getGlobalNews(5);
          if (newsList.length === 0) {
            finalResponse = '⚠️ Gagal mengambil berita saat ini. Silakan coba lagi nanti.';
          } else {
            finalResponse = `📰 *Berita Global Terbaru*\n\n` + newsList.map((n, i) => `*${i+1}. ${n.title}*\n${n.description}\n🔗 [Baca di sini](${n.url})`).join('\n\n');
          }
          break;
        }
      }

      // 3. Kirim Hasil
      bot.sendMessage(chatId, finalResponse, { parse_mode: 'Markdown' });

      // 4. Simpan giliran percakapan ini supaya jadi konteks pesan berikutnya
      await saveMessage(chatId, 'user', text);
      await saveMessage(chatId, 'assistant', finalResponse);

    } catch (error) {
      console.error('[TelegramBot Error]', error.message);
      bot.sendMessage(chatId, '⚠️ Terjadi kesalahan internal saat memproses pesan Anda.');
    }
  });

  return bot;
}
