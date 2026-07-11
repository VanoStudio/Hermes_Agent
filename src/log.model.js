import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
  source: { type: String, required: true }, // 'whatsapp' | 'telegram' | 'system'
  event: { type: String, required: true },  // 'qr' | 'ready' | 'auth_failure' | ...
  level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
  message: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export const Log = mongoose.model('Log', logSchema, 'bot_logs');
