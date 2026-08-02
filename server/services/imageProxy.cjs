const fs = require('node:fs');
const path = require('node:path');

function imageContentType(filename = '') {
  switch (path.extname(filename).toLowerCase()) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.heic':
    case '.heif': return 'image/heic';
    case '.jpg':
    case '.jpeg':
    default: return 'image/jpeg';
  }
}

function safeFilename(filename = 'photo.jpg') {
  return String(filename).replace(/[\\/\r\n"]/g, '_') || 'photo.jpg';
}

function applyImageHeaders(res, upload, { download = false, cacheControl } = {}) {
  const filename = upload?.filename || 'photo.jpg';
  res.setHeader('Content-Type', imageContentType(filename));
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', cacheControl || 'private, max-age=300');
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${safeFilename(filename)}"`
  );
}

function sendPreview(upload, res, options) {
  if (!upload || !upload.preview_base64) return false;

  let base64Data = upload.preview_base64;
  if (base64Data.startsWith('data:')) {
    base64Data = base64Data.split(',')[1];
  }

  try {
    const imageBuffer = Buffer.from(base64Data, 'base64');
    if (imageBuffer.length === 0) return false;
    applyImageHeaders(res, upload, { ...options, cacheControl: 'private, max-age=60' });
    res.setHeader('Content-Length', imageBuffer.length);
    res.send(imageBuffer);
    return true;
  } catch (err) {
    console.error('Error sending preview buffer:', err);
    return false;
  }
}

/**
 * Streams a photo with multi-tier fallbacks (RClone -> DB Preview -> Local Disk)
 * so image delivery never fails regardless of RClone or network state.
 */
function streamUploadImage(upload, res, { rclone, download = false } = {}) {
  if (!upload) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  // 1. If RClone is online and not in dryRun mode, stream from RClone storage
  const originalIsAvailable = upload.original_ready || upload.status === 'completed';
  if (originalIsAvailable && upload.rclone_path && rclone && !rclone.dryRun) {
    applyImageHeaders(res, upload, { download, cacheControl: 'private, max-age=300' });
    rclone.streamPhotoByPath(upload.rclone_path, res);
    return;
  }

  // 2. Send stored base64 preview if available
  if (sendPreview(upload, res, { download })) return;

  // 3. Local disk fallbacks if file exists on local machine
  const watchDir = process.env.GRADSYNC_WATCH_DIR || 'D:/Roshen/test';
  const possiblePaths = [
    upload.rclone_path,
    path.join(__dirname, '..', '..', 'data', 'uploads', upload.filename),
    path.join(watchDir, upload.filename),
    path.join(process.cwd(), 'data', 'uploads', upload.filename),
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        // Auto-heal missing preview_base64 in MongoDB for future instant loads
        if (!upload.preview_base64) {
          const buf = fs.readFileSync(p);
          if (buf.length <= 8 * 1024 * 1024) {
            const Upload = require('../models/Upload.cjs');
            Upload.updateOne({ _id: upload._id }, { $set: { preview_base64: buf.toString('base64'), preview_ready: true } }).catch(() => {});
          }
        }
      } catch (e) {}

      applyImageHeaders(res, upload, { download, cacheControl: 'private, max-age=300' });
      fs.createReadStream(p).pipe(res);
      return;
    }
  }

  // 4. Try RClone as final fallback
  if (upload.rclone_path && rclone && !rclone.dryRun) {
    applyImageHeaders(res, upload, { download, cacheControl: 'private, max-age=300' });
    rclone.streamPhotoByPath(upload.rclone_path, res);
    return;
  }

  res.status(404).json({ error: 'Photo is not available from server storage yet.' });
}

module.exports = {
  imageContentType,
  streamUploadImage,
};
