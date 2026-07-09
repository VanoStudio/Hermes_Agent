/**
 * ============================================================
 * Config.gs — Centralized Configuration & Constants
 * Hermes Agent | Google Apps Script
 * ============================================================
 *
 * CARA PENGGUNAAN:
 * 1. Buka Apps Script Editor
 * 2. Pergi ke Project Settings (ikon gear) > Script Properties
 * 3. Tambahkan semua key berikut:
 *    - TELEGRAM_BOT_TOKEN
 *    - TELEGRAM_SECRET_TOKEN
 *    - OPENROUTER_API_KEY
 *    - NEWS_API_KEY
 *    - CALENDAR_ID (opsional, default: 'primary')
 *    - OPENROUTER_MODEL (opsional, default: 'google/gemini-flash-1.5')
 */

// ─── Script Properties Cache ───────────────────────────────────────────────
const SCRIPT_PROPS = PropertiesService.getScriptProperties();

// ─── Configuration Object ──────────────────────────────────────────────────
const CONFIG = {
  // Telegram
  TELEGRAM_BOT_TOKEN:    SCRIPT_PROPS.getProperty('TELEGRAM_BOT_TOKEN')    || '',
  TELEGRAM_SECRET_TOKEN: SCRIPT_PROPS.getProperty('TELEGRAM_SECRET_TOKEN') || '',
  TELEGRAM_API_BASE:     'https://api.telegram.org/bot',

  // OpenRouter (LLM Gateway)
  OPENROUTER_API_KEY:    SCRIPT_PROPS.getProperty('OPENROUTER_API_KEY')    || '',
  OPENROUTER_API_URL:    'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_MODEL:      SCRIPT_PROPS.getProperty('OPENROUTER_MODEL')      || 'google/gemini-flash-1.5',
  OPENROUTER_MAX_TOKENS: 512,
  OPENROUTER_TEMPERATURE: 0.3,

  // News API (newsapi.org)
  NEWS_API_KEY:          SCRIPT_PROPS.getProperty('NEWS_API_KEY')          || '',
  NEWS_API_URL:          'https://newsapi.org/v2/everything',
  NEWS_DEFAULT_LANGUAGE: 'id',
  NEWS_DEFAULT_PAGE_SIZE: 5,

  // Google Calendar
  CALENDAR_ID:           SCRIPT_PROPS.getProperty('CALENDAR_ID')           || 'primary',
  DEFAULT_EVENT_DURATION: 60, // menit

  // System
  APP_NAME:    'Hermes Agent',
  APP_VERSION: '1.0.0',
  DEBUG_MODE:  SCRIPT_PROPS.getProperty('DEBUG_MODE') === 'true',
};

/**
 * Validasi konfigurasi kritis saat startup.
 * Lempar error jika ada key penting yang kosong.
 */
function validateConfig() {
  const required = ['TELEGRAM_BOT_TOKEN', 'OPENROUTER_API_KEY'];
  const missing = required.filter(key => !CONFIG[key]);

  if (missing.length > 0) {
    throw new Error(
      `[Config] Missing required Script Properties: ${missing.join(', ')}. ` +
      'Silakan isi di Project Settings > Script Properties.'
    );
  }
}

/**
 * Helper: Log ke Stackdriver jika DEBUG_MODE aktif.
 * @param {string} context - Nama modul/fungsi.
 * @param {*} data - Data yang di-log.
 */
function debugLog(context, data) {
  if (CONFIG.DEBUG_MODE) {
    Logger.log(`[DEBUG][${context}] ${JSON.stringify(data)}`);
  }
}
