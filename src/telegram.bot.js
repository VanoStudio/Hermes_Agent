import TelegramBot from 'node-telegram-bot-api';
import { processMessageWithAI } from './ai.service.js';
import { addCalendarEvent } from './google.service.js';
import { getGlobalNews } from './news.service.js';
import { getRecentHistory, saveMessage } from './conversation.service.js';
import { getProfile, ensureProfile, setNickname, addNote } from './user.service.js';

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
    const chatId = msg.chat.id;   // ke mana balasan dikirim
    const userId = msg.from.id;   // SIAPA yang bicara - identitas unik per orang,
                                   // dipakai untuk profil & riwayat supaya tidak
                                   // bercampur antar pengguna (mis. kalau dipakai di grup).
    const text = msg.text;
    const username = msg.from.username || msg.from.first_name || 'User';

    if (!text) return;

    await ensureProfile(userId, msg.from.username || null);

    if (text.startsWith('/start')) {
      const profile = await getProfile(userId);
      const greetName = profile.nickname || username;
      bot.sendMessage(chatId, `Halo ${greetName}! Saya Hermes, AI assistant Anda. Ada yang bisa saya bantu?`);
      return;
    }

    try {
      bot.sendChatAction(chatId, 'typing');

      // 0. Ambil profil permanen (nickname dll) + riwayat percakapan - keduanya
      // dikunci per userId, jadi tiap orang punya "otak" sendiri-sendiri.
      const profile = await getProfile(userId);
      const history = await getRecentHistory(userId);

      // 1. Dapatkan Tool Call JSON dari AI
      const toolCall = await processMessageWithAI(text, history, profile);
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
      await saveMessage(userId, 'user', text);
      await saveMessage(userId, 'assistant', finalResponse);

      // 5. Kalau AI mendeteksi fakta permanen baru (mis. nama panggilan), simpan ke profil
      if (toolCall.profileUpdate?.nickname) {
        await setNickname(userId, toolCall.profileUpdate.nickname);
      }
      if (toolCall.profileUpdate?.note) {
        await addNote(userId, toolCall.profileUpdate.note);
      }

    } catch (error) {
      console.error('[TelegramBot Error]', error.message);
      bot.sendMessage(chatId, '⚠️ Terjadi kesalahan internal saat memproses pesan Anda.');
    }
  });

  return bot;
}
