import express from 'express';
import QRCode from 'qrcode';
import { getState } from './qr.state.js';
import { Log } from './log.model.js';
import { getClient } from './wa.state.js';
import { Group } from './group.model.js';
import { refreshGroups } from './whatsapp.bot.js';

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

  // Daftar grup dibaca dari MongoDB. Dengan Baileys, registry diisi otomatis
  // saat koneksi terbuka (refreshGroups) - ringan & instan, tanpa browser.
  // Pakai ?refresh=1 untuk memperbarui langsung dari server WhatsApp.
  app.get('/groups', async (req, res) => {
    try {
      let refresh = 'skipped';

      if (req.query.refresh === '1') {
        const sock = getClient();
        const { status } = getState();
        if (sock && status === 'ready') {
          try {
            const n = await refreshGroups(sock);
            refresh = `ok (${n} grup)`;
          } catch (err) {
            refresh = 'error: ' + err.message;
          }
        } else {
          refresh = `not_ready (status: ${status})`;
        }
      }

      const docs = await Group.find().sort({ name: 1, _id: 1 });
      const groups = docs.map((g) => ({ name: g.name || '(tanpa nama)', id: g._id }));
      res.json({
        count: groups.length,
        refresh,
        hint: 'Grup terisi otomatis saat bot terhubung. Tambahkan ?refresh=1 untuk memperbarui dari server WhatsApp.',
        groups
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
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
