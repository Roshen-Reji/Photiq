const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createDriveRouter } = require('../server/routes/drive.cjs');

test('a clean student request receives an image through an opaque proxy URL', async (t) => {
  const student = {
    student_id: 'STU-1001',
    digital_qr: 'student-gallery-token',
    name: 'Test Student',
    department: 'QA',
  };
  const storedUpload = {
    _id: 'internal-mongo-id',
    public_id: 'c6ee8cff-5516-4da3-b034-5f9e6c3bf649',
    student_id: student.student_id,
    filename: 'graduation.jpg',
    status: 'completed',
    original_ready: true,
    preview_ready: false,
    upload_progress: 100,
    rclone_path: '/GradSync/Test_Student_STU-1001/graduation.jpg',
    // These are intentionally present in storage but must never reach the browser.
    localPath: 'D:/camera/graduation.jpg',
    driveFileId: 'private-google-drive-file-id',
  };

  const StudentModel = {
    findOne: async () => student,
    findById: async () => null,
  };
  const UploadModel = {
    find: () => ({ sort: () => ({ lean: async () => [storedUpload] }) }),
    findOne: async (query) => (
      query.student_id === student.student_id && query.public_id === storedUpload.public_id
        ? storedUpload
        : null
    ),
    bulkWrite: async () => ({ ok: 1 }),
  };
  const rcloneService = {
    remote: 'drive:',
    dryRun: false,
    getFolderName: () => 'GradSync/Test_Student_STU-1001',
    listStudentPhotos: async () => [],
    streamPhotoByPath: (_remotePath, response) => response.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
  };

  const app = express();
  app.use('/api/drive', createDriveRouter({ StudentModel, UploadModel, rcloneService }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  // No cookies or authorization header: this represents a first-time phone visit.
  const listResponse = await fetch(`${origin}/api/drive/${student.digital_qr}/photos`);
  assert.equal(listResponse.status, 200);
  const photos = await listResponse.json();

  assert.equal(photos.length, 1);
  assert.equal(photos[0].id, storedUpload.public_id);
  assert.match(photos[0].imageUrl, new RegExp(`/photo/${storedUpload.public_id}(\\?|$)`));
  assert.doesNotMatch(JSON.stringify(photos), /private-google-drive-file-id|D:\/camera|rclone_path|internal-mongo-id/);

  const imageResponse = await fetch(`${origin}${photos[0].imageUrl}`);
  assert.equal(imageResponse.status, 200);
  assert.match(imageResponse.headers.get('content-type'), /^image\/jpeg/);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});
