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

const port = Number(process.env.PORT || 8787);
const rcloneRemote = process.env.GRADSYNC_RCLONE_REMOTE || '';
const rcloneDryRun = process.env.GRADSYNC_RCLONE_DRY_RUN === 'true';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] } });

app.use(cors());
app.use(express.json({ limit: '12mb' }));

// API Routes
app.use('/api/students', studentsRoute);
app.use('/api/queue', queueRoute);
app.use('/api/uploads', uploadsRoute);

// Simple health endpoint
app.get('/api/health', (req, res) => res.json({ ok: true, db: 'mongodb' }));

// Attach IO to app for routes to use
app.set('io', io);

// Sockets
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Clients can ask for current state immediately upon connecting
  socket.on('request_state', async () => {
    try {
      const Student = require('./models/Student.cjs');
      const activeStudent = await Student.findOne({ status: 'active' });
      socket.emit('state_update', activeStudent);
    } catch (err) {
      console.error('Socket state fetch error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

async function boot() {
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => req.path.startsWith('/api') || req.path.startsWith('/socket.io') ? next() : res.sendFile(path.join(dist, 'index.html')));
  }
  server.listen(port, () => console.log(`GradSync server listening on http://127.0.0.1:${port}`));
}

boot().catch((error) => { console.error(error); process.exitCode = 1; });
