/**
 * ============================================================
 * test_AIProcessor.gs — Unit Tests for AIProcessor
 * Hermes Agent | Google Apps Script
 * ============================================================
 *
 * CARA MENJALANKAN:
 * 1. Buka Apps Script Editor
 * 2. Pilih fungsi test yang ingin dijalankan dari dropdown
 * 3. Klik tombol Run
 * 4. Lihat hasil di View > Logs (atau Execution Log)
 */

/**
 * Test: Parsing JSON valid dari LLM.
 */
function test_parseValidJSON() {
  const mockResponse = JSON.stringify({
    action:  'calendar',
    params:  { title: 'Rapat Tim', date: '2025-07-10', time: '14:00', duration: 60 },
    message: 'Saya akan menambahkan event ke kalendermu!',
  });

  // Simulasi _parseToolCall (akses fungsi private via eval atau refactor ke testable)
  const result = _parseToolCall(mockResponse);

  Logger.log('TEST test_parseValidJSON:');
  Logger.log('  action  = ' + result.action);   // Expected: calendar
  Logger.log('  title   = ' + result.params.title); // Expected: Rapat Tim
  Logger.log('  message = ' + result.message);

  const passed = result.action === 'calendar' && result.params.title === 'Rapat Tim';
  Logger.log(passed ? '✅ PASSED' : '❌ FAILED');
}

/**
 * Test: Fallback saat LLM mengembalikan teks biasa (bukan JSON).
 */
function test_parseFallbackOnInvalidJSON() {
  const mockResponse = 'Maaf, saya tidak mengerti permintaan Anda.';
  const result       = _parseToolCall(mockResponse);

  Logger.log('TEST test_parseFallbackOnInvalidJSON:');
  Logger.log('  action  = ' + result.action);   // Expected: reply
  Logger.log('  message = ' + result.message);

  const passed = result.action === 'reply';
  Logger.log(passed ? '✅ PASSED' : '❌ FAILED');
}

/**
 * Test: Parsing JSON yang dibungkus markdown code block.
 */
function test_parseJSONWithMarkdownWrapper() {
  const mockResponse =
    '```json\n' +
    '{"action":"news","params":{"query":"teknologi","language":"id"},"message":"Mencari berita..."}\n' +
    '```';

  const result = _parseToolCall(mockResponse);

  Logger.log('TEST test_parseJSONWithMarkdownWrapper:');
  Logger.log('  action = ' + result.action);  // Expected: news
  Logger.log('  query  = ' + result.params.query); // Expected: teknologi

  const passed = result.action === 'news' && result.params.query === 'teknologi';
  Logger.log(passed ? '✅ PASSED' : '❌ FAILED');
}

/**
 * Test: Validasi datetime parser untuk CalendarService.
 */
function test_parseDateTimeValid() {
  try {
    const date = _parseDateTime('2025-07-10', '14:00');
    Logger.log('TEST test_parseDateTimeValid:');
    Logger.log('  Parsed date = ' + date.toString());
    Logger.log('✅ PASSED');
  } catch (e) {
    Logger.log('❌ FAILED: ' + e.message);
  }
}

/**
 * Test: Error pada format tanggal yang salah.
 */
function test_parseDateTimeInvalid() {
  try {
    _parseDateTime('10-07-2025', '14:00'); // Format salah: DD-MM-YYYY
    Logger.log('❌ FAILED: Harusnya throw error!');
  } catch (e) {
    Logger.log('TEST test_parseDateTimeInvalid:');
    Logger.log('  Error: ' + e.message);
    Logger.log('✅ PASSED (error diexpected)');
  }
}

/**
 * Run semua test sekaligus.
 */
function runAllTests() {
  Logger.log('='.repeat(50));
  Logger.log('Running Hermes Agent Test Suite...');
  Logger.log('='.repeat(50));

  test_parseValidJSON();
  Logger.log('');
  test_parseFallbackOnInvalidJSON();
  Logger.log('');
  test_parseJSONWithMarkdownWrapper();
  Logger.log('');
  test_parseDateTimeValid();
  Logger.log('');
  test_parseDateTimeInvalid();

  Logger.log('');
  Logger.log('='.repeat(50));
  Logger.log('Test Suite Selesai.');
  Logger.log('='.repeat(50));
}
