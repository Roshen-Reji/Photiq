const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  student_id: { type: String, required: true },
  filename: { type: String, required: true },
  camera_id: { type: String }, 
  source: { type: String },
  status: { type: String, default: 'pending' },
  rclone_path: { type: String },
  error_log: { type: String },
  drive_url: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Upload', uploadSchema);
