import express from 'express';
import QRCode from 'qrcode';
import { getState } from './qr.state.js';
import { Log } from './log.model.js';
import { getClient } from './wa.state.js';
import { Group } from './group.model.js';

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

  // Daftar grup dibaca dari MongoDB (registry yang diisi pasif dari event pesan).
  // Ini INSTAN dan tidak pernah menyentuh browser, jadi tidak bisa timeout.
  // Grup akan muncul di sini begitu ada aktivitas pesan di grup tersebut,
  // atau setelah kamu ketik "!groupinfo" di grup itu.
  app.get('/groups', async (req, res) => {
    try {
      let liveScan = 'skipped';

      // Opsional: /groups?refresh=1 mencoba scan penuh dari browser (best-effort).
      // Kalau browser lagi sibuk dan timeout, kita tetap balas isi Mongo - tidak error.
      if (req.query.refresh === '1') {
        liveScan = await refreshGroupsFromBrowser();
      }

      const docs = await Group.find().sort({ name: 1, _id: 1 });
      const groups = docs.map((g) => ({ name: g.name || '(tanpa nama)', id: g._id }));
      res.json({
        count: groups.length,
        liveScan,
        hint: 'Grup muncul setelah ada aktivitas pesan / setelah ketik "!groupinfo" di grup itu. Tambahkan ?refresh=1 untuk mencoba scan penuh.',
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

/**
 * Best-effort: coba scan semua grup langsung dari Store WhatsApp Web dan
 * simpan ke Mongo. Filter grup hanya lewat cek ID (server 'g.us'), TIDAK
 * menyentuh groupMetadata. Dibungkus race timeout supaya kalau browser sibuk
 * kita menyerah dengan rapi ('timeout') alih-alih menggantung/menggagalkan request.
 * @returns {Promise<'ok'|'timeout'|'not_ready'|'error'>}
 */
async function refreshGroupsFromBrowser() {
  const client = getClient();
  const { status } = getState();
  if (!client || !client.pupPage || status !== 'ready') return 'not_ready';

  try {
    const scanned = await Promise.race([
      client.pupPage.evaluate(() => {
        const chats = window.require('WAWebCollections').Chat.getModelsArray();
        const out = [];
        for (const c of chats) {
          try {
            const id = c.id;
            const isGroup =
              (typeof id?.isGroup === 'function' ? id.isGroup() : id?.server === 'g.us');
            if (!isGroup) continue;
            let name = '';
            try { name = c.formattedTitle || c.name || ''; } catch (e) { /* abaikan */ }
            out.push({ id: id._serialized, name });
          } catch (e) { /* lewati */ }
        }
        return out;
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 20000))
    ]);

    if (!scanned) return 'timeout';

    await Promise.all(
      scanned.map((g) =>
        Group.updateOne(
          { _id: g.id },
          { $set: { updatedAt: new Date(), ...(g.name ? { name: g.name } : {}) }, $setOnInsert: { _id: g.id } },
          { upsert: true }
        )
      )
    );
    return 'ok';
  } catch (e) {
    return 'error';
  }
}
