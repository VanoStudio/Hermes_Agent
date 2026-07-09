# Hermes Agent 🪽

**Autonomous AI Agent** yang terintegrasi dengan Telegram Bot, Google Apps Script, dan OpenRouter sebagai otak NLP.

[![Made with Google Apps Script](https://img.shields.io/badge/Made%20with-Google%20Apps%20Script-blue?logo=google)](https://script.google.com)
[![Powered by OpenRouter](https://img.shields.io/badge/Powered%20by-OpenRouter-purple)](https://openrouter.ai)
[![Telegram Bot](https://img.shields.io/badge/Interface-Telegram%20Bot-blue?logo=telegram)](https://core.telegram.org/bots)

---

## ✨ Fitur

| Kemampuan | Contoh Perintah |
|---|---|
| 📅 **Buat Kalender** | "Hermes, jadwalkan rapat besok jam 14:00" |
| 📰 **Cari Berita** | "Cari berita AI terbaru" |
| 💬 **Percakapan Umum** | "Apa itu machine learning?" |

## 🏗️ Arsitektur

```
Telegram User → Webhook → Google Apps Script → OpenRouter LLM
                                              ↓ Tool Call JSON
                                         ┌──────────────┐
                                         │ Google Calendar│
                                         │ News API      │
                                         │ Direct Reply  │
                                         └──────────────┘
```

## 📂 Struktur File

```
src/
├── Main.gs              # Entry point (doPost webhook handler)
├── Config.gs            # Centralized config via PropertiesService
├── MessageHandler.gs    # Parse Telegram update, handle commands
├── AIProcessor.gs       # OpenRouter LLM call + tool call parsing
├── ActionDispatcher.gs  # Route AI output ke service yang tepat
├── CalendarService.gs   # Google Calendar CRUD
├── NewsService.gs       # News API integration
├── TelegramService.gs   # Telegram Bot API wrapper
└── ErrorHandler.gs      # Error handling, security, logging
```

## 🚀 Setup & Deployment

Lihat [`docs/SETUP.md`](docs/SETUP.md) untuk panduan lengkap.

**Ringkasan:**
1. Buat Google Apps Script project
2. Copy semua file `src/*.gs`
3. Isi Script Properties (API Keys)
4. Deploy sebagai Web App
5. Jalankan `registerWebhook()` di GAS editor

## 🔐 Keamanan

- Semua API key disimpan di **Script Properties** (tidak hardcoded)
- Webhook divalidasi via `X-Telegram-Bot-Api-Secret-Token`
- Error handling terpusat — tidak ada unhandled exception

## 📄 Lisensi

MIT License — Bebas digunakan dan dimodifikasi.
