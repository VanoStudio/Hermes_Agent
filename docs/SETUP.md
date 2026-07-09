# Setup Guide — Hermes Agent

## Prasyarat

- Akun Google (untuk Apps Script & Calendar)
- Telegram Bot Token dari [@BotFather](https://t.me/botfather)
- API Key dari [OpenRouter](https://openrouter.ai/keys)
- API Key dari [NewsAPI](https://newsapi.org/register) (opsional)

---

## Langkah 1: Buat Google Apps Script Project

1. Buka [script.google.com](https://script.google.com)
2. Klik **New Project**
3. Beri nama project: `Hermes Agent`

---

## Langkah 2: Upload Source Files

Copy isi setiap file dari folder `src/` ke editor GAS:

| File | Cara Upload |
|---|---|
| `Main.gs` | Rename file default (`Code.gs`) menjadi `Main` |
| `Config.gs` | Klik **+** > Script > beri nama `Config` |
| `MessageHandler.gs` | Klik **+** > Script > beri nama `MessageHandler` |
| `AIProcessor.gs` | Klik **+** > Script > beri nama `AIProcessor` |
| `ActionDispatcher.gs` | Klik **+** > Script > beri nama `ActionDispatcher` |
| `CalendarService.gs` | Klik **+** > Script > beri nama `CalendarService` |
| `NewsService.gs` | Klik **+** > Script > beri nama `NewsService` |
| `TelegramService.gs` | Klik **+** > Script > beri nama `TelegramService` |
| `ErrorHandler.gs` | Klik **+** > Script > beri nama `ErrorHandler` |

> **Tip:** Gunakan [clasp](https://github.com/google/clasp) untuk push dari local:
> ```bash
> npm install -g @google/clasp
> clasp login
> clasp create --type webapp --title "Hermes Agent"
> clasp push
> ```

---

## Langkah 3: Isi Script Properties (API Keys)

1. Di GAS Editor, klik ikon **⚙️ (Project Settings)**
2. Scroll ke bagian **Script Properties**
3. Klik **Add Script Property** dan tambahkan:

| Property Name | Value | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `12345:AAAA...` | Dari @BotFather |
| `TELEGRAM_SECRET_TOKEN` | `random_string_aman` | Buat sendiri, minimal 20 karakter |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | Dari openrouter.ai |
| `NEWS_API_KEY` | `abc123...` | Dari newsapi.org |
| `CALENDAR_ID` | `primary` | Atau email Google Calendar spesifik |
| `OPENROUTER_MODEL` | `google/gemini-flash-1.5` | Atau model lain dari OpenRouter |
| `DEBUG_MODE` | `false` | Set `true` saat development |

> ⚠️ **JANGAN** commit nilai API key ke Git!

---

## Langkah 4: Deploy Sebagai Web App

1. Klik **Deploy** > **New Deployment**
2. Pilih tipe: **Web App**
3. Konfigurasi:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone` (diperlukan agar Telegram bisa POST)
4. Klik **Deploy**
5. **Copy URL** yang diberikan (format: `https://script.google.com/macros/s/XXXX/exec`)

---

## Langkah 5: Registrasi Webhook Telegram

**Opsi A: Via GAS Editor (Recommended)**

1. Di GAS Editor, pilih fungsi `registerWebhook` dari dropdown
2. Klik **Run**
3. Cek log di **View > Execution Log**

**Opsi B: Via Browser/curl**

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<GAS_URL>&secret_token=<SECRET>"
```

---

## Langkah 6: Test Bot

Buka Telegram, cari bot kamu, dan kirim:
- `/start` — Memulai bot
- `Hermes, jadwalkan rapat besok jam 10 pagi` — Test kalender
- `Cari berita teknologi` — Test berita

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Bot tidak merespons | Cek `checkWebhookInfo()` di GAS, lihat `last_error_message` |
| Error "Missing Script Properties" | Pastikan semua property sudah diisi (Langkah 3) |
| Calendar event tidak dibuat | Cek scope OAuth di `appsscript.json` |
| OpenRouter error 401 | Pastikan `OPENROUTER_API_KEY` valid |
| News API error | Pastikan `NEWS_API_KEY` valid dan query tidak kosong |

---

## Update Deployment

Setiap kali kamu mengubah kode:
1. Simpan perubahan di GAS Editor
2. **Deploy** > **Manage Deployments** > Edit deployment yang ada > **Deploy**
3. URL tidak berubah, webhook tidak perlu diregistrasi ulang

---

## Menggunakan clasp (Advanced)

```bash
# Install clasp
npm install -g @google/clasp

# Login ke Google Account
clasp login

# Clone project GAS yang sudah ada
clasp clone <SCRIPT_ID>

# Push perubahan lokal ke GAS
clasp push

# Buka di browser
clasp open
```

`SCRIPT_ID` bisa ditemukan di URL GAS Editor atau di **Project Settings**.
