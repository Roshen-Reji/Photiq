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

    let rcloneDestination = '/Incoming';

    if (studentId !== 'UNASSIGNED') {
      const student = await Student.findOne({ student_id: studentId });
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }
      const folderName = rclone.getFolderName(student);
      rcloneDestination = `/${folderName}`;
    }

    const upload = new Upload({
      student_id: studentId,
      filename,
      source: source || 'stage',
      camera_id: camera || 'unknown',
      rclone_path: `${rcloneDestination}/${filename}`,
      status: 'pending'
    });

    await upload.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('agent_status', {
        id: camera || 'STAGE_CAM_A',
        time: new Date().toLocaleTimeString(),
        file: filename
      });
    }

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

    const io = req.app.get('io');
    if (io) {
      io.emit('system_log', {
        time: new Date().toLocaleTimeString(),
        level: completed ? 'ok' : 'warn',
        message: completed ? `FILE SYNCED: ${upload.filename}` : `SYNC FAILED: ${upload.filename}`
      });
      if (completed && upload.student_id === 'UNASSIGNED') {
        io.emit('new_unassigned_photo', upload);
      }
    }

    res.json(upload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all unassigned photos
router.get('/unassigned', async (req, res) => {
  try {
    const unassigned = await Upload.find({ student_id: 'UNASSIGNED', status: 'completed' }).sort({ createdAt: -1 });
    res.json(unassigned);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stream a photo by upload ID
router.get('/stream/:id', async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id);
    if (!upload || !upload.rclone_path) return res.status(404).send('Not found');
    
    rclone.streamPhotoByPath(upload.rclone_path, res);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Assign photo to a student
router.post('/:id/assign', async (req, res) => {
  try {
    const { studentId } = req.body;
    const upload = await Upload.findById(req.params.id);
    
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    if (upload.student_id !== 'UNASSIGNED') return res.status(400).json({ error: 'Already assigned' });
    
    const student = await Student.findOne({ student_id: studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    const folderName = rclone.getFolderName(student);
    const newRclonePath = `/${folderName}/${upload.filename}`;
    
    // Move on remote using rclone
    await rclone.moveFile(upload.rclone_path, newRclonePath);
    
    upload.student_id = studentId;
    upload.rclone_path = newRclonePath;
    await upload.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('system_log', {
        time: new Date().toLocaleTimeString(),
        level: 'ok',
        message: `ASSIGNED: ${upload.filename} to ${student.name}`
      });
      io.emit('photo_assigned', upload);
    }
    
    res.json(upload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
