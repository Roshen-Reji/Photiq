import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Share2, Grid } from 'lucide-react';

export default function StudentPortal() {
  const { token } = useParams();

  // Mock data for the portal
  const photos = [
    { id: '1', style: 'gold tall' },
    { id: '2', style: 'violet wide' },
    { id: '3', style: 'coral' },
    { id: '4', style: 'blue' },
    { id: '5', style: 'forest tall' },
    { id: '6', style: 'plum' },
    { id: '7', style: 'sunset wide' },
  ];

  return (
    <div className="portal-app">
      <header className="gallery-header">
        <button className="wordmark">Grad<span>Sync</span></button>
        <nav className="gallery-nav">
          <button>YOUR GALLERY</button>
          <button>PRINT STORE</button>
          <button>HELP</button>
        </nav>
      </header>

      <main className="gallery-wrap">
        <div className="gallery-hero">
          <div>
            <p className="portal-eyebrow">CLASS OF 2026</p>
            <h1><i>Your</i><br/>Moments.</h1>
            <p>Welcome to your personal graduation gallery. High-resolution downloads are included.</p>
          </div>
          <button className="download-all">
            <Download size={12} />
            DOWNLOAD ALL <span>(ZIP)</span>
          </button>
        </div>

        <div className="gallery-meta">
          <span>{photos.length} ITEMS FOUND</span>
          <span><i className="gallery-live"></i> SYNCING LIVE</span>
        </div>

        <div className="photo-grid">
          {photos.map(p => (
            <figure key={p.id} className={`gallery-card ${p.style}`}>
              <div className="image-grain"></div>
              <figcaption>
                <span>ID_00{p.id}</span>
                <strong>DSLR_RAW</strong>
                <button><Download size={14} /></button>
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
