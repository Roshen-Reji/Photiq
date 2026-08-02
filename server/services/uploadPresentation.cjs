const { randomUUID } = require('node:crypto');

function createPublicId() {
  return randomUUID();
}

function hasPublicId(upload) {
  return Boolean(upload?.public_id);
}

/**
 * Assign opaque IDs to legacy uploads before they are exposed through an API.
 * Drive IDs, rclone paths, local paths, and Mongo IDs must stay server-side.
 */
async function ensurePublicIds(UploadModel, uploads) {
  const missing = uploads.filter((upload) => !hasPublicId(upload));
  if (!missing.length) return uploads;

  const operations = missing.map((upload) => {
    const publicId = createPublicId();
    upload.public_id = publicId;

    return {
      updateOne: {
        filter: { _id: upload._id },
        update: { $set: { public_id: publicId } },
      },
    };
  });

  await UploadModel.bulkWrite(operations, { ordered: false });
  return uploads;
}

function buildImageUrl(upload, { studentToken } = {}) {
  if (!hasPublicId(upload)) return null;

  const publicId = encodeURIComponent(upload.public_id);
  if (studentToken) {
    return `/api/drive/${encodeURIComponent(studentToken)}/photo/${publicId}`;
  }
  return `/api/uploads/stream/${publicId}`;
}

/**
 * Converts an Upload record into the small, safe shape consumed by browsers.
 * Deliberately exclude driveFileId, rclone_path, localPath, preview bytes, and _id.
 */
function presentUpload(upload, options = {}) {
  const imageUrl = buildImageUrl(upload, options);

  let finalImageUrl = imageUrl;
  if (finalImageUrl && (upload.status === 'completed' || upload.original_ready)) {
    // Append a cache-buster so clients fetching the list will bypass the cached preview
    const t = upload.updatedAt ? new Date(upload.updatedAt).getTime() : Date.now();
    finalImageUrl = `${finalImageUrl}${finalImageUrl.includes('?') ? '&' : '?'}t=${t}`;
  }

  return {
    id: upload.public_id || null,
    student_id: upload.student_id,
    filename: upload.filename,
    source: upload.source || 'stage',
    status: upload.status,
    preview_ready: Boolean(upload.preview_ready),
    original_ready: Boolean(upload.original_ready),
    upload_progress: typeof upload.upload_progress === 'number' ? upload.upload_progress : 0,
    createdAt: upload.createdAt,
    imageUrl: finalImageUrl,
    downloadUrl: finalImageUrl ? `${finalImageUrl}${finalImageUrl.includes('?') ? '&' : '?'}download=true` : null,
  };
}

module.exports = {
  createPublicId,
  ensurePublicIds,
  presentUpload,
};
