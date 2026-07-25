import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  Activity, 
  Server, 
  Search, 
  Upload, 
  MoreHorizontal, 
  Play,
  Pause,
  FastForward,
  Settings,
  HardDrive
} from 'lucide-react';

export default function MonitorDashboard() {
  const [students, setStudents] = useState([]);
  const [activeStudent, setActiveStudent] = useState(null);

  useEffect(() => {
    fetch('/api/students')
      .then(res => res.json())
      .then(data => setStudents(data))
      .catch(err => console.error(err));
      
    fetch('/api/queue/active')
      .then(res => res.json())
      .then(data => setActiveStudent(data))
      .catch(err => console.error(err));
  }, []);

  const handleNext = async (id) => {
    const res = await fetch('/api/queue/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id })
    });
    const updated = await res.json();
    setActiveStudent(updated);
  };

  return (
    <div className="monitor-app">
      <header className="command-header">
        <div className="brand">
          <div className="brand-mark">GS</div>
          <span>GRADSYNC // MON</span>
          <small>V 1.0.4 - SECURE</small>
        </div>
        <div className="header-actions">
          <span className="header-status">
            <i className="live-dot"></i> SYSTEM LIVE
          </span>
          <div className="header-divider"></div>
          <button className="header-link"><Activity size={10} /> DIAGNOSTICS</button>
          <button className="header-icon"><Settings size={14} /></button>
        </div>
      </header>

      <div className="command-title">
        <div>
          <p className="eyebrow">NODE: STAGE_01</p>
          <h1>CEREMONY CONTROL</h1>
        </div>
        <div className="title-actions">
          <button className="ghost-control"><Server size={12}/> DB STATUS</button>
          <button className="accent-control">[ EMER_HALT ]</button>
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
            <input type="text" placeholder="QUERY STUDENT_ID OR NAME..." />
            <kbd>ESC</kbd>
          </div>

          <div className="queue-tools">
            <button>[EDIT]</button>
            <button>[DEL]</button>
            <label className="upload-inline">
              <Upload size={10} /> IMPORT.CSV
              <input type="file" />
            </label>
          </div>

          <div className="queue-scroll">
            {students.map((s, idx) => (
              <div 
                key={s.student_id} 
                className={`queue-item ${activeStudent?.student_id === s.student_id ? 'active' : ''}`}
                onClick={() => handleNext(s.student_id)}
              >
                <div className="drag-marks">|||</div>
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
            <span>SYNC_RATE: 12ms</span>
          </div>
        </section>

        {/* CENTER COLUMN: ACTIVE STUDENT */}
        <section className="panel-frame active-panel">
          <div className="panel-heading">
            <span>[ACTIVE_NODE]</span>
            <span className="sync-label">
              {activeStudent ? <><i className="pulse-dot"></i> SYNCING</> : 'IDLE'}
            </span>
          </div>

          <div className="active-main">
            <div className="active-meta">
              <span>R_POS: <em>01</em></span>
              <span>AUTO_MODE: <em>ON</em></span>
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
                    <strong className="success-text">/{activeStudent.student_id}_{activeStudent.name.replace(/\s+/g, '')}</strong>
                  </div>
                  <div>
                    <span>FILE COUNT</span>
                    <strong>00 IMM_CACHE</strong>
                  </div>
                </div>

                <div className="qr-zone">
                  <div className="qr-shell">
                    {/* Placeholder for QR Code */}
                    <div style={{ width: '132px', height: '132px', background: '#000' }}></div>
                  </div>
                  <div className="qr-copy">
                    <p>DIGITAL IDENTIFIER</p>
                    <strong>READY</strong>
                    <span>Physical QR override available. Tap to assign static marker.</span>
                    <button>[ ASSIGN_PHYSICAL ]</button>
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
            <button className="prev-next"><Play size={10} style={{transform: 'rotate(180deg)'}}/> PREV</button>
            <button className="pause-control"><Pause size={10}/> PAUSE QUEUE</button>
            <button className="next-control" onClick={() => {
               // Jump to next in list conceptually
               if (students.length > 0) handleNext(students[0].student_id)
            }}>
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
          <section className="panel-frame system-panel">
            <div className="panel-heading">
              <span>[SYSTEM_LOG]</span>
            </div>
            <div className="logs">
              <div className="log active">
                <time>14:02:11</time>
                <span>&gt;</span>
                <p>SYSTEM INITIALIZED.</p>
              </div>
              {activeStudent && (
                <div className="log ok">
                  <time>14:03:45</time>
                  <span>&gt;</span>
                  <p>FOLDER ALLOCATED: {activeStudent.student_id}</p>
                </div>
              )}
            </div>
            <button className="all-logs">[ VIEW_ALL ]</button>
          </section>

          <section className="panel-frame agents-panel">
            <div className="panel-heading">
              <span>[TETHER_AGENTS]</span>
              <span className="muted-small">1 ONLINE</span>
            </div>
            <div className="agent-row">
              <i className="agent-led"></i>
              <div>
                <strong>STAGE_CAM_A</strong>
                <small>192.168.1.104</small>
              </div>
              <span className="agent-size">0B/s</span>
            </div>
            <div className="agent-bottom">
              <span>PING: 14ms</span>
              <span>[ RESTART ]</span>
            </div>
          </section>

          <div className="drive-card">
            <div>
              <div className="drive-icon"><HardDrive size={18}/></div>
              <p>RCLONE: DRIVE_01</p>
              <span>MOUNTED: TRUE</span>
            </div>
            <div className="drive-state">
              <span>ONLINE</span>
              <div>
                <strong>14.2 GB</strong>
                <small>FREE SPACE</small>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="monitor-footer">
        <span><i className="signal"></i> CONNECTION STABLE</span>
        <span>GRADSYNC PROTOCOL V1</span>
      </footer>
    </div>
  );
}
