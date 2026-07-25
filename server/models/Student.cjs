const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const studentSchema = new mongoose.Schema({
  student_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  department: { type: String },
  physical_qr: { type: String }, // Pre-printed card ID if assigned
  digital_qr: { type: String, default: uuidv4 }, // Auto-generated UUID/Token
  folder_id: { type: String }, // Google Drive folder ID or link
  status: { 
    type: String, 
    enum: ['pending', 'active', 'completed', 'skipped'],
    default: 'pending'
  },
  queuePosition: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
