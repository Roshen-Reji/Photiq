/*
 * One-time cleanup for records created before image delivery used server-side
 * storage proxies. It removes device-local paths and gives legacy records an
 * opaque browser-safe ID without touching the original photo or rclone path.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const Upload = require('../server/models/Upload.cjs');

function needsPublicId(upload) {
  return !upload.public_id || typeof upload.public_id !== 'string';
}

async function migrate() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is required to migrate upload records.');

  await mongoose.connect(uri);
  let updated = 0;
  let localPathsRemoved = 0;
  let unsafeUrlsRemoved = 0;
  let publicIdsAdded = 0;

  const cursor = Upload.find({
    $or: [
      { localPath: { $exists: true } },
      { public_id: { $exists: false } },
      { public_id: null },
      { public_id: '' },
      { drive_url: { $regex: /^(?:blob:|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)/i } },
    ],
  }).lean().cursor();

  for await (const upload of cursor) {
    const set = {};
    const unset = {};

    if (needsPublicId(upload)) {
      set.public_id = randomUUID();
      publicIdsAdded += 1;
    }
    if (upload.localPath) {
      unset.localPath = '';
      localPathsRemoved += 1;
    }
    if (typeof upload.drive_url === 'string'
      && /^(?:blob:|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)/i.test(upload.drive_url)) {
      unset.drive_url = '';
      unsafeUrlsRemoved += 1;
    }

    if (Object.keys(set).length || Object.keys(unset).length) {
      const update = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;
      // localPath was intentionally removed from the schema. Use the native
      // collection here so Mongoose strict mode cannot discard its $unset.
      await Upload.collection.updateOne({ _id: upload._id }, update);
      updated += 1;
    }
  }

  console.log(JSON.stringify({ updated, publicIdsAdded, localPathsRemoved, unsafeUrlsRemoved }));
}

migrate()
  .catch((error) => {
    console.error(`Upload image-access migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
