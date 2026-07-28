const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const Student = require('../models/Student.cjs');
const rclone = require('../controllers/rclone.cjs');
const { spawn } = require('node:child_process');

const findStudent = async (identifier) => {
  return await Student.findOne({
    $or: [
      { student_id: identifier },
      { digital_qr: identifier },
      { physical_qr: identifier }
    ]
  });
};

// Get basic public student info for portal
router.get('/:token/info', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({ name: student.name, department: student.department });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all photos for a student
router.get('/:token/photos', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    const photos = await rclone.listStudentPhotos(student);
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stream a specific photo
router.get('/:token/photo/:filename', async (req, res) => {
  try {
    const student = await findStudent(req.params.token);
    if (!student) return res.status(404).send('Student not found');
    
    // Attempt to set a reasonable content type
    if (req.params.filename.toLowerCase().endsWith('.png')) res.setHeader('Content-Type', 'image/png');
    else res.setHeader('Content-Type', 'image/jpeg');
    
    // Optional: add cache headers
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    
    rclone.streamPhoto(student, req.params.filename, res);
  } catch (err) {
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
      res.status(500).send({ error: err.message });
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
    if (!res.headersSent) res.status(500).send(err.message);
  }
});

module.exports = router;
