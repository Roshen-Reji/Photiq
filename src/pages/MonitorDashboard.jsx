import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Wifi, Activity, Server, Search, Upload, MoreHorizontal, 
  Play, Pause, FastForward, Settings, HardDrive, Home, ExternalLink, Plus, X, Check, AlertTriangle
} from 'lucide-react';
import useToast from '../hooks/useToast';
import ToastContainer from '../components/Toast';
import { resolveImageUrl } from '../utils/imageUrl';
import { getBackendOrigin } from '../utils/backendUrl';

// Status badge colors
const STATUS_COLORS = {
  pending: { bg: '#333', color: '#aaa', label: 'WAITING' },
  preview_uploading: { bg: '#3d2a0f', color: '#f0a830', label: 'UPLOADING PREVIEW' },
  preview_ready: { bg: '#1a2e1a', color: '#75dba6', label: 'PREVIEW READY' },
  uploading_original: { bg: '#2a1f0f', color: '#f0a830', label: 'UPLOADING ORIGINAL' },
  completed: { bg: '#1a2e1a', color: '#75dba6', label: 'COMPLETE' },
  failed: { bg: '#3d1a1a', color: '#f05825', label: 'FAILED' },
  retrying: { bg: '#3d2a0f', color: '#ffc107', label: 'RETRYING' },
};

function StatusBadge({ status }) {
  const config = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const isActive = status === 'preview_uploading' || status === 'uploading_original' || status === 'retrying';
  return (
    <span style={{
      fontSize: '8px',
      padding: '2px 6px',
      borderRadius: '3px',
      background: config.bg,
      color: config.color,
      letterSpacing: '0.5px',
      fontWeight: 'bold',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
    }}>
      {isActive && <i className="pulse-dot" style={{ width: '5px', height: '5px' }}></i>}
      {config.label}
    </span>
  );
}

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

  // Add Node modal state (Fix 6)
  const [showAddNode, setShowAddNode] = useState(false);
  const [addNodeForm, setAddNodeForm] = useState({ id: '', name: '', department: '' });
  const [addNodeLoading, setAddNodeLoading] = useState(false);

  // Toast notifications (Fix 9)
  const { toasts, addToast, removeToast } = useToast();

  // Debounced search (Fix 7)
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef(null);

  // Drag and drop state for queue reordering
  const dragItem = useRef();
  const dragOverItem = useRef();
  const pollIntervalRef = useRef(null);
  const socketRef = useRef(null);
  // FIX: Track photo IDs that are being assigned so the poll doesn't re-add them
  const assigningPhotoIds = useRef(new Set());

  const getAuthHeaders = () => {
    const token = localStorage.getItem('gradsync_admin_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // Debounce search input (Fix 7)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  // Fetch unassigned photos (used for initial load + polling)
  // FIX: Filter out photos that are currently being assigned (in-flight)
  // so the poll doesn't re-add them and cause the "snap-back" effect.
  const fetchUnassigned = useCallback(async () => {
    try {
      const res = await fetch('/api/uploads/unassigned', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const filtered = Array.isArray(data)
        ? data.filter(p => !assigningPhotoIds.current.has(p.id))
        : [];
      setUnassignedPhotos(filtered);
    } catch (err) {
      console.error('Unassigned poll error:', err);
    }
  }, []);

  useEffect(() => {
    fetch('/api/students', { headers: getAuthHeaders() })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => setStudents(Array.isArray(data) ? data : []))
      .catch(err => { console.error(err); addToast(`Failed to load students: ${err.message}`, 'error'); setStudents([]); });

    fetchUnassigned();

    // Auto-poll unassigned photos every 2500ms for automatic dashboard refresh
    pollIntervalRef.current = setInterval(fetchUnassigned, 2500);

    const socket = io(getBackendOrigin());
    socketRef.current = socket;
    
    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('request_state');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      addToast('Connection lost. Attempting to reconnect...', 'warning');
    });

    socket.on('reconnect', () => {
      addToast('Connection restored.', 'success');
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

    // FIX: Upsert logic — if a photo with this ID already exists (e.g. from
    // polling), update it in-place. Otherwise prepend. This prevents the
    // duplicate-then-vanish bug when new_unassigned_photo and the poll both
    // fire for the same image.
    socket.on('new_unassigned_photo', (photo) => {
      setUnassignedPhotos(prev => {
        if (!Array.isArray(prev)) return [photo];
        const idx = prev.findIndex(p => p.id === photo.id);
        if (idx !== -1) {
          // Already exists (from poll or earlier event) — update in-place
          const updated = [...prev];
          updated[idx] = { ...prev[idx], ...photo };
          return updated;
        }
        return [photo, ...prev];
      });
    });

    socket.on('photo_assigned', (photo) => {
      setUnassignedPhotos(prev => Array.isArray(prev) ? prev.filter(p => p.id !== photo.id) : []);
    });

    // When rclone finishes uploading, force the thumbnail to re-render
    socket.on('photo_upload_complete', (photo) => {
      setUnassignedPhotos(prev => 
        Array.isArray(prev) 
          ? prev.map(p => p.id === photo.id ? { ...p, ...photo, _refreshKey: Date.now() } : p)
          : []
      );
    });

    // Real-time preview ready — update existing OR insert if somehow missing
    socket.on('preview_ready', (data) => {
      setUnassignedPhotos(prev => {
        if (!Array.isArray(prev)) return [data];
        const idx = prev.findIndex(p => p.id === data.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = { ...prev[idx], ...data, status: 'preview_ready', preview_ready: true };
          return updated;
        }
        // Not found — this can happen if the photo was assigned to a student
        // (not UNASSIGNED). In that case, don't add it to unassigned list.
        if (data.student_id && data.student_id !== 'UNASSIGNED') return prev;
        return [data, ...prev];
      });
    });

    // Upload progress tracking
    socket.on('upload_progress', (data) => {
      setUnassignedPhotos(prev =>
        Array.isArray(prev)
          ? prev.map(p => p.id === data.id ? { ...p, upload_progress: data.upload_progress, status: data.status } : p)
          : []
      );
    });

    // Original ready — update status and bust the image cache
    socket.on('original_ready', (data) => {
      setUnassignedPhotos(prev =>
        Array.isArray(prev)
          ? prev.map(p => p.id === data.id ? { ...p, ...data, status: 'completed', original_ready: true, _refreshKey: Date.now() } : p)
          : []
      );
    });

    // Real-time student list updates (Fix 3)
    socket.on('student_added', (student) => {
      setStudents(prev => [...prev, student]);
    });

    socket.on('student_deleted', ({ student_id }) => {
      setStudents(prev => prev.filter(s => s.student_id !== student_id));
    });

    socket.on('student_updated', (student) => {
      setStudents(prev => prev.map(s => s.student_id === student.student_id ? student : s));
    });

    socket.on('students_imported', ({ students: newStudents }) => {
      if (Array.isArray(newStudents)) {
        setStudents(prev => [...prev, ...newStudents]);
      }
    });

    socket.on('queue_reordered', (reorderedStudents) => {
      if (Array.isArray(reorderedStudents)) setStudents(reorderedStudents);
    });

    // Initial unassigned photos sync
    socket.on('unassigned_photos_sync', (photos) => {
      if (Array.isArray(photos)) {
        setUnassignedPhotos(photos.filter(p => !assigningPhotoIds.current.has(p.id)));
      }
    });

    return () => {
      socket.disconnect();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleNext = useCallback(async (id) => {
    if (queuePaused) return; // Prevent advancing if paused
    try {
      const res = await fetch('/api/queue/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ studentId: id })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      if (updated && !updated.error) {
        setActiveStudent(updated);
      } else if (updated?.error) {
        addToast(updated.error, 'error');
      }
    } catch (err) {
      addToast(`Failed to advance queue: ${err.message}`, 'error');
    }
  }, [queuePaused, addToast]);

  const advanceQueue = useCallback((direction) => {
    if (!Array.isArray(students) || !students.length) return;
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
  }, [students, activeStudent, handleNext]);

  // Add Node handler (Fix 6)
  const handleAddNode = async (e) => {
    e.preventDefault();
    if (!addNodeForm.id || !addNodeForm.name) {
      addToast('Student ID and name are required.', 'warning');
      return;
    }
    setAddNodeLoading(true);
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(addNodeForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      addToast(`Student ${data.name} added successfully.`, 'success');
      setAddNodeForm({ id: '', name: '', department: '' });
      setShowAddNode(false);
    } catch (err) {
      addToast(`Failed to add student: ${err.message}`, 'error');
    } finally {
      setAddNodeLoading(false);
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
    if (debouncedSearch) return; // Disable reorder while searching
    if (dragItem.current !== null && dragOverItem.current !== null) {
      const newList = [...students];
      const draggedItemContent = newList[dragItem.current];
      newList.splice(dragItem.current, 1);
      newList.splice(dragOverItem.current, 0, draggedItemContent);
      dragItem.current = null;
      dragOverItem.current = null;
      setStudents(newList);

      // Save to backend
      try {
        const studentIds = newList.map(s => s.student_id);
        await fetch('/api/queue/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ studentIds })
        });
      } catch (err) {
        addToast(`Failed to save queue order: ${err.message}`, 'error');
      }
    }
  };

  // Drag and Drop Handlers for Photos
  const handlePhotoDragStart = (e, photo) => {
    e.dataTransfer.setData('photo_id', photo.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handlePhotoDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsPhotoDraggingOver(true);
  };

  const handlePhotoDragLeave = () => {
    setIsPhotoDraggingOver(false);
  };

  // FIX: Track the in-flight photo ID so the poll won't re-add it.
  const handlePhotoDrop = async (e) => {
    e.preventDefault();
    setIsPhotoDraggingOver(false);
    const photoId = e.dataTransfer.getData('photo_id');
    if (!photoId || !activeStudent) {
      if (!activeStudent) addToast('Select an active student first before assigning photos.', 'warning');
      return;
    }
    
    // Mark as in-flight BEFORE removing from state — this prevents the
    // poll (which runs every 2.5s) from re-adding the photo while the
    // assign API is still processing.
    assigningPhotoIds.current.add(photoId);
    setUnassignedPhotos(prev => Array.isArray(prev) ? prev.filter(p => p.id !== photoId) : []);
    
    try {
      const res = await fetch(`/api/uploads/${photoId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ studentId: activeStudent.student_id })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      addToast(`Photo assigned to ${activeStudent.name}.`, 'success');
    } catch (err) {
      addToast(`Failed to assign photo: ${err.message}`, 'error');
      // Assignment failed — remove from in-flight set and re-fetch
      assigningPhotoIds.current.delete(photoId);
      try {
        const res = await fetch('/api/uploads/unassigned', { headers: getAuthHeaders() });
        const data = await res.json();
        setUnassignedPhotos(Array.isArray(data) ? data : []);
      } catch (e) { /* ignore refresh failure */ }
    } finally {
      // Clean up in-flight tracking after a delay to cover any in-progress polls
      setTimeout(() => assigningPhotoIds.current.delete(photoId), 5000);
    }
  };

  // Memoized filtered list (Fix 7)
  const filteredStudents = useMemo(() => {
    if (!Array.isArray(students)) return [];
    if (!debouncedSearch) return students;
    const q = debouncedSearch.toLowerCase();
    return students.filter(s => 
      (s.name || '').toLowerCase().includes(q) || 
      (s.student_id || '').toLowerCase().includes(q)
    );
  }, [students, debouncedSearch]);

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
          <button className="ghost-control" disabled={!activeStudent} onClick={() => activeStudent && window.open(`/s/${activeStudent.digital_qr || activeStudent.student_id}`, '_blank')}>
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
              onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
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
                draggable={!debouncedSearch}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnter={(e) => handleDragEnter(e, idx)}
                onDragEnd={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                style={{ cursor: debouncedSearch ? 'pointer' : 'grab' }}
              >
                <div className="drag-marks" style={{ cursor: 'grab' }}>|||</div>
                <span className="queue-number">{(idx + 1).toString().padStart(2, '0')}</span>
                <div className="student-label">
                  <strong>{s.name.toUpperCase()}</strong>
                  <span>ID: {s.student_id} | {s.department}</span>
                </div>
                <div className="queue-item-actions" onClick={e => e.stopPropagation()}>
                  <button title="View Profile" onClick={() => window.open(`/s/${s.digital_qr || s.student_id}`, '_blank')}>
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="queue-footer">
            <button onClick={() => setShowAddNode(!showAddNode)}>[ + ADD NODE ]</button>
            <span>SYNC_RATE: {socketConnected ? '12ms' : 'ERR'}</span>
          </div>

          {/* Add Node Form (Fix 6) */}
          {showAddNode && (
            <div style={{ padding: '12px 14px', borderTop: '1px solid #3b3e3a', background: '#0d0e0d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', color: '#f05825', letterSpacing: '1px' }}>[NEW_NODE]</span>
                <button onClick={() => setShowAddNode(false)} style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', padding: '2px' }}>
                  <X size={12} />
                </button>
              </div>
              <form onSubmit={handleAddNode} style={{ display: 'grid', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="STUDENT_ID"
                  value={addNodeForm.id}
                  onChange={e => setAddNodeForm(prev => ({ ...prev, id: e.target.value }))}
                  required
                  style={{ background: '#090a0a', border: '1px solid #3b3e3a', color: '#f1f0ea', fontSize: '10px', padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }}
                />
                <input
                  type="text"
                  placeholder="FULL_NAME"
                  value={addNodeForm.name}
                  onChange={e => setAddNodeForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  style={{ background: '#090a0a', border: '1px solid #3b3e3a', color: '#f1f0ea', fontSize: '10px', padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }}
                />
                <input
                  type="text"
                  placeholder="DEPARTMENT"
                  value={addNodeForm.department}
                  onChange={e => setAddNodeForm(prev => ({ ...prev, department: e.target.value }))}
                  style={{ background: '#090a0a', border: '1px solid #3b3e3a', color: '#f1f0ea', fontSize: '10px', padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }}
                />
                <button
                  type="submit"
                  disabled={addNodeLoading}
                  style={{ background: '#f05825', color: '#111', border: 'none', fontSize: '10px', padding: '8px', cursor: addNodeLoading ? 'wait' : 'pointer', fontWeight: 'bold', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {addNodeLoading ? 'ADDING...' : <><Plus size={10} /> ADD TO QUEUE</>}
                </button>
              </form>
            </div>
          )}
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
                    <strong className="success-text">GradSync/{activeStudent.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_{activeStudent.student_id}</strong>
                  </div>
                  <div>
                    <span>FILE COUNT</span>
                    <strong>00 IMM_CACHE</strong>
                  </div>
                </div>

                <div className="qr-zone">
                  <div className="qr-shell">
                    <QRCodeSVG 
                      value={`${window.location.origin}/s/${activeStudent.digital_qr || activeStudent.student_id}`} 
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
                    key={photo.id}
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
                      alignItems: 'center',
                      position: 'relative'
                    }}
                  >
                    {photo.status === 'pending' || photo.status === 'preview_uploading' ? (
                      <div style={{ width: '100%', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: '#f05825', fontSize: '9px', letterSpacing: '1px', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>UPLOADING…</span>
                        {typeof photo.upload_progress === 'number' && photo.upload_progress > 0 && (
                          <div style={{ width: '80%', height: '3px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${photo.upload_progress}%`, height: '100%', background: '#f05825', transition: 'width 0.3s ease' }}></div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <img 
                        src={resolveImageUrl(photo)} 
                        alt={photo.filename} 
                        style={{ width: '100%', height: '60px', objectFit: 'cover' }} 
                        draggable={false}
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.style.background = 'linear-gradient(135deg, #2a2d2a 0%, #1a1c1a 100%)';
                        }}
                      />
                    )}
                    <div style={{ width: '100%', padding: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span style={{ fontSize: '9px', color: '#ccc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>
                        {photo.filename}
                      </span>
                      <StatusBadge status={photo.status} />
                    </div>
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

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
