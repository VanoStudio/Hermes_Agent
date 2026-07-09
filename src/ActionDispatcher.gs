/**
 * ============================================================
 * ActionDispatcher.gs — Tool Call Router
 * Hermes Agent | Google Apps Script
 * ============================================================
 *
 * Menerima parsed tool call dari AIProcessor dan mendelegasikan
 * ke service yang tepat berdasarkan action type.
 */

/**
 * Mendispatch aksi dari AI ke service yang sesuai.
 *
 * @param {object} toolCall - Hasil parse dari AIProcessor.
 * @param {string} toolCall.action  - Nama aksi: 'calendar' | 'news' | 'reply'.
 * @param {object} toolCall.params  - Parameter aksi.
 * @param {string} toolCall.message - Pesan pre-generated dari AI.
 * @param {string|number} chatId    - Telegram chat ID untuk mengirim respons.
 * @returns {boolean} True jika dispatch berhasil.
 */
function dispatchAction(toolCall, chatId) {
  debugLog('ActionDispatcher.dispatchAction', { action: toolCall.action, chatId });

  const { action, params, message } = toolCall;

  switch (action) {

    // ── Aksi: Tambah Event Kalender ──────────────────────────────────────
    case 'calendar':
      return withErrorHandling(() => {
        // Kirim pesan "sedang memproses" dulu
        sendReply(chatId, message);

        // Eksekusi tambah event
        const eventResult = addCalendarEvent(params);

        // Kirim konfirmasi dengan detail event
        sendCalendarConfirmation(chatId, eventResult);
        return true;
      }, chatId, 'CalendarAction');

    // ── Aksi: Ambil Berita ──────────────────────────────────────────────
    case 'news':
      return withErrorHandling(() => {
        // Kirim pesan "sedang mencari"
        sendReply(chatId, message);
        sendTyping(chatId);

        // Fetch dan format berita
        const newsMessage = fetchNews(params);
        sendReply(chatId, newsMessage);
        return true;
      }, chatId, 'NewsAction');

    // ── Aksi: Reply Percakapan Biasa ────────────────────────────────────
    case 'reply':
      return withErrorHandling(() => {
        sendReply(chatId, message);
        return true;
      }, chatId, 'ReplyAction');

    // ── Default: Unknown Action ─────────────────────────────────────────
    default:
      Logger.log(`[ActionDispatcher] Unknown action: "${action}"`);
      sendReply(
        chatId,
        `🤔 Maaf, saya belum bisa menangani permintaan jenis ini.\n\n` +
        `Coba katakan:\n` +
        `📅 *"Jadwalkan [event] [waktu]"* untuk menambah ke kalender\n` +
        `📰 *"Cari berita [topik]"* untuk membaca berita\n` +
        `💬 *"Hermes, [pertanyaan]"* untuk bertanya apa saja`
      );
      return false;
  }
}
