const express = require('express');
const router = express.Router();
const path = require('node:path');
const fs = require('node:fs');
const archiver = require('archiver');
const Student = require('../models/Student.cjs');
const Upload = require('../models/Upload.cjs');
const rclone = require('../controllers/rclone.cjs');
const { spawn } = require('node:child_process');

// Normalize paths: always use forward slashes
function normalizePath(p) {
  if (!p) return p;
  return p.replace(/\\/g, '/');
}

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
        _localPath: normalizePath(dbMatch?.localPath) || null,
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
          _localPath: normalizePath(upload.localPath) || null,
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

// Stream a specific photo — LOCAL FIRST, then DB preview, then Drive
router.get('/:token/photo/:filename', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).send('Student not found');
    
    const isPng = req.params.filename.toLowerCase().endsWith('.png');
    const contentType = isPng ? 'image/png' : 'image/jpeg';

    // 1. LOCAL FIRST: Check if we have a local file via the Upload record
    const upload = await Upload.findOne(
      { student_id: student.student_id, filename: req.params.filename },
      { localPath: 1, preview_base64: 1 }
    );

    if (upload?.localPath) {
      const normalized = normalizePath(upload.localPath);
      try {
        if (fs.existsSync(normalized)) {
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
          const stat = fs.statSync(normalized);
          res.setHeader('Content-Length', stat.size);
          fs.createReadStream(normalized).pipe(res);
          return;
        }
      } catch (e) {
        console.error(`Local file check failed: ${e.message}`);
      }
    }

    // 2. DB PREVIEW FALLBACK: Serve the preview from DB if available
    if (upload?.preview_base64) {
      const imgBuffer = Buffer.from(upload.preview_base64, 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Length', imgBuffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
      return res.send(imgBuffer);
    }

    // 3. DRIVE FALLBACK: Stream from rclone if available
    if (rclone.dryRun) {
      return res.status(404).send('Photo not available — rclone is not configured and no local/preview exists.');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
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
      { preview_base64: 1, localPath: 1 }
    );

    // Try local file first
    if (upload?.localPath) {
      const normalized = normalizePath(upload.localPath);
      try {
        if (fs.existsSync(normalized)) {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          const stat = fs.statSync(normalized);
          res.setHeader('Content-Length', stat.size);
          fs.createReadStream(normalized).pipe(res);
          return;
        }
      } catch (e) { /* fall through */ }
    }

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

// Download all photos as ZIP — LOCAL FIRST, Drive fallback
router.get('/:token/download', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).send('Student not found');

    // Get DB uploads to check local paths
    const dbUploads = await Upload.find(
      { student_id: student.student_id, status: { $in: ['preview_ready', 'uploading_original', 'completed'] } },
      { filename: 1, localPath: 1, preview_base64: 1 }
    ).lean();

    // Also get Drive listing
    const drivePhotos = await rclone.listStudentPhotos(student).catch(() => []);

    // Combine: all unique filenames
    const allFilenames = new Set();
    const localMap = new Map();
    const previewMap = new Map();

    for (const u of dbUploads) {
      allFilenames.add(u.filename);
      if (u.localPath) localMap.set(u.filename, normalizePath(u.localPath));
      if (u.preview_base64) previewMap.set(u.filename, u.preview_base64);
    }
    for (const p of drivePhotos) {
      allFilenames.add(p.Path);
    }

    if (allFilenames.size === 0) {
      return res.status(404).send('No photos found for this student');
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_Graduation_Photos.zip"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', function(err) {
      console.error('Archive error:', err);
      if (!res.headersSent) res.status(500).send({ error: err.message });
    });
    archive.pipe(res);

    for (const filename of allFilenames) {
      // 1. LOCAL FIRST
      const localPath = localMap.get(filename);
      if (localPath) {
        try {
          if (fs.existsSync(localPath)) {
            archive.file(localPath, { name: filename });
            continue;
          }
        } catch (e) { /* fall through */ }
      }

      // 2. DRIVE FALLBACK: stream from rclone
      if (!rclone.dryRun) {
        const folderName = rclone.getFolderName(student);
        const destination = `${rclone.remote}/${folderName}/${filename}`;
        const child = spawn('rclone', ['cat', destination]);
        archive.append(child.stdout, { name: filename });
        await new Promise((resolve) => { child.on('exit', () => resolve()); });
        continue;
      }

      // 3. PREVIEW FALLBACK: use base64 preview
      const preview = previewMap.get(filename);
      if (preview) {
        const buf = Buffer.from(preview, 'base64');
        archive.append(buf, { name: filename });
      }
    }

    archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) res.status(500).send(err.message);
  }
});

module.exports = router;
