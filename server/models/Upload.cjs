const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  student_id: { type: String, required: true },
  filename: { type: String, required: true },
  camera_id: { type: String }, 
  source: { type: String },
  status: { 
    type: String, 
    default: 'pending',
    enum: ['pending', 'preview_uploading', 'preview_ready', 'uploading_original', 'completed', 'failed', 'retrying']
  },
  rclone_path: { type: String },
  error_log: { type: String },
  drive_url: { type: String },
  // Preview image support (Fix 1 & 2)
  preview_base64: { type: String }, // Small compressed JPEG preview as base64
  preview_ready: { type: Boolean, default: false },
  original_ready: { type: Boolean, default: false },
  upload_progress: { type: Number, default: 0, min: 0, max: 100 },
  retry_count: { type: Number, default: 0 },
  last_error: { type: String },
}, { timestamps: true });

// Index for fast lookups by student_id and status
uploadSchema.index({ student_id: 1, status: 1 });
uploadSchema.index({ student_id: 1, createdAt: -1 });

module.exports = mongoose.model('Upload', uploadSchema);
