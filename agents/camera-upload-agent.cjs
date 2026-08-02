/* Watches a tethered-camera folder, then routes each image through RClone. */
const fs = require('node:fs/promises');
const fsp = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const chokidar = require('chokidar');

const configPath = process.env.GRADSYNC_AGENT_CONFIG || path.join(__dirname, 'camera-agent.config.json');
const queuePath = process.env.GRADSYNC_AGENT_QUEUE || path.join(__dirname, 'runtime', 'camera-upload-queue.json');
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.cr2', '.cr3', '.nef', '.arw']);
let config;
let queue = [];
let busy = false;
let isOnline = true;

// Exponential backoff config
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const MAX_RETRIES = 20;

async function loadConfig() {
  try { config = JSON.parse(await fs.readFile(configPath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Create ${configPath} from camera-agent.config.example.json before starting the agent.`);
    throw error;
  }
  for (const key of ['apiBaseUrl', 'watchDirectory', 'cameraName', 'rcloneRemote']) if (!config[key]) throw new Error(`Missing ${key} in camera agent config.`);
  config.apiBaseUrl = config.apiBaseUrl.replace(/\/$/, '');
}

async function saveQueue() {
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
}

async function loadQueue() {
  try { queue = JSON.parse(await fs.readFile(queuePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; queue = []; }
}

async function api(endpoint, options = {}) {
  const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(config.agentToken ? { 'X-Agent-Token': config.agentToken } : {}), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Controller returned ${response.status}`);
  return payload;
}

// Generate a clean, valid preview as base64 for images
async function generatePreview(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const supportedFormats = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
    
    if (supportedFormats.has(ext)) {
      const fileBuffer = await fs.readFile(filePath);
      // Support files up to 8MB for instant base64 preview
      if (fileBuffer.length <= 8 * 1024 * 1024) {
        return fileBuffer.toString('base64');
      }
    }
    
    return null;
  } catch (err) {
    console.error(`Preview generation failed for ${filePath}: ${err.message}`);
    return null;
  }
}

// Calculate exponential backoff delay
function getBackoffDelay(attempts) {
  const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempts), BACKOFF_MAX_MS);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

// Check network connectivity
async function checkConnectivity() {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    const wasOffline = !isOnline;
    isOnline = response.ok;
    if (wasOffline && isOnline) {
      console.log('[Recovery] Network restored. Resuming uploads...');
      processQueue();
    }
    return isOnline;
  } catch {
    if (isOnline) console.warn('[Offline] Network unreachable. Queuing uploads for retry...');
    isOnline = false;
    return false;
  }
}

function runRclone(sourcePath, destination) {
  const filename = path.basename(sourcePath);
  const fullDest = `${config.rcloneRemote}${destination}/${filename}`;
  if (config.dryRun) {
    console.log(`[dry run] rclone copyto "${sourcePath}" "${fullDest}"`);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const child = spawn('rclone', ['copyto', sourcePath, fullDest, '--retries', '4', '--low-level-retries', '10'], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`rclone exited with code ${code}`)));
  });
}

async function enqueue(filePath) {
  if (!imageExtensions.has(path.extname(filePath).toLowerCase()) || queue.some((job) => job.filePath === filePath)) return;
  
  console.log(`[Enqueue] New image detected: ${path.basename(filePath)}`);
  
  queue.push({ 
    filePath, 
    filename: path.basename(filePath), 
    attempts: 0, 
    createdAt: new Date().toISOString(),
    previewSent: false,
    uploadId: null,
  });
  await saveQueue();
  processQueue();
}

async function processQueue() {
  if (busy || !queue.length) return;
  
  // Check connectivity before processing
  if (!isOnline) {
    const online = await checkConnectivity();
    if (!online) {
      console.log(`[Offline] ${queue.length} job(s) queued. Will retry in 10s...`);
      setTimeout(processQueue, 10000);
      return;
    }
  }
  
  busy = true;
  const job = queue[0];
  
  try {
    // Check if file still exists
    try {
      await fs.access(job.filePath);
    } catch {
      console.warn(`[Skip] File no longer exists: ${job.filename}`);
      queue.shift();
      await saveQueue();
      busy = false;
      if (queue.length) setTimeout(processQueue, 100);
      return;
    }

    // 1. Generate preview (Fix 1 & 2) — only on first attempt
    let previewBase64 = null;
    if (!job.previewSent) {
      console.log(`[Preview] Generating preview for ${job.filename}...`);
      previewBase64 = await generatePreview(job.filePath);
    }

    // 2. Request an upload intent as UNASSIGNED (with preview if available)
    if (!job.uploadId) {
      const intent = await api('/api/uploads/intent', { 
        method: 'POST', 
        body: JSON.stringify({ 
          studentId: 'UNASSIGNED', 
          source: 'stage', 
          filename: job.filename, 
          camera: config.cameraName, 
          previewBase64: previewBase64 || undefined,
        }) 
      });
      job.uploadId = intent.uploadId;
      job.rcloneDestination = intent.rcloneDestination;
      job.previewSent = !!previewBase64;
      await saveQueue();
      
      if (previewBase64) {
        console.log(`[Preview] Preview sent for ${job.filename} — monitor should display it immediately.`);
      }
    }

    // 3. Report progress: uploading original
    try {
      await api(`/api/uploads/${job.uploadId}/progress`, {
        method: 'PATCH',
        body: JSON.stringify({ progress: 10, status: 'uploading_original' })
      });
    } catch { /* non-critical */ }

    // 4. Execute rclone upload
    console.log(`[Upload] Uploading original: ${job.filename}...`);
    await runRclone(job.filePath, job.rcloneDestination);

    // 5. Report progress: 100%
    try {
      await api(`/api/uploads/${job.uploadId}/progress`, {
        method: 'PATCH',
        body: JSON.stringify({ progress: 100, status: 'uploading_original' })
      });
    } catch { /* non-critical */ }
    
    // 6. Mark as completed
    await api(`/api/uploads/${job.uploadId}/completed`, { 
      method: 'POST', 
      body: JSON.stringify({ completed: true })
    });
    
    console.log(`[Complete] Uploaded ${job.filename} as UNASSIGNED`);
    queue.shift();
  } catch (error) {
    job.attempts += 1;
    job.lastError = error.message;
    job.lastAttemptAt = new Date().toISOString();
    
    const backoffDelay = getBackoffDelay(job.attempts);
    console.error(`[Retry ${job.attempts}/${MAX_RETRIES}] ${job.filename}: ${error.message} (next attempt in ${Math.round(backoffDelay/1000)}s)`);
    
    // Report retry status
    if (job.uploadId) {
      try {
        await api(`/api/uploads/${job.uploadId}/progress`, {
          method: 'PATCH',
          body: JSON.stringify({ progress: job.attempts > 0 ? 5 : 0, status: 'retrying' })
        });
      } catch { /* non-critical */ }
    }
    
    // Check if we should give up
    if (job.attempts >= MAX_RETRIES) {
      console.error(`[Failed] Giving up on ${job.filename} after ${MAX_RETRIES} attempts.`);
      if (job.uploadId) {
        try {
          await api(`/api/uploads/${job.uploadId}/completed`, {
            method: 'POST',
            body: JSON.stringify({ completed: false, error: `Failed after ${MAX_RETRIES} attempts: ${error.message}` })
          });
        } catch { /* ignore */ }
      }
      queue.shift();
    }
    
    // Check if this is a network error
    if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED') || error.message.includes('network')) {
      isOnline = false;
    }
  } finally {
    await saveQueue();
    busy = false;
    if (queue.length) {
      const nextJob = queue[0];
      const delay = nextJob.attempts > 0 ? getBackoffDelay(nextJob.attempts) : 250;
      setTimeout(processQueue, delay);
    }
  }
}

// Periodic connectivity check for offline recovery
function startConnectivityMonitor() {
  setInterval(async () => {
    if (!isOnline && queue.length > 0) {
      await checkConnectivity();
    }
  }, 15000); // Check every 15 seconds when offline
}

async function boot() {
  await loadConfig();
  await loadQueue();
  await fs.mkdir(config.watchDirectory, { recursive: true });
  
  console.log(`[Agent] Watching ${config.watchDirectory} as ${config.cameraName}${config.dryRun ? ' (dry run)' : ''}`);
  console.log(`[Agent] API endpoint: ${config.apiBaseUrl}`);
  console.log(`[Agent] Queued jobs from previous session: ${queue.length}`);
  
  chokidar.watch(config.watchDirectory, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 150 } }).on('add', enqueue);
  
  // Start connectivity monitor for offline recovery
  startConnectivityMonitor();
  
  // Process any leftover jobs from previous session
  if (queue.length > 0) {
    console.log(`[Resume] Processing ${queue.length} queued job(s) from previous session...`);
    processQueue();
  }
}

boot().catch((error) => { console.error(error.message); process.exitCode = 1; });
