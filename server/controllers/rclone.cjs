const { spawn } = require('node:child_process');

class RCloneService {
  constructor() {
    this.remote = process.env.GRADSYNC_RCLONE_REMOTE || 'drive:';
    this.dryRun = process.env.GRADSYNC_RCLONE_DRY_RUN === 'true';
  }

  // Sanitize for folder names
  sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // The format requested by user: studentname_studentid
  getFolderName(student) {
    const safeName = this.sanitizeName(student.name);
    return `${safeName}_${student.student_id}`;
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
        reject(err);
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
          reject(new Error(errMsg));
        }
      });
    });
  }
}

module.exports = new RCloneService();
