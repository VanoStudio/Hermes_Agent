import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';

/**
 * Menyimpan auth-state Baileys (creds + signal keys) ke MongoDB, bukan ke file,
 * supaya sesi tetap awet di Railway yang filesystem-nya ephemeral. Ini pengganti
 * langsung untuk RemoteAuth-nya whatsapp-web.js - dan JAUH lebih ringan karena
 * Baileys tidak butuh Chromium sama sekali.
 *
 * @param {import('mongodb').Collection} coll Koleksi MongoDB untuk menyimpan state
 */
export async function useMongoAuthState(coll) {
  const writeData = (data, id) =>
    coll.replaceOne(
      { _id: id },
      { _id: id, data: JSON.stringify(data, BufferJSON.replacer) },
      { upsert: true }
    );

  const readData = async (id) => {
    const doc = await coll.findOne({ _id: id });
    if (!doc || !doc.data) return null;
    return JSON.parse(doc.data, BufferJSON.reviver);
  };

  const removeData = async (id) => {
    await coll.deleteOne({ _id: id });
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, 'creds'),
    /** Hapus seluruh state (dipakai saat logout supaya bisa scan QR ulang bersih). */
    clearState: () => coll.deleteMany({})
  };
}
