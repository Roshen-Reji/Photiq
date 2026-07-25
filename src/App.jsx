import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import { parseXlsxRoster } from './xlsx-import';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Download, FileSpreadsheet, Folder,
  Images, Link2, ListFilter, LockKeyhole, Maximize2, Monitor, MoreHorizontal,
  MoveRight, Pause, Play, Plus, QrCode, RotateCcw, ScanLine, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Trash2, UploadCloud, UserPlus, UserRoundCheck,
  Wifi, X,
} from 'lucide-react';

const initialStudents = [
  { id: 'CEK-2026-1042', name: 'Aditi Menon', department: 'CSE', physicalQr: 'GRAD-6K84', stage: 12, booth: 4, status: 'ready' },
  { id: 'CEK-2026-1038', name: 'Adarsh S. Nair', department: 'ECE', physicalQr: 'GRAD-73P2', stage: 0, booth: 0, status: 'waiting' },
  { id: 'CEK-2026-1016', name: 'Amina Basheer', department: 'ME', physicalQr: null, stage: 0, booth: 0, status: 'waiting' },
  { id: 'CEK-2026-1057', name: 'Arjun Krishna', department: 'EEE', physicalQr: 'GRAD-9QJ1', stage: 8, booth: 3, status: 'ready' },
  { id: 'CEK-2026-1029', name: 'Athira Raj', department: 'CIV', physicalQr: 'GRAD-2MZ7', stage: 0, booth: 0, status: 'waiting' },
  { id: 'CEK-2026-1063', name: 'Bilal Mohammed', department: 'CSE', physicalQr: null, stage: 0, booth: 0, status: 'waiting' },
  { id: 'CEK-2026-1007', name: 'Diya Paul', department: 'ECE', physicalQr: 'GRAD-4GZ9', stage: 11, booth: 7, status: 'ready' },
  { id: 'CEK-2026-1072', name: 'Farhan Faisal', department: 'ME', physicalQr: null, stage: 0, booth: 0, status: 'waiting' },
  { id: 'CEK-2026-1011', name: 'Gopika S.', department: 'CSE', physicalQr: 'GRAD-8RC4', stage: 0, booth: 0, status: 'waiting' },
];

const galleryImages = [
  { tone: 'gold', label: 'Stage portrait', size: 'tall' }, { tone: 'violet', label: 'Degree moment', size: 'standard' },
  { tone: 'blue', label: 'Class of 2026', size: 'wide' }, { tone: 'coral', label: 'Celebration', size: 'standard' },
  { tone: 'forest', label: 'Booth portrait', size: 'tall' }, { tone: 'plum', label: 'Friends', size: 'wide' },
  { tone: 'ink', label: 'Graduate', size: 'standard' }, { tone: 'sunset', label: 'After party', size: 'standard' },
];

function makeToken(student) {
  const publicUrl = student.publicUrl || `/s/${btoa(student.id).replace(/=/g, '').slice(0, 14)}`;
  return `${window.location.origin}${publicUrl}`;
}

function timeStamp() {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Controller returned ${response.status}`);
  return payload;
}

function displayTime(value) {
  if (!value || /^\d{2}:\d{2}:\d{2}$/.test(value)) return value || timeStamp();
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function parseRosterCsv(text) {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
  return parseRosterRows(rows);
}

function parseRosterRows(rows) {
  if (rows.length < 2) throw new Error('Use a header row followed by at least one student');
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const findColumn = (...names) => headers.findIndex((header) => names.includes(header));
  const idColumn = findColumn('studentid', 'id', 'rollnumber', 'registrationnumber');
  const nameColumn = findColumn('name', 'studentname', 'fullname');
  const departmentColumn = findColumn('department', 'dept', 'branch');
  if (idColumn < 0 || nameColumn < 0 || departmentColumn < 0) throw new Error('CSV needs Student ID, Name, and Department columns');
  return rows.slice(1).map((row) => ({ id: row[idColumn] || '', name: row[nameColumn] || '', department: row[departmentColumn] || '' }));
}

function App() {
  const publicToken = window.location.pathname.match(/^\/s\/([^/]+)$/)?.[1] || null;
  const [students, setStudents] = useState(initialStudents);
  const [activeIndex, setActiveIndex] = useState(0);
  const [screen, setScreen] = useState(publicToken ? 'gallery' : 'monitor');
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState('');
  const [logs, setLogs] = useState([
    { time: '10:28:04', type: 'ok', text: 'SYSTEM READY — 2 CAPTURE AGENTS ONLINE' },
    { time: '10:28:12', type: 'info', text: 'QUEUE IMPORTED: 296 STUDENTS' },
    { time: '10:31:47', type: 'ok', text: 'FOLDER VERIFIED: CEK-2026-1042' },
    { time: '10:31:48', type: 'ok', text: 'DIGITAL QR TOKEN ISSUED' },
  ]);
  const [assigning, setAssigning] = useState(false);
  const [cardValue, setCardValue] = useState('');
  const [boothPeople, setBoothPeople] = useState([]);
  const [boothInput, setBoothInput] = useState('');
  const [flash, setFlash] = useState('');
  const [galleryStudent, setGalleryStudent] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newStudent, setNewStudent] = useState({ id: '', name: '', department: '' });
  const [editingStudent, setEditingStudent] = useState(null);

  const active = students[activeIndex] ?? students[0];
  const filteredStudents = useMemo(() => students.filter((student) => `${student.name} ${student.id}`.toLowerCase().includes(query.toLowerCase())), [students, query]);
  const totalPhotos = students.reduce((sum, student) => sum + student.stage + student.booth, 0);

  function applyEventState(eventState) {
    if (!eventState?.students?.length) return;
    setStudents(eventState.students);
    const nextIndex = eventState.students.findIndex((student) => student.id === eventState.activeStudentId);
    setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
    setPaused(Boolean(eventState.paused));
    if (eventState.activity) setLogs(eventState.activity.map((log) => ({ ...log, time: displayTime(log.time) })));
  }

  function notify(message, duration = 2600) {
    setFlash(message);
    window.setTimeout(() => setFlash(''), duration);
  }

  useEffect(() => {
    let mounted = true;
    if (publicToken) {
      apiRequest(`/api/public/${encodeURIComponent(publicToken)}`).then((gallery) => {
        if (mounted) setGalleryStudent(gallery.student);
      }).catch(() => { if (mounted) notify('This gallery link is invalid or has expired', 5000); });
      return () => { mounted = false; };
    }
    apiRequest('/api/event').then((eventState) => { if (mounted) applyEventState(eventState); }).catch(() => {
      // The interface deliberately keeps its sample data usable when the controller is offline.
    });
    const socket = io({ transports: ['websocket', 'polling'] });
    socket.on('event:state', (eventState) => { if (mounted) applyEventState(eventState); });
    return () => { mounted = false; socket.disconnect(); };
  }, [publicToken]);

  function addLog(text, type = 'info') {
    setLogs((current) => [{ time: timeStamp(), text, type }, ...current].slice(0, 8));
  }

  function activate(index) {
    if (index === activeIndex || !students[index]) return;
    if (paused) return notify('Queue is paused — resume before selecting a student');
    const nextStudent = students[index];
    setActiveIndex(index);
    setStudents((current) => current.map((student, studentIndex) => studentIndex === index ? { ...student, status: 'ready' } : student));
    addLog(`ACTIVE NODE SET: ${nextStudent.id} — ${nextStudent.name.toUpperCase()}`, 'active');
    addLog(`DRIVE FOLDER VERIFIED: 2026/${nextStudent.id}_${nextStudent.name.replaceAll(' ', '_')}`, 'ok');
    notify(`${nextStudent.name} is now active`);
    apiRequest('/api/active', { method: 'POST', body: JSON.stringify({ studentId: nextStudent.id }) }).catch((error) => notify(error.message, 4200));
  }

  function step(direction) {
    if (paused) return;
    const next = Math.max(0, Math.min(students.length - 1, activeIndex + direction));
    activate(next);
  }

  function moveStudent(index, direction) {
    const replacement = index + direction;
    if (replacement < 0 || replacement >= students.length) return;
    const next = [...students];
    [next[index], next[replacement]] = [next[replacement], next[index]];
    setStudents(next);
    if (activeIndex === index) setActiveIndex(replacement);
    else if (activeIndex === replacement) setActiveIndex(index);
    addLog('QUEUE ORDER UPDATED BY OPERATOR', 'info');
    apiRequest('/api/queue/reorder', { method: 'POST', body: JSON.stringify({ studentIds: next.map((student) => student.id) }) }).catch((error) => notify(error.message, 4200));
  }

  function removeStudent(index) {
    if (students.length === 1) return;
    const target = students[index];
    setStudents((current) => current.filter((_, studentIndex) => studentIndex !== index));
    setActiveIndex((current) => Math.min(current > index ? current - 1 : current, students.length - 2));
    addLog(`REMOVED FROM LIVE QUEUE: ${target.id}`, 'warn');
    apiRequest(`/api/students/${encodeURIComponent(target.id)}`, { method: 'DELETE' }).catch((error) => notify(error.message, 4200));
  }

  function assignCard(event) {
    event.preventDefault();
    const code = cardValue.trim().toUpperCase();
    if (!code) return;
    setStudents((current) => current.map((student, index) => index === activeIndex ? { ...student, physicalQr: code } : student));
    addLog(`PHYSICAL CARD ${code} LINKED TO ${active.id}`, 'ok');
    setCardValue('');
    setAssigning(false);
    apiRequest('/api/physical-qr', { method: 'POST', body: JSON.stringify({ studentId: active.id, code }) }).catch((error) => notify(error.message, 4200));
  }

  function addBoothPerson(raw) {
    const value = raw.trim().toLowerCase();
    if (!value) return;
    const matched = students.find((student) => student.id.toLowerCase() === value || student.physicalQr?.toLowerCase() === value || student.name.toLowerCase() === value || makeToken(student).toLowerCase() === value || student.publicUrl?.toLowerCase() === value || value.endsWith(student.publicUrl?.toLowerCase() || '///'));
    if (!matched) {
      notify('No matching secure QR or card found', 2400);
      return;
    }
    if (!boothPeople.some((student) => student.id === matched.id)) {
      setBoothPeople((current) => [...current, matched]);
      notify(`Welcome, ${matched.name}`, 1800);
    }
    setBoothInput('');
  }

  function captureBooth(imageData) {
    if (!boothPeople.length) {
      notify('Scan at least one QR before taking a picture', 2400);
      return;
    }
    if (!imageData) return notify('Start the booth camera before taking a photo', 3200);
    addLog(`BOOTH-02 UPLOAD QUEUED FOR ${boothPeople.length} RECIPIENT${boothPeople.length > 1 ? 'S' : ''}`, 'active');
    notify(`Photo queued for ${boothPeople.length} private ${boothPeople.length === 1 ? 'gallery' : 'galleries'}`, 3000);
    setBoothPeople([]);
    apiRequest('/api/booth/capture', { method: 'POST', body: JSON.stringify({ studentIds: boothPeople.map((student) => student.id), camera: 'BOOTH-02', imageData }) }).catch((error) => notify(error.message, 4200));
  }

  function createStudent(event) {
    event.preventDefault();
    apiRequest('/api/students', { method: 'POST', body: JSON.stringify(newStudent) }).then((student) => {
      setCreating(false);
      setNewStudent({ id: '', name: '', department: '' });
      notify(`${student.name} was added to the queue`);
    }).catch((error) => notify(error.message, 4200));
  }

  function saveStudent(event) {
    event.preventDefault();
    if (!editingStudent) return;
    apiRequest(`/api/students/${encodeURIComponent(editingStudent.id)}`, { method: 'PATCH', body: JSON.stringify({ name: editingStudent.name, department: editingStudent.department }) }).then(() => {
      notify(`${editingStudent.name} was updated`);
      setEditingStudent(null);
    }).catch((error) => notify(error.message, 4200));
  }

  function importRoster(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const loadRoster = file.name.toLowerCase().endsWith('.xlsx') ? parseXlsxRoster(file, parseRosterRows) : file.name.toLowerCase().endsWith('.csv') ? file.text().then(parseRosterCsv) : Promise.reject(new Error('Choose a CSV or .xlsx roster file'));
    loadRoster.then((roster) => apiRequest('/api/students/import', { method: 'POST', body: JSON.stringify({ students: roster }) })).then((result) => {
      notify(`${result.imported} student${result.imported === 1 ? '' : 's'} added to the live queue`, 3600);
    }).catch((error) => notify(error.message, 4200));
  }

  return (
    <main className={screen === 'monitor' ? 'app monitor-app' : 'app portal-app'}>
      {screen === 'monitor' ? (
        <MonitorDashboard
          students={students}
          filteredStudents={filteredStudents}
          active={active}
          activeIndex={activeIndex}
          query={query}
          paused={paused}
          logs={logs}
          totalPhotos={totalPhotos}
          assigning={assigning}
          cardValue={cardValue}
          onQuery={setQuery}
          onStep={step}
          onActivate={activate}
          onMove={moveStudent}
          onRemove={removeStudent}
          onPause={() => {
            const nextPaused = !paused;
            setPaused(nextPaused);
            addLog(nextPaused ? 'QUEUE PAUSED BY OPERATOR' : 'QUEUE RESUMED', nextPaused ? 'warn' : 'ok');
            apiRequest('/api/queue/pause', { method: 'POST', body: JSON.stringify({ paused: nextPaused }) }).catch((error) => notify(error.message, 4200));
          }}
          onAssignOpen={() => setAssigning(true)}
          onAssignClose={() => setAssigning(false)}
          onCardChange={setCardValue}
          onAssignCard={assignCard}
          onCreateOpen={() => setCreating(true)}
          onEdit={(student) => setEditingStudent({ ...student })}
          onImport={importRoster}
          onBooth={() => setScreen('booth')}
          onGallery={() => setScreen('gallery')}
        />
      ) : screen === 'booth' ? (
        <CameraPhotoBooth
          people={boothPeople}
          input={boothInput}
          onInput={setBoothInput}
          onAdd={addBoothPerson}
          onRemove={(id) => setBoothPeople((current) => current.filter((student) => student.id !== id))}
          onCapture={captureBooth}
          onExit={() => setScreen('monitor')}
          onGallery={() => setScreen('gallery')}
        />
      ) : (
        <StudentGallery student={galleryStudent || active} images={galleryImages} isPublic={Boolean(publicToken)} onExit={publicToken ? undefined : () => setScreen('monitor')} onBooth={publicToken ? undefined : () => setScreen('booth')} />
      )}
      {flash && <div className="toast"><Check size={16} />{flash}</div>}
      {creating && <div className="modal-backdrop"><form className="assignment-modal" onSubmit={createStudent}><button type="button" className="modal-close" onClick={() => setCreating(false)}><X size={18} /></button><div className="modal-icon"><UserPlus size={24} /></div><p className="eyebrow">MANUAL QUEUE ENTRY</p><h3>Add a student to<br />the live roster</h3><span>Folders and private access tokens are created automatically when the student becomes active.</span><input autoFocus value={newStudent.id} onChange={(event) => setNewStudent((current) => ({ ...current, id: event.target.value }))} placeholder="STUDENT ID" /><input value={newStudent.name} onChange={(event) => setNewStudent((current) => ({ ...current, name: event.target.value }))} placeholder="FULL NAME" /><input value={newStudent.department} onChange={(event) => setNewStudent((current) => ({ ...current, department: event.target.value }))} placeholder="DEPARTMENT" /><button className="assign-submit" type="submit">ADD TO QUEUE <ArrowRight size={17} /></button></form></div>}
      {editingStudent && <div className="modal-backdrop"><form className="assignment-modal" onSubmit={saveStudent}><button type="button" className="modal-close" onClick={() => setEditingStudent(null)}><X size={18} /></button><div className="modal-icon"><MoreHorizontal size={24} /></div><p className="eyebrow">STUDENT RECORD</p><h3>Edit {editingStudent.id}</h3><span>Changing a display name does not change the student's private QR token or gallery ownership.</span><input autoFocus value={editingStudent.name} onChange={(event) => setEditingStudent((current) => ({ ...current, name: event.target.value }))} placeholder="FULL NAME" /><input value={editingStudent.department} onChange={(event) => setEditingStudent((current) => ({ ...current, department: event.target.value }))} placeholder="DEPARTMENT" /><button className="assign-submit" type="submit">SAVE CHANGES <Check size={17} /></button></form></div>}
    </main>
  );
}

function MonitorDashboard(props) {
  const {
    students, filteredStudents, active, activeIndex, query, paused, logs, totalPhotos, assigning, cardValue,
    onQuery, onStep, onActivate, onMove, onRemove, onPause, onAssignOpen, onAssignClose, onCardChange,
    onAssignCard, onCreateOpen, onEdit, onImport, onBooth, onGallery,
  } = props;
  const token = makeToken(active);
  const activeNumber = String(activeIndex + 1).padStart(3, '0');

  return <>
    <header className="command-header">
      <div className="brand"><span className="brand-mark">G//S</span><span>GRADSYNC</span><small>EVENT CONTROL PROTOCOL</small></div>
      <div className="header-status"><span className="live-dot" /> CEREMONY LIVE <span className="header-divider" /> 10:34:18 IST</div>
      <nav className="header-actions">
        <button className="header-link" onClick={onBooth}><Camera size={15} /> BOOTH_02</button>
        <button className="header-link" onClick={onGallery}><Images size={15} /> STUDENT PORTAL</button>
        <button className="header-icon"><CircleHelp size={17} /></button>
      </nav>
    </header>

    <section className="command-title">
      <div><p className="eyebrow">// ACTIVE CEREMONY · SESSION 01</p><h1>STAGE CONTROL</h1></div>
      <div className="title-actions"><label className="ghost-control import-control"><FileSpreadsheet size={16} /> IMPORT ROSTER<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onImport} /></label><button className="accent-control" onClick={onCreateOpen}><UserPlus size={16} /> ADD STUDENT</button></div>
    </section>

    <section className="monitor-grid">
      <aside className="queue-panel panel-frame">
        <div className="panel-heading"><span>[ QUEUE_VIEW ]</span><span className="counter">{students.length.toString().padStart(3, '0')} IN LINE</span></div>
        <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="SEARCH NAME OR ID" /><kbd>⌘K</kbd></label>
        <div className="queue-tools"><button><ListFilter size={14} /> ALL ({students.length})</button><button><SlidersHorizontal size={14} /> SORT</button><label className="upload-inline"><UploadCloud size={14} /> ROSTER<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onImport} /></label></div>
        <div className="queue-scroll">
          {filteredStudents.map((student) => {
            const actualIndex = students.findIndex((item) => item.id === student.id);
            const isActive = actualIndex === activeIndex;
            return <article className={`queue-item ${isActive ? 'active' : ''}`} key={student.id} onClick={() => onActivate(actualIndex)}>
              <div className="queue-number">{String(actualIndex + 1).padStart(2, '0')}</div>
              <div className="drag-marks">⠿</div>
              <div className="student-label"><strong>{student.name}</strong><span>{student.id} · {student.department}</span></div>
              <div className="queue-item-actions" onClick={(event) => event.stopPropagation()}>
                <button title="Move up" onClick={() => onMove(actualIndex, -1)}><ArrowUp size={13} /></button>
                <button title="Move down" onClick={() => onMove(actualIndex, 1)}><ArrowDown size={13} /></button>
                <button title="Edit student" onClick={() => onEdit(student)}><MoreHorizontal size={13} /></button>
                <button title="Remove" onClick={() => onRemove(actualIndex)}><Trash2 size={13} /></button>
              </div>
            </article>;
          })}
        </div>
        <footer className="queue-footer"><button><Plus size={15} /> INSERT TO QUEUE</button><span>DRAG TO REORDER</span></footer>
      </aside>

      <section className="active-panel panel-frame">
        <div className="panel-heading"><span>[ ACTIVE_NODE ]</span><span className="sync-label"><span className="pulse-dot" /> {paused ? 'QUEUE PAUSED' : 'SYNCED'}</span></div>
        <div className="active-main">
          <div className="active-meta"><span>NOW ON STAGE</span><em>NODE {activeNumber}</em></div>
          <h2>{active.name}</h2>
          <p className="student-code">{active.id} <i /> {active.department} ENGINEERING</p>
          <div className="active-data-row">
            <div><span>DRIVE FOLDER</span><strong><Folder size={15} /> VERIFIED</strong></div>
            <div><span>PHYSICAL CARD</span><strong className={active.physicalQr ? 'success-text' : 'warning-text'}>{active.physicalQr || 'UNASSIGNED'}</strong></div>
            <div><span>STAGE ASSETS</span><strong>{active.stage.toString().padStart(2, '0')} FILES</strong></div>
          </div>
          <div className="qr-zone">
            <div className="qr-shell"><QRCodeSVG value={token} size={180} bgColor="#f4f1e8" fgColor="#080909" level="M" includeMargin /></div>
            <div className="qr-copy"><p>PERSONAL ACCESS TOKEN</p><strong>QR/{active.id.split('-').at(-1)}</strong><span>Valid for photo booth and private gallery access.</span><button onClick={onGallery}><Link2 size={14} /> OPEN PRIVATE GALLERY</button></div>
          </div>
        </div>
        <div className="active-controls">
          <button className="prev-next" onClick={() => onStep(-1)}><ChevronLeft size={20} /> PREV</button>
          <button className="pause-control" onClick={onPause}>{paused ? <Play size={17} /> : <Pause size={17} />}{paused ? 'RESUME QUEUE' : 'PAUSE QUEUE'}</button>
          <button className="next-control" onClick={() => onStep(1)}>NEXT STUDENT <ChevronRight size={20} /></button>
        </div>
        <div className="active-sub-actions"><button onClick={onAssignOpen}><ScanLine size={15} /> ASSIGN PHYSICAL QR</button><button><Maximize2 size={15} /> SHOW ON DISPLAY</button><button><MoreHorizontal size={16} /> MORE OPTIONS</button></div>
      </section>

      <aside className="system-column">
        <section className="system-panel panel-frame">
          <div className="panel-heading"><span>[ SYSTEM_LOG ]</span><span className="muted-small">LIVE BUFFER</span></div>
          <div className="logs">
            {logs.map((log, index) => <div className={`log ${log.type}`} key={`${log.time}-${index}`}><time>{log.time}</time><span>›</span><p>{log.text}</p></div>)}
          </div>
          <button className="all-logs">VIEW FULL LOG <MoveRight size={14} /></button>
        </section>
        <section className="agents-panel panel-frame">
          <div className="panel-heading"><span>[ UPLOAD_AGENTS ]</span><span className="counter">02 / 02 ONLINE</span></div>
          <AgentRow label="STAGE-CAM_01" details="CANON EOS R6 · ETHERNET" count="1.2 GB" />
          <AgentRow label="STAGE-CAM_02" details="SONY A7 IV · WIFI 6" count="842 MB" />
          <div className="agent-bottom"><span><Wifi size={14} /> 98% LINK HEALTH</span><span>{totalPhotos.toString().padStart(4, '0')} ASSETS</span></div>
        </section>
        <section className="drive-card"><div><div className="drive-icon"><ShieldCheck size={22} /></div><p>GOOGLE DRIVE</p><span>GRADUATION / 2026</span></div><div className="drive-state"><span>CONNECTED</span><strong>12.4 GB <small>SYNCED</small></strong></div></section>
      </aside>
    </section>

    <footer className="monitor-footer"><span><span className="signal" /> ALL SYSTEMS NOMINAL</span><span>SECURE SESSION · OPERATOR 04</span><span>BUILD 0.1.0 / DEMO MODE</span></footer>

    {assigning && <div className="modal-backdrop"><form className="assignment-modal" onSubmit={onAssignCard}><button type="button" className="modal-close" onClick={onAssignClose}><X size={18} /></button><div className="modal-icon"><ScanLine size={24} /></div><p className="eyebrow">PHYSICAL QR LINK</p><h3>Assign a card to<br />{active.name}</h3><span>Scan with a USB reader or enter the printed card code. The link is one-to-one and can be updated later.</span><input autoFocus value={cardValue} onChange={(event) => onCardChange(event.target.value)} placeholder="E.G. GRAD-6K84" /><button className="assign-submit" type="submit">LINK CARD <ArrowRight size={17} /></button></form></div>}
  </>;
}

function AgentRow({ label, details, count }) {
  return <div className="agent-row"><span className="agent-led" /><div><strong>{label}</strong><small>{details}</small></div><span className="agent-size">{count}</span></div>;
}

function PhotoBooth({ people, input, onInput, onAdd, onRemove, onCapture, onExit, onGallery }) {
  return <>
    <header className="portal-header"><button className="wordmark" onClick={onExit}>GRAD<span>SYNC</span></button><div className="kiosk-chip"><span /> PHOTO BOOTH · 02</div><button className="portal-link" onClick={onGallery}>MY GALLERY <ArrowRight size={15} /></button></header>
    <section className="booth-layout">
      <div className="booth-copy"><p className="portal-eyebrow">GRADUATION 2026 / MEMORY STATION</p><h1>One frame.<br /><i>Everybody's</i> gallery.</h1><p>Scan your card or personal QR, step into the frame, and your photographs will arrive in your private gallery.</p><div className="booth-steps"><span className={people.length ? 'done' : ''}><b>01</b> SCAN</span><MoveRight size={14} /><span><b>02</b> POSE</span><MoveRight size={14} /><span><b>03</b> RECEIVE</span></div></div>
      <section className="viewfinder"><div className="corner c1" /><div className="corner c2" /><div className="corner c3" /><div className="corner c4" /><div className="viewfinder-top"><span><span className="record-dot" /> LIVE CAMERA</span><span>4K · 30 FPS</span></div><div className="booth-placeholder"><Sparkles size={44} /><p>READY FOR YOUR<br />BEST ANGLE</p></div><div className="viewfinder-bottom"><span>GROUP MODE ENABLED</span><span>← STEP INTO FRAME →</span></div></section>
      <aside className="scan-panel"><div className="scan-title"><p>IDENTITIES IN FRAME</p><span>{people.length.toString().padStart(2, '0')} / 06</span></div><div className="people-list">
        {people.length ? people.map((person) => <div className="person-pill" key={person.id}><div>{person.name.split(' ').map((name) => name[0]).slice(0, 2).join('')}</div><span><strong>{person.name}</strong><small>{person.id}</small></span><button onClick={() => onRemove(person.id)}><X size={15} /></button></div>) : <div className="scan-empty"><QrCode size={30} /><strong>Scan to begin</strong><span>You may add up to six people to one photograph.</span></div>}
      </div><form className="booth-scan-input" onSubmit={(event) => { event.preventDefault(); onAdd(input); }}><ScanLine size={19} /><input autoFocus value={input} onChange={(event) => onInput(event.target.value)} placeholder="SCAN QR OR ENTER CARD ID" /><button type="submit">ADD</button></form><button className="take-photo" onClick={onCapture}><span className="shutter" /><span>TAKE PHOTO</span><kbd>SPACE</kbd></button><p className="privacy-note"><LockKeyhole size={12} /> Only scanned guests receive this image.</p></aside>
    </section>
    <footer className="portal-footer"><span>GRADSYNC PHOTO SYSTEM</span><span>NEED HELP? ASK THE BOOTH ATTENDANT</span></footer>
  </>;
}

function CameraPhotoBooth({ people, input, onInput, onAdd, onRemove, onCapture, onExit, onGallery }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraState, setCameraState] = useState('idle');
  const [cameraMessage, setCameraMessage] = useState('');

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  useEffect(() => {
    if (cameraState !== 'ready' || !videoRef.current || !('BarcodeDetector' in window)) return undefined;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let scanning = false;
    const timer = window.setInterval(async () => {
      if (scanning || !videoRef.current) return;
      scanning = true;
      try { (await detector.detect(videoRef.current)).forEach((code) => onAdd(code.rawValue)); } catch { /* an incomplete video frame is safe to ignore */ }
      scanning = false;
    }, 900);
    return () => window.clearInterval(timer);
  }, [cameraState, onAdd]);

  async function startCamera() {
    try {
      setCameraState('starting');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraState('ready');
      setCameraMessage('Camera ready. Scan cards or enter their codes.');
    } catch (error) {
      setCameraState('error');
      setCameraMessage(error.name === 'NotAllowedError' ? 'Camera permission was not granted.' : 'Camera could not be started.');
    }
  }

  function takePhoto() {
    const video = videoRef.current;
    if (cameraState !== 'ready' || !video?.videoWidth) return setCameraMessage('Start the booth camera before taking a photo.');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.84));
  }

  return <>
    <header className="portal-header"><button className="wordmark" onClick={onExit}>GRAD<span>SYNC</span></button><div className="kiosk-chip"><span /> PHOTO BOOTH · 02</div><button className="portal-link" onClick={onGallery}>MY GALLERY <ArrowRight size={15} /></button></header>
    <section className="booth-layout">
      <div className="booth-copy"><p className="portal-eyebrow">GRADUATION 2026 / MEMORY STATION</p><h1>One frame.<br /><i>Everybody's</i> gallery.</h1><p>Scan your card or personal QR, step into the frame, and your photographs will arrive in your private gallery.</p><div className="booth-steps"><span className={people.length ? 'done' : ''}><b>01</b> SCAN</span><MoveRight size={14} /><span><b>02</b> POSE</span><MoveRight size={14} /><span><b>03</b> RECEIVE</span></div></div>
      <section className="viewfinder"><div className="corner c1" /><div className="corner c2" /><div className="corner c3" /><div className="corner c4" /><div className="viewfinder-top"><span><span className="record-dot" /> {cameraState === 'ready' ? 'LIVE CAMERA' : 'CAMERA STANDBY'}</span><span>1080P · QR READY</span></div>{cameraState === 'ready' ? <video ref={videoRef} className="booth-video" muted playsInline /> : <div className="booth-placeholder"><Sparkles size={44} /><p>READY FOR YOUR<br />BEST ANGLE</p><button className="start-camera" onClick={startCamera}>{cameraState === 'starting' ? 'STARTING...' : 'START CAMERA'}</button></div>}{cameraMessage && <div className="camera-message">{cameraMessage}</div>}<div className="viewfinder-bottom"><span>GROUP MODE ENABLED</span><span>← STEP INTO FRAME →</span></div></section>
      <aside className="scan-panel"><div className="scan-title"><p>IDENTITIES IN FRAME</p><span>{people.length.toString().padStart(2, '0')} / 06</span></div><div className="people-list">{people.length ? people.map((person) => <div className="person-pill" key={person.id}><div>{person.name.split(' ').map((name) => name[0]).slice(0, 2).join('')}</div><span><strong>{person.name}</strong><small>{person.id}</small></span><button onClick={() => onRemove(person.id)}><X size={15} /></button></div>) : <div className="scan-empty"><QrCode size={30} /><strong>Scan to begin</strong><span>You may add up to six people to one photograph.</span></div>}</div><form className="booth-scan-input" onSubmit={(event) => { event.preventDefault(); onAdd(input); }}><ScanLine size={19} /><input value={input} onChange={(event) => onInput(event.target.value)} placeholder="SCAN QR OR ENTER CARD ID" /><button type="submit">ADD</button></form><button className="take-photo" onClick={takePhoto}><span className="shutter" /><span>TAKE PHOTO</span><kbd>SPACE</kbd></button><p className="privacy-note"><LockKeyhole size={12} /> Only scanned guests receive this image.</p></aside>
    </section>
    <footer className="portal-footer"><span>GRADSYNC PHOTO SYSTEM</span><span>NEED HELP? ASK THE BOOTH ATTENDANT</span></footer>
  </>;
}

function StudentGallery({ student, images, isPublic, onExit, onBooth }) {
  return <>
    <header className="gallery-header"><button className="wordmark dark-wordmark" onClick={onExit}>GRAD<span>SYNC</span></button>{!isPublic && <div className="gallery-nav"><button onClick={onBooth}>PHOTO BOOTH</button><button onClick={onExit}>CEREMONY CONTROL</button></div>}</header>
    <main className="gallery-wrap"><div className="gallery-hero"><div><p className="portal-eyebrow">CLASS OF 2026 / PRIVATE GALLERY</p><h1>Congratulations,<br /><i>{student.name.split(' ')[0]}.</i></h1><p>Your graduation memories, collected in one private place.</p></div><button className="download-all"><Download size={17} /> DOWNLOAD ALL <span>({student.stage + student.booth})</span></button></div>
      <div className="gallery-meta"><span>{student.id} · {student.department} ENGINEERING</span><span><span className="gallery-live" /> LIVE UPDATES ON</span></div><section className="photo-grid">{images.map((image, index) => <figure className={`gallery-card ${image.size} ${image.tone}`} key={image.label}><div className="image-grain" /><figcaption><span>{String(index + 1).padStart(2, '0')}</span><strong>{image.label}</strong><button><Maximize2 size={15} /></button></figcaption></figure>)}</section>
    </main><footer className="gallery-footer"><span>GRADSYNC © 2026</span><span>YOUR PHOTOS ARE PRIVATE TO YOU</span></footer>
  </>;
}

export default App;
