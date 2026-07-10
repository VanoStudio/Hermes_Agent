# ============================================================
# Dockerfile — Hermes Agent (Telegram + WhatsApp Dual Bot)
# Optimized untuk Railway.app
# ============================================================

# === TAHAP 1: Builder (Install npm dependencies saja) ===
FROM node:20-slim AS builder

# Skip download Chromium saat npm install.
# Kita akan pakai Chromium bawaan OS di tahap produksi.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# === TAHAP 2: Production (Runtime dengan Chromium OS) ===
FROM node:20-slim

# Install Chromium bawaan Debian + semua library pendukungnya.
# Ini SATU-SATUNYA cara yang reliable untuk menjalankan Puppeteer di Docker.
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules dan source code dari builder
COPY --from=builder /app /app

# Konfigurasi environment untuk production
ENV NODE_ENV=production

# KRUSIAL: Arahkan Puppeteer ke Chromium bawaan OS, BUKAN download sendiri.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

CMD ["node", "src/index.js"]
