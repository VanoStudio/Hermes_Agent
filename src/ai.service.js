import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-flash-1.5';

if (!OPENROUTER_API_KEY) {
  console.warn('[AIService] Peringatan: OPENROUTER_API_KEY tidak ditemukan.');
}

const SYSTEM_PROMPT = `
Kamu adalah Hermes, asisten AI pribadi. Waktu saat ini: ${new Date().toISOString()}.
TUGASMU: Analisis pesan pengguna dan tentukan aksi yang tepat. Balas HANYA dengan JSON valid.

DAFTAR AKSI:
1. "calendar" — Buat event Google Calendar (butuh: title, date (YYYY-MM-DD), time (HH:MM), duration)
2. "news" — Cari berita (butuh: query)
3. "reply" — Percakapan biasa (tanpa params)

FORMAT WAJIB JSON:
{
  "action": "calendar" | "news" | "reply",
  "params": { ... },
  "message": "Pesan untuk dikirim ke pengguna"
}
`;

/**
 * Mengirim pesan ke OpenRouter dan memparsing respons JSON.
 * @param {string} userMessage - Pesan dari user.
 * @returns {Promise<Object>} Object aksi JSON.
 */
export async function processMessageWithAI(userMessage) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/HermesAgent',
          'X-Title': 'Hermes Agent'
        }
      }
    );

    const rawText = response.data.choices[0].message.content;
    return parseToolCall(rawText);
  } catch (error) {
    console.error('[AIService] OpenRouter Error:', error.response?.data || error.message);
    throw new Error('Gagal menghubungi otak AI (OpenRouter).');
  }
}

/**
 * Memastikan output benar-benar JSON valid.
 */
function parseToolCall(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    const validActions = ['calendar', 'news', 'reply'];
    
    if (!validActions.includes(parsed.action)) {
      parsed.action = 'reply';
    }
    return {
      action: parsed.action || 'reply',
      params: parsed.params || {},
      message: parsed.message || 'Memproses...'
    };
  } catch (e) {
    console.error('[AIService] Parse Error:', e.message);
    return {
      action: 'reply',
      params: {},
      message: cleaned // Fallback to raw text
    };
  }
}
