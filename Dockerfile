# ============================================================
# Dockerfile — Hermes Agent (Telegram + WhatsApp Dual Bot)
# WhatsApp pakai Baileys (WebSocket) — TIDAK butuh Chromium/Puppeteer,
# jadi image jauh lebih kecil & hemat memori (cocok untuk Railway).
# ============================================================

FROM node:20-slim

WORKDIR /app

# Install dependency produksi saja.
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code.
COPY . .

ENV NODE_ENV=production

# Port HTTP server (QR image, status, logs, groups). Railway inject PORT sendiri.
EXPOSE 3000

CMD ["node", "src/index.js"]
