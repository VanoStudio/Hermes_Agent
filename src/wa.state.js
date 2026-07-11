// Menyimpan referensi socket Baileys yang sedang aktif,
// dibaca oleh server.js untuk endpoint on-demand seperti /groups.

let client = null;

export function setClient(instance) {
  client = instance;
}

export function getClient() {
  return client;
}
