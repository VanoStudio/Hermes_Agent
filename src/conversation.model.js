import mongoose from 'mongoose';

// Riwayat percakapan per chat, supaya AI punya konteks lintas pesan
// (tanpa ini, tiap pesan diproses AI seolah percakapan baru).
const conversationSchema = new mongoose.Schema({
  chatId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Conversation = mongoose.model('Conversation', conversationSchema, 'conversations');
