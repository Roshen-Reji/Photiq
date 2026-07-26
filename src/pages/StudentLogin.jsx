import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { Camera, Search, User } from 'lucide-react';

export default function StudentLogin() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [scanning, setScanning] = useState(false);
  const [manualId, setManualId] = useState('');
  const [error, setError] = useState('');

  // Start/Stop Webcam
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
          setError('Camera access denied or unavailable.');
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
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          // Found a QR code! Check if it's JSON or a raw string
          let studentId = code.data;
          try {
            const parsed = JSON.parse(code.data);
            if (parsed.id) studentId = parsed.id;
          } catch(e) { /* use raw data */ }
          
          handleLogin(studentId);
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
  }, [scanning]);

  const handleLogin = (id) => {
    if (!id || id.trim() === '') return;
    setScanning(false);
    navigate(`/s/${encodeURIComponent(id.trim())}`);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualId) {
      handleLogin(manualId);
    }
  };

  return (
    <div className="portal-app">
      <header className="gallery-header">
        <button className="wordmark">Grad<span>Sync</span></button>
        <nav className="gallery-nav">
          <button style={{ color: '#fff', borderBottom: '1px solid #fff', paddingBottom: '2px' }}>STUDENT ACCESS</button>
        </nav>
      </header>

      <main style={{ maxWidth: '500px', margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <User size={48} color="#f05825" style={{ marginBottom: '20px' }} />
        <h1 style={{ color: '#f1f0ea', fontSize: '24px', letterSpacing: '1px', marginBottom: '10px' }}>ACCESS YOUR GALLERY</h1>
        <p style={{ color: '#aeb4aa', fontSize: '14px', lineHeight: '1.6', marginBottom: '40px' }}>
          Scan your GradSync QR code or enter your Student ID below to view and download your graduation photos.
        </p>

        {error && <p style={{ color: '#e8542e', marginBottom: '20px', fontSize: '12px' }}>{error}</p>}

        <div style={{ background: '#111', border: '1px solid #222', padding: '30px', borderRadius: '4px', marginBottom: '30px' }}>
          {scanning ? (
            <div>
              <div style={{ position: 'relative', width: '100%', maxWidth: '300px', margin: '0 auto 20px' }}>
                <video ref={videoRef} style={{ width: '100%', display: 'block', borderRadius: '4px' }} />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(240, 88, 37, 0.5)', borderRadius: '4px', pointerEvents: 'none' }}></div>
              </div>
              <button className="accent-control" onClick={() => setScanning(false)} style={{ width: '100%' }}>
                CANCEL SCAN
              </button>
            </div>
          ) : (
            <button className="accent-control" onClick={() => setScanning(true)} style={{ width: '100%', padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '16px' }}>
              <Camera size={18} /> SCAN QR CODE
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: '#555' }}>
          <div style={{ flex: 1, height: '1px', background: '#222' }}></div>
          <span style={{ padding: '0 15px', fontSize: '12px', letterSpacing: '1px' }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: '#222' }}></div>
        </div>

        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="ENTER STUDENT ID" 
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            style={{ 
              flex: 1, 
              background: '#0a0a0a', 
              border: '1px solid #3b3e3a', 
              color: '#f1f0ea', 
              padding: '12px 15px',
              fontFamily: 'var(--font-mono)',
              outline: 'none'
            }}
          />
          <button type="submit" className="ghost-control" style={{ padding: '0 20px' }}>
            <Search size={16} />
          </button>
        </form>
      </main>
    </div>
  );
}
