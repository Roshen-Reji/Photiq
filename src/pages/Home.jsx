import React from 'react';
import { Link } from 'react-router-dom';
import { Monitor, Users, Camera, Terminal, ShieldAlert, FileText } from 'lucide-react';

export default function Home() {
  return (
    <div className="monitor-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '800px', width: '100%', padding: '20px' }}>
        <div className="brand" style={{ marginBottom: '40px', textAlign: 'center' }}>
          <div className="brand-mark" style={{ display: 'inline-block', margin: '0 auto 15px' }}>GS</div>
          <h1 style={{ color: '#f1f0ea', fontSize: '24px', letterSpacing: '2px', fontWeight: 'bold' }}>GRADSYNC // LAUNCHPAD</h1>
          <p style={{ color: '#aeb4aa', fontSize: '12px', marginTop: '10px' }}>SYSTEM INITIALIZATION AND MODULE ROUTING</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Link to="/monitor" style={{ textDecoration: 'none' }}>
            <div className="panel-frame" style={{ padding: '30px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid #3b3e3a', height: '100%' }}
                 onMouseOver={e => e.currentTarget.style.borderColor = '#f05825'}
                 onMouseOut={e => e.currentTarget.style.borderColor = '#3b3e3a'}>
              <Monitor size={32} color="#f05825" style={{ marginBottom: '15px', display: 'inline-block' }} />
              <h2 style={{ color: '#f1f0ea', fontSize: '14px', marginBottom: '8px', letterSpacing: '1px' }}>MONITOR DASHBOARD</h2>
              <p style={{ color: '#93988f', fontSize: '11px', lineHeight: '1.4', margin: 0 }}>Control queue advancement, monitor sync status, and oversee live stage telemetry.</p>
            </div>
          </Link>

          <Link to="/admin" style={{ textDecoration: 'none' }}>
            <div className="panel-frame" style={{ padding: '30px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid #3b3e3a', height: '100%' }}
                 onMouseOver={e => e.currentTarget.style.borderColor = '#f05825'}
                 onMouseOut={e => e.currentTarget.style.borderColor = '#3b3e3a'}>
              <Users size={32} color="#f05825" style={{ marginBottom: '15px', display: 'inline-block' }} />
              <h2 style={{ color: '#f1f0ea', fontSize: '14px', marginBottom: '8px', letterSpacing: '1px' }}>ADMIN DASHBOARD</h2>
              <p style={{ color: '#93988f', fontSize: '11px', lineHeight: '1.4', margin: 0 }}>Manage student roster, import batch XLSX/CSV files, and assign physical QR markers.</p>
            </div>
          </Link>

          <Link to="/booth" style={{ textDecoration: 'none' }}>
            <div className="panel-frame" style={{ padding: '30px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid #3b3e3a', height: '100%' }}
                 onMouseOver={e => e.currentTarget.style.borderColor = '#f05825'}
                 onMouseOut={e => e.currentTarget.style.borderColor = '#3b3e3a'}>
              <Camera size={32} color="#f05825" style={{ marginBottom: '15px', display: 'inline-block' }} />
              <h2 style={{ color: '#f1f0ea', fontSize: '14px', marginBottom: '8px', letterSpacing: '1px' }}>PHOTO BOOTH</h2>
              <p style={{ color: '#93988f', fontSize: '11px', lineHeight: '1.4', margin: 0 }}>Track scanned QR groups for automated multi-sync uploading of DSLR images.</p>
            </div>
          </Link>

          <Link to="/guide" style={{ textDecoration: 'none' }}>
            <div className="panel-frame" style={{ padding: '30px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid #3b3e3a', height: '100%' }}
                 onMouseOver={e => e.currentTarget.style.borderColor = '#f05825'}
                 onMouseOut={e => e.currentTarget.style.borderColor = '#3b3e3a'}>
              <Terminal size={32} color="#f05825" style={{ marginBottom: '15px', display: 'inline-block' }} />
              <h2 style={{ color: '#f1f0ea', fontSize: '14px', marginBottom: '8px', letterSpacing: '1px' }}>TETHER AGENT GUIDE</h2>
              <p style={{ color: '#93988f', fontSize: '11px', lineHeight: '1.4', margin: 0 }}>Instructions on configuring and running the Node upload agents for stage & booth.</p>
            </div>
          </Link>
        </div>
        
        <div style={{ marginTop: '50px', textAlign: 'center', borderTop: '1px solid #222', paddingTop: '20px' }}>
          <ShieldAlert size={16} color="#777" style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          <span style={{ color: '#777', fontSize: '10px', letterSpacing: '1px' }}>AUTHORIZED PERSONNEL ONLY // GRADSYNC PROTOCOL</span>
        </div>
      </div>
    </div>
  );
}
