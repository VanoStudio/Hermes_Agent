/**
 * ============================================================
 * ErrorHandler.gs — Global Error Handling & Logging
 * Hermes Agent | Google Apps Script
 * ============================================================
 */

/**
 * Higher-Order Function: Membungkus fungsi dengan try-catch.
 * Otomatis mengirim pesan error ke user Telegram jika terjadi kegagalan.
 *
 * @param {Function} fn - Fungsi yang akan dieksekusi.
 * @param {string|number} chatId - Telegram chat ID untuk mengirim error.
 * @param {string} context - Nama konteks untuk logging.
 * @returns {*} Hasil eksekusi fn, atau null jika error.
 */
function withErrorHandling(fn, chatId, context) {
  try {
    return fn();
  } catch (err) {
    const errorMsg = `[${context || 'Unknown'}] ${err.message}`;
    Logger.log('[ERROR] ' + errorMsg + '\nStack: ' + err.stack);

    // Kirim notifikasi error ke user jika chatId tersedia
    if (chatId) {
      try {
        sendError(chatId, err.message, context);
      } catch (telegramErr) {
        // Jangan sampai error handler juga throw error
        Logger.log('[CRITICAL] Gagal mengirim pesan error ke Telegram: ' + telegramErr.message);
      }
    }

    return null;
  }
}

/**
 * Mencatat informasi request yang masuk untuk audit trail.
 * @param {object} update - Telegram update object.
 */
function logIncomingRequest(update) {
  const chatId = update?.message?.chat?.id || 'unknown';
  const userId = update?.message?.from?.id || 'unknown';
  const text   = update?.message?.text   || '[no text]';

  Logger.log(`[REQUEST] chatId=${chatId} | userId=${userId} | text="${text.substring(0, 100)}"`);
}

/**
 * Format error response yang konsisten.
 * @param {string} code - Error code (e.g., 'AI_TIMEOUT', 'CALENDAR_FAILED').
 * @param {string} message - Pesan detail.
 * @returns {object}
 */
function createError(code, message) {
  return {
    success: false,
    error: { code, message, timestamp: new Date().toISOString() },
  };
}

/**
 * Validasi bahwa request berasal dari Telegram (via secret token header).
 * @param {object} e - Event object dari doPost().
 * @returns {boolean}
 */
function isValidTelegramRequest(e) {
  if (!CONFIG.TELEGRAM_SECRET_TOKEN) return true; // Lewati validasi jika belum diset

  const secretHeader = e?.parameter?.secret
    || (e?.headers && e.headers['X-Telegram-Bot-Api-Secret-Token']);

  if (secretHeader !== CONFIG.TELEGRAM_SECRET_TOKEN) {
    Logger.log('[SECURITY] Request ditolak: Secret token tidak valid.');
    return false;
  }
  return true;
}
