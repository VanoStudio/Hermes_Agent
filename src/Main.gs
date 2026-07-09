/**
 * ============================================================
 * Main.gs — Entry Point (Webhook Handler)
 * Hermes Agent | Google Apps Script
 * ============================================================
 *
 * File ini adalah pintu masuk utama untuk semua request HTTP
 * yang masuk ke Google Apps Script Web App.
 *
 * DEPLOYMENT:
 * 1. Deploy sebagai Web App (Execute as: Me, Access: Anyone)
 * 2. Copy URL deployment
 * 3. Set sebagai Telegram Webhook (lihat SETUP.md)
 */

/**
 * Handler untuk HTTP POST — dipanggil oleh Telegram Webhook.
 * @param {object} e - Google Apps Script event object.
 * @returns {ContentService.TextOutput} HTTP 200 OK (wajib untuk Telegram).
 */
function doPost(e) {
  // ── Selalu kembalikan 200 agar Telegram tidak retry ───────────────────
  // (Proses async, error di-handle internal)
  try {
    // Validasi secret token (keamanan)
    if (!isValidTelegramRequest(e)) {
      Logger.log('[Main.doPost] Request ditolak: invalid secret token.');
      return _ok('Unauthorized');
    }

    // Parse body JSON
    const body = e.postData?.contents;
    if (!body) {
      Logger.log('[Main.doPost] Request body kosong.');
      return _ok('Empty body');
    }

    const update = JSON.parse(body);

    // Log request untuk audit
    logIncomingRequest(update);

    // Validasi konfigurasi sebelum memproses
    validateConfig();

    // Dispatch ke MessageHandler
    handleMessage(update);

  } catch (err) {
    // Log error tapi JANGAN throw — Telegram butuh HTTP 200
    Logger.log('[Main.doPost] CRITICAL ERROR: ' + err.message + '\n' + err.stack);
  }

  return _ok('OK');
}

/**
 * Handler untuk HTTP GET — berguna untuk health check & debug.
 * @returns {ContentService.TextOutput}
 */
function doGet(e) {
  const info = {
    status:  'running',
    app:     CONFIG.APP_NAME,
    version: CONFIG.APP_VERSION,
    time:    Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
    model:   CONFIG.OPENROUTER_MODEL,
  };

  return ContentService
    .createTextOutput(JSON.stringify(info, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Utility Functions ────────────────────────────────────────────────────

/**
 * Registrasi Telegram Webhook ke URL deployment ini.
 * JALANKAN MANUAL sekali setelah deployment.
 */
function registerWebhook() {
  const webAppUrl = ScriptApp.getService().getUrl();
  const apiUrl    =
    `${CONFIG.TELEGRAM_API_BASE}${CONFIG.TELEGRAM_BOT_TOKEN}/setWebhook` +
    `?url=${encodeURIComponent(webAppUrl)}` +
    `&secret_token=${encodeURIComponent(CONFIG.TELEGRAM_SECRET_TOKEN)}` +
    `&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`;

  const response = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
  const result   = JSON.parse(response.getContentText());

  Logger.log('[Main.registerWebhook] Result: ' + JSON.stringify(result));

  if (result.ok) {
    Logger.log('✅ Webhook berhasil diregistrasi ke: ' + webAppUrl);
  } else {
    Logger.log('❌ Gagal registrasi webhook: ' + result.description);
  }
}

/**
 * Hapus Telegram Webhook (untuk debugging atau saat shutdown).
 * JALANKAN MANUAL jika perlu mematikan bot.
 */
function deleteWebhook() {
  const apiUrl = `${CONFIG.TELEGRAM_API_BASE}${CONFIG.TELEGRAM_BOT_TOKEN}/deleteWebhook`;
  const response = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
  Logger.log('[Main.deleteWebhook] ' + response.getContentText());
}

/**
 * Cek info webhook yang aktif saat ini.
 * JALANKAN MANUAL untuk troubleshooting.
 */
function checkWebhookInfo() {
  const apiUrl   = `${CONFIG.TELEGRAM_API_BASE}${CONFIG.TELEGRAM_BOT_TOKEN}/getWebhookInfo`;
  const response = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
  const info     = JSON.parse(response.getContentText());
  Logger.log('[Main.checkWebhookInfo] ' + JSON.stringify(info, null, 2));
}

// ─── Private Helper ────────────────────────────────────────────────────────

function _ok(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message }))
    .setMimeType(ContentService.MimeType.JSON);
}
