import mongoose from 'mongoose';

// Profil pengguna PERMANEN, terpisah dari riwayat chat biasa (yang cuma
// menyimpan N pesan terakhir). Dikunci per ID Telegram unik (msg.from.id),
// BUKAN per chat - supaya identitas tiap orang tidak bercampur walau mereka
// chat lewat grup yang sama.
const userSchema = new mongoose.Schema({
  _id: { type: String },              // Telegram user id (string)
  telegramUsername: { type: String, default: null },
  nickname: { type: String, default: null },       // nama panggilan UNTUK user ini
  assistantName: { type: String, default: null },  // nama AI ini KHUSUS untuk user tsb
  notes: { type: [String], default: [] }, // fakta durable lain, mis. preferensi
  updatedAt: { type: Date, default: Date.now }
});

export const UserProfile = mongoose.model('UserProfile', userSchema, 'user_profiles');
