import { google } from 'googleapis';

// ─── Setup Autentikasi Google (Untuk Kalender) ─────────────────────
// Menggunakan kredensial Service Account yang di-encode Base64 dari env vars
let authClient = null;

try {
  const b64Creds = process.env.GCP_CREDENTIALS_BASE64;
  if (b64Creds) {
    const credentials = JSON.parse(Buffer.from(b64Creds, 'base64').toString('utf8'));
    authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });
    console.log('[GoogleService] Autentikasi Google Calendar siap.');
  } else {
    console.warn('[GoogleService] Peringatan: GCP_CREDENTIALS_BASE64 tidak ditemukan, fitur kalender mungkin gagal.');
  }
} catch (e) {
  console.error('[GoogleService] Gagal memuat kredensial:', e.message);
}

const calendar = google.calendar({ version: 'v3', auth: authClient });
const CALENDAR_ID = process.env.CALENDAR_ID || 'primary';

/**
 * Menambahkan event ke Google Calendar
 * @param {Object} params Object parameter event
 * @returns {Promise<string>} Hasil eksekusi string terformat
 */
export async function addCalendarEvent(params) {
  if (!authClient) return `⚠️ Gagal menjadwalkan: Kredensial Google belum diset di server.`;
  
  try {
    const { title, date, time, duration = 60 } = params;
    if (!title || !date || !time) throw new Error("Parameter waktu tidak lengkap.");

    const startDateTime = new Date(`${date}T${time}:00+07:00`); // Asumsi WIB
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    const event = {
      summary: title,
      start: { dateTime: startDateTime.toISOString(), timeZone: 'Asia/Jakarta' },
      end: { dateTime: endDateTime.toISOString(), timeZone: 'Asia/Jakarta' }
    };

    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event
    });

    return `✅ *Berhasil dijadwalkan!*\n\n📌 **${title}**\n🕒 ${date} ${time}\n[🔗 Lihat Kalender](${res.data.htmlLink})`;

  } catch (error) {
    console.error('[GoogleService - Calendar Error]', error.message);
    return `❌ Gagal menambahkan jadwal: ${error.message}`;
  }
}
