import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { read, utils } from 'xlsx';
import jsQR from 'jsqr';
import { Upload, Plus, Trash2, Edit2, Server, Search, Camera, CameraOff, Link2, Home } from 'lucide-react';

export default function AdminDashboard() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  
  // Add/Edit State
  const [editingStudent, setEditingStudent] = useState(null);
  const [formState, setFormState] = useState({ id: '', name: '', department: '' });
  
  // QR Scan State
  const [scanning, setScanning] = useState(false);
  const [activeAssignId, setActiveAssignId] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await fetch('/api/students');
      setStudents(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = utils.sheet_to_json(ws, { header: 1 });
      
      if (!data || data.length < 2) return;

      const headers = data[0].map(h => String(h).toLowerCase().replace(/\s+/g, ''));
      const idIdx = headers.findIndex(h => h.includes('id'));
      const nameIdx = headers.findIndex(h => h.includes('name'));
      const depIdx = headers.findIndex(h => h.includes('department') || h.includes('dept'));

      if (idIdx === -1 || nameIdx === -1) {
        alert("Could not find 'ID' or 'Name' columns in spreadsheet. Please ensure headers are present.");
        return;
      }

      const parsed = data.slice(1).map(row => ({
        id: row[idIdx],
        name: row[nameIdx],
        department: depIdx !== -1 ? row[depIdx] : ''
      })).filter(s => s.id && s.name);

      await fetch('/api/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: parsed })
      });
      fetchStudents();
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formState.id || !formState.name) return;

    if (editingStudent) {
      await fetch(`/api/students/${editingStudent.student_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState)
      });
    } else {
      await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState)
      });
    }
    setFormState({ id: '', name: '', department: '' });
    setEditingStudent(null);
    fetchStudents();
  };

  const handleDelete = async (id) => {
    if (!confirm(`Are you sure you want to delete student ${id}?`)) return;
    await fetch(`/api/students/${id}`, { method: 'DELETE' });
    fetchStudents();
  };

  const handleEdit = (s) => {
    setEditingStudent(s);
    setFormState({ id: s.student_id, name: s.name, department: s.department || '' });
  };

  // QR Scanning logic
  useEffect(() => {
    let streamObj = null;
    let scanFrame = null;
    
    if (scanning) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(function(stream) {
          streamObj = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute("playsinline", true);
            videoRef.current.play();
            scanFrame = requestAnimationFrame(tick);
          }
        }).catch(err => {
          console.warn('Webcam not accessible:', err);
          alert('Webcam access failed. Make sure you granted permissions or use manual entry.');
          setScanning(false);
        });
    }

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        
        if (code && activeAssignId) {
          try {
            const data = JSON.parse(code.data);
            assignPhysicalQR(activeAssignId, data.id || code.data);
          } catch(e) {
            assignPhysicalQR(activeAssignId, code.data);
          }
          setScanning(false);
          setActiveAssignId(null);
        }
      }
      if (scanning) {
        scanFrame = requestAnimationFrame(tick);
      }
    };

    return () => {
      if (streamObj) streamObj.getTracks().forEach(t => t.stop());
      if (scanFrame) cancelAnimationFrame(scanFrame);
    };
  }, [scanning, activeAssignId]);

  const assignPhysicalQR = async (studentId, qrData) => {
    await fetch(`/api/students/${studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ physical_qr: qrData })
    });
    fetchStudents();
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.student_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="monitor-app">
      <header className="command-header">
        <div className="brand">
          <div className="brand-mark">GS</div>
          <span>GRADSYNC // ADMIN</span>
          <small>V 1.0.4 - SECURE</small>
        </div>
        <div className="header-actions">
          <span className="header-status">
            <i className="live-dot"></i> DB CONNECTED
          </span>
          <div className="header-divider"></div>
          <Link to="/">
            <button className="header-link"><Home size={10} /> LAUNCHPAD</button>
          </Link>
        </div>
      </header>

      <div className="command-title">
        <div>
          <p className="eyebrow">ROSTER MANAGEMENT</p>
          <h1>ADMIN DASHBOARD</h1>
        </div>
      </div>

      <main className="monitor-grid">
        <div className="system-column">
          <section className="panel-frame queue-panel" style={{ minHeight: 'auto', padding: '0 0 20px 0' }}>
            <div className="panel-heading">
              <span>[ROSTER_IO]</span>
            </div>
            
            <div style={{ padding: '20px' }}>
              <label className="upload-inline" style={{ width: '100%', justifyContent: 'center', background: '#f05825', color: '#111', fontWeight: 'bold', padding: '12px', cursor: 'pointer' }}>
                <Upload size={14} /> BATCH IMPORT (XLSX/CSV)
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
              </label>
              
              <div style={{ margin: '20px 0', borderTop: '1px solid #3b3e3a' }}></div>

              <h3 style={{ fontSize: '12px', color: '#aeb4aa', marginBottom: '12px', letterSpacing: '1px' }}>
                {editingStudent ? '[EDIT NODE]' : '[MANUAL ENTRY]'}
              </h3>
              
              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
                <input className="search-box" style={{ border: '1px solid #3b3e3a', padding: '10px', background: '#090a0a', color: '#f1f0ea', fontSize: '10px', width: '100%', display: 'block', outline: 'none' }} 
                  placeholder="STUDENT ID" required
                  value={formState.id} onChange={e => setFormState({...formState, id: e.target.value})}
                />
                <input className="search-box" style={{ border: '1px solid #3b3e3a', padding: '10px', background: '#090a0a', color: '#f1f0ea', fontSize: '10px', width: '100%', display: 'block', outline: 'none' }} 
                  placeholder="FULL NAME" required
                  value={formState.name} onChange={e => setFormState({...formState, name: e.target.value})}
                />
                <input className="search-box" style={{ border: '1px solid #3b3e3a', padding: '10px', background: '#090a0a', color: '#f1f0ea', fontSize: '10px', width: '100%', display: 'block', outline: 'none' }} 
                  placeholder="DEPARTMENT"
                  value={formState.department} onChange={e => setFormState({...formState, department: e.target.value})}
                />
                <button type="submit" style={{ padding: '10px', background: '#171a18', color: '#f1f0ea', border: '1px solid #3b3e3a', fontSize: '10px', marginTop: '5px', cursor: 'pointer' }}>
                  {editingStudent ? 'UPDATE RECORD' : '+ ADD TO QUEUE'}
                </button>
                {editingStudent && (
                  <button type="button" onClick={() => { setEditingStudent(null); setFormState({id:'', name:'', department:''}); }} style={{ padding: '10px', background: 'transparent', color: '#93988f', border: '1px solid #3b3e3a', fontSize: '10px', cursor: 'pointer' }}>
                    CANCEL EDIT
                  </button>
                )}
              </form>
            </div>
          </section>

          {(scanning || activeAssignId) && (
            <section className="panel-frame system-panel" style={{ overflow: 'hidden' }}>
              <div className="panel-heading">
                <span>[QR_SCANNER]</span>
                <button onClick={() => {setScanning(false); setActiveAssignId(null);}} style={{background: 'none', border:'none', color:'#f05825', fontSize:'9px', cursor: 'pointer'}}>[CANCEL]</button>
              </div>
              <div style={{ position: 'relative', height: '200px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                {!scanning ? (
                  <button onClick={() => setScanning(true)} style={{ background: 'transparent', color: '#f05825', border: '1px solid #f05825', padding: '10px', fontSize: '10px', cursor: 'pointer' }}>START CAMERA</button>
                ) : (
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }}></video>
                    <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                    <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(240, 88, 37, 0.5)', pointerEvents: 'none' }}></div>
                  </div>
                )}
              </div>
              {activeAssignId && <div style={{ padding: '8px', fontSize: '10px', color: '#aeb4aa', textAlign: 'center', background: '#111' }}>SCANNING FOR: {activeAssignId}</div>}
            </section>
          )}
        </div>

        <section className="panel-frame queue-panel" style={{ gridColumn: 'span 2' }}>
          <div className="panel-heading">
            <span>[DATABASE_VIEW]</span>
            <span className="counter">{students.length} TOTAL RECORDS</span>
          </div>
          
          <div className="search-box">
            <Search size={12} />
            <input type="text" placeholder="QUERY STUDENT_ID OR NAME..." value={search} onChange={e => setSearch(e.target.value)} />
            <kbd>ESC</kbd>
          </div>

          <div className="queue-scroll" style={{ maxHeight: 'calc(100vh - 250px)' }}>
            {filteredStudents.map((s, idx) => (
              <div key={s.student_id} className="queue-item" style={{ gridTemplateColumns: '25px 1.5fr 1.2fr 0.8fr auto', minHeight: '65px' }}>
                <span className="queue-number">{(idx + 1).toString().padStart(2, '0')}</span>
                <div className="student-label">
                  <strong>{s.name.toUpperCase()}</strong>
                  <span>ID: {s.student_id} | {s.department}</span>
                </div>
                
                <div className="student-label" style={{ paddingLeft: '10px', borderLeft: '1px solid #353835' }}>
                  <strong style={{ color: '#969b92' }}>QR ASSIGNMENT</strong>
                  {s.physical_qr ? (
                    <span style={{ color: '#77d9a4' }}><Link2 size={8} style={{marginRight: '4px'}}/>{s.physical_qr}</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px', marginTop: '3px' }}>
                      <input 
                        type="text" 
                        placeholder="Assign QR ID..." 
                        style={{ background: 'transparent', border: '1px solid #3b3e3a', color: '#ccc', fontSize: '9px', padding: '4px 6px', width: '85px', outline: 'none' }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && e.target.value) {
                            assignPhysicalQR(s.student_id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                      />
                      <button onClick={() => { setActiveAssignId(s.student_id); setScanning(true); }} style={{ background: '#171a18', border: '1px solid #3b3e3a', color: '#93988f', padding: '4px 6px', cursor: 'pointer' }}>
                        <Camera size={10} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="student-label" style={{ paddingLeft: '10px', borderLeft: '1px solid #353835' }}>
                  <strong style={{ color: '#969b92' }}>STATUS</strong>
                  <span className={s.status === 'active' || s.status === 'completed' ? 'success-text' : ''}>
                    {s.status.toUpperCase()}
                  </span>
                </div>

                <div className="queue-item-actions" style={{ display: 'flex', gap: '4px', paddingLeft: '10px' }}>
                  <button onClick={() => handleEdit(s)}><Edit2 size={13} /></button>
                  <button onClick={() => handleDelete(s.student_id)} style={{ color: '#777' }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
