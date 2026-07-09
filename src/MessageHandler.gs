/**
 * ============================================================
 * MessageHandler.gs — Telegram Update Parser & Router
 * Hermes Agent | Google Apps Script
 * ============================================================
 *
 * Mengekstrak data dari Telegram update object, menangani
 * command khusus (/start, /help), dan mengatur alur pesan
 * ke AIProcessor.
 */

/**
 * Entry point utama untuk setiap update Telegram yang masuk.
 * Dipanggil oleh doPost() di Main.gs.
 *
 * @param {object} update - Telegram Update object (dari JSON.parse).
 */
function handleMessage(update) {
  debugLog('MessageHandler.handleMessage', { updateId: update.update_id });

  // ── Hanya proses "message" (bukan callback_query, inline, dll) ────────
  if (!update.message) {
    Logger.log('[MessageHandler] Update bukan tipe message, diabaikan.');
    return;
  }

  const message  = update.message;
  const chatId   = message.chat.id;
  const userId   = message.from?.id;
  const username = message.from?.username || 'user';
  const firstName = message.from?.first_name || 'Pengguna';
  const text     = (message.text || '').trim();

  Logger.log(`[MessageHandler] From: @${username}(${userId}) | Chat: ${chatId} | Text: "${text.substring(0, 80)}"`);

  // ── Abaikan pesan kosong / non-teks ──────────────────────────────────
  if (!text) {
    sendReply(chatId, '💬 Maaf, saya hanya bisa memproses pesan teks saat ini.');
    return;
  }

  // ── Handle command Telegram (/start, /help, dll) ──────────────────────
  if (text.startsWith('/')) {
    _handleCommand(text, chatId, firstName);
    return;
  }

  // ── Indikasi typing sebelum memproses ─────────────────────────────────
  sendTyping(chatId);

  // ── Proses pesan dengan AI ────────────────────────────────────────────
  withErrorHandling(() => {
    const toolCall = processAI(text);
    dispatchAction(toolCall, chatId);
  }, chatId, 'MessageHandler');
}

// ─── Private: Command Handler ──────────────────────────────────────────────

/**
 * Menangani command Telegram yang diawali '/'.
 * @param {string} text - Teks command.
 * @param {string|number} chatId
 * @param {string} firstName - Nama user.
 */
function _handleCommand(text, chatId, firstName) {
  const command = text.split(' ')[0].toLowerCase().split('@')[0]; // Handle /cmd@botname

  debugLog('MessageHandler._handleCommand', { command });

  switch (command) {
    case '/start':
      sendWelcome(chatId, firstName);
      break;

    case '/help':
      sendReply(chatId,
        `🆘 *Panduan Hermes Agent*\n\n` +
        `*Perintah Tersedia:*\n` +
        `/start — Memulai bot\n` +
        `/help  — Menampilkan bantuan ini\n` +
        `/status — Cek status bot\n\n` +
        `*Contoh Penggunaan Natural:*\n` +
        `• _"Jadwalkan meeting besok jam 9 pagi selama 1 jam"_\n` +
        `• _"Hermes, ingatkan aku rapat lusa jam 15:00"_\n` +
        `• _"Cari berita terbaru tentang AI"_\n` +
        `• _"Berita olahraga hari ini"_\n\n` +
        `Powered by *${CONFIG.APP_NAME} v${CONFIG.APP_VERSION}*`
      );
      break;

    case '/status':
      sendReply(chatId,
        `🟢 *${CONFIG.APP_NAME}* sedang berjalan\n\n` +
        `🤖 Model: \`${CONFIG.OPENROUTER_MODEL}\`\n` +
        `📅 Kalender: \`${CONFIG.CALENDAR_ID}\`\n` +
        `🕐 Waktu Server: ${Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm')} WIB`
      );
      break;

    default:
      sendReply(chatId,
        `❓ Command *${command}* tidak dikenal.\nKetik /help untuk melihat daftar perintah.`
      );
  }
}
