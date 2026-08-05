const { spawn, execSync } = require('node:child_process');

const RCLONE_LIST_TIMEOUT_MS = Number(process.env.GRADSYNC_RCLONE_LIST_TIMEOUT_MS || 15000);

class RCloneService {
  constructor() {
    this.remote = process.env.GRADSYNC_RCLONE_REMOTE || 'drive:';
    this.baseFolder = process.env.GRADSYNC_BASE_FOLDER || 'GradSync';
    this.dryRun = process.env.GRADSYNC_RCLONE_DRY_RUN === 'true';
    // Track folders already created this session to avoid duplicates in Drive
    this._createdFolders = new Set();

    // Auto-detect if rclone is installed AND configured
    if (!this.dryRun) {
      try {
        execSync('rclone version', { stdio: 'ignore', timeout: 5000 });
        const remotes = execSync('rclone listremotes', { timeout: 5000 }).toString();
        if (remotes.includes(this.remote)) {
          console.log(`[RClone] rclone detected and remote '${this.remote}' is configured.`);
        } else {
          console.warn(`[RClone] rclone is installed but remote '${this.remote}' is NOT configured. Auto-enabling dry-run mode.`);
          this.dryRun = true;
        }
      } catch (e) {
        console.warn('[RClone] rclone is NOT installed or failed. Auto-enabling dry-run mode.');
        this.dryRun = true;
      }
    }
  }

  // Sanitize for folder names
  sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // The format requested by user: studentname_studentid
  getFolderName(student) {
    const safeName = this.sanitizeName(student.name);
    return `${this.baseFolder}/${safeName}_${student.student_id}`;
  }

  createStudentFolder(student, io) {
    return new Promise((resolve, reject) => {
      const folderName = this.getFolderName(student);
      const destination = `${this.remote}/${folderName}`;

      // FIX: Skip if we already created this exact folder this session.
      // Prevents duplicate folders when a student is clicked active multiple
      // times in the queue.
      if (this._createdFolders.has(folderName)) {
        console.log(`[RClone] Folder already created this session: ${folderName}`);
        return resolve(destination);
      }

      if (this.dryRun) {
        console.log(`[RClone Dry Run] mkdir "${destination}"`);
        this._createdFolders.add(folderName);
        if (io) {
          io.emit('system_log', {
            time: new Date().toLocaleTimeString(),
            level: 'ok',
            message: `[DRY_RUN] FOLDER ALLOCATED: ${folderName}`
          });
        }
        return resolve(destination);
      }

      console.log(`[RClone] Creating folder: ${destination}`);
      const child = spawn('rclone', ['mkdir', destination], { stdio: 'pipe' });

      child.on('error', (err) => {
        console.error(`[RClone Error]: ${err.message}`);
        if (io) {
          io.emit('system_log', {
            time: new Date().toLocaleTimeString(),
            level: 'warn',
            message: `RCLONE ERROR: ${err.message}`
          });
        }
        // Resolve instead of reject to prevent server crash
        resolve(destination);
      });

      child.on('exit', (code) => {
        if (code === 0) {
          this._createdFolders.add(folderName);
          if (io) {
            io.emit('system_log', {
              time: new Date().toLocaleTimeString(),
              level: 'ok',
              message: `FOLDER ALLOCATED: ${folderName}`
            });
          }
          resolve(destination);
        } else {
          const errMsg = `RClone exited with code ${code}`;
          if (io) {
            io.emit('system_log', {
              time: new Date().toLocaleTimeString(),
              level: 'warn',
              message: errMsg
            });
          }
          // Resolve instead of reject to prevent server crash
          resolve(destination);
        }
      });
    });
  }

  listStudentPhotos(student) {
    return new Promise((resolve) => {
      if (this.dryRun) {
        return resolve([]);
      }
      const folderName = this.getFolderName(student);
      const destination = `${this.remote}/${folderName}`;

      const child = spawn('rclone', ['lsjson', destination, '--contimeout', '10s', '--timeout', '30s', '--retries', '1'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let settled = false;
      const finish = (files) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(files);
      };
      const timeout = setTimeout(() => {
        console.error(`[RClone listStudentPhotos Error]: timed out after ${RCLONE_LIST_TIMEOUT_MS}ms`);
        child.kill();
        finish([]);
      }, RCLONE_LIST_TIMEOUT_MS);

      child.stdout.on('data', (data) => output += data.toString());
      child.on('error', (err) => {
        console.error(`[RClone listStudentPhotos Error]: ${err.message}`);
        finish([]);
      });

      child.on('exit', (code) => {
        if (code === 0) {
          try {
            const files = JSON.parse(output);
            finish(files.filter(f => !f.IsDir));
          } catch(e) {
            finish([]);
          }
        } else {
          finish([]);
        }
      });
    });
  }

  streamPhoto(student, filename, res) {
    if (this.dryRun) {
      res.status(404).send('Photos not available — rclone is not configured.');
      return;
    }
    const folderName = this.getFolderName(student);
    const destination = `${this.remote}/${folderName}/${filename}`;
    this.streamPhotoByPath(destination, res);
  }

  /**
   * Streams a file from rclone storage. Returns a Promise that resolves to
   * `true` if streaming succeeded, `false` if rclone failed (so the caller
   * can fall back to a preview or local file).
   *
   * IMPORTANT: When `sendHeaders` is true (the default) this function sets
   * response headers itself. Set `sendHeaders: false` if the caller already
   * sent headers.
   */
  streamPhotoByPath(rclonePath, res, { sendHeaders = false } = {}) {
    if (this.dryRun) {
      if (!res.headersSent) res.status(404).send('Photos not available — rclone is not configured.');
      return Promise.resolve(false);
    }
    const destination = rclonePath.startsWith(this.remote) ? rclonePath : `${this.remote}${rclonePath}`;

    return new Promise((resolve) => {
      let stderrBuf = '';
      let settled = false;
      let receivedData = false;

      const child = spawn('rclone', ['cat', destination, '--contimeout', '15s', '--timeout', '45s', '--retries', '2', '--low-level-retries', '5']);

      // Kill rclone if it takes too long
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.error(`[RClone streamPhoto] Timeout streaming ${destination}`);
          child.kill();
          if (!res.headersSent) res.status(504).send('Photo streaming timed out.');
          else if (!res.writableEnded) res.end();
          resolve(false);
        }
      }, 60000);

      child.stdout.on('data', (chunk) => {
        receivedData = true;
        if (!res.writableEnded) {
          try { res.write(chunk); } catch (e) { /* client disconnected */ }
        }
      });

      child.stderr.on('data', (data) => { stderrBuf += data.toString(); });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.error(`[RClone streamPhoto Error]: ${err.message}`);
        if (!res.headersSent) res.status(500).send('Photo streaming failed — rclone error.');
        else if (!res.writableEnded) res.end();
        resolve(false);
      });

      child.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (code === 0 && receivedData) {
          if (!res.writableEnded) res.end();
          resolve(true);
        } else {
          const errMsg = stderrBuf.trim() || `rclone exited with code ${code}`;
          console.error(`[RClone streamPhoto] Failed for ${destination}: ${errMsg}`);
          if (!res.headersSent) {
            res.status(404).send('Photo not found in cloud storage.');
          } else if (!res.writableEnded) {
            res.end();
          }
          resolve(false);
        }
      });

      // Clean up if the client disconnects
      res.on('close', () => {
        clearTimeout(timeout);
        if (!child.killed) child.kill();
        if (!settled) { settled = true; resolve(false); }
      });
    });
  }

  moveFile(srcPath, destPath) {
    return new Promise((resolve) => {
      const src = srcPath.startsWith(this.remote) ? srcPath : `${this.remote}${srcPath}`;
      const dest = destPath.startsWith(this.remote) ? destPath : `${this.remote}${destPath}`;
      
      if (this.dryRun) {
        console.log(`[RClone Dry Run] moveto "${src}" "${dest}"`);
        return resolve(true);
      }
      
      const child = spawn('rclone', ['moveto', src, dest], { stdio: 'pipe' });
      child.on('error', (err) => {
        console.error(`[RClone moveFile Error]: ${err.message}`);
        resolve(false);
      });
      child.on('exit', (code) => {
        if (code === 0) resolve(true);
        else {
          console.error(`RClone moveto failed with code ${code}`);
          resolve(false);
        }
      });
    });
  }
}

module.exports = new RCloneService();
