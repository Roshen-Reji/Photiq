const { randomBytes } = require('node:crypto');

function token() {
  return randomBytes(18).toString('base64url');
}

function student(id, name, department, physicalQr, stage, booth, status = 'waiting') {
  return {
    id,
    name,
    department,
    physicalQr,
    stage,
    booth,
    status,
    secureToken: token(),
    folder: { status: status === 'ready' ? 'verified' : 'pending', createdAt: status === 'ready' ? new Date().toISOString() : null },
    createdAt: new Date().toISOString(),
  };
}

function initialState() {
  return {
    version: 1,
    event: { name: 'Graduation 2026', year: 2026, parentFolder: 'Graduation/2026' },
    activeStudentId: 'CEK-2026-1042',
    paused: false,
    students: [
      student('CEK-2026-1042', 'Aditi Menon', 'CSE', 'GRAD-6K84', 12, 4, 'ready'),
      student('CEK-2026-1038', 'Adarsh S. Nair', 'ECE', 'GRAD-73P2', 0, 0),
      student('CEK-2026-1016', 'Amina Basheer', 'ME', null, 0, 0),
      student('CEK-2026-1057', 'Arjun Krishna', 'EEE', 'GRAD-9QJ1', 8, 3, 'ready'),
      student('CEK-2026-1029', 'Athira Raj', 'CIV', 'GRAD-2MZ7', 0, 0),
      student('CEK-2026-1063', 'Bilal Mohammed', 'CSE', null, 0, 0),
      student('CEK-2026-1007', 'Diya Paul', 'ECE', 'GRAD-4GZ9', 11, 7, 'ready'),
      student('CEK-2026-1072', 'Farhan Faisal', 'ME', null, 0, 0),
      student('CEK-2026-1011', 'Gopika S.', 'CSE', 'GRAD-8RC4', 0, 0),
    ],
    uploads: [],
    activity: [
      { id: token(), time: new Date().toISOString(), type: 'ok', text: 'SYSTEM READY — 2 CAPTURE AGENTS ONLINE' },
      { id: token(), time: new Date().toISOString(), type: 'info', text: 'QUEUE IMPORTED: 296 STUDENTS' },
    ],
  };
}

module.exports = { initialState, token };
