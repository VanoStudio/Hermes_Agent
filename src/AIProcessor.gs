/**
 * ============================================================
 * AIProcessor.gs — OpenRouter LLM Integration & Tool Calling
 * Hermes Agent | Google Apps Script
 * ============================================================
 *
 * Modul ini bertanggung jawab untuk:
 * 1. Membangun system prompt yang mengarahkan LLM berperilaku sebagai Hermes
 * 2. Mengirim pesan user ke OpenRouter
 * 3. Memparsing respons JSON (Tool Call) dari LLM
 * 4. Memvalidasi struktur JSON sebelum diteruskan ke ActionDispatcher
 */

// ─── System Prompt ─────────────────────────────────────────────────────────

const HERMES_SYSTEM_PROMPT = `
Kamu adalah Hermes, asisten AI pribadi yang terintegrasi dengan Google Calendar dan layanan berita.
Tanggal dan waktu sekarang adalah: {{CURRENT_DATETIME}} (WIB, UTC+7).

TUGASMU:
Analisis pesan pengguna dan tentukan aksi yang tepat. Balas HANYA dengan JSON valid (tanpa markdown, tanpa penjelasan tambahan).

DAFTAR AKSI YANG TERSEDIA:

1. "calendar" — Buat event di Google Calendar
   Gunakan jika user menyebut: jadwal, rapat, meeting, event, reminder, ingatkan, besok, lusa, jam, dll.
   Params yang diperlukan:
   - title (string): judul event, singkat dan jelas
   - date (string): format YYYY-MM-DD, hitung dari tanggal hari ini
   - time (string): format HH:MM dalam 24 jam
   - duration (number): durasi dalam menit, default 60

2. "news" — Ambil berita terbaru
   Gunakan jika user menyebut: berita, kabar, update, terkini, hari ini, dll.
   Params yang diperlukan:
   - query (string): kata kunci pencarian
   - language (string): "id" untuk Indonesia, "en" untuk Inggris

3. "reply" — Balas percakapan biasa / pertanyaan umum
   Gunakan untuk pertanyaan umum, salam, atau yang tidak cocok dengan aksi di atas.
   Params: {} (kosong)

FORMAT RESPONS WAJIB (JSON SAJA, TIDAK ADA TEKS LAIN):
{
  "action": "calendar" | "news" | "reply",
  "params": { ... sesuai aksi ... },
  "message": "Pesan ramah dalam Bahasa Indonesia untuk dikirim ke pengguna"
}

CONTOH:
Input: "Hermes, catat rapat tim besok jam 14:00 selama 2 jam"
Output: {"action":"calendar","params":{"title":"Rapat Tim","date":"2025-07-10","time":"14:00","duration":120},"message":"✅ Saya akan menambahkan rapat tim besok jam 14:00 ke kalendermu!"}

Input: "Cari berita teknologi terbaru"
Output: {"action":"news","params":{"query":"teknologi","language":"id"},"message":"🔍 Mencari berita teknologi terbaru untukmu..."}

PENTING: Selalu hitung tanggal relatif (besok, lusa, minggu depan) berdasarkan tanggal hari ini yang sudah saya berikan.
`.trim();

// ─── Main Function ─────────────────────────────────────────────────────────

/**
 * Memproses pesan user dengan LLM via OpenRouter.
 * @param {string} userMessage - Teks pesan dari user.
 * @param {string} conversationHistory - Riwayat percakapan (opsional).
 * @returns {object} Parsed tool call object: { action, params, message }
 */
function processAI(userMessage, conversationHistory) {
  debugLog('AIProcessor.processAI', { userMessage: userMessage.substring(0, 100) });

  // Inject tanggal & waktu sekarang ke system prompt
  const now = new Date();
  const systemPrompt = HERMES_SYSTEM_PROMPT.replace(
    '{{CURRENT_DATETIME}}',
    Utilities.formatDate(now, 'Asia/Jakarta', "EEEE, dd MMMM yyyy 'pukul' HH:mm")
  );

  // Bangun messages array
  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // Tambah riwayat percakapan jika ada (untuk context)
  if (conversationHistory && Array.isArray(conversationHistory)) {
    messages.push(...conversationHistory);
  }

  messages.push({ role: 'user', content: userMessage });

  // Kirim ke OpenRouter
  const rawResponse = _callOpenRouter(messages);
  debugLog('AIProcessor.rawResponse', rawResponse);

  // Parse dan validasi respons JSON
  const toolCall = _parseToolCall(rawResponse);
  return toolCall;
}

// ─── Private Helpers ───────────────────────────────────────────────────────

/**
 * Memanggil OpenRouter Chat Completions API.
 * @param {Array} messages - Array message objects.
 * @returns {string} Konten teks dari respons LLM.
 */
function _callOpenRouter(messages) {
  const payload = {
    model:       CONFIG.OPENROUTER_MODEL,
    messages:    messages,
    max_tokens:  CONFIG.OPENROUTER_MAX_TOKENS,
    temperature: CONFIG.OPENROUTER_TEMPERATURE,
    response_format: { type: 'json_object' }, // Force JSON output
  };

  const options = {
    method:      'post',
    contentType: 'application/json',
    headers: {
      'Authorization':  `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
      'HTTP-Referer':   'https://github.com/HermesAgent',
      'X-Title':        CONFIG.APP_NAME,
    },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response     = UrlFetchApp.fetch(CONFIG.OPENROUTER_API_URL, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    Logger.log(`[AIProcessor] OpenRouter HTTP ${responseCode}: ${responseText}`);
    throw new Error(`OpenRouter API gagal (HTTP ${responseCode}). Cek API key dan model.`);
  }

  const data = JSON.parse(responseText);

  // Validasi struktur respons OpenAI-compatible
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Respons OpenRouter tidak valid: struktur choices tidak ditemukan.');
  }

  return data.choices[0].message.content;
}

/**
 * Memparsing string JSON dari LLM menjadi object tool call.
 * Handles berbagai edge case (JSON dalam markdown block, whitespace, dll).
 * @param {string} rawText - Teks mentah dari LLM.
 * @returns {object} { action, params, message }
 */
function _parseToolCall(rawText) {
  // Bersihkan markdown code block jika ada
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    Logger.log(`[AIProcessor] JSON parse error: ${parseErr.message}\nRaw: ${cleaned}`);
    // Fallback: treat as plain reply
    return {
      action:  'reply',
      params:  {},
      message: cleaned || 'Maaf, saya tidak bisa memproses permintaanmu saat ini.',
    };
  }

  // Validasi field wajib
  const validActions = ['calendar', 'news', 'reply'];
  if (!validActions.includes(parsed.action)) {
    Logger.log(`[AIProcessor] Invalid action: ${parsed.action}`);
    parsed.action = 'reply';
  }

  return {
    action:  parsed.action  || 'reply',
    params:  parsed.params  || {},
    message: parsed.message || 'Permintaanmu sedang diproses.',
  };
}
