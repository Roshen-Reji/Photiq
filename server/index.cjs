const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');

// MongoDB setup
const connectDB = require('./db.cjs');
connectDB();

const studentsRoute = require('./routes/students.cjs');
const queueRoute = require('./routes/queue.cjs');
const uploadsRoute = require('./routes/uploads.cjs');
const boothRoute = require('./routes/booth.cjs');
const driveRoute = require('./routes/drive.cjs');
const authRoute = require('./routes/auth.cjs');
const requireAuth = require('./middleware/auth.cjs');

const port = Number(process.env.PORT || 8787);
const rcloneRemote = process.env.GRADSYNC_RCLONE_REMOTE || '';
const rcloneDryRun = process.env.GRADSYNC_RCLONE_DRY_RUN === 'true';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  // Performance: increase ping interval to reduce overhead
  pingInterval: 15000,
  pingTimeout: 10000,
});

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false,
  })
);

// Permit embeds and `<img src>` across external domains
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
app.use(express.json({ limit: '12mb' }));

// API Routes
app.use('/api/auth', authRoute);
app.use('/api/students', requireAuth, studentsRoute);
app.use('/api/queue', requireAuth, queueRoute);
app.use('/api/uploads', requireAuth, uploadsRoute);
app.use('/api/booth', requireAuth, boothRoute);
app.use('/api/drive', driveRoute); // Drive is public for students, secured by URL tokens

// Simple health endpoint
app.get('/api/health', (req, res) => res.json({ ok: true, db: 'mongodb' }));

// Static uploads directory — serve local images directly (Fix: local-first)
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(uploadsDir));

// Attach IO to app for routes to use
app.set('io', io);

// Share uploadsDir path with routes
app.set('uploadsDir', uploadsDir);

// Track connected clients for monitoring
let connectedClients = 0;

// Sockets
io.on('connection', (socket) => {
  connectedClients++;
  console.log(`Client connected: ${socket.id} (${connectedClients} total)`);
  
  // Clients can ask for current state immediately upon connecting
  socket.on('request_state', async () => {
    try {
      const Student = require('./models/Student.cjs');
      const Upload = require('./models/Upload.cjs');

      const activeStudent = await Student.findOne({ status: 'active' }).lean();
      socket.emit('state_update', activeStudent);

      // Also send recent unassigned photos for immediate monitor display
      const unassigned = await Upload.find(
        { student_id: 'UNASSIGNED' },
        { preview_base64: 0 }
      ).sort({ createdAt: -1 }).limit(50).lean();
      socket.emit('unassigned_photos_sync', unassigned);

    } catch (err) {
      console.error('Socket state fetch error:', err);
    }
  });

  // Allow student portal to join a room for their specific student
  socket.on('join_student_room', (studentId) => {
    if (studentId) {
      socket.join(`student:${studentId}`);
    }
  });

  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`Client disconnected: ${socket.id} (${connectedClients} total)`);
  });
});

async function boot() {
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads') ? next() : res.sendFile(path.join(dist, 'index.html')));
  }
  server.listen(port, '0.0.0.0', () => console.log(`GradSync server listening on http://0.0.0.0:${port}`));
}

boot().catch((error) => { console.error(error); process.exitCode = 1; });
