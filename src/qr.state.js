// Menyimpan state QR/koneksi WhatsApp terkini secara in-memory,
// dibaca oleh server.js untuk endpoint /qr dan /status.

let latestQr = null;
let status = 'initializing'; // initializing | qr_ready | authenticated | ready | disconnected | auth_failure

export function setQr(qr) {
  latestQr = qr;
  status = 'qr_ready';
}

export function setStatus(newStatus) {
  status = newStatus;
  if (newStatus !== 'qr_ready') {
    latestQr = null;
  }
}

export function getState() {
  return { latestQr, status };
}
