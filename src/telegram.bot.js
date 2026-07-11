import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';
import { processMessageWithAI, summarizeNewsArticles } from './ai.service.js';
import { addCalendarEvent } from './google.service.js';
import { getGlobalNews, attachFullText } from './news.service.js';
import { getRecentHistory, saveMessage } from './conversation.service.js';
import { getProfile, ensureProfile, setNickname, setAssistantName, addNote } from './user.service.js';
import { UserProfile } from './user.model.js';
import { sendLongTelegramMessage } from './message.util.js';
import { logEvent } from './logger.service.js';

const DAILY_NEWS_COUNT = 5;

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
      const aiName = profile.assistantName || 'Hermes';
      bot.sendMessage(chatId, `Halo ${greetName}! Saya ${aiName}, AI assistant Anda. Ada yang bisa saya bantu?`);
      return;
    }

    try {
      bot.sendChatAction(chatId, 'typing');

      // 0. Ambil profil permanen (nickname, nama AI, dll) + riwayat percakapan -
      // keduanya dikunci per userId, jadi tiap orang punya "otak" sendiri-sendiri.
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
          finalResponse = await buildGlobalNewsDigest(DAILY_NEWS_COUNT);
          break;
        }
      }

      // 3. Kirim Hasil (dipecah otomatis kalau kepanjangan buat Telegram)
      await sendLongTelegramMessage(bot, chatId, finalResponse);

      // 4. Simpan giliran percakapan ini supaya jadi konteks pesan berikutnya
      await saveMessage(userId, 'user', text);
      await saveMessage(userId, 'assistant', finalResponse);

      // 5. Kalau AI mendeteksi fakta permanen baru, simpan ke profil.
      // nickname = nama UNTUK user, assistantName = nama untuk AI (khusus user ini saja).
      if (toolCall.profileUpdate?.nickname) {
        await setNickname(userId, toolCall.profileUpdate.nickname);
      }
      if (toolCall.profileUpdate?.assistantName) {
        await setAssistantName(userId, toolCall.profileUpdate.assistantName);
      }
      if (toolCall.profileUpdate?.note) {
        await addNote(userId, toolCall.profileUpdate.note);
      }

    } catch (error) {
      console.error('[TelegramBot Error]', error.message);
      bot.sendMessage(chatId, '⚠️ Terjadi kesalahan internal saat memproses pesan Anda.');
    }
  });

  scheduleDailyDigest(bot);

  return bot;
}

/**
 * Ambil top-N berita global dan buat ringkasan mendalam (2-3 paragraf/item)
 * berdasarkan isi artikel penuh. Dipakai untuk permintaan on-demand maupun
 * broadcast harian, supaya hasilnya konsisten substantif.
 * @param {number} count
 * @returns {Promise<string>}
 */
async function buildGlobalNewsDigest(count) {
  const newsList = await getGlobalNews(count);
  if (newsList.length === 0) {
    return '⚠️ Gagal mengambil berita saat ini. Silakan coba lagi nanti.';
  }
  const enriched = await attachFullText(newsList);
  const header = `📰 *Ringkasan ${enriched.length} Berita Global Teratas*\n\n`;
  const body = await summarizeNewsArticles(enriched);
  return header + body;
}

/**
 * CronJob broadcast harian jam 08:00 WIB - kirim ringkasan 5 berita global
 * ke SEMUA user yang pernah terdaftar (personal daily briefing per user).
 * Kegagalan pada satu user (mis. belum pernah /start di chat pribadi,
 * sehingga Telegram menolak pesan proaktif) tidak menggagalkan user lain.
 * @param {import('node-telegram-bot-api')} bot
 */
function scheduleDailyDigest(bot) {
  console.log('[TelegramBot] Cron digest harian aktif (08:00 WIB, ke semua user terdaftar).');
  cron.schedule('0 8 * * *', async () => {
    console.log('[TelegramBot] Cron: menyiapkan digest berita harian...');
    let digest;
    try {
      digest = await buildGlobalNewsDigest(DAILY_NEWS_COUNT);
    } catch (error) {
      logEvent('telegram', 'digest_build_failed', error.message, 'error');
      return;
    }

    const users = await UserProfile.find().select('_id');
    let sent = 0, failed = 0;
    for (const u of users) {
      try {
        await sendLongTelegramMessage(bot, u._id, digest);
        sent++;
      } catch (error) {
        failed++;
        console.warn(`[TelegramBot] Gagal kirim digest ke user ${u._id}:`, error.message);
      }
    }
    logEvent('telegram', 'digest_sent', `Digest harian terkirim ke ${sent} user (gagal: ${failed}).`);
  }, { scheduled: true, timezone: 'Asia/Jakarta' });
}
