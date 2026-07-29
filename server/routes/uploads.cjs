const express = require('express');
const router = express.Router();
const Upload = require('../models/Upload.cjs');
const Student = require('../models/Student.cjs');
const rclone = require('../controllers/rclone.cjs');

// The agent requests an upload intent
router.post('/intent', async (req, res) => {
  try {
    const { studentId, source, filename, camera, localPath, previewBase64 } = req.body;

    if (!studentId || !filename) {
      return res.status(400).json({ error: 'Missing studentId or filename' });
    }

    let rcloneDestination = '/GradSync/Incoming';

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
      status: previewBase64 ? 'preview_ready' : 'pending',
      preview_base64: previewBase64 || null,
      preview_ready: !!previewBase64,
      original_ready: false,
      upload_progress: 0,
    });

    await upload.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('agent_status', {
        id: camera || 'STAGE_CAM_A',
        time: new Date().toLocaleTimeString(),
        file: filename
      });

      // Emit preview_ready immediately so monitor/portal see the thumbnail instantly
      if (previewBase64) {
        io.emit('preview_ready', {
          _id: upload._id,
          student_id: upload.student_id,
          filename: upload.filename,
          status: 'preview_ready',
          preview_base64: previewBase64,
          createdAt: upload.createdAt,
        });
      }

      // Emit immediately so the monitor incoming feed updates live
      if (studentId === 'UNASSIGNED') {
        io.emit('new_unassigned_photo', {
          _id: upload._id,
          student_id: upload.student_id,
          filename: upload.filename,
          status: upload.status,
          preview_ready: upload.preview_ready,
          preview_base64: previewBase64 || null,
          createdAt: upload.createdAt,
        });
      }
    }

    res.json({
      uploadId: upload._id,
      rcloneDestination
    });
  } catch (err) {
    console.error('Upload intent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Agent reports upload progress
router.patch('/:id/progress', async (req, res) => {
  try {
    const { progress, status } = req.body;
    const upload = await Upload.findById(req.params.id);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });

    if (typeof progress === 'number') upload.upload_progress = Math.min(100, Math.max(0, progress));
    if (status) upload.status = status;

    await upload.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('upload_progress', {
        _id: upload._id,
        student_id: upload.student_id,
        filename: upload.filename,
        upload_progress: upload.upload_progress,
        status: upload.status,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Upload progress error:', err);
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
    upload.original_ready = !!completed;
    upload.upload_progress = completed ? 100 : upload.upload_progress;
    if (error) {
      upload.error_log = error;
      upload.last_error = error;
    }
    
    await upload.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('system_log', {
        time: new Date().toLocaleTimeString(),
        level: completed ? 'ok' : 'warn',
        message: completed ? `FILE SYNCED: ${upload.filename}` : `SYNC FAILED: ${upload.filename}`
      });

      // Emit original_ready so portals can swap preview with full-res
      if (completed) {
        io.emit('original_ready', {
          _id: upload._id,
          student_id: upload.student_id,
          filename: upload.filename,
          status: 'completed',
          original_ready: true,
        });
      }

      // Notify monitor to refresh the thumbnail now that file is on Drive
      if (completed && upload.student_id === 'UNASSIGNED') {
        io.emit('photo_upload_complete', upload);
      }

      // Notify student portals
      if (completed && upload.student_id !== 'UNASSIGNED') {
        io.emit('photos_updated', {
          student_id: upload.student_id,
          upload_id: upload._id,
          filename: upload.filename,
        });
      }
    }

    res.json(upload);
  } catch (err) {
    console.error('Upload completed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all unassigned photos
router.get('/unassigned', async (req, res) => {
  try {
    const unassigned = await Upload.find(
      { student_id: 'UNASSIGNED' },
      { preview_base64: 0 } // Exclude large base64 from list queries for performance
    ).sort({ createdAt: -1 }).lean();
    res.json(unassigned);
  } catch (err) {
    console.error('Unassigned fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get preview image for an upload
router.get('/preview/:id', async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id, { preview_base64: 1, preview_ready: 1 }).lean();
    if (!upload || !upload.preview_base64) {
      return res.status(404).send('Preview not available');
    }

    // Decode base64 and send as JPEG
    const imgBuffer = Buffer.from(upload.preview_base64, 'base64');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Length', imgBuffer.length);
    res.send(imgBuffer);
  } catch (err) {
    console.error('Preview fetch error:', err);
    res.status(500).send(err.message);
  }
});

// Stream a photo by upload ID (serves original if available, falls back to preview)
router.get('/stream/:id', async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id);
    if (!upload) return res.status(404).send('Not found');

    // Set content type so the UI renders it as an image correctly
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    // If original is ready on Drive, stream it
    if (upload.original_ready && upload.rclone_path) {
      rclone.streamPhotoByPath(upload.rclone_path, res);
      return;
    }

    // Fallback: serve the preview if available
    if (upload.preview_base64) {
      const imgBuffer = Buffer.from(upload.preview_base64, 'base64');
      res.setHeader('Content-Length', imgBuffer.length);
      res.send(imgBuffer);
      return;
    }

    // Last resort: try streaming from rclone path anyway
    if (upload.rclone_path) {
      rclone.streamPhotoByPath(upload.rclone_path, res);
      return;
    }

    res.status(404).send('No image available');
  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) res.status(500).send(err.message);
  }
});

// Get uploads for a specific student (used by student portal for instant display)
router.get('/student/:studentId', async (req, res) => {
  try {
    const uploads = await Upload.find(
      { student_id: req.params.studentId, status: { $in: ['preview_ready', 'uploading_original', 'completed'] } },
      { preview_base64: 0 } // Exclude large base64 for list queries
    ).sort({ createdAt: -1 }).lean();
    res.json(uploads);
  } catch (err) {
    console.error('Student uploads fetch error:', err);
    res.status(500).json({ error: err.message });
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
    
    // Move on remote using rclone (non-blocking — don't fail the assignment if move fails)
    rclone.moveFile(upload.rclone_path, newRclonePath).catch(err => {
      console.error('RClone move failed (non-critical):', err.message);
    });
    
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
      io.emit('photos_updated', {
        student_id: studentId,
        upload_id: upload._id,
        filename: upload.filename,
      });
    }
    
    res.json(upload);
  } catch (err) {
    console.error('Photo assign error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
