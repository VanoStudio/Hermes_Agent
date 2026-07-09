# Menggunakan base image yang ringan dan aman
FROM node:20-alpine AS builder

# Set working directory di dalam container
WORKDIR /app

# Menyalin file package.json dan package-lock.json (jika ada)
# Hal ini memanfaatkan Docker cache agar npm install tidak dijalankan ulang jika dependensi tidak berubah
COPY package*.json ./

# Menginstal dependensi produksi saja agar image lebih ringan
RUN npm install --omit=dev

# Menyalin seluruh source code ke dalam container
COPY . .

# Tahap produksi menggunakan image yang lebih bersih
FROM node:20-alpine

WORKDIR /app

# Copy dependensi dan source code dari tahap builder
COPY --from=builder /app /app

# Mengatur environment variable default
ENV NODE_ENV=production

# Expose port yang akan digunakan oleh aplikasi (Railway biasanya mendeteksi PORT otomatis)
EXPOSE 3000

# Entrypoint untuk menjalankan aplikasi
# Pastikan 'npm start' sudah didefinisikan di package.json, atau ganti dengan 'node src/index.js'
CMD ["npm", "start"]
