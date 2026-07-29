const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const Student = require('../models/Student.cjs');
const Upload = require('../models/Upload.cjs');
const rclone = require('../controllers/rclone.cjs');
const { spawn } = require('node:child_process');

const findStudent = async (identifier) => {
  if (!identifier || identifier === 'undefined' || identifier === 'null') return null;
  const cleanId = String(identifier).trim();
  if (!cleanId) return null;
  
  // 1. Try exact match (digital_qr, student_id, physical_qr)
  let student = await Student.findOne({
    $or: [
      { digital_qr: cleanId },
      { student_id: cleanId },
      { physical_qr: cleanId }
    ]
  });
  
  if (student) return student;

  // 2. Try uppercase match
  const upperId = cleanId.toUpperCase();
  student = await Student.findOne({
    $or: [
      { student_id: upperId },
      { physical_qr: upperId }
    ]
  });
  
  if (student) return student;

  // 3. Try case-insensitive regex match
  const safeRegex = new RegExp(`^${cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  student = await Student.findOne({
    $or: [
      { student_id: safeRegex },
      { physical_qr: safeRegex },
      { digital_qr: safeRegex }
    ]
  });

  if (student) return student;

  // 4. Try MongoDB _id as a fallback (Fix 5)
  if (cleanId.match(/^[0-9a-fA-F]{24}$/)) {
    student = await Student.findById(cleanId);
    if (student) return student;
  }

  return null;
};

// Get basic public student info for portal
router.get('/:token/info', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({ name: student.name, department: student.department, student_id: student.student_id });
  } catch (err) {
    console.error('Student info error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all photos for a student (HYBRID: DB uploads + rclone listing — Fix 5)
router.get('/:token/photos', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    // Start both queries in parallel for speed
    const [rclonePhotos, dbUploads] = await Promise.all([
      rclone.listStudentPhotos(student).catch(err => {
        console.error('RClone listing failed (using DB fallback):', err.message);
        return [];
      }),
      Upload.find(
        { student_id: student.student_id, status: { $in: ['preview_ready', 'uploading_original', 'completed'] } },
        { preview_base64: 0 } // Exclude large field
      ).sort({ createdAt: -1 }).lean().catch(err => {
        console.error('DB uploads query failed:', err.message);
        return [];
      })
    ]);

    // Build a combined result: rclone photos enriched with DB data
    const seenFilenames = new Set();
    const combined = [];

    // First, add all rclone photos (these are the original files on Drive)
    for (const photo of rclonePhotos) {
      seenFilenames.add(photo.Path);
      // Find matching DB upload for status info
      const dbMatch = dbUploads.find(u => u.filename === photo.Path);
      combined.push({
        ...photo,
        _upload_id: dbMatch?._id || null,
        _status: dbMatch?.status || 'completed',
        _preview_ready: dbMatch?.preview_ready || false,
        _original_ready: true, // It's on Drive, so original is available
        _source: 'drive',
      });
    }

    // Then, add DB uploads that aren't on Drive yet (previews only)
    for (const upload of dbUploads) {
      if (!seenFilenames.has(upload.filename)) {
        combined.push({
          Path: upload.filename,
          Name: upload.filename,
          Size: 0, // Unknown until on Drive
          MimeType: 'image/jpeg',
          _upload_id: upload._id,
          _status: upload.status,
          _preview_ready: upload.preview_ready,
          _original_ready: upload.original_ready || false,
          _source: 'preview',
        });
      }
    }
    
    res.json(combined);
  } catch (err) {
    console.error('Photos listing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stream a specific photo
router.get('/:token/photo/:filename', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).send('Student not found');
    
    // Attempt to set a reasonable content type
    const isPng = req.params.filename.toLowerCase().endsWith('.png');
    
    // If rclone is in dry-run mode, serve from DB uploads first
    if (rclone.dryRun) {
      const upload = await Upload.findOne(
        { student_id: student.student_id, filename: req.params.filename },
        { preview_base64: 1 }
      );
      if (upload?.preview_base64) {
        const imgBuffer = Buffer.from(upload.preview_base64, 'base64');
        res.setHeader('Content-Type', isPng ? 'image/png' : 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Length', imgBuffer.length);
        return res.send(imgBuffer);
      }
      return res.status(404).send('Photo not available — rclone is not configured and no preview exists in DB.');
    }

    // rclone is available — stream from Drive
    res.setHeader('Content-Type', isPng ? 'image/png' : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
    rclone.streamPhoto(student, req.params.filename, res);
  } catch (err) {
    console.error('Photo stream error:', err);
    if (!res.headersSent) res.status(500).send(err.message);
  }
});

// Stream a preview for a specific upload (for student portal — serves preview instantly)
router.get('/:token/preview/:uploadId', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).send('Student not found');

    const upload = await Upload.findOne(
      { _id: req.params.uploadId, student_id: student.student_id },
      { preview_base64: 1 }
    );

    if (!upload?.preview_base64) {
      return res.status(404).send('Preview not available');
    }

    const imgBuffer = Buffer.from(upload.preview_base64, 'base64');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Length', imgBuffer.length);
    res.send(imgBuffer);
  } catch (err) {
    console.error('Preview stream error:', err);
    if (!res.headersSent) res.status(500).send(err.message);
  }
});

// Download all photos as ZIP
router.get('/:token/download', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).send('Student not found');
    
    const photos = await rclone.listStudentPhotos(student);
    if (!photos || photos.length === 0) {
      return res.status(404).send('No photos found for this student');
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_Graduation_Photos.zip"`);

    const archive = archiver('zip', {
      zlib: { level: 5 } // Standard compression
    });

    archive.on('error', function(err) {
      console.error('Archive error:', err);
      if (!res.headersSent) res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    // Stream each file into the archive
    for (const photo of photos) {
      const folderName = rclone.getFolderName(student);
      const destination = `${rclone.remote}/${folderName}/${photo.Path}`;
      
      const child = spawn('rclone', ['cat', destination]);
      
      // Append the stream to the archive
      archive.append(child.stdout, { name: photo.Path });
      
      // Wait for the stream to finish before appending the next (or could append all at once)
      await new Promise((resolve) => {
        child.on('exit', () => resolve());
      });
    }

    archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) res.status(500).send(err.message);
  }
});

module.exports = router;
