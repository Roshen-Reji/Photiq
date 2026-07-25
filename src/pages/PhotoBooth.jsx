import React, { useRef, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import jsQR from 'jsqr';
import { Camera, X, Plus } from 'lucide-react';

export default function PhotoBooth() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [scannedStudents, setScannedStudents] = useState([]);
  const [scanning, setScanning] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [activeStudent, setActiveStudent] = useState(null);

  useEffect(() => {
    // Connect to sockets to listen to the queue
    const socket = io(window.location.origin.includes('localhost') ? 'http://localhost:8787' : '/');
    
    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('request_state');
    });

    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('state_update', (student) => {
      if (student) setActiveStudent(student);
    });

    return () => socket.disconnect();
  }, []);

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
        }).catch(err => console.warn('Webcam not accessible:', err));
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
          try {
            const data = JSON.parse(code.data);
            if (data.id) handleAddStudent(data.id);
          } catch(e) {
            // Not a JSON QR, just use raw string
            handleAddStudent(code.data);
          }
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

  const handleAddStudent = async (id) => {
    if (!id || scannedStudents.find(s => s.student_id === id)) return;
    
    try {
      // In production, fetch student details from API to get name/dept
      // For now, we mock the fetch or rely on active student state
      const newStudent = { student_id: id, name: activeStudent?.student_id === id ? activeStudent.name : 'Scanned User', department: 'QR Scan' };
      setScannedStudents(prev => [...prev, newStudent]);
      setManualInput('');
    } catch(err) {
      console.error(err);
    }
  };

  const handleRemove = (id) => {
    setScannedStudents(prev => prev.filter(s => s.student_id !== id));
  };

  // Add the active student automatically if they just got on stage and aren't scanned yet
  useEffect(() => {
    if (activeStudent && !scannedStudents.find(s => s.student_id === activeStudent.student_id)) {
       handleAddStudent(activeStudent.student_id);
    }
  }, [activeStudent]);

  return (
    <div className="portal-app">
      <header className="portal-header">
        <button className="wordmark">Grad<span>Sync</span></button>
        <div className="kiosk-chip">
          <span style={{ background: socketConnected ? '#6eae82' : '#e8542e' }}></span> 
          KIOSK_01 ACTIVE
        </div>
      </header>

      <main className="booth-layout">
        <div className="booth-copy">
          <p className="portal-eyebrow">STEP 01</p>
          <h1><i>Scan</i> QR to<br/>identify.</h1>
          <p>Please hold your digital or physical QR code up to the camera to link your photos to your personal gallery.</p>
          
          <div className="booth-steps">
            <span className="done"><b>01</b> SCAN</span> — 
            <span><b>02</b> VERIFY</span> — 
            <span><b>03</b> CAPTURE</span>
          </div>
        </div>

        <div className="viewfinder">
          <div className="corner c1"></div>
          <div className="corner c2"></div>
          <div className="corner c3"></div>
          <div className="corner c4"></div>

          <div className="viewfinder-top">
            <span><i className="record-dot"></i> SCANNING</span>
            <span>AUTO-EXP</span>
          </div>
          
          <video ref={videoRef} className="booth-video"></video>
          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
          
          {!scanning && (
            <div className="booth-placeholder">
              <Camera size={32} />
              <p>CAMERA DISABLED</p>
              <button className="start-camera" onClick={() => setScanning(true)}>ACTIVATE CAMERA</button>
            </div>
          )}

          <div className="viewfinder-bottom">
            <span>FOCUS_LOCKED</span>
          </div>
        </div>

        <aside className="scan-panel">
          <div className="scan-title">
            <p>GROUP MEMBERS</p>
            <span>{scannedStudents.length}/10</span>
          </div>

          <div className="people-list">
            {scannedStudents.length === 0 ? (
              <div className="scan-empty">
                <Camera size={24} />
                <span>Waiting for QR scan or active queue update...</span>
              </div>
            ) : (
              scannedStudents.map(student => (
                <div key={student.student_id} className="person-pill">
                  <div>{student.name.substring(0, 2).toUpperCase()}</div>
                  <span>
                    <strong>{student.name}</strong>
                    <small>ID: {student.student_id}</small>
                  </span>
                  <button onClick={() => handleRemove(student.student_id)}>
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="booth-scan-input">
            <input 
              type="text" 
              placeholder="Manual ID Entry" 
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddStudent(manualInput)}
            />
            <button onClick={() => handleAddStudent(manualInput)}><Plus size={14} /></button>
          </div>

          <button className="take-photo" disabled={scannedStudents.length === 0}>
            <i className="shutter"></i> CAPTURE IDENTITIES <kbd>SPACE</kbd>
          </button>
          
          <p className="privacy-note">Photos synced securely to Drive.</p>
        </aside>
      </main>
      
      <footer className="portal-footer">
        <span>© 2026 UNIVERSITY EVENTS</span>
        <span>POWERED BY GRADSYNC PROTOCOL</span>
      </footer>
    </div>
  );
}
