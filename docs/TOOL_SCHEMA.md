# Tool Call Schema — Hermes Agent

Dokumen ini mendefinisikan format JSON yang harus dihasilkan oleh LLM
dan yang akan diparsing oleh `ActionDispatcher.gs`.

---

## Format Umum

```json
{
  "action": "<nama_action>",
  "params": { ... },
  "message": "Pesan ramah untuk dikirim ke user"
}
```

---

## Action: `calendar`

Membuat event baru di Google Calendar.

```json
{
  "action": "calendar",
  "params": {
    "title":       "string (required) — Judul event",
    "date":        "string (required) — Format: YYYY-MM-DD",
    "time":        "string (required) — Format: HH:MM (24 jam)",
    "duration":    "number (optional) — Durasi dalam menit, default: 60",
    "description": "string (optional) — Deskripsi event",
    "location":    "string (optional) — Lokasi event"
  },
  "message": "✅ Event [title] dijadwalkan pada [date] pukul [time]!"
}
```

**Contoh Valid:**
```json
{
  "action": "calendar",
  "params": {
    "title": "Rapat Tim Produk",
    "date": "2025-07-10",
    "time": "14:00",
    "duration": 90
  },
  "message": "Saya akan menambahkan Rapat Tim Produk ke kalendermu pada 10 Juli 2025 pukul 14:00!"
}
```

---

## Action: `news`

Mengambil berita terbaru dari NewsAPI.

```json
{
  "action": "news",
  "params": {
    "query":    "string (required) — Kata kunci pencarian",
    "language": "string (optional) — 'id' (Indonesia) atau 'en' (English), default: 'id'",
    "pageSize": "number (optional) — Jumlah artikel (1-10), default: 5"
  },
  "message": "🔍 Mencari berita terbaru tentang [query]..."
}
```

**Contoh Valid:**
```json
{
  "action": "news",
  "params": {
    "query": "kecerdasan buatan",
    "language": "id",
    "pageSize": 5
  },
  "message": "Baik, saya carikan berita terbaru tentang kecerdasan buatan!"
}
```

---

## Action: `reply`

Membalas pesan percakapan biasa tanpa eksekusi aksi eksternal.

```json
{
  "action": "reply",
  "params": {},
  "message": "string — Respons konversasional dari Hermes"
}
```

**Contoh Valid:**
```json
{
  "action": "reply",
  "params": {},
  "message": "Machine learning adalah cabang dari AI yang memungkinkan komputer belajar dari data tanpa diprogram secara eksplisit!"
}
```

---

## Error Response dari Dispatcher

Jika action tidak dikenali atau eksekusi gagal, user akan menerima:

```
⚠️ Hermes mengalami kendala

Maaf, terjadi kesalahan saat memproses permintaanmu.
Silakan coba lagi beberapa saat.
```

---

## Catatan Implementasi

- LLM dipaksa menghasilkan JSON via `response_format: { type: "json_object" }`
- Parser memiliki fallback ke `action: "reply"` jika JSON tidak valid
- Markdown code block (` ```json `) dibersihkan sebelum parsing
- Validasi field `action` hanya mengizinkan nilai dalam whitelist
