const { spawn, execSync } = require('node:child_process');

const RCLONE_LIST_TIMEOUT_MS = Number(process.env.GRADSYNC_RCLONE_LIST_TIMEOUT_MS || 15000);

class RCloneService {
  constructor() {
    this.remote = process.env.GRADSYNC_RCLONE_REMOTE || 'drive:';
    this.baseFolder = process.env.GRADSYNC_BASE_FOLDER || 'GradSync';
    this.dryRun = process.env.GRADSYNC_RCLONE_DRY_RUN === 'true';

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

      if (this.dryRun) {
        console.log(`[RClone Dry Run] mkdir "${destination}"`);
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

  streamPhotoByPath(rclonePath, res) {
    if (this.dryRun) {
      res.status(404).send('Photos not available — rclone is not configured.');
      return;
    }
    const destination = rclonePath.startsWith(this.remote) ? rclonePath : `${this.remote}${rclonePath}`;
    
    const child = spawn('rclone', ['cat', destination]);
    child.stdout.pipe(res);
    child.stderr.on('data', (data) => console.error(`[RClone Cat Error]: ${data}`));
    child.on('error', (err) => {
      console.error(`[RClone streamPhoto Error]: ${err.message}`);
      if (!res.headersSent) res.status(500).send('Photo streaming failed — rclone error.');
    });
    res.on('close', () => {
      if (!child.killed) child.kill();
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
