import React from 'react';
import { useParams } from 'react-router-dom';

export default function StudentPortal() {
  const { token } = useParams();

  // In production, fetch photos based on token
  // fetch(`/api/public/${token}`) ...

  return (
    <div className="portal-container" style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Graduation Gallery</h1>
      <p>Welcome to your personal gallery! Here are your photos from the stage and booth.</p>
      
      <div className="gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
        <div style={{ backgroundColor: '#f0f0f0', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Photo 1</div>
        <div style={{ backgroundColor: '#f0f0f0', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Photo 2</div>
        <div style={{ backgroundColor: '#f0f0f0', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Photo 3</div>
      </div>
      
      <button style={{ marginTop: '2rem', padding: '1rem 2rem' }}>Download Full Gallery</button>
    </div>
  );
}
