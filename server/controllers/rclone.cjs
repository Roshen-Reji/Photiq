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
  listStudentPhotos(student) {
    return new Promise((resolve, reject) => {
      if (this.dryRun) {
        return resolve([{ Path: 'mock_stage_01.jpg', Size: 4500000, MimeType: 'image/jpeg' }]);
      }
      const folderName = this.getFolderName(student);
      const destination = `${this.remote}/${folderName}`;
      
      const child = spawn('rclone', ['lsjson', destination], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      
      child.stdout.on('data', (data) => output += data.toString());
      
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
      res.status(404).send('Not found in dry run');
      return;
    }
    const folderName = this.getFolderName(student);
    const destination = `${this.remote}/${folderName}/${filename}`;
    
    const child = spawn('rclone', ['cat', destination]);
    
    child.stdout.pipe(res);
    
    child.stderr.on('data', (data) => {
      console.error(`[RClone Cat Error]: ${data}`);
    });
    
    child.on('error', (err) => {
      if (!res.headersSent) res.status(500).end();
    });
  }
}

module.exports = new RCloneService();
