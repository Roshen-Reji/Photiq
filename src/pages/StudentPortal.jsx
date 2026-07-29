import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Share2, Grid } from 'lucide-react';

export default function StudentPortal() {
  const { token } = useParams();
  const [photos, setPhotos] = useState([]);
  const [studentInfo, setStudentInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
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
      const styles = ['gold tall', 'violet wide', 'coral', 'blue', 'forest tall', 'plum', 'sunset wide'];
      const processed = data.map((photo, i) => ({
        ...photo,
        style: styles[i % styles.length]
      }));
      
      setPhotos(processed);
    } catch (err) {
      setError(err.message);
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
          <button className="download-all" onClick={handleDownloadAll} disabled={photos.length === 0 || loading}>
            <Download size={12} />
            DOWNLOAD ALL <span>(ZIP)</span>
          </button>
        </div>

        <div className="gallery-meta">
          <span>{loading ? 'LOADING...' : `${photos.length} ITEMS FOUND`}</span>
          <span><i className="gallery-live"></i> SYNCING LIVE</span>
        </div>
        
        {error && <div style={{ color: '#e8542e', padding: '20px', background: 'rgba(232, 84, 46, 0.1)', border: '1px solid #e8542e', borderRadius: '4px', margin: '20px 0' }}>{error}</div>}

        {!loading && !error && photos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aeb4aa' }}>
            <h3 style={{ color: '#f1f0ea', marginBottom: '10px' }}>NO PHOTOS YET</h3>
            <p>Your photos are being processed and synced. Please check back shortly!</p>
          </div>
        )}

        <div className="photo-grid">
          {photos.map((p, i) => (
            <figure key={i} className={`gallery-card ${p.style}`} style={{ backgroundImage: `url(/api/drive/${token}/photo/${p.Path})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <div className="image-grain"></div>
              <figcaption>
                <span>{p.Path}</span>
                <strong>{(p.Size / 1024 / 1024).toFixed(1)} MB</strong>
                <button onClick={() => handleDownloadSingle(p.Path)}><Download size={14} /></button>
              </figcaption>
            </figure>
          ))}
        </div>
      </main>

      <footer className="gallery-footer">
        <span>© 2026 UNIVERSITY EVENTS</span>
        <span>SECURE GALLERY LINK: {token}</span>
      </footer>
    </div>
  );
}
