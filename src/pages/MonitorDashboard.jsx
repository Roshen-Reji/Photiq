import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Wifi, Activity, Server, Search, Upload, MoreHorizontal, 
  Play, Pause, FastForward, Settings, HardDrive, Home 
} from 'lucide-react';

export default function MonitorDashboard() {
  const [students, setStudents] = useState([]);
  const [activeStudent, setActiveStudent] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [queuePaused, setQueuePaused] = useState(false);
  
  const [logs, setLogs] = useState([{ time: new Date().toLocaleTimeString(), level: 'ok', message: 'SYSTEM INITIALIZED.' }]);
  const [agents, setAgents] = useState({});
  const [unassignedPhotos, setUnassignedPhotos] = useState([]);
  const [isPhotoDraggingOver, setIsPhotoDraggingOver] = useState(false);

  // Drag and drop state for queue reordering
  const dragItem = useRef();
  const dragOverItem = useRef();

  useEffect(() => {
    fetch('/api/students')
      .then(res => res.json())
      .then(data => setStudents(data))
      .catch(err => console.error(err));

    fetch('/api/uploads/unassigned')
      .then(res => res.json())
      .then(data => setUnassignedPhotos(data))
      .catch(err => console.error(err));

    const socket = io(window.location.origin.includes('localhost') ? 'http://localhost:8787' : '/');
    
    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('request_state');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('state_update', (student) => {
      setActiveStudent(student);
    });

    socket.on('system_log', (log) => {
      setLogs(prev => [log, ...prev].slice(0, 50));
    });

    socket.on('agent_status', (agent) => {
      setAgents(prev => ({ ...prev, [agent.id]: { ...agent, online: true, lastSeen: Date.now() } }));
    });

    socket.on('new_unassigned_photo', (photo) => {
      setUnassignedPhotos(prev => [photo, ...prev]);
    });

    socket.on('photo_assigned', (photo) => {
      setUnassignedPhotos(prev => prev.filter(p => p._id !== photo._id));
    });

    return () => socket.disconnect();
  }, []);

  const handleNext = async (id) => {
    if (queuePaused) return; // Prevent advancing if paused
    const res = await fetch('/api/queue/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id })
    });
    const updated = await res.json();
    setActiveStudent(updated);
  };

  const advanceQueue = (direction) => {
    if (!students.length) return;
    if (!activeStudent) {
      handleNext(students[0].student_id);
      return;
    }
    const currentIndex = students.findIndex(s => s.student_id === activeStudent.student_id);
    let targetIndex = currentIndex + direction;
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= students.length) targetIndex = students.length - 1;
    
    if (targetIndex !== currentIndex) {
      handleNext(students[targetIndex].student_id);
    }
  };

  // Drag and Drop Handlers for Queue
  const handleDragStart = (e, index) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e, index) => {
    dragOverItem.current = index;
  };

  const handleDrop = async (e) => {
    if (searchQuery) return; // Disable reorder while searching
    if (dragItem.current !== null && dragOverItem.current !== null) {
      const newList = [...students];
      const draggedItemContent = newList[dragItem.current];
      newList.splice(dragItem.current, 1);
      newList.splice(dragOverItem.current, 0, draggedItemContent);
      dragItem.current = null;
      dragOverItem.current = null;
      setStudents(newList);

      // Save to backend
      const studentIds = newList.map(s => s.student_id);
      await fetch('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds })
      });
    }
  };

  // Drag and Drop Handlers for Photos
  const handlePhotoDragStart = (e, photo) => {
    e.dataTransfer.setData('photo_id', photo._id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handlePhotoDragOver = (e) => {
    e.preventDefault();
    setIsPhotoDraggingOver(true);
  };

  const handlePhotoDragLeave = () => {
    setIsPhotoDraggingOver(false);
  };

  const handlePhotoDrop = async (e) => {
    e.preventDefault();
    setIsPhotoDraggingOver(false);
    const photoId = e.dataTransfer.getData('photo_id');
    if (!photoId || !activeStudent) return;
    
    setUnassignedPhotos(prev => prev.filter(p => p._id !== photoId));
    
    try {
      await fetch(`/api/uploads/${photoId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: activeStudent.student_id })
      });
    } catch (err) {
      console.error(err);
      const res = await fetch('/api/uploads/unassigned');
      setUnassignedPhotos(await res.json());
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.student_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="monitor-app">
      <header className="command-header">
        <div className="brand">
          <div className="brand-mark">GS</div>
          <span>GRADSYNC // MON</span>
          <small>V 1.0.4 - SECURE</small>
        </div>
        <div className="header-actions">
          <span className="header-status" style={{ color: socketConnected ? '#a6a9a3' : '#f05825' }}>
            <i className="live-dot" style={{ background: socketConnected ? '#f05825' : '#555', boxShadow: socketConnected ? '0 0 10px #f05825' : 'none' }}></i> 
            {socketConnected ? 'SYSTEM LIVE' : 'DISCONNECTED'}
          </span>
          <div className="header-divider"></div>
          <Link to="/">
            <button className="ghost-control"><Home size={14} /> LAUNCHPAD</button>
          </Link>
        </div>
      </header>

      <div className="command-title">
        <div>
          <p className="eyebrow">NODE: STAGE_01</p>
          <h1>CEREMONY CONTROL</h1>
        </div>
        <div className="title-actions">
          <button className="ghost-control" disabled={!activeStudent} onClick={() => activeStudent && window.open(`/s/${activeStudent.digital_qr}`, '_blank')}>
            [ PORTAL ]
          </button>
          <button className="accent-control" onClick={() => setQueuePaused(!queuePaused)}>
            {queuePaused ? '[ RESUME_QUEUE ]' : '[ EMER_HALT ]'}
          </button>
        </div>
      </div>

      <main className="monitor-grid">
        {/* LEFT COLUMN: QUEUE */}
        <section className="panel-frame queue-panel">
          <div className="panel-heading">
            <span>[QUEUE_VIEW]</span>
            <span className="counter">{students.length} IN QUEUE</span>
          </div>
          
          <div className="search-box">
            <Search size={12} />
            <input 
              type="text" 
              placeholder="QUERY STUDENT_ID OR NAME..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <kbd>ESC</kbd>
          </div>

          <div className="queue-tools">
            <label className="upload-inline" onClick={() => window.location.href = '/'}>
              <Settings size={10} /> LAUNCHPAD
            </label>
          </div>

          <div className="queue-scroll">
            {filteredStudents.map((s, idx) => (
              <div 
                key={s.student_id} 
                className={`queue-item ${activeStudent?.student_id === s.student_id ? 'active' : ''}`}
                onClick={() => handleNext(s.student_id)}
                draggable={!searchQuery}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnter={(e) => handleDragEnter(e, idx)}
                onDragEnd={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                style={{ cursor: searchQuery ? 'pointer' : 'grab' }}
              >
                <div className="drag-marks" style={{ cursor: 'grab' }}>|||</div>
                <span className="queue-number">{(idx + 1).toString().padStart(2, '0')}</span>
                <div className="student-label">
                  <strong>{s.name.toUpperCase()}</strong>
                  <span>ID: {s.student_id} | {s.department}</span>
                </div>
                <div className="queue-item-actions">
                  <button><MoreHorizontal size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="queue-footer">
            <button>[ + ADD NODE ]</button>
            <span>SYNC_RATE: {socketConnected ? '12ms' : 'ERR'}</span>
          </div>
        </section>

        {/* CENTER COLUMN: ACTIVE STUDENT */}
        <section 
          className={`panel-frame active-panel ${isPhotoDraggingOver ? 'drag-over' : ''}`}
          onDragOver={handlePhotoDragOver}
          onDragLeave={handlePhotoDragLeave}
          onDrop={handlePhotoDrop}
          style={isPhotoDraggingOver ? { border: '2px dashed #f05825', background: 'rgba(240, 88, 37, 0.05)' } : {}}
        >
          <div className="panel-heading">
            <span>[ACTIVE_NODE]</span>
            <span className="sync-label">
              {activeStudent ? <><i className="pulse-dot"></i> SYNCING</> : 'IDLE'}
            </span>
          </div>

          <div className="active-main">
            <div className="active-meta">
              <span>R_POS: <em>{activeStudent ? students.findIndex(s => s.student_id === activeStudent.student_id) + 1 : '00'}</em></span>
              <span>AUTO_MODE: <em>{queuePaused ? 'PAUSED' : 'ON'}</em></span>
            </div>

            {activeStudent ? (
              <>
                <h2>{activeStudent.name.toUpperCase()}</h2>
                <p className="student-code">
                  ID: {activeStudent.student_id} <i></i> DEP: {activeStudent.department}
                </p>

                <div className="active-data-row">
                  <div>
                    <span>FOLDER TARGET</span>
                    <strong className="success-text">/{activeStudent.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_{activeStudent.student_id}</strong>
                  </div>
                  <div>
                    <span>FILE COUNT</span>
                    <strong>00 IMM_CACHE</strong>
                  </div>
                </div>

                <div className="qr-zone">
                  <div className="qr-shell">
                    <QRCodeSVG 
                      value={`${window.location.origin}/s/${activeStudent.digital_qr}`} 
                      size={132} 
                      level="L" 
                      includeMargin={false} 
                      bgColor="transparent"/>
                  </div>
                  <div className="qr-copy">
                    <p>DIGITAL IDENTIFIER</p>
                    <strong>READY</strong>
                    <span>{activeStudent.physical_qr ? `PHYSICAL QR MAPPED: ${activeStudent.physical_qr}` : 'Physical QR override available. Tap to assign static marker.'}</span>
                    <button onClick={() => window.location.href = '/admin'}>[ ADMIN_ASSIGN ]</button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ marginTop: '100px', textAlign: 'center', color: '#555' }}>
                <h2>NO ACTIVE NODE</h2>
                <p>Select a student from the queue to begin tracking.</p>
              </div>
            )}
          </div>

          <div className="active-controls">
            <button className="prev-next" onClick={() => advanceQueue(-1)}>
              <Play size={10} style={{transform: 'rotate(180deg)'}}/> PREV
            </button>
            <button className="pause-control" onClick={() => setQueuePaused(!queuePaused)}>
              {queuePaused ? <Play size={10}/> : <Pause size={10}/>} 
              {queuePaused ? 'RESUME QUEUE' : 'PAUSE QUEUE'}
            </button>
            <button className="next-control" onClick={() => advanceQueue(1)}>
              NEXT NODE <FastForward size={10}/>
            </button>
          </div>
          <div className="active-sub-actions">
            <button>[FORCE_SYNC]</button>
            <button>[OVERRIDE_DIR]</button>
          </div>
        </section>

        {/* RIGHT COLUMN: SYSTEM & AGENTS */}
        <div className="system-column">
          <section className="panel-frame incoming-panel" style={{ flex: '1', display: 'flex', flexDirection: 'column', minHeight: '180px' }}>
            <div className="panel-heading">
              <span>[INCOMING_FEED]</span>
              <span className="muted-small">{unassignedPhotos.length} UNASSIGNED</span>
            </div>
            <div className="incoming-grid" style={{ overflowY: 'auto', flex: 1, padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
              {unassignedPhotos.length === 0 ? (
                <div style={{ padding: '20px 0', fontSize: '10px', color: '#777', gridColumn: '1 / -1', textAlign: 'center' }}>NO INCOMING PHOTOS</div>
              ) : (
                unassignedPhotos.map(photo => (
                  <div 
                    key={photo._id} 
                    className="incoming-photo-card"
                    draggable
                    onDragStart={(e) => handlePhotoDragStart(e, photo)}
                    style={{ 
                      cursor: 'grab', 
                      background: '#222', 
                      border: '1px solid #444', 
                      borderRadius: '4px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                  >
                    <img 
                      src={`/api/uploads/stream/${photo._id}`} 
                      alt={photo.filename} 
                      style={{ width: '100%', height: '60px', objectFit: 'cover' }} 
                      draggable={false}
                    />
                    <span style={{ fontSize: '9px', padding: '4px', color: '#ccc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>
                      {photo.filename}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel-frame system-panel" style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
            <div className="panel-heading">
              <span>[SYSTEM_LOG]</span>
            </div>
            <div className="logs" style={{ overflowY: 'auto', flex: 1, maxHeight: '150px' }}>
              {logs.map((log, i) => (
                <div key={i} className={`log ${log.level}`}>
                  <time>{log.time}</time>
                  <span>&gt;</span>
                  <p>{log.message}</p>
                </div>
              ))}
            </div>
            <button className="all-logs" onClick={() => setLogs([])}>[ CLEAR_LOGS ]</button>
          </section>

          <section className="panel-frame agents-panel" style={{ flex: 'none', height: 'auto', minHeight: '130px' }}>
            <div className="panel-heading">
              <span>[TETHER_AGENTS]</span>
              <span className="muted-small">{Object.keys(agents).length} ONLINE</span>
            </div>
            {Object.values(agents).length === 0 ? (
              <div style={{ padding: '20px 14px', fontSize: '10px', color: '#777' }}>NO AGENTS DETECTED</div>
            ) : (
              Object.values(agents).map(agent => (
                <div key={agent.id} className="agent-row">
                  <i className="agent-led" style={{ background: agent.online ? '#75dba6' : '#555', boxShadow: agent.online ? '0 0 9px #75dba6' : 'none' }}></i>
                  <div>
                    <strong>{agent.id}</strong>
                    <small>LAST SYNC: {agent.file}</small>
                  </div>
                  <span className="agent-size">ONLINE</span>
                </div>
              ))
            )}
            <div className="agent-bottom">
              <span>PING: 14ms</span>
              <span>[ RESTART ]</span>
            </div>
          </section>
        </div>
      </main>

      <footer className="monitor-footer">
        <span><i className="signal"></i> CONNECTION STABLE</span>
        <span>GRADSYNC PROTOCOL V1</span>
      </footer>
    </div>
  );
}
