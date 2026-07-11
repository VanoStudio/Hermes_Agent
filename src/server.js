import express from 'express';
import QRCode from 'qrcode';
import { getState } from './qr.state.js';
import { Log } from './log.model.js';
import { getClient } from './wa.state.js';

export function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.get('/', (req, res) => {
    res.send('Hermes Agent is running.');
  });

  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  app.get('/status', (req, res) => {
    const { status } = getState();
    res.json({ status });
  });

  app.get('/qr', async (req, res) => {
    const { latestQr, status } = getState();

    if (!latestQr) {
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;margin-top:60px;">
          <h2>Status WhatsApp: ${status}</h2>
          <p>Tidak ada QR aktif saat ini.</p>
          ${status !== 'ready' ? '<script>setTimeout(() => location.reload(), 5000)</script>' : ''}
        </body></html>
      `);
    }

    try {
      const qrImage = await QRCode.toDataURL(latestQr);
      res.send(`
        <html>
          <body style="font-family:sans-serif;text-align:center;margin-top:40px;">
            <h2>Scan QR WhatsApp - Hermes Agent</h2>
            <img src="${qrImage}" alt="QR Code" />
            <p>Halaman ini refresh otomatis tiap 10 detik.</p>
            <script>setTimeout(() => location.reload(), 10000)</script>
          </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send('Gagal generate QR image: ' + err.message);
    }
  });

  app.get('/groups', async (req, res) => {
    const client = getClient();
    const { status } = getState();

    if (!client || status !== 'ready') {
      return res.status(503).json({ error: `Bot belum siap (status: ${status}). Coba lagi setelah status "ready".` });
    }

    try {
      // Sengaja TIDAK pakai client.getChats() - fungsi itu memanggil
      // groupMetadata.update() (request jaringan live ke server WhatsApp)
      // untuk SETIAP grup, jadi bisa memakan waktu menit-an dan gampang
      // timeout di CPU terbatas seperti Railway. Di sini kita cuma butuh
      // nama + ID, jadi baca langsung dari Store yang sudah ada di memori
      // tanpa memicu request tambahan apa pun - hasilnya instan.
      const groups = await Promise.race([
        client.pupPage.evaluate(() => {
          const chats = window.require('WAWebCollections').Chat.getModelsArray();
          return chats
            .filter((chat) => !!chat.groupMetadata)
            .map((chat) => ({
              name: chat.name || chat.formattedTitle || chat.id.user,
              id: chat.id._serialized
            }));
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 15 detik saat membaca Store WhatsApp Web')), 15000))
      ]);

      res.json({ count: groups.length, groups });
    } catch (err) {
      res.status(500).json({ error: 'Gagal mengambil daftar grup: ' + err.message });
    }
  });

  app.get('/logs', async (req, res) => {
    try {
      const logs = await Log.find().sort({ createdAt: -1 }).limit(50);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`[Server] HTTP server listening on port ${PORT}`);
  });
}
