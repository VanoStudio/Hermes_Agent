import Parser from 'rss-parser';
import axios from 'axios';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';

const parser = new Parser();

// Batas panjang teks artikel yang diikutkan ke AI - cukup untuk ringkasan
// 2-3 paragraf yang akurat, tapi tidak membengkakkan prompt tanpa perlu.
const MAX_ARTICLE_CHARS = 4000;
const ARTICLE_FETCH_TIMEOUT_MS = 8000;

// jsdom suka mencetak warning "Could not parse CSS stylesheet" saat parsing
// halaman berita modern (CSS-in-JS, dsb) - jinak/tidak fatal (ekstraksi teks
// tetap jalan), tapi berisik di log Railway. VirtualConsole kosong (tidak
// disambungkan ke console) meredamnya tanpa menyembunyikan error asli, karena
// kegagalan fetch/parse tetap ditangani lewat try/catch di bawah.
const silentVirtualConsole = new VirtualConsole();

/**
 * Ambil isi teks penuh sebuah artikel berita (bukan cuma cuplikan RSS),
 * pakai Readability (mesin yang sama dengan Firefox Reader View) supaya
 * bekerja generik di berbagai situs berita tanpa scraping khusus per situs.
 * Gagal dengan aman (return null) kalau situs sumber memblokir/timeout -
 * pemanggil harus fallback ke cuplikan RSS biasa.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
export async function fetchArticleFullText(url) {
  try {
    const res = await axios.get(url, {
      timeout: ARTICLE_FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const dom = new JSDOM(res.data, { url, virtualConsole: silentVirtualConsole });
    const article = new Readability(dom.window.document).parse();
    const text = article?.textContent?.trim();
    if (!text) return null;
    return text.slice(0, MAX_ARTICLE_CHARS);
  } catch (error) {
    console.warn(`[NewsService] Gagal ambil isi artikel penuh (${url}):`, error.message);
    return null;
  }
}

/**
 * Lengkapi daftar berita dengan isi artikel penuh (best-effort, paralel).
 * Item yang gagal diambil tetap dipertahankan, cuma pakai description (RSS
 * snippet) sebagai fallback isinya - supaya satu sumber lambat/bermasalah
 * tidak menggagalkan seluruh daftar.
 * @param {Array<{title: string, description: string, url: string}>} newsList
 */
export async function attachFullText(newsList) {
  const results = await Promise.allSettled(newsList.map((n) => fetchArticleFullText(n.url)));
  return newsList.map((n, i) => ({
    ...n,
    fullText: (results[i].status === 'fulfilled' && results[i].value) || n.description
  }));
}

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
