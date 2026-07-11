import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Model gratis di OpenRouter kadang kena rate-limit upstream dari provider-nya
// (bukan limit akun kita) - jadi kita coba beberapa model unggulan berurutan,
// bukan cuma satu, DAN urutannya disesuaikan jenis permintaan (umum vs kode).
const GENERAL_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free', // umum, reasoning kuat, context 1M
  'poolside/laguna-m.1:free'                // alternatif umum lainnya
];
const CODING_MODELS = [
  'cohere/north-mini-code:free' // dioptimalkan untuk kode - didahulukan kalau permintaan terdeteksi soal coding
];

// Heuristik ringan: kalau pesan user mengandung kata kunci coding, dahulukan
// model kode; kalau tidak, coba model umum dulu. Kedua daftar tetap saling
// jadi fallback satu sama lain kalau salah satu kena rate-limit/timeout.
const CODING_KEYWORDS = /\b(code|coding|script|html|css|javascript|js|python|json|api|function|program(?:kan)?|bug|error|debug|refactor|kode|fungsi)\b/i;

function pickModelOrder(userMessage = '') {
  const isCoding = CODING_KEYWORDS.test(userMessage);
  const ordered = isCoding ? [...CODING_MODELS, ...GENERAL_MODELS] : [...GENERAL_MODELS, ...CODING_MODELS];
  return [
    ...(process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : []),
    ...ordered.filter((m) => m !== process.env.OPENROUTER_MODEL)
  ];
}

if (!OPENROUTER_API_KEY) {
  console.warn('[AIService] Peringatan: OPENROUTER_API_KEY tidak ditemukan.');
}

const MODEL_TIMEOUT_MS = 20000; // model yang macet/lambat cepat gagal & pindah ke fallback, bukan menggantung tanpa batas

/**
 * Panggil OpenRouter, coba beberapa model berurutan kalau ada yang kena
 * rate-limit upstream (429), error sisi provider (5xx), timeout, atau
 * lolos tapi hasilnya tidak valid (lihat `validate`) - supaya satu model
 * gratis lagi sibuk/rusak tidak langsung menggagalkan permintaan.
 * @param {Array<{role: string, content: string}>} messages
 * @param {{jsonMode?: boolean, hintText?: string, validate?: (rawText: string) => boolean}} [opts]
 *   hintText dipakai untuk memilih urutan model (deteksi coding vs umum).
 *   validate: kalau disediakan dan return false, respons dianggap gagal dan lanjut ke model berikutnya
 *   (mis. JSON valid tapi field "message" kosong - jangan diloloskan begitu saja ke user).
 * @returns {Promise<string>} Raw text dari respons AI.
 */
async function callOpenRouterWithFallback(messages, { jsonMode = true, hintText = '', validate } = {}) {
  const modelCandidates = pickModelOrder(hintText);
  let lastError;
  for (const model of modelCandidates) {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
        },
        {
          timeout: MODEL_TIMEOUT_MS,
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/HermesAgent',
            'X-Title': 'Hermes Agent'
          }
        }
      );
      const rawText = response.data.choices[0].message.content;
      if (validate && !validate(rawText)) {
        throw new Error('Respons model tidak valid/lengkap');
      }
      return rawText;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      // Tanpa status = network error, timeout, ATAU validasi kita sendiri gagal - semuanya layak dicoba model lain.
      const retryable = !status || status === 429 || (status >= 500 && status < 600);
      console.error(`[AIService] Model "${model}" gagal (status ${status ?? 'n/a'}):`, error.response?.data?.error?.message || error.message);
      if (!retryable) break; // error bukan soal ketersediaan/kualitas model (mis. API key salah) -> jangan coba model lain
    }
  }
  throw new Error('Gagal menghubungi otak AI (semua model OpenRouter gagal): ' + (lastError?.message || 'unknown'));
}

function buildSystemPrompt(profile = {}) {
  const { nickname, notes = [], assistantName } = profile;
  const myName = assistantName || 'Hermes';

  const profileBlock = nickname || notes.length
    ? `\nYANG SUDAH KAMU TAHU TENTANG ORANG INI (dari profil permanen, bukan riwayat chat):\n` +
      (nickname ? `- Ingin dipanggil: "${nickname}" (SELALU panggil DIA dengan nama ini, jangan pakai nama lain)\n` : '') +
      notes.map((n) => `- ${n}`).join('\n')
    : `\nKamu belum tahu nama panggilan orang ini. Kalau relevan/natural, boleh tanya mau dipanggil apa - tapi jangan maksa di setiap pesan.`;

  return `Kamu adalah asisten AI pribadi. Untuk orang yang sedang mengobrol denganmu SEKARANG, namamu adalah "${myName}" - begitulah dia memanggilmu dan begitulah kamu memperkenalkan dirimu ke dia. Gaya bicaramu cerdas, hangat, dan enak diajak ngobrol - natural dan membumi, bukan kaku atau template. SELALU balas dalam Bahasa Indonesia, kecuali user jelas-jelas menulis dalam bahasa lain. Waktu saat ini: ${new Date().toISOString()}.

Kamu dipakai oleh BANYAK ORANG BERBEDA (bukan cuma satu user). Setiap orang punya profil & riwayat sendiri-sendiri yang terpisah dari orang lain - jangan pernah bocorkan atau campur informasi antar orang. Nama panggilanmu ("${myName}") juga BISA BEDA untuk tiap orang - orang lain mungkin memanggilmu dengan nama lain, itu normal.
${profileBlock}

Kamu juga punya riwayat percakapan sebelumnya dengan ORANG INI (dikirim sebagai pesan-pesan role user/assistant sebelum pesan terbaru). GUNAKAN riwayat itu secara aktif: ingat apa yang sudah dibahas, sambungkan dengan pertanyaan baru, jangan minta dia mengulang informasi yang sudah pernah diberikan.

TUGASMU: baca pesan terbaru user (dengan mempertimbangkan profil & riwayat di atas), lalu tentukan aksi yang tepat. Balas HANYA dengan satu objek JSON valid, tanpa teks lain di luar JSON.

DAFTAR AKSI:
1. "calendar" - Buat event Google Calendar (butuh params: title, date (YYYY-MM-DD), time (HH:MM), duration)
2. "news" - Cari/tampilkan berita (butuh params: query)
3. "reply" - Percakapan biasa / pertanyaan apa pun yang tidak butuh aksi khusus (params kosong {})

Untuk action "reply", isi "message" dengan jawaban yang sebenar-benarnya membantu: jelas, to the point tapi tidak dangkal, boleh agak panjang kalau memang perlu penjelasan, dan terasa seperti dijawab manusia yang benar-benar mendengarkan - bukan cuma template basa-basi.

FIELD OPSIONAL "profile_update" - isi HANYA kalau relevan, dan PERHATIKAN BAIK-BAIK BEDANYA:
- "nickname": diisi kalau USER minta DIRINYA SENDIRI dipanggil dengan nama tertentu (mis. "panggil aku Eyinaa"). Ini nama UNTUK USER.
- "assistant_name": diisi HANYA kalau USER secara eksplisit memberi/mengganti NAMAMU (mis. "aku mau manggil kamu Jarwis", "nama kamu sekarang Nova aja"). Ini nama untuk KAMU (si AI), dan HANYA berlaku untuk user yang memintanya - jangan pernah anggap ini berubah untuk user lain.
- "note": satu fakta durable singkat tentang user, kalau ada yang layak diingat jangka panjang.
JANGAN TERTUKAR antara nickname (nama untuk user) dan assistant_name (nama untukmu). Jangan isi field yang tidak relevan dengan pesan terbaru.

FORMAT WAJIB JSON:
{
  "action": "calendar" | "news" | "reply",
  "params": { ... },
  "message": "Pesan untuk dikirim ke pengguna",
  "profile_update": { "nickname": "...", "assistant_name": "...", "note": "..." }
}`;
}

/**
 * Mengirim pesan (beserta profil & riwayat percakapan) ke OpenRouter dan memparsing respons JSON.
 * @param {string} userMessage - Pesan terbaru dari user.
 * @param {Array<{role: 'user'|'assistant', content: string}>} [history] - Riwayat percakapan sebelumnya, lama ke baru.
 * @param {{nickname?: string, notes?: string[], assistantName?: string}} [profile] - Profil permanen user ini (terpisah per orang).
 * @returns {Promise<Object>} Object aksi JSON.
 */
export async function processMessageWithAI(userMessage, history = [], profile = {}) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(profile) },
    ...history,
    { role: 'user', content: userMessage }
  ];
  const rawText = await callOpenRouterWithFallback(messages, {
    jsonMode: true,
    hintText: userMessage,
    // Tolak respons yang JSON-nya valid tapi field "message"-nya kosong -
    // ini yang sebelumnya bocor sebagai balasan literal "Memproses..." ke
    // user. Kalau tidak valid, otomatis lanjut coba model fallback berikutnya.
    validate: (text) => {
      try {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        return typeof parsed.message === 'string' && parsed.message.trim().length > 0;
      } catch {
        return false;
      }
    }
  });
  return parseToolCall(rawText);
}

const NEWS_SUMMARY_SYSTEM_PROMPT = `Kamu adalah asisten peringkas berita. Untuk SETIAP artikel yang diberikan, tulis ringkasan 2-3 paragraf yang mendalam dan mengalir enak dibaca, HANYA berdasarkan isi artikel yang diberikan - jangan mengarang atau menambah fakta yang tidak ada di teks sumber. Tulis dalam Bahasa Indonesia.

Format tiap item (pakai Markdown gaya Telegram):
*<nomor>. <judul berita>*
<2-3 paragraf ringkasan>
🔗 <url sumber>

Pisahkan tiap item dengan baris kosong. Jangan tambahkan pembuka/penutup di luar daftar item, langsung mulai dari item nomor 1.`;

/**
 * Buat ringkasan mendalam (2-3 paragraf) untuk tiap artikel berita, berbasis
 * isi artikel penuh (bukan cuplikan RSS) - dipakai untuk broadcast harian
 * maupun permintaan berita on-demand supaya hasilnya selalu substantif.
 * @param {Array<{title: string, url: string, fullText: string}>} articles
 * @returns {Promise<string>} Teks markdown siap kirim.
 */
export async function summarizeNewsArticles(articles) {
  const userContent = articles
    .map((a, i) => `### Artikel ${i + 1}\nJudul: ${a.title}\nURL: ${a.url}\nIsi:\n${a.fullText}`)
    .join('\n\n---\n\n');

  const messages = [
    { role: 'system', content: NEWS_SUMMARY_SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ];
  return (await callOpenRouterWithFallback(messages, { jsonMode: false })).trim();
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
      assistantName: (typeof rawUpdate?.assistant_name === 'string' && rawUpdate.assistant_name.trim()) ? rawUpdate.assistant_name.trim() : null,
      note: (typeof rawUpdate?.note === 'string' && rawUpdate.note.trim()) ? rawUpdate.note.trim() : null
    };

    return {
      action: parsed.action || 'reply',
      params: parsed.params || {},
      // Jaring pengaman terakhir (harusnya tidak pernah kena kalau lewat
      // processMessageWithAI - itu sudah divalidasi di callOpenRouterWithFallback).
      message: parsed.message || 'Maaf, aku belum dapat jawaban yang jelas untuk itu. Bisa coba dijelaskan ulang?',
      profileUpdate
    };
  } catch (e) {
    console.error('[AIService] Parse Error:', e.message);
    return {
      action: 'reply',
      params: {},
      message: cleaned, // Fallback to raw text
      profileUpdate: { nickname: null, assistantName: null, note: null }
    };
  }
}
