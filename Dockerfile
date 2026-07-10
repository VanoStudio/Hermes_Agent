# Menggunakan base image Debian-slim untuk kompatibilitas Chromium (Dibutuhkan whatsapp-web.js)
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
# Install dependencies
RUN npm install

COPY . .

# Tahap produksi
FROM node:20-slim

# Install dependencies sistem untuk Puppeteer/Chromium
# Ini krusial agar whatsapp-web.js bisa berjalan di Docker (Headless Chromium)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependensi dan source code dari builder
COPY --from=builder /app /app

ENV NODE_ENV=production
# Force Puppeteer untuk menghindari sandbox errors di Docker
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

EXPOSE 3000

CMD ["node", "src/index.js"]
