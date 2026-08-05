const express = require('express');
const router = express.Router();
const Upload = require('../models/Upload.cjs');
const Student = require('../models/Student.cjs');
const rclone = require('../controllers/rclone.cjs');
const { ensurePublicIds, presentUpload } = require('../services/uploadPresentation.cjs');
const { streamUploadImage } = require('../services/imageProxy.cjs');

async function presentUploads(uploads) {
  await ensurePublicIds(Upload, uploads);
  return uploads.map((upload) => presentUpload(upload));
}

async function presentSingleUpload(upload) {
  if (!upload) return null;
  await ensurePublicIds(Upload, [upload]);
  return presentUpload(upload);
}

// The agent requests an upload intent. Its local file path stays in the agent's
// durable queue; storing it in the shared database would make image delivery
// depend on the photographer's computer.
router.post('/intent', async (req, res) => {
  try {
    const { studentId, source, filename, camera, previewBase64 } = req.body;

    if (!studentId || !filename) {
      return res.status(400).json({ error: 'Missing studentId or filename' });
    }

    // Use rclone.baseFolder so the path stays consistent if the base folder
    // config changes. Previously this was hardcoded to '/GradSync/Incoming'.
    let rcloneDestination = `/${rclone.baseFolder}/Incoming`;
    if (studentId !== 'UNASSIGNED') {
      const student = await Student.findOne({ student_id: studentId });
      if (!student) return res.status(404).json({ error: 'Student not found' });
      rcloneDestination = `/${rclone.getFolderName(student)}`;
    }

    const upload = new Upload({
      student_id: studentId,
      filename,
      source: source || 'stage',
      camera_id: camera || 'unknown',
      rclone_path: `${rcloneDestination}/${filename}`,
      status: previewBase64 ? 'preview_ready' : 'pending',
      preview_base64: previewBase64 || null,
      preview_ready: Boolean(previewBase64),
      original_ready: false,
      upload_progress: 0,
    });
    await upload.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('agent_status', {
        id: camera || 'STAGE_CAM_A',
        time: new Date().toLocaleTimeString(),
        file: filename,
      });

      const clientUpload = await presentSingleUpload(upload);

      // FIX: For UNASSIGNED photos, emit ONLY `new_unassigned_photo`.
      // Previously we emitted both `preview_ready` AND `new_unassigned_photo`,
      // causing duplicate entries on the monitor (the preview_ready handler
      // couldn't find the item to update since new_unassigned_photo already
      // added it with a slightly different shape).
      if (studentId === 'UNASSIGNED') {
        io.emit('new_unassigned_photo', clientUpload);
      } else if (previewBase64) {
        // For assigned photos, emit preview_ready so the student portal updates
        io.emit('preview_ready', clientUpload);
      }
    }

    // uploadId is intentionally agent-only; browsers receive public_id instead.
    res.json({ uploadId: upload._id, rcloneDestination });
  } catch (err) {
    console.error('Upload intent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Agent reports upload progress using its private MongoDB upload ID.
router.patch('/:id/progress', async (req, res) => {
  try {
    const { progress, status } = req.body;
    const upload = await Upload.findById(req.params.id);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });

    if (typeof progress === 'number') upload.upload_progress = Math.min(100, Math.max(0, progress));
    if (status) upload.status = status;
    await upload.save();

    const io = req.app.get('io');
    if (io) io.emit('upload_progress', await presentSingleUpload(upload));
    res.json({ ok: true });
  } catch (err) {
    console.error('Upload progress error:', err);
    res.status(500).json({ error: err.message });
  }
});

// The agent confirms the rclone upload is complete. A Drive file ID may be
// retained server-side for diagnostics, but delivery never depends on it.
router.post('/:id/completed', async (req, res) => {
  try {
    const { completed, error, driveFileId } = req.body;
    const upload = await Upload.findById(req.params.id);
    if (!upload) return res.status(404).json({ error: 'Upload intent not found' });

    upload.status = completed ? 'completed' : 'failed';
    upload.original_ready = Boolean(completed);
    upload.upload_progress = completed ? 100 : upload.upload_progress;
    if (driveFileId) upload.driveFileId = driveFileId;
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
        message: completed ? `FILE SYNCED: ${upload.filename}` : `SYNC FAILED: ${upload.filename}`,
      });

      const clientUpload = await presentSingleUpload(upload);
      if (completed) io.emit('original_ready', clientUpload);
      if (completed && upload.student_id === 'UNASSIGNED') {
        io.emit('photo_upload_complete', clientUpload);
      }
      if (completed && upload.student_id !== 'UNASSIGNED') {
        io.emit('photos_updated', {
          student_id: upload.student_id,
          filename: upload.filename,
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Upload completed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin/monitor list. The response deliberately contains only opaque IDs and
// proxy URLs, never local file paths or provider identifiers.
router.get('/unassigned', async (req, res) => {
  try {
    const uploads = await Upload.find({ student_id: 'UNASSIGNED' })
      .sort({ createdAt: -1 })
      .lean();
    res.json(await presentUploads(uploads));
  } catch (err) {
    console.error('Unassigned fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin/monitor proxy. It resolves an opaque public ID on the server and uses
// server-side rclone credentials to stream the remote object.
router.get('/stream/:publicId', async (req, res) => {
  try {
    const upload = await Upload.findOne({ public_id: req.params.publicId });
    await streamUploadImage(upload, res, { rclone, download: req.query.download === 'true' });
  } catch (err) {
    console.error('Photo proxy failure:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to stream photo from server storage.' });
  }
});

// Kept as a named preview endpoint for compatibility, but it now accepts only
// an opaque ID and never reads a local camera path.
router.get('/preview/:publicId', async (req, res) => {
  try {
    const upload = await Upload.findOne({ public_id: req.params.publicId });
    if (!upload?.preview_base64) return res.status(404).send('Preview not available');
    await streamUploadImage({ ...upload.toObject(), original_ready: false, status: 'preview_ready' }, res, { rclone });
  } catch (err) {
    console.error('Preview fetch error:', err);
    if (!res.headersSent) res.status(500).send('Preview unavailable');
  }
});

router.get('/download/:publicId', async (req, res) => {
  try {
    const upload = await Upload.findOne({ public_id: req.params.publicId });
    await streamUploadImage(upload, res, { rclone, download: true });
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) res.status(500).send('Download unavailable');
  }
});

router.get('/student/:studentId', async (req, res) => {
  try {
    const uploads = await Upload.find({
      student_id: req.params.studentId,
      status: { $in: ['preview_ready', 'uploading_original', 'completed'] },
    }).sort({ createdAt: -1 }).lean();
    res.json(await presentUploads(uploads));
  } catch (err) {
    console.error('Student uploads fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Move an incoming photo before changing the database path. This prevents the
// portal from pointing at the destination before storage has finished moving.
router.post('/:publicId/assign', async (req, res) => {
  try {
    const { studentId } = req.body;
    const upload = await Upload.findOne({ public_id: req.params.publicId });
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    if (upload.student_id !== 'UNASSIGNED') return res.status(400).json({ error: 'Already assigned' });

    const student = await Student.findOne({ student_id: studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const newRclonePath = `/${rclone.getFolderName(student)}/${upload.filename}`;

    // Attempt to move the file in cloud storage. If the file hasn't finished
    // uploading to the Incoming folder yet (or rclone is in dry-run), we still
    // update the database path so the portal can serve the preview. The
    // original will become available once the agent finishes uploading.
    let moved = false;
    if (upload.original_ready || upload.status === 'completed') {
      moved = await rclone.moveFile(upload.rclone_path, newRclonePath);
      if (!moved && !rclone.dryRun) {
        console.warn(`[Assign] rclone move failed for ${upload.filename}, updating DB path anyway`);
      }
    }

    upload.student_id = studentId;
    upload.rclone_path = newRclonePath;
    await upload.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('system_log', {
        time: new Date().toLocaleTimeString(),
        level: 'ok',
        message: `ASSIGNED: ${upload.filename} to ${student.name}`,
      });
      io.emit('photo_assigned', await presentSingleUpload(upload));
      io.emit('photos_updated', { student_id: studentId, filename: upload.filename });
    }

    res.json(await presentSingleUpload(upload));
  } catch (err) {
    console.error('Photo assign error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
