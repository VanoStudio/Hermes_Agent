/**
 * ============================================================
 * CalendarService.gs — Google Calendar Integration
 * Hermes Agent | Google Apps Script
 * ============================================================
 */

/**
 * Membuat event baru di Google Calendar.
 *
 * @param {object} params - Parameter event dari AI tool call.
 * @param {string} params.title    - Judul event.
 * @param {string} params.date     - Tanggal dalam format YYYY-MM-DD.
 * @param {string} params.time     - Waktu dalam format HH:MM (24 jam).
 * @param {number} [params.duration] - Durasi dalam menit (default: 60).
 * @param {string} [params.description] - Deskripsi event (opsional).
 * @returns {object} Detail event yang berhasil dibuat.
 */
function addCalendarEvent(params) {
  debugLog('CalendarService.addCalendarEvent', params);

  // ── Validasi parameter ──────────────────────────────────────────────────
  const requiredFields = ['title', 'date', 'time'];
  const missingFields  = requiredFields.filter(f => !params[f]);

  if (missingFields.length > 0) {
    throw new Error(`Parameter kalender tidak lengkap: ${missingFields.join(', ')}`);
  }

  // ── Parse waktu mulai & selesai ─────────────────────────────────────────
  const startDateTime = _parseDateTime(params.date, params.time);
  const duration      = params.duration || CONFIG.DEFAULT_EVENT_DURATION;
  const endDateTime   = new Date(startDateTime.getTime() + duration * 60 * 1000);

  // ── Validasi waktu tidak di masa lalu ───────────────────────────────────
  if (startDateTime < new Date()) {
    Logger.log(`[CalendarService] Warning: Event dijadwalkan di masa lalu (${startDateTime})`);
    // Tidak throw error, biarkan user memutuskan
  }

  // ── Buat event via Google Calendar API ─────────────────────────────────
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);

  if (!calendar) {
    throw new Error(`Kalender dengan ID '${CONFIG.CALENDAR_ID}' tidak ditemukan.`);
  }

  const eventOptions = {
    description: params.description || `Dibuat oleh ${CONFIG.APP_NAME}`,
    location:    params.location    || '',
  };

  const event = calendar.createEvent(
    params.title,
    startDateTime,
    endDateTime,
    eventOptions
  );

  Logger.log(`[CalendarService] Event berhasil dibuat: ${event.getId()}`);

  return {
    success:     true,
    eventId:     event.getId(),
    title:       event.getTitle(),
    date:        Utilities.formatDate(startDateTime, 'Asia/Jakarta', 'EEEE, dd MMMM yyyy'),
    time:        Utilities.formatDate(startDateTime, 'Asia/Jakarta', 'HH:mm'),
    duration:    duration,
    calendarUrl: event.getEventSeries
      ? 'https://calendar.google.com'
      : `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(event.getId())}`,
  };
}

/**
 * Mengambil event-event mendatang dari Google Calendar.
 *
 * @param {number} [maxResults=5] - Jumlah maksimum event yang diambil.
 * @param {number} [daysAhead=7]  - Berapa hari ke depan yang dicari.
 * @returns {Array} Array event objects.
 */
function listUpcomingEvents(maxResults, daysAhead) {
  const now     = new Date();
  const endDate = new Date(now.getTime() + (daysAhead || 7) * 24 * 60 * 60 * 1000);

  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) throw new Error(`Kalender '${CONFIG.CALENDAR_ID}' tidak ditemukan.`);

  const events = calendar.getEvents(now, endDate);

  return events.slice(0, maxResults || 5).map(event => ({
    title:    event.getTitle(),
    start:    Utilities.formatDate(event.getStartTime(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm'),
    end:      Utilities.formatDate(event.getEndTime(),   'Asia/Jakarta', 'HH:mm'),
    location: event.getLocation() || '',
  }));
}

// ─── Private Helper ────────────────────────────────────────────────────────

/**
 * Memparsing string date (YYYY-MM-DD) dan time (HH:MM) menjadi Date object.
 * @param {string} dateStr - Format: YYYY-MM-DD
 * @param {string} timeStr - Format: HH:MM
 * @returns {Date}
 */
function _parseDateTime(dateStr, timeStr) {
  // Validasi format dengan regex
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Format tanggal tidak valid: "${dateStr}". Gunakan YYYY-MM-DD.`);
  }
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new Error(`Format waktu tidak valid: "${timeStr}". Gunakan HH:MM.`);
  }

  const [year, month, day]   = dateStr.split('-').map(Number);
  const [hours, minutes]     = timeStr.split(':').map(Number);

  if (month < 1 || month > 12) throw new Error(`Bulan tidak valid: ${month}`);
  if (day   < 1 || day   > 31) throw new Error(`Tanggal tidak valid: ${day}`);
  if (hours < 0 || hours > 23) throw new Error(`Jam tidak valid: ${hours}`);
  if (minutes < 0 || minutes > 59) throw new Error(`Menit tidak valid: ${minutes}`);

  // Buat Date di timezone WIB (UTC+7)
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return date;
}
