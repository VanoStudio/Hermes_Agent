import Parser from 'rss-parser';

const parser = new Parser();

/**
 * Mengambil berita global dari RSS BBC World News
 * @param {number} limit Jumlah berita yang diambil (default 5)
 * @returns {Promise<Array>} Array of objects berisi title, description, dan url
 */
export async function getGlobalNews(limit = 5) {
  try {
    const feed = await parser.parseURL('http://feeds.bbci.co.uk/news/world/rss.xml');
    
    return feed.items.slice(0, limit).map(item => ({
      title: item.title || 'Tanpa Judul',
      description: item.contentSnippet || item.content || 'Tidak ada deskripsi singkat',
      url: item.link || '#'
    }));
  } catch (error) {
    console.error('[NewsService - Global] RSS Fetch Error:', error.message);
    return []; // Return array kosong jika gagal agar aplikasi tidak crash
  }
}

/**
 * Mengambil berita spesifik teknologi/AI dari RSS MIT Technology Review
 * @param {number} limit Jumlah berita yang diambil (default 2)
 * @returns {Promise<Array>} Array of objects berisi title, description, dan url
 */
export async function getAINews(limit = 2) {
  try {
    // Menggunakan MIT Technology Review untuk topik AI
    const feed = await parser.parseURL('https://www.technologyreview.com/topic/artificial-intelligence/feed');
    
    return feed.items.slice(0, limit).map(item => ({
      title: item.title || 'Tanpa Judul',
      description: item.contentSnippet || item.content || 'Tidak ada deskripsi singkat',
      url: item.link || '#'
    }));
  } catch (error) {
    console.error('[NewsService - AI] RSS Fetch Error:', error.message);
    return []; // Return array kosong jika gagal agar aplikasi tidak crash
  }
}
