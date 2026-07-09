/**
 * ============================================================
 * TelegramService.gs — Telegram Bot API Wrapper
 * Hermes Agent | Google Apps Script
 * ============================================================
 */

/**
 * Mengirim pesan teks ke Telegram chat.
 * @param {string|number} chatId - Target chat ID.
 * @param {string} text - Pesan yang akan dikirim.
 * @param {object} [options] - Opsi tambahan (parse_mode, reply_markup, dll).
 * @returns {object} Respons Telegram API.
 */
function sendReply(chatId, text, options = {}) {
  const url = `${CONFIG.TELEGRAM_API_BASE}${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id:    chatId,
    text:       text,
    parse_mode: options.parse_mode || 'Markdown',
    ...options,
  };

  debugLog('TelegramService.sendReply', { chatId, textLength: text.length });

  return _callTelegramAPI(url, payload);
}

/**
 * Mengirim indikator "mengetik..." ke user.
 * @param {string|number} chatId
 */
function sendTyping(chatId) {
  const url = `${CONFIG.TELEGRAM_API_BASE}${CONFIG.TELEGRAM_BOT_TOKEN}/sendChatAction`;
  _callTelegramAPI(url, { chat_id: chatId, action: 'typing' });
}

/**
 * Mengirim pesan error yang terformat ke user.
 * @param {string|number} chatId
 * @param {string} errorMessage - Pesan error teknis.
 * @param {string} [context] - Konteks di mana error terjadi.
 */
function sendError(chatId, errorMessage, context) {
  const userFriendlyMsg =
    `⚠️ *Hermes mengalami kendala*\n\n` +
    `Maaf, terjadi kesalahan saat memproses permintaanmu.\n` +
    (CONFIG.DEBUG_MODE ? `\`${context}: ${errorMessage}\`` : 'Silakan coba lagi beberapa saat.') +
    `\n\n_Tim Hermes sudah diberitahu._`;

  sendReply(chatId, userFriendlyMsg);
}

/**
 * Mengirim pesan selamat datang / help.
 * @param {string|number} chatId
 * @param {string} firstName - Nama depan user.
 */
function sendWelcome(chatId, firstName) {
  const welcomeMsg =
    `👋 Halo, *${firstName || 'teman'}*! Saya *Hermes*, asisten AI-mu.\n\n` +
    `Berikut yang bisa saya bantu:\n` +
    `📅 *Kalender* — "Hermes, catat rapat besok jam 2 siang"\n` +
    `📰 *Berita* — "Cari berita teknologi hari ini"\n` +
    `💬 *Tanya Apa Saja* — Cukup ketik pertanyaanmu!\n\n` +
    `_Powered by OpenRouter & Google Apps Script_`;

  sendReply(chatId, welcomeMsg);
}

/**
 * Mengirim ringkasan event kalender yang berhasil dibuat.
 * @param {string|number} chatId
 * @param {object} eventDetails - Detail event yang dibuat.
 */
function sendCalendarConfirmation(chatId, eventDetails) {
  const msg =
    `✅ *Event berhasil ditambahkan!*\n\n` +
    `📌 *Judul:* ${eventDetails.title}\n` +
    `📅 *Tanggal:* ${eventDetails.date}\n` +
    `⏰ *Waktu:* ${eventDetails.time}\n` +
    `⏳ *Durasi:* ${eventDetails.duration} menit\n\n` +
    `[Lihat di Google Calendar](https://calendar.google.com)`;

  sendReply(chatId, msg);
}

// ─── Private Helper ────────────────────────────────────────────────────────

/**
 * Internal: Eksekusi POST request ke Telegram API.
 * @param {string} url
 * @param {object} payload
 * @returns {object} Parsed JSON response.
 */
function _callTelegramAPI(url, payload) {
  const options = {
    method:      'post',
    contentType: 'application/json',
    payload:     JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const data     = JSON.parse(response.getContentText());

  if (!data.ok) {
    Logger.log(`[TelegramService] API Error: ${JSON.stringify(data)}`);
    throw new Error(`Telegram API error: ${data.description}`);
  }

  return data;
}
