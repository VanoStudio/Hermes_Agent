import mongoose from 'mongoose';

// Registry grup WhatsApp yang diisi secara pasif dari event pesan,
// supaya endpoint /groups bisa baca dari sini tanpa perlu scan browser
// yang berat & rawan timeout di Railway.
const groupSchema = new mongoose.Schema({
  _id: { type: String },              // JID grup, contoh: 12036304...@g.us
  name: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

export const Group = mongoose.model('Group', groupSchema, 'wa_groups');
