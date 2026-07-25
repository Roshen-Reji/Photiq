const express = require('express');
const router = express.Router();
const Upload = require('../models/Upload.cjs');
const Student = require('../models/Student.cjs');
const rclone = require('../controllers/rclone.cjs');

// The agent requests an upload intent
router.post('/intent', async (req, res) => {
  try {
    const { studentId, source, filename, camera, localPath } = req.body;

    if (!studentId || !filename) {
      return res.status(400).json({ error: 'Missing studentId or filename' });
    }

    const student = await Student.findOne({ student_id: studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const folderName = rclone.getFolderName(student);
    const rcloneDestination = `/${folderName}`;

    const upload = new Upload({
      student_id: studentId,
      filename,
      source: source || 'stage',
      camera_id: camera || 'unknown',
      rclone_path: `${rcloneDestination}/${filename}`,
      status: 'pending'
    });

    await upload.save();

    res.json({
      uploadId: upload._id,
      rcloneDestination
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The agent confirms upload completion
router.post('/:id/completed', async (req, res) => {
  try {
    const { completed, error } = req.body;
    
    const upload = await Upload.findById(req.params.id);
    if (!upload) return res.status(404).json({ error: 'Upload intent not found' });

    upload.status = completed ? 'completed' : 'failed';
    if (error) upload.error_log = error;
    
    await upload.save();

    // Optionally emit a socket event so the Monitor knows a file arrived
    const io = req.app.get('io');
    if (io) {
      io.emit('system_log', {
        time: new Date().toLocaleTimeString(),
        level: completed ? 'ok' : 'warn',
        message: completed ? `FILE SYNCED: ${upload.filename}` : `SYNC FAILED: ${upload.filename}`
      });
    }

    res.json(upload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
