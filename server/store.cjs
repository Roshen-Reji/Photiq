const fs = require('node:fs/promises');
const path = require('node:path');
const { initialState, token } = require('./defaults.cjs');

function folderName(student) {
  return `${student.id}_${student.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}

function publicStudent(student) {
  const { secureToken, ...rest } = student;
  return { ...rest, publicUrl: `/s/${secureToken}`, folderName: folderName(student) };
}

function publicState(state) {
  return {
    event: state.event,
    activeStudentId: state.activeStudentId,
    paused: state.paused,
    students: state.students.map(publicStudent),
    activity: state.activity.slice(0, 32),
    pendingUploads: state.uploads.filter((upload) => upload.status !== 'completed').length,
  };
}

class EventStore {
  constructor(filePath) { this.filePath = filePath; this.state = null; this.writeQueue = Promise.resolve(); }
  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try { this.state = JSON.parse(await fs.readFile(this.filePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.state = initialState(); await this.persist(); }
  }
  async persist() {
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, this.filePath);
  }
  async mutate(change) {
    let result;
    this.writeQueue = this.writeQueue.then(async () => { result = await change(this.state); await this.persist(); });
    await this.writeQueue;
    return result;
  }
  student(studentId) { return this.state.students.find((student) => student.id === studentId); }
  activity(text, type = 'info') {
    this.state.activity.unshift({ id: token(), time: new Date().toISOString(), type, text });
    this.state.activity = this.state.activity.slice(0, 100);
  }
  active() { return this.student(this.state.activeStudentId); }
}

module.exports = { EventStore, folderName, publicStudent, publicState, token };
