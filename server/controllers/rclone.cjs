const { spawn, execSync } = require('node:child_process');

class RCloneService {
  constructor() {
    this.remote = process.env.GRADSYNC_RCLONE_REMOTE || 'drive:';
    this.baseFolder = process.env.GRADSYNC_BASE_FOLDER || 'GradSync';
    this.dryRun = process.env.GRADSYNC_RCLONE_DRY_RUN === 'true';

    // Auto-detect if rclone is installed
    if (!this.dryRun) {
      try {
        execSync('rclone version', { stdio: 'ignore', timeout: 5000 });
        console.log('[RClone] rclone detected on system.');
      } catch (e) {
        console.warn('[RClone] rclone is NOT installed or not in PATH. Auto-enabling dry-run mode.');
        console.warn('[RClone] Install rclone (https://rclone.org/install/) to enable Google Drive sync.');
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
      
      const child = spawn('rclone', ['lsjson', destination], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      
      child.stdout.on('data', (data) => output += data.toString());
      
      // Handle spawn errors (e.g. rclone not found) gracefully
      child.on('error', (err) => {
        console.error(`[RClone listStudentPhotos Error]: ${err.message}`);
        resolve([]);
      });

      child.on('exit', (code) => {
        if (code === 0) {
          try {
            const files = JSON.parse(output);
            resolve(files.filter(f => !f.IsDir));
          } catch(e) {
            resolve([]);
          }
        } else {
          // If folder doesn't exist, rclone might exit with error, just return empty
          resolve([]);
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
  }

  moveFile(srcPath, destPath) {
    return new Promise((resolve) => {
      const src = srcPath.startsWith(this.remote) ? srcPath : `${this.remote}${srcPath}`;
      const dest = destPath.startsWith(this.remote) ? destPath : `${this.remote}${destPath}`;
      
      if (this.dryRun) {
        console.log(`[RClone Dry Run] moveto "${src}" "${dest}"`);
        return resolve();
      }
      
      const child = spawn('rclone', ['moveto', src, dest], { stdio: 'pipe' });
      child.on('error', (err) => {
        console.error(`[RClone moveFile Error]: ${err.message}`);
        resolve(); // Don't crash
      });
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else {
          console.error(`RClone moveto failed with code ${code}`);
          resolve(); // Don't crash
        }
      });
    });
  }
}

module.exports = new RCloneService();
