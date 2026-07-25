import React, { useRef, useState, useEffect } from 'react';
import jsQR from 'jsqr';

export default function PhotoBooth() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [scannedIds, setScannedIds] = useState([]);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(function(stream) {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true);
          videoRef.current.play();
          requestAnimationFrame(tick);
        }
      });
  }, []);

  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      if (code) {
        // Try parsing QR data
        if (!scannedIds.includes(code.data)) {
          setScannedIds(prev => [...prev, code.data]);
        }
      }
    }
    if (scanning) {
      requestAnimationFrame(tick);
    }
  };

  return (
    <div className="photobooth-container">
      <h1>Photo Booth Kiosk</h1>
      <p>Scan your QR code(s) to begin</p>
      <div className="camera-view">
        <video ref={videoRef} style={{ width: '100%', maxWidth: '400px' }}></video>
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      </div>
      <div className="scanned-list">
        <h3>Group Members:</h3>
        <ul>
          {scannedIds.map(id => <li key={id}>{id}</li>)}
        </ul>
        {scannedIds.length > 0 && <button>Take Photo</button>}
      </div>
    </div>
  );
}
