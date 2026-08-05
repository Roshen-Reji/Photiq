import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Share2, Grid, RefreshCw, ExternalLink } from 'lucide-react';
import { io } from 'socket.io-client';
import useToast from '../hooks/useToast';
import ToastContainer from '../components/Toast';
import { getBackendOrigin } from '../utils/backendUrl';

const BACKEND_URL = getBackendOrigin(false);

function withBackendOrigin(url) {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return `${BACKEND_URL}${url}`;
}

const StudentPhotoCard = ({ photo, badge }) => {
  const [hasError, setHasError] = useState(false);

  // FIX: Resolve URLs through backend origin so they work with Vite dev proxy
  // and when frontend/backend are on different ports/hosts
  const imageUrl = withBackendOrigin(photo.imageUrl);
  const downloadUrl = withBackendOrigin(photo.downloadUrl || photo.imageUrl);

  const handleImageError = () => setHasError(true);

  return (
    <figure 
      className={`gallery-card ${photo.style}`} 
      style={{ 
        position: 'relative',
        overflow: 'hidden',
        background: hasError ? 'linear-gradient(135deg, #2a2d2a 0%, #1a1c1a 100%)' : '#1a1c1a'
      }}
    >
      {!hasError && imageUrl && (
        <img 
          src={imageUrl}
          alt={photo.filename || 'Graduation Photo'} 
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={handleImageError}
        />
      )}
      <div className="image-grain"></div>
      {badge && (
        <div style={{
          position: 'absolute', top: '8px', right: '8px',
          background: `rgba(${badge.color === '#f0a830' ? '240, 168, 48' : '117, 219, 166'}, 0.9)`, color: '#111',
          fontSize: '8px', padding: '2px 6px', borderRadius: '3px',
          fontWeight: 'bold', letterSpacing: '0.5px',
        }}>
          {badge.label}
        </div>
      )}
      <figcaption>
        <span>{photo.filename}</span>
        <strong>
          {photo.size ? `${(photo.size / 1024 / 1024).toFixed(1)} MB` : (badge ? badge.label : 'READY')}
        </strong>
        <a href={downloadUrl} download style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#333', border: '1px solid #444', borderRadius: '50%', width: '28px', height: '28px', color: '#fff', cursor: 'pointer' }}>
          <Download size={14} />
        </a>
      </figcaption>
    </figure>
  );
};

export default function StudentPortal() {
  const { token } = useParams();
  const [photos, setPhotos] = useState([]);
  const [studentInfo, setStudentInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [driveLink, setDriveLink] = useState(null);
  const socketRef = useRef(null);
  const studentInfoRef = useRef(null); // Ref to access latest studentInfo in socket handlers
  const { toasts, addToast, removeToast } = useToast();

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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch student basic info
      let info = null;
      try {
        const infoRes = await fetch(`/api/drive/${token}/info`);
        if (infoRes.ok) {
          info = await infoRes.json();
          setStudentInfo(info);
          studentInfoRef.current = info;
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
      
      // Fetch folder link asynchronously without blocking the photos render
      fetch(`/api/drive/${token}/folder-link`)
        .then(res => res.json())
        .then(data => { if (data.link) setDriveLink(data.link); })
        .catch(e => console.warn('Could not fetch drive link:', e));
    } catch (err) {
      setError(err.message);
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [token, addToast]);

  // FIX: Single useEffect for socket setup. All event handlers use
  // studentInfoRef (a ref) instead of the stale studentInfo state from
  // the first render. This eliminates the bug where handlers registered
  // before studentInfo loaded would silently ignore all events.
  useEffect(() => {
    fetchData();

    const socket = io(getBackendOrigin());
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Listen for preview ready — check against ref for latest studentInfo
    socket.on('preview_ready', (data) => {
      const info = studentInfoRef.current;
      if (info && data.student_id === info.student_id) {
        fetchPhotos();
        addToast('New photo available!', 'success');
      }
    });

    // Listen for original ready — swap preview with original
    socket.on('original_ready', (data) => {
      const info = studentInfoRef.current;
      // Only refetch if this is for our student or if it's a global update
      if (!info || data.student_id === info.student_id) {
        fetchPhotos();
      }
    });

    // Listen for photo assigned to this student
    socket.on('photo_assigned', (upload) => {
      const info = studentInfoRef.current;
      if (info && upload.student_id === info.student_id) {
        fetchPhotos();
      }
    });

    // Listen for photos_updated for this student
    socket.on('photos_updated', (data) => {
      const info = studentInfoRef.current;
      if (info && data.student_id === info.student_id) {
        fetchPhotos();
      }
    });

    // FIX: Removed the indiscriminate photo_upload_complete listener that
    // fetched all photos for every student on every upload. This caused
    // unnecessary network traffic and was redundant with photos_updated.

    return () => socket.disconnect();
  }, [token, fetchPhotos, fetchData, addToast]);

  // When studentInfo loads, join the student-specific socket room
  useEffect(() => {
    if (!socketRef.current || !studentInfo) return;
    studentInfoRef.current = studentInfo;

    if (studentInfo.student_id) {
      socketRef.current.emit('join_student_room', studentInfo.student_id);
    }
  }, [studentInfo]);

  const handleDownloadAll = () => {
    window.location.href = `${window.location.origin}/api/drive/${token}/download`;
  };

  // Get sync status info for a photo
  const getSyncBadge = (photo) => {
    if (photo.status === 'completed' || photo.original_ready || photo.source === 'drive') {
      return null; // Fully synced, no badge needed
    }
    if (photo.status === 'uploading_original') {
      return { label: 'CLOUD SYNCING', color: '#f0a830' };
    }
    if (photo.source === 'preview' && !photo.original_ready) {
      return { label: 'PREVIEW', color: '#f0a830' };
    }
    return null;
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
            {driveLink && (
              <a href={driveLink} target="_blank" rel="noopener noreferrer" className="download-all" style={{ background: '#4285F4', borderColor: '#4285F4', textDecoration: 'none' }}>
                <ExternalLink size={12} />
                OPEN IN DRIVE
              </a>
            )}
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
          {photos.map((p, i) => {
            const badge = getSyncBadge(p);
            return <StudentPhotoCard key={p.id || p.filename || p.Path || i} photo={p} token={token} badge={badge} />;
          })}
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
