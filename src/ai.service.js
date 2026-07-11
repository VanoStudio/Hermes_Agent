import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Model gratis di OpenRouter kadang kena rate-limit upstream dari provider-nya
// (bukan limit akun kita) - jadi kita coba beberapa model unggulan berurutan,
// bukan cuma satu. Kalau OPENROUTER_MODEL di-set di env, itu dicoba PALING
// DULU, baru fallback ke daftar ini kalau gagal.
const FALLBACK_MODELS = [
  'openai/gpt-oss-120b:free',            // kuat reasoning + JSON terstruktur
  'meta-llama/llama-3.3-70b-instruct:free', // stabil, umum dipakai
  'qwen/qwen3-next-80b-a3b-instruct:free',  // alternatif kuat lainnya
  'nvidia/nemotron-3-ultra-550b-a55b:free'  // cadangan terakhir, model besar
];

const MODEL_CANDIDATES = [
  ...(process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : []),
  ...FALLBACK_MODELS.filter((m) => m !== process.env.OPENROUTER_MODEL)
];

if (!OPENROUTER_API_KEY) {
  console.warn('[AIService] Peringatan: OPENROUTER_API_KEY tidak ditemukan.');
}

function buildSystemPrompt(profile = {}) {
  const { nickname, notes = [] } = profile;

  const profileBlock = nickname || notes.length
    ? `\nYANG SUDAH KAMU TAHU TENTANG ORANG INI (dari profil permanen, bukan riwayat chat):\n` +
      (nickname ? `- Ingin dipanggil: "${nickname}" (SELALU panggil dia dengan nama ini, jangan pakai nama lain)\n` : '') +
      notes.map((n) => `- ${n}`).join('\n')
    : `\nKamu belum tahu nama panggilan orang ini. Kalau relevan/natural, boleh tanya mau dipanggil apa - tapi jangan maksa di setiap pesan.`;

  return `Kamu adalah Hermes, asisten AI pribadi yang cerdas, hangat, dan enak diajak ngobrol - gaya bicaramu natural dan membumi, bukan kaku atau template. Waktu saat ini: ${new Date().toISOString()}.

Hermes dipakai oleh BANYAK ORANG BERBEDA (bukan cuma satu user). Setiap orang punya profil & riwayat sendiri-sendiri yang terpisah dari orang lain - jangan pernah bocorkan atau campur informasi antar orang.
${profileBlock}

Kamu juga punya riwayat percakapan sebelumnya dengan ORANG INI (dikirim sebagai pesan-pesan role user/assistant sebelum pesan terbaru). GUNAKAN riwayat itu secara aktif: ingat apa yang sudah dibahas, sambungkan dengan pertanyaan baru, jangan minta dia mengulang informasi yang sudah pernah diberikan.

TUGASMU: baca pesan terbaru user (dengan mempertimbangkan profil & riwayat di atas), lalu tentukan aksi yang tepat. Balas HANYA dengan satu objek JSON valid, tanpa teks lain di luar JSON.

DAFTAR AKSI:
1. "calendar" - Buat event Google Calendar (butuh params: title, date (YYYY-MM-DD), time (HH:MM), duration)
2. "news" - Cari berita (butuh params: query)
3. "reply" - Percakapan biasa / pertanyaan apa pun yang tidak butuh aksi khusus (params kosong {})

Untuk action "reply", isi "message" dengan jawaban yang sebenar-benarnya membantu: jelas, to the point tapi tidak dangkal, boleh agak panjang kalau memang perlu penjelasan, dan terasa seperti dijawab manusia yang benar-benar mendengarkan - bukan cuma template basa-basi.

FIELD OPSIONAL "profile_update" (isi HANYA kalau user baru saja memberi tahu fakta permanen tentang dirinya, seperti nama panggilan yang diinginkan atau preferensi penting):
{
  "nickname": "nama panggilan baru, kalau user baru saja minta dipanggil sesuatu",
  "note": "satu fakta durable singkat tentang user, kalau ada yang layak diingat jangka panjang"
}
Jangan isi profile_update untuk obrolan biasa yang tidak mengandung fakta baru tentang user.

FORMAT WAJIB JSON:
{
  "action": "calendar" | "news" | "reply",
  "params": { ... },
  "message": "Pesan untuk dikirim ke pengguna",
  "profile_update": { "nickname": "...", "note": "..." }
}`;
}

/**
 * Mengirim pesan (beserta profil & riwayat percakapan) ke OpenRouter dan memparsing respons JSON.
 * Mencoba beberapa model gratis berurutan (MODEL_CANDIDATES) kalau ada yang
 * kena rate-limit upstream (429) atau error sisi provider (5xx), supaya bot
 * tidak langsung gagal cuma karena satu model gratis lagi sibuk.
 * @param {string} userMessage - Pesan terbaru dari user.
 * @param {Array<{role: 'user'|'assistant', content: string}>} [history] - Riwayat percakapan sebelumnya, lama ke baru.
 * @param {{nickname?: string, notes?: string[]}} [profile] - Profil permanen user ini (terpisah per orang).
 * @returns {Promise<Object>} Object aksi JSON.
 */
export async function processMessageWithAI(userMessage, history = [], profile = {}) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(profile) },
    ...history,
    { role: 'user', content: userMessage }
  ];

  let lastError;
  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model, messages, response_format: { type: 'json_object' } },
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
      lastError = error;
      const status = error.response?.status;
      const retryable = status === 429 || (status >= 500 && status < 600);
      console.error(`[AIService] Model "${model}" gagal (status ${status}):`, error.response?.data?.error?.message || error.message);
      if (!retryable) break; // error bukan soal ketersediaan model (mis. API key salah) -> jangan coba model lain
    }
  }

  throw new Error('Gagal menghubungi otak AI (semua model OpenRouter gagal): ' + (lastError?.message || 'unknown'));
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

    const rawUpdate = parsed.profile_update;
    const profileUpdate = {
      nickname: (typeof rawUpdate?.nickname === 'string' && rawUpdate.nickname.trim()) ? rawUpdate.nickname.trim() : null,
      note: (typeof rawUpdate?.note === 'string' && rawUpdate.note.trim()) ? rawUpdate.note.trim() : null
    };

    return {
      action: parsed.action || 'reply',
      params: parsed.params || {},
      message: parsed.message || 'Memproses...',
      profileUpdate
    };
  } catch (e) {
    console.error('[AIService] Parse Error:', e.message);
    return {
      action: 'reply',
      params: {},
      message: cleaned, // Fallback to raw text
      profileUpdate: { nickname: null, note: null }
    };
  }
}
