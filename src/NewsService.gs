/**
 * ============================================================
 * NewsService.gs — News API Integration
 * Hermes Agent | Google Apps Script
 * ============================================================
 */

/**
 * Mengambil berita terbaru dari NewsAPI berdasarkan query.
 *
 * @param {object} params - Parameter dari AI tool call.
 * @param {string} params.query    - Kata kunci pencarian.
 * @param {string} [params.language] - Kode bahasa: 'id' atau 'en' (default: 'id').
 * @param {number} [params.pageSize] - Jumlah artikel (default: 5, max: 10).
 * @returns {string} Pesan terformat untuk Telegram.
 */
function fetchNews(params) {
  debugLog('NewsService.fetchNews', params);

  if (!params.query || params.query.trim() === '') {
    throw new Error('Query berita tidak boleh kosong.');
  }

  if (!CONFIG.NEWS_API_KEY) {
    throw new Error('NEWS_API_KEY belum diset di Script Properties.');
  }

  const query    = params.query.trim();
  const language = params.language || CONFIG.NEWS_DEFAULT_LANGUAGE;
  const pageSize = Math.min(params.pageSize || CONFIG.NEWS_DEFAULT_PAGE_SIZE, 10);

  // ── Bangun URL request ─────────────────────────────────────────────────
  const queryParams = {
    q:        query,
    language: language,
    pageSize: pageSize,
    sortBy:   'publishedAt',
    apiKey:   CONFIG.NEWS_API_KEY,
  };

  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = `${CONFIG.NEWS_API_URL}?${queryString}`;

  // ── Fetch dari NewsAPI ─────────────────────────────────────────────────
  const response = UrlFetchApp.fetch(url, {
    method:             'get',
    muteHttpExceptions: true,
  });

  const responseCode = response.getResponseCode();
  const data         = JSON.parse(response.getContentText());

  if (responseCode !== 200 || data.status !== 'ok') {
    const errMsg = data.message || `HTTP ${responseCode}`;
    Logger.log(`[NewsService] API Error: ${errMsg}`);
    throw new Error(`Gagal mengambil berita: ${errMsg}`);
  }

  if (!data.articles || data.articles.length === 0) {
    return `📭 Tidak ada berita ditemukan untuk kata kunci *"${query}"*.`;
  }

  // ── Format hasil menjadi pesan Telegram ───────────────────────────────
  return _formatNewsMessage(data.articles, query, data.totalResults);
}

// ─── Private Helper ────────────────────────────────────────────────────────

/**
 * Memformat array artikel berita menjadi pesan Telegram Markdown.
 * @param {Array}  articles     - Array artikel dari NewsAPI.
 * @param {string} query        - Kata kunci yang digunakan.
 * @param {number} totalResults - Total hasil dari API.
 * @returns {string} Pesan terformat.
 */
function _formatNewsMessage(articles, query, totalResults) {
  const header =
    `📰 *Berita Terbaru: "${query}"*\n` +
    `_(Menampilkan ${articles.length} dari ${totalResults} artikel)_\n` +
    `${'─'.repeat(30)}\n\n`;

  const articleLines = articles.map((article, i) => {
    const title       = _escapeMarkdown(article.title || 'Tanpa Judul');
    const source      = article.source?.name || 'Sumber Tidak Diketahui';
    const publishedAt = _formatDate(article.publishedAt);
    const url         = article.url || '#';

    return (
      `*${i + 1}. ${title}*\n` +
      `🗞️ ${source} · ${publishedAt}\n` +
      `🔗 [Baca Selengkapnya](${url})`
    );
  });

  return header + articleLines.join('\n\n');
}

/**
 * Memformat tanggal ISO 8601 menjadi string yang mudah dibaca.
 * @param {string} isoDateStr
 * @returns {string}
 */
function _formatDate(isoDateStr) {
  if (!isoDateStr) return 'Tanggal tidak diketahui';
  try {
    const date = new Date(isoDateStr);
    return Utilities.formatDate(date, 'Asia/Jakarta', 'dd MMM yyyy, HH:mm') + ' WIB';
  } catch (e) {
    return isoDateStr;
  }
}

/**
 * Escape karakter Markdown khusus untuk Telegram.
 * @param {string} text
 * @returns {string}
 */
function _escapeMarkdown(text) {
  // Escape hanya karakter yang bisa merusak formatting Telegram Markdown
  return text.replace(/[_*[\]`]/g, c => '\\' + c);
}
