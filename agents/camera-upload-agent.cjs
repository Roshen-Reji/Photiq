/* Watches a tethered-camera folder, then routes each image through RClone. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const chokidar = require('chokidar');

const configPath = process.env.GRADSYNC_AGENT_CONFIG || path.join(__dirname, 'camera-agent.config.json');
const queuePath = process.env.GRADSYNC_AGENT_QUEUE || path.join(__dirname, 'runtime', 'camera-upload-queue.json');
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.cr2', '.cr3', '.nef', '.arw']);
let config;
let queue = [];
let busy = false;

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

function runRclone(sourcePath, destination) {
  if (config.dryRun) {
    console.log(`[dry run] rclone copyto "${sourcePath}" "${config.rcloneRemote}${destination}"`);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const child = spawn('rclone', ['copyto', sourcePath, `${config.rcloneRemote}${destination}`, '--retries', '4', '--low-level-retries', '10'], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`rclone exited with code ${code}`)));
  });
}

async function enqueue(filePath) {
  if (!imageExtensions.has(path.extname(filePath).toLowerCase()) || queue.some((job) => job.filePath === filePath)) return;
  queue.push({ filePath, filename: path.basename(filePath), attempts: 0, createdAt: new Date().toISOString() });
  await saveQueue();
  processQueue();
}

async function processQueue() {
  if (busy || !queue.length) return;
  busy = true;
  const job = queue[0];
  try {
    // 1. Request an upload intent as UNASSIGNED
    const intent = await api('/api/uploads/intent', { 
      method: 'POST', 
      body: JSON.stringify({ 
        studentId: 'UNASSIGNED', 
        source: 'stage', 
        filename: job.filename, 
        camera: config.cameraName, 
        localPath: job.filePath 
      }) 
    });
    
    // 2. Execute rclone
    await runRclone(job.filePath, intent.rcloneDestination);
    
    // 3. Mark as completed
    await api(`/api/uploads/${intent.uploadId}/completed`, { 
      method: 'POST', 
      body: JSON.stringify({ completed: true }) 
    });
    
    console.log(`Uploaded ${job.filename} as UNASSIGNED`);
    queue.shift();
  } catch (error) {
    job.attempts += 1;
    job.lastError = error.message;
    job.lastAttemptAt = new Date().toISOString();
    console.error(`Queue retry ${job.attempts} for ${job.filename}: ${error.message}`);
  } finally {
    await saveQueue();
    busy = false;
    if (queue.length) setTimeout(processQueue, queue[0]?.attempts ? 15_000 : 250);
  }
}

async function boot() {
  await loadConfig();
  await loadQueue();
  await fs.mkdir(config.watchDirectory, { recursive: true });
  console.log(`Watching ${config.watchDirectory} as ${config.cameraName}${config.dryRun ? ' (dry run)' : ''}`);
  chokidar.watch(config.watchDirectory, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 1800, pollInterval: 200 } }).on('add', enqueue);
  processQueue();
}

boot().catch((error) => { console.error(error.message); process.exitCode = 1; });
