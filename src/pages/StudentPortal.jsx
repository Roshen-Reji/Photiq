import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Share2, Grid, RefreshCw } from 'lucide-react';
import { io } from 'socket.io-client';
import useToast from '../hooks/useToast';
import ToastContainer from '../components/Toast';

export default function StudentPortal() {
  const { token } = useParams();
  const [photos, setPhotos] = useState([]);
  const [studentInfo, setStudentInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef(null);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    fetchData();

    // Connect to Socket.IO for real-time updates (Fix 3 & 4)
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Listen for preview ready — new photo available instantly
    socket.on('preview_ready', (data) => {
      if (!studentInfo) return; // Wait until we know the student
      // Will be handled after studentInfo is set
    });

    // Listen for original ready — swap preview with original
    socket.on('original_ready', (data) => {
      setPhotos(prev => prev.map(p => {
        if (p._upload_id === data._id || p._upload_id?.toString() === data._id?.toString()) {
          return { ...p, _original_ready: true, _status: 'completed', _refreshKey: Date.now() };
        }
        return p;
      }));
    });

    // Listen for photo assigned to this student
    socket.on('photo_assigned', (upload) => {
      // Refresh photos when a photo is assigned
      if (studentInfo && upload.student_id === studentInfo.student_id) {
        fetchPhotos();
      }
    });

    // Listen for photos_updated for this student
    socket.on('photos_updated', (data) => {
      if (studentInfo && data.student_id === studentInfo.student_id) {
        fetchPhotos();
      }
    });

    // Photo upload complete — refresh to get updated data
    socket.on('photo_upload_complete', () => {
      fetchPhotos();
    });

    return () => socket.disconnect();
  }, [token]);

  // Re-subscribe to relevant events when studentInfo becomes available
  useEffect(() => {
    if (!socketRef.current || !studentInfo) return;
    const socket = socketRef.current;

    // Join student-specific room for targeted updates
    if (studentInfo.student_id) {
      socket.emit('join_student_room', studentInfo.student_id);
    }

    // Re-register handlers with studentInfo context
    const handlePreview = (data) => {
      if (data.student_id === studentInfo.student_id) {
        setPhotos(prev => {
          const exists = prev.find(p => p._upload_id === data._id || p._upload_id?.toString() === data._id?.toString());
          if (exists) {
            return prev.map(p => 
              (p._upload_id === data._id || p._upload_id?.toString() === data._id?.toString())
                ? { ...p, _status: 'preview_ready', _preview_ready: true }
                : p
            );
          }
          // Add new photo entry
          return [...prev, {
            Path: data.filename,
            Name: data.filename,
            Size: 0,
            _upload_id: data._id,
            _status: 'preview_ready',
            _preview_ready: true,
            _original_ready: false,
            _source: 'preview',
            style: getPhotoStyle(prev.length),
          }];
        });
        addToast('New photo available!', 'success');
      }
    };

    const handlePhotosUpdated = (data) => {
      if (data.student_id === studentInfo.student_id) {
        fetchPhotos();
      }
    };

    const handleAssigned = (upload) => {
      if (upload.student_id === studentInfo.student_id) {
        fetchPhotos();
      }
    };

    socket.on('preview_ready', handlePreview);
    socket.on('photos_updated', handlePhotosUpdated);
    socket.on('photo_assigned', handleAssigned);

    return () => {
      socket.off('preview_ready', handlePreview);
      socket.off('photos_updated', handlePhotosUpdated);
      socket.off('photo_assigned', handleAssigned);
    };
  }, [studentInfo]);

  const styles = ['gold tall', 'violet wide', 'coral', 'blue', 'forest tall', 'plum', 'sunset wide'];
  
  const getPhotoStyle = (index) => styles[index % styles.length];

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/drive/${token}/photos`);
      if (!res.ok) throw new Error('Failed to load photos');
      const data = await res.json();
      
      const processed = data.map((photo, i) => ({
        ...photo,
        style: getPhotoStyle(i)
      }));
      
      setPhotos(processed);
    } catch (err) {
      console.error('Photo refresh error:', err);
    }
  }, [token]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch student basic info
      try {
        const infoRes = await fetch(`/api/drive/${token}/info`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          setStudentInfo(info);
        }
      } catch (e) {
        console.warn('Could not fetch student info:', e);
      }

      // Fetch photos
      const res = await fetch(`/api/drive/${token}/photos`);
      if (!res.ok) throw new Error('Failed to load photos or student profile not found.');
      const data = await res.json();
      
      // Assign random styles to photos for the masonry grid look
      const processed = data.map((photo, i) => ({
        ...photo,
        style: getPhotoStyle(i)
      }));
      
      setPhotos(processed);
    } catch (err) {
      setError(err.message);
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAll = () => {
    window.location.href = `/api/drive/${token}/download`;
  };

  const handleDownloadSingle = (filename) => {
    const link = document.createElement('a');
    link.href = `/api/drive/${token}/photo/${filename}`;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Determine image source based on availability
  const getImageSrc = (photo) => {
    // If original is on Drive, use the direct streaming endpoint
    if (photo._original_ready || photo._source === 'drive') {
      const refreshParam = photo._refreshKey ? `?t=${photo._refreshKey}` : '';
      return `/api/drive/${token}/photo/${photo.Path}${refreshParam}`;
    }
    // If only preview is available, use the preview endpoint
    if (photo._upload_id && (photo._preview_ready || photo._source === 'preview')) {
      return `/api/drive/${token}/preview/${photo._upload_id}`;
    }
    // Default: try direct photo endpoint
    return `/api/drive/${token}/photo/${photo.Path}`;
  };

  return (
    <div className="portal-app">
      <header className="gallery-header">
        <button className="wordmark">Grad<span>Sync</span></button>
        <nav className="gallery-nav">
          <button style={{ color: '#fff', borderBottom: '1px solid #fff', paddingBottom: '2px' }}>YOUR GALLERY</button>
        </nav>
      </header>

      <main className="gallery-wrap">
        <div className="gallery-hero">
          <div>
            <p className="portal-eyebrow">
              CLASS OF 2026 {studentInfo?.department ? `// ${studentInfo.department.toUpperCase()}` : ''}
            </p>
            <h1><i>{studentInfo?.name ? studentInfo.name : 'Your'}</i><br/>Moments.</h1>
            <p>Welcome to your personal graduation gallery. High-resolution downloads are included.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            <button className="download-all" onClick={handleDownloadAll} disabled={photos.length === 0 || loading}>
              <Download size={12} />
              DOWNLOAD ALL <span>(ZIP)</span>
            </button>
            <button 
              className="ghost-control" 
              onClick={fetchData} 
              disabled={loading}
              style={{ fontSize: '10px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={10} className={loading ? 'spin-icon' : ''} /> REFRESH
            </button>
          </div>
        </div>

        <div className="gallery-meta">
          <span>{loading ? 'LOADING...' : `${photos.length} ITEMS FOUND`}</span>
          <span>
            <i className="gallery-live" style={{ background: socketConnected ? undefined : '#555' }}></i> 
            {socketConnected ? 'SYNCING LIVE' : 'OFFLINE'}
          </span>
        </div>
        
        {error && <div style={{ color: '#e8542e', padding: '20px', background: 'rgba(232, 84, 46, 0.1)', border: '1px solid #e8542e', borderRadius: '4px', margin: '20px 0' }}>{error}</div>}

        {!loading && !error && photos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aeb4aa' }}>
            <h3 style={{ color: '#f1f0ea', marginBottom: '10px' }}>NO PHOTOS YET</h3>
            <p>Your photos are being processed and synced. This page updates automatically — no need to refresh!</p>
          </div>
        )}

        <div className="photo-grid">
          {photos.map((p, i) => (
            <figure 
              key={p._upload_id || p.Path || i} 
              className={`gallery-card ${p.style}`} 
              style={{ 
                backgroundImage: `url(${getImageSrc(p)})`, 
                backgroundSize: 'cover', 
                backgroundPosition: 'center',
                position: 'relative',
              }}
            >
              <div className="image-grain"></div>
              {/* Preview badge */}
              {p._source === 'preview' && !p._original_ready && (
                <div style={{
                  position: 'absolute', top: '8px', right: '8px',
                  background: 'rgba(240, 168, 48, 0.9)', color: '#111',
                  fontSize: '8px', padding: '2px 6px', borderRadius: '3px',
                  fontWeight: 'bold', letterSpacing: '0.5px',
                }}>
                  PREVIEW
                </div>
              )}
              <figcaption>
                <span>{p.Path}</span>
                <strong>{p.Size ? `${(p.Size / 1024 / 1024).toFixed(1)} MB` : 'Syncing...'}</strong>
                <button onClick={() => handleDownloadSingle(p.Path)} disabled={!p._original_ready && p._source === 'preview'}>
                  <Download size={14} />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      </main>

      <footer className="gallery-footer">
        <span>© 2026 UNIVERSITY EVENTS</span>
        <span>SECURE GALLERY LINK: {token}</span>
      </footer>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
