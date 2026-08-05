const express = require('express');
const path = require('node:path');
const { spawn } = require('node:child_process');
const archiver = require('archiver');
const DefaultStudent = require('../models/Student.cjs');
const DefaultUpload = require('../models/Upload.cjs');
const defaultRclone = require('../controllers/rclone.cjs');
const { ensurePublicIds, presentUpload } = require('../services/uploadPresentation.cjs');
const { imageContentType, streamUploadImage } = require('../services/imageProxy.cjs');

function isPlainFilename(filename) {
  return Boolean(filename)
    && filename === path.basename(filename)
    && !filename.includes('\\')
    && filename !== '.'
    && filename !== '..';
}

function storageDestination(rclone, rclonePath) {
  return rclonePath.startsWith(rclone.remote) ? rclonePath : `${rclone.remote}${rclonePath}`;
}

function publicRclonePhoto(studentToken, photo) {
  const filename = photo.Name || photo.Path;
  if (!isPlainFilename(filename)) return null;

  const imageUrl = `/api/drive/${encodeURIComponent(studentToken)}/file/${encodeURIComponent(filename)}`;
  return {
    id: null,
    filename,
    source: 'drive',
    status: 'completed',
    preview_ready: false,
    original_ready: true,
    upload_progress: 100,
    size: typeof photo.Size === 'number' ? photo.Size : 0,
    mimeType: photo.MimeType || imageContentType(filename),
    imageUrl,
    downloadUrl: `${imageUrl}?download=true`,
  };
}

function createDriveRouter({ StudentModel = DefaultStudent, UploadModel = DefaultUpload, rcloneService = defaultRclone } = {}) {
  const router = express.Router();

  const findStudent = async (identifier) => {
    if (!identifier || identifier === 'undefined' || identifier === 'null') return null;
    const cleanId = String(identifier).trim();
    if (!cleanId) return null;

    // A gallery route accepts only the high-entropy digital QR token. Student
    // IDs and Mongo IDs are predictable/internal and must not authorize photos.
    return StudentModel.findOne({ digital_qr: cleanId });
  };

  async function presentStudentUpload(upload, studentToken, size = 0, mimeType) {
    await ensurePublicIds(UploadModel, [upload]);
    return {
      ...presentUpload(upload, { studentToken }),
      size: typeof size === 'number' ? size : 0,
      mimeType: mimeType || imageContentType(upload.filename),
    };
  }

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

  // The browser gets only opaque IDs and token-scoped server proxy URLs. Raw
  // rclone/Drive metadata stays on this server.
  router.get('/:token/photos', async (req, res) => {
    try {
      const student = await findStudent(req.params.token);
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const dbUploads = await UploadModel.find({
        student_id: student.student_id,
        status: { $in: ['preview_ready', 'uploading_original', 'completed'] },
      }).sort({ createdAt: -1 }).lean();

      await ensurePublicIds(UploadModel, dbUploads);
      // New uploads are always tracked in MongoDB, so do not make a student's
      // gallery wait on a remote folder listing. Use rclone only for legacy
      // folders which have no Upload records at all.
      const rclonePhotos = dbUploads.length
        ? []
        : await rcloneService.listStudentPhotos(student).catch((err) => {
          console.error('RClone listing failed (using database records):', err.message);
          return [];
        });
      const byFilename = new Map(dbUploads.map((upload) => [upload.filename, upload]));
      const seenFilenames = new Set();
      const photos = [];

      for (const rclonePhoto of rclonePhotos) {
        const filename = rclonePhoto.Name || rclonePhoto.Path;
        if (!isPlainFilename(filename) || seenFilenames.has(filename)) continue;
        seenFilenames.add(filename);

        const dbUpload = byFilename.get(filename);
        if (dbUpload) {
          photos.push(await presentStudentUpload(
            dbUpload,
            req.params.token,
            rclonePhoto.Size,
            rclonePhoto.MimeType
          ));
        } else {
          const publicPhoto = publicRclonePhoto(req.params.token, rclonePhoto);
          if (publicPhoto) photos.push(publicPhoto);
        }
      }

      for (const upload of dbUploads) {
        if (seenFilenames.has(upload.filename)) continue;
        seenFilenames.add(upload.filename);
        photos.push(await presentStudentUpload(upload, req.params.token));
      }

      res.json(photos);
    } catch (err) {
      console.error('Photos listing error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Photo proxy for database-backed uploads. The student token and upload
  // ownership are checked together, preventing cross-student access.
  router.get('/:token/photo/:publicId', async (req, res) => {
    try {
      const student = await findStudent(req.params.token);
      if (!student) return res.status(404).send('Student not found');

      const upload = await UploadModel.findOne({
        student_id: student.student_id,
        public_id: req.params.publicId,
      });
      await streamUploadImage(upload, res, {
        rclone: rcloneService,
        download: req.query.download === 'true',
      });
    } catch (err) {
      console.error('Photo stream error:', err);
      if (!res.headersSent) res.status(500).send('Photo stream failed');
    }
  });

  // Compatibility for photos that existed in storage before an Upload record.
  // The filename is validated and rclone always scopes it to the authenticated
  // student's own folder.
  router.get('/:token/file/:filename', async (req, res) => {
    try {
      const student = await findStudent(req.params.token);
      if (!student) return res.status(404).send('Student not found');
      if (!isPlainFilename(req.params.filename)) return res.status(400).send('Invalid filename');

      const upload = {
        filename: req.params.filename,
        rclone_path: `/${rcloneService.getFolderName(student)}/${req.params.filename}`,
        original_ready: true,
        status: 'completed',
      };
      await streamUploadImage(upload, res, {
        rclone: rcloneService,
        download: req.query.download === 'true',
      });
    } catch (err) {
      console.error('Legacy photo stream error:', err);
      if (!res.headersSent) res.status(500).send('Photo stream failed');
    }
  });

  router.get('/:token/preview/:publicId', async (req, res) => {
    try {
      const student = await findStudent(req.params.token);
      if (!student) return res.status(404).send('Student not found');
      const upload = await UploadModel.findOne({
        student_id: student.student_id,
        public_id: req.params.publicId,
      });
      if (!upload?.preview_base64) return res.status(404).send('Preview not available');
      await streamUploadImage({ ...upload.toObject(), original_ready: false, status: 'preview_ready' }, res, {
        rclone: rcloneService,
      });
    } catch (err) {
      console.error('Preview stream error:', err);
      if (!res.headersSent) res.status(500).send('Preview unavailable');
    }
  });

  router.get('/:token/download', async (req, res) => {
    try {
      const student = await findStudent(req.params.token);
      if (!student) return res.status(404).send('Student not found');

      const [dbUploads, rclonePhotos] = await Promise.all([
        UploadModel.find({
          student_id: student.student_id,
          status: { $in: ['preview_ready', 'uploading_original', 'completed'] },
        }).lean(),
        rcloneService.listStudentPhotos(student).catch(() => []),
      ]);

      const uploadsByFilename = new Map(dbUploads.map((upload) => [upload.filename, upload]));
      const filenames = new Set([
        ...dbUploads.map((upload) => upload.filename),
        ...rclonePhotos.map((photo) => photo.Name || photo.Path).filter(isPlainFilename),
      ]);
      if (!filenames.size) return res.status(404).send('No photos found for this student');

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${String(student.name).replace(/[^a-zA-Z0-9]/g, '_')}_Graduation_Photos.zip"`
      );

      const archive = archiver('zip', { zlib: { level: 5 } });
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        if (!res.headersSent) res.status(500).send({ error: err.message });
      });
      archive.pipe(res);

      for (const filename of filenames) {
        if (!isPlainFilename(filename)) continue;
        const upload = uploadsByFilename.get(filename);

        if (upload?.rclone_path && !rcloneService.dryRun) {
          const child = spawn('rclone', ['cat', storageDestination(rcloneService, upload.rclone_path)]);
          archive.append(child.stdout, { name: filename });
          continue;
        }

        if (!upload && !rcloneService.dryRun) {
          const remotePath = `/${rcloneService.getFolderName(student)}/${filename}`;
          const child = spawn('rclone', ['cat', storageDestination(rcloneService, remotePath)]);
          archive.append(child.stdout, { name: filename });
          continue;
        }

        if (upload?.preview_base64) {
          archive.append(Buffer.from(upload.preview_base64, 'base64'), { name: filename });
        }
      }

      archive.finalize();
    } catch (err) {
      console.error('Download error:', err);
      if (!res.headersSent) res.status(500).send('Download unavailable');
    }
  });

  return router;
}

const router = createDriveRouter();
module.exports = router;
module.exports.createDriveRouter = createDriveRouter;
