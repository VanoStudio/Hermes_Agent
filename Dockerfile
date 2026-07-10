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
# Termasuk 'chromium' agar kita menggunakan browser bawaan OS
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
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependensi dan source code dari builder
COPY --from=builder /app /app

ENV NODE_ENV=production
# Set path executable Chromium bawaan Debian agar Puppeteer langsung menggunakannya
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium


EXPOSE 3000

CMD ["node", "src/index.js"]
