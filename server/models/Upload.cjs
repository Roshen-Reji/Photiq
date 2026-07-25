const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  student_id: { type: String, required: true },
  filename: { type: String, required: true },
  camera: { type: String }, // 'stage' or 'booth'
  uploaded: { type: Boolean, default: false },
  drive_url: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Upload', uploadSchema);
