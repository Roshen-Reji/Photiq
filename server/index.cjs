const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { createHmac, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const { EventStore, folderName, publicStudent, publicState, token } = require('./store.cjs');

const port = Number(process.env.PORT || 8787);
const statePath = process.env.GRADSYNC_STATE_FILE || path.join(__dirname, '..', 'data', 'event-state.json');
const agentToken = process.env.GRADSYNC_AGENT_TOKEN || '';
const storageRoot = process.env.GRADSYNC_STORAGE_ROOT || path.join(__dirname, '..', 'data', 'booth-captures');
const rcloneRemote = process.env.GRADSYNC_RCLONE_REMOTE || '';
const rcloneDryRun = process.env.GRADSYNC_RCLONE_DRY_RUN === 'true';
const adminPassword = process.env.GRADSYNC_ADMIN_PASSWORD || '';
const monitorPassword = process.env.GRADSYNC_MONITOR_PASSWORD || adminPassword;
const authEnabled = Boolean(adminPassword || monitorPassword);
const sessionSecret = process.env.GRADSYNC_SESSION_SECRET || randomBytes(32).toString('hex');
const store = new EventStore(statePath);
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] } });

app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function cookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key, value]) => key && value));
}
function sign(value) { return createHmac('sha256', sessionSecret).update(value).digest('base64url'); }
function sessionFor(role) {
  const payload = Buffer.from(JSON.stringify({ role, expiresAt: Date.now() + (12 * 60 * 60 * 1000) })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function readSession(request) {
  try {
    const [payload, signature] = String(cookies(request).GRADSYNC_SESSION || '').split('.');
    if (!payload || !signature) return null;
    const expected = sign(payload);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.expiresAt > Date.now() && ['admin', 'monitor'].includes(session.role) ? session : null;
  } catch { return null; }
}
function setSession(res, role) {
  res.setHeader('Set-Cookie', `GRADSYNC_SESSION=${encodeURIComponent(sessionFor(role))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`);
}
app.use((req, res, next) => { req.operator = readSession(req); next(); });

function fail(res, status, message) { return res.status(status).json({ error: message }); }
function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}
function emitState() { io.emit('event:state', publicState(store.state)); }
async function update(change) { const result = await store.mutate(change); emitState(); return result; }
function rclone(args) {
  if (!rcloneRemote) return Promise.resolve(false);
  if (rcloneDryRun) { console.log(`[dry run] rclone ${args.join(' ')}`); return Promise.resolve(true); }
  return new Promise((resolve, reject) => {
    const process = spawn('rclone', args, { windowsHide: true, stdio: 'inherit' });
    process.once('error', reject);
    process.once('exit', (code) => code === 0 ? resolve(true) : reject(new Error(`rclone exited with code ${code}`)));
  });
}
function destinationFor(student, source, filename) {
  return `${store.state.event.parentFolder}/${folderName(student)}/${source === 'stage' ? 'Stage' : 'Booth'}/${filename}`;
}
async function syncFolder(student) {
  if (!rcloneRemote || student.folder.driveVerified) return;
  try {
    await rclone(['mkdir', `${rcloneRemote}${store.state.event.parentFolder}/${folderName(student)}/Stage`]);
    await rclone(['mkdir', `${rcloneRemote}${store.state.event.parentFolder}/${folderName(student)}/Booth`]);
    await update(() => { student.folder.driveVerified = true; store.activity(`DRIVE FOLDER READY: ${folderName(student)}`, 'ok'); });
  } catch (error) {
    await update(() => { student.folder.driveError = error.message; store.activity(`DRIVE FOLDER RETRY: ${student.id}`, 'warn'); });
  }
}
function ensureActiveFolder(student) {
  if (student.folder.status !== 'verified') {
    student.folder = { status: 'verified', createdAt: new Date().toISOString(), driveVerified: false, driveError: null };
    store.activity(`FOLDER CREATED: ${folderName(student)}`, 'ok');
  }
  student.status = 'ready';
  void syncFolder(student);
}
let boothWorkerBusy = false;
async function processBoothQueue() {
  if (boothWorkerBusy || !rcloneRemote) return;
  const upload = store.state.uploads.find((item) => item.source === 'booth' && item.status === 'queued' && item.localPath);
  if (!upload) return;
  const student = store.student(upload.studentId);
  if (!student || !fs.existsSync(upload.localPath)) return;
  boothWorkerBusy = true;
  try {
    await update(() => { upload.status = 'uploading'; upload.error = null; });
    await rclone(['copyto', upload.localPath, `${rcloneRemote}${destinationFor(student, 'booth', upload.filename)}`, '--retries', '4', '--low-level-retries', '10']);
    await update(() => {
      upload.status = 'completed';
      upload.completedAt = new Date().toISOString();
      student.booth += 1;
      store.activity(`BOOTH UPLOAD COMPLETE: ${upload.filename} → ${student.id}`, 'ok');
    });
  } catch (error) {
    await update(() => {
      upload.status = 'queued';
      upload.attempts = Number(upload.attempts || 0) + 1;
      upload.error = error.message;
      store.activity(`BOOTH UPLOAD RETRY ${upload.attempts}: ${upload.filename}`, 'warn');
    });
  } finally {
    boothWorkerBusy = false;
    setTimeout(processBoothQueue, upload.status === 'queued' ? 5000 : 250);
  }
}
function verifyAgent(req, res, next) {
  if (agentToken && req.get('x-agent-token') !== agentToken) return fail(res, 401, 'Invalid upload-agent token');
  next();
}

app.get('/api/auth/status', (req, res) => res.json({ enabled: authEnabled, authenticated: Boolean(req.operator), role: req.operator?.role || null }));
app.post('/api/auth/login', (req, res) => {
  if (!authEnabled) return res.json({ enabled: false, role: 'monitor' });
  const password = String(req.body?.password || '');
  const role = req.body?.role === 'admin' ? 'admin' : 'monitor';
  const expected = role === 'admin' ? adminPassword : monitorPassword;
  if (!expected || password.length !== expected.length || !timingSafeEqual(Buffer.from(password), Buffer.from(expected))) return fail(res, 401, 'Invalid operator password');
  setSession(res, role);
  res.json({ enabled: true, role });
});
app.post('/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', 'GRADSYNC_SESSION=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); res.sendStatus(204); });
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/public/') || req.path.startsWith('/auth/')) return next();
  if (!authEnabled || req.operator || (agentToken && req.get('x-agent-token') === agentToken)) return next();
  return fail(res, 401, 'Operator sign-in required');
});

app.get('/api/health', (req, res) => res.json({ ok: true, activeStudentId: store.state?.activeStudentId }));
app.get('/api/event', (req, res) => res.json(publicState(store.state)));
app.get('/api/students', (req, res) => res.json(store.state.students.map(publicStudent)));

app.post('/api/students', async (req, res) => {
  try {
    const id = requireString(req.body.id, 'Student ID').toUpperCase();
    const name = requireString(req.body.name, 'Name');
    const department = requireString(req.body.department, 'Department').toUpperCase();
    if (store.student(id)) return fail(res, 409, 'That student ID already exists');
    let created;
    await update(() => {
      created = { id, name, department, physicalQr: null, stage: 0, booth: 0, status: 'waiting', secureToken: token(), folder: { status: 'pending', createdAt: null }, createdAt: new Date().toISOString() };
      store.state.students.push(created);
      store.activity(`STUDENT ADDED: ${id} — ${name.toUpperCase()}`, 'ok');
    });
    res.status(201).json(publicStudent(created));
  } catch (error) { fail(res, 400, error.message); }
});

app.post('/api/students/import', async (req, res) => {
  const candidates = Array.isArray(req.body.students) ? req.body.students : null;
  if (!candidates?.length) return fail(res, 400, 'Provide at least one student to import');
  if (candidates.length > 2000) return fail(res, 400, 'Imports are limited to 2,000 students at a time');
  const seen = new Set(store.state.students.map((student) => student.id));
  const accepted = [];
  const rejected = [];
  candidates.forEach((candidate, index) => {
    const id = typeof candidate.id === 'string' ? candidate.id.trim().toUpperCase() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const department = typeof candidate.department === 'string' ? candidate.department.trim().toUpperCase() : '';
    if (!id || !name || !department || seen.has(id)) {
      rejected.push({ row: index + 1, id: id || null, reason: !id || !name || !department ? 'Student ID, name, and department are required' : 'Duplicate student ID' });
      return;
    }
    seen.add(id);
    accepted.push({ id, name, department });
  });
  if (!accepted.length) return res.status(400).json({ error: 'No valid students found in the import', rejected });
  await update(() => {
    accepted.forEach((candidate) => store.state.students.push({ ...candidate, physicalQr: null, stage: 0, booth: 0, status: 'waiting', secureToken: token(), folder: { status: 'pending', createdAt: null }, createdAt: new Date().toISOString() }));
    store.activity(`ROSTER IMPORTED: ${accepted.length} STUDENT${accepted.length === 1 ? '' : 'S'}`, 'ok');
  });
  res.status(201).json({ imported: accepted.length, rejected });
});

app.patch('/api/students/:studentId', async (req, res) => {
  const student = store.student(req.params.studentId);
  if (!student) return fail(res, 404, 'Student not found');
  const { name, department } = req.body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return fail(res, 400, 'Name must be a non-empty string');
  if (department !== undefined && (typeof department !== 'string' || !department.trim())) return fail(res, 400, 'Department must be a non-empty string');
  await update(() => {
    if (name !== undefined) student.name = name.trim();
    if (department !== undefined) student.department = department.trim().toUpperCase();
    store.activity(`STUDENT DETAILS UPDATED: ${student.id}`, 'info');
  });
  res.json(publicStudent(student));
});

app.delete('/api/students/:studentId', async (req, res) => {
  const student = store.student(req.params.studentId);
  if (!student) return fail(res, 404, 'Student not found');
  if (store.state.students.length === 1) return fail(res, 400, 'The final student cannot be deleted');
  await update(() => {
    store.state.students = store.state.students.filter((item) => item.id !== student.id);
    if (store.state.activeStudentId === student.id) store.state.activeStudentId = store.state.students[0].id;
    store.activity(`REMOVED FROM QUEUE: ${student.id}`, 'warn');
  });
  res.sendStatus(204);
});

app.post('/api/queue/reorder', async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length !== store.state.students.length) return fail(res, 400, 'studentIds must contain every student exactly once');
  const ids = new Set(studentIds);
  if (ids.size !== studentIds.length || studentIds.some((id) => !store.student(id))) return fail(res, 400, 'Queue contains an unknown or duplicate student');
  await update(() => {
    store.state.students = studentIds.map((id) => store.student(id));
    store.activity('QUEUE ORDER UPDATED BY OPERATOR', 'info');
  });
  res.json(publicState(store.state));
});

app.post('/api/active', async (req, res) => {
  const student = store.student(req.body.studentId);
  if (!student) return fail(res, 404, 'Student not found');
  if (store.state.paused) return fail(res, 409, 'Queue is paused');
  await update(() => {
    store.state.activeStudentId = student.id;
    ensureActiveFolder(student);
    store.activity(`ACTIVE NODE SET: ${student.id} — ${student.name.toUpperCase()}`, 'active');
  });
  res.json(publicStudent(student));
});

app.post('/api/queue/pause', async (req, res) => {
  const paused = Boolean(req.body.paused);
  await update(() => {
    store.state.paused = paused;
    store.activity(paused ? 'QUEUE PAUSED BY OPERATOR' : 'QUEUE RESUMED', paused ? 'warn' : 'ok');
  });
  res.json({ paused });
});

app.post('/api/physical-qr', async (req, res) => {
  try {
    const studentId = requireString(req.body.studentId, 'Student ID');
    const code = requireString(req.body.code, 'Card code').toUpperCase();
    const student = store.student(studentId);
    if (!student) return fail(res, 404, 'Student not found');
    const existing = store.state.students.find((item) => item.physicalQr === code && item.id !== student.id);
    if (existing) return fail(res, 409, `Card is already linked to ${existing.id}`);
    await update(() => {
      student.physicalQr = code;
      store.activity(`PHYSICAL CARD ${code} LINKED TO ${student.id}`, 'ok');
    });
    res.json(publicStudent(student));
  } catch (error) { fail(res, 400, error.message); }
});

app.post('/api/upload-intent', verifyAgent, async (req, res) => {
  try {
    const source = requireString(req.body.source, 'Source').toLowerCase();
    if (!['stage', 'booth'].includes(source)) return fail(res, 400, 'Source must be stage or booth');
    const student = store.student(req.body.studentId || store.state.activeStudentId);
    if (!student) return fail(res, 404, 'Student not found');
    const filename = requireString(req.body.filename, 'Filename').replace(/[\\/]/g, '_');
    let upload;
    await update(() => {
      ensureActiveFolder(student);
      upload = { id: randomUUID(), studentId: student.id, source, filename, camera: String(req.body.camera || 'UNSPECIFIED'), localPath: String(req.body.localPath || ''), status: 'queued', createdAt: new Date().toISOString(), completedAt: null, error: null };
      store.state.uploads.unshift(upload);
      store.activity(`UPLOAD QUEUED: ${source.toUpperCase()} / ${student.id} / ${filename}`, 'info');
    });
    res.status(201).json({ uploadId: upload.id, rcloneDestination: destinationFor(student, source, filename) });
  } catch (error) { fail(res, 400, error.message); }
});

app.post('/api/uploads/:uploadId/completed', verifyAgent, async (req, res) => {
  const upload = store.state.uploads.find((item) => item.id === req.params.uploadId);
  if (!upload) return fail(res, 404, 'Upload not found');
  if (upload.status === 'completed') return res.json({ ok: true, alreadyCompleted: true });
  const completed = req.body.completed !== false;
  await update(() => {
    upload.status = completed ? 'completed' : 'failed';
    upload.completedAt = new Date().toISOString();
    upload.error = completed ? null : String(req.body.error || 'RClone upload failed');
    const student = store.student(upload.studentId);
    if (completed && student) student[upload.source] += 1;
    store.activity(completed ? `UPLOAD COMPLETE: ${upload.filename} → ${upload.studentId}` : `UPLOAD FAILED: ${upload.filename} → ${upload.studentId}`, completed ? 'ok' : 'warn');
  });
  res.json({ ok: true });
});

app.post('/api/booth/capture', async (req, res) => {
  try {
    const studentIds = Array.isArray(req.body.studentIds) ? [...new Set(req.body.studentIds)] : [];
    if (!studentIds.length || studentIds.length > 6) return fail(res, 400, 'Scan between 1 and 6 student codes first');
    const students = studentIds.map((id) => store.student(id));
    if (students.some((student) => !student)) return fail(res, 404, 'One or more student IDs are invalid');
    const imageData = requireString(req.body.imageData, 'Booth image');
    const match = imageData.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return fail(res, 400, 'Booth image must be a JPEG, PNG, or WebP data URL');
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 8 * 1024 * 1024) return fail(res, 413, 'Booth image must be between 1 byte and 8 MB');
    const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
    const filename = String(req.body.filename || `booth-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`).replace(/[\\/]/g, '_');
    const localPath = path.join(storageRoot, filename);
    await fsp.mkdir(storageRoot, { recursive: true });
    await fsp.writeFile(localPath, image, { flag: 'wx' });
    await update(() => {
      students.forEach((student) => {
        ensureActiveFolder(student);
        store.state.uploads.unshift({ id: randomUUID(), studentId: student.id, source: 'booth', filename, camera: String(req.body.camera || 'BOOTH-02'), localPath, status: 'queued', createdAt: new Date().toISOString(), completedAt: null, error: null });
      });
      store.activity(`BOOTH-02 CAPTURE QUEUED FOR ${students.length} RECIPIENT${students.length === 1 ? '' : 'S'}`, 'active');
    });
    void processBoothQueue();
    res.status(201).json({ queuedFor: students.length, deliveredTo: students.map((student) => publicStudent(student)) });
  } catch (error) { fail(res, error.code === 'EEXIST' ? 409 : 400, error.message); }
});

app.get('/api/public/:token', (req, res) => {
  const student = store.state.students.find((item) => item.secureToken === req.params.token);
  if (!student) return fail(res, 404, 'Gallery link is invalid or has expired');
  const photos = store.state.uploads.filter((upload) => upload.studentId === student.id && upload.status === 'completed').map((upload) => ({ id: upload.id, filename: upload.filename, source: upload.source, createdAt: upload.completedAt }));
  res.json({ student: publicStudent(student), photos });
});

io.on('connection', (socket) => socket.emit('event:state', publicState(store.state)));

async function boot() {
  await store.init();
  await fsp.mkdir(storageRoot, { recursive: true });
  if (rcloneRemote) setInterval(processBoothQueue, 10_000).unref();
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => req.path.startsWith('/api') || req.path.startsWith('/socket.io') ? next() : res.sendFile(path.join(dist, 'index.html')));
  }
  server.listen(port, () => console.log(`GradSync controller listening on http://127.0.0.1:${port}${rcloneRemote ? ` (RClone: ${rcloneDryRun ? 'dry run' : 'enabled'})` : ''}`));
}

boot().catch((error) => { console.error(error); process.exitCode = 1; });
