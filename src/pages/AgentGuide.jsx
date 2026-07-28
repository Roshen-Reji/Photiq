import React from 'react';
import { Link } from 'react-router-dom';
import { Terminal, HardDrive, Network, Camera, ChevronLeft } from 'lucide-react';

export default function AgentGuide() {
  return (
    <div className="monitor-app" style={{ overflowY: 'auto' }}>
      <header className="monitor-header">
        <div className="brand">
          <div className="brand-mark">GS</div>
          <span>GRADSYNC // TETHER GUIDE</span>
        </div>
        <nav className="header-nav">
          <Link to="/">
            <button className="ghost-control"><ChevronLeft size={14} style={{ marginRight: '5px' }} /> LAUNCHPAD</button>
          </Link>
        </nav>
      </header>

      <main style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', color: '#aeb4aa', fontFamily: 'var(--font-mono)' }}>
        <h1 style={{ color: '#f1f0ea', fontSize: '24px', borderBottom: '1px solid #3b3e3a', paddingBottom: '15px', marginBottom: '30px' }}>Tether Agent Installation & Usage</h1>
        
        <p style={{ lineHeight: '1.6', marginBottom: '40px' }}>
          GradSync uses lightweight Node.js agents that run on the photographer's local laptops. 
          These agents monitor a "Watched Folder" (where your DSLR saves incoming photos) and immediately execute 
          <code style={{ background: '#111', padding: '2px 6px', color: '#f05825', margin: '0 4px' }}>rclone</code> commands to sync them to the active student's Google Drive folder.
        </p>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ color: '#f05825', fontSize: '16px', marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
            <Terminal size={18} style={{ marginRight: '10px' }} /> Step 1: Prerequisites
          </h2>
          <ul style={{ listStyleType: 'square', marginLeft: '20px', lineHeight: '1.8' }}>
            <li>Install <strong>Node.js</strong> (v18+) on the laptop.</li>
            <li>Install <strong>RClone</strong> and authenticate it with your Google Drive account (run <code style={{ background: '#111', padding: '2px 6px', color: '#f05825' }}>rclone config</code>). Name the remote <code style={{ background: '#111', padding: '2px 6px', color: '#f05825' }}>drive</code>.</li>
            <li>Install the GradSync dependencies by running <code style={{ background: '#111', padding: '2px 6px', color: '#f05825' }}>npm install</code> in the root folder.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ color: '#f05825', fontSize: '16px', marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
            <HardDrive size={18} style={{ marginRight: '10px' }} /> Step 2: Configuration
          </h2>
          <p style={{ marginBottom: '10px' }}>Inside the <code style={{ background: '#111', padding: '2px 6px', color: '#f05825' }}>agents/</code> directory, copy the example config:</p>
          <pre style={{ background: '#0a0a0a', border: '1px solid #222', padding: '15px', overflowX: 'auto', marginBottom: '15px' }}>
cp agents/camera-agent.config.example.json agents/camera-agent.config.json
          </pre>
          <p style={{ marginBottom: '10px' }}>Edit <code style={{ background: '#111', padding: '2px 6px', color: '#f05825' }}>camera-agent.config.json</code>:</p>
          <pre style={{ background: '#0a0a0a', border: '1px solid #222', padding: '15px', overflowX: 'auto', color: '#569cd6' }}>
{`{
  "apiBaseUrl": "http://192.168.1.100:8787",
  "watchDirectory": "C:/Users/Photographer/Pictures/CaptureOne",
  "cameraName": "STAGE_CAM_MAIN",
  "rcloneRemote": "drive:"
}`}
          </pre>
          <p style={{ fontSize: '12px', marginTop: '10px' }}>* Set <code>apiBaseUrl</code> to the IP address of the main server running GradSync.</p>
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ color: '#f05825', fontSize: '16px', marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
            <Camera size={18} style={{ marginRight: '10px' }} /> Step 3: Running the Agents
          </h2>
          <p style={{ marginBottom: '10px' }}><strong>For Stage Photography (1 Active Student):</strong></p>
          <pre style={{ background: '#0a0a0a', border: '1px solid #222', padding: '15px', overflowX: 'auto', marginBottom: '20px' }}>
node agents/camera-upload-agent.cjs
          </pre>
          
          <p style={{ marginBottom: '10px' }}><strong>For Photo Booth (Multiple Scanned Students):</strong></p>
          <pre style={{ background: '#0a0a0a', border: '1px solid #222', padding: '15px', overflowX: 'auto', marginBottom: '15px' }}>
node agents/booth-upload-agent.cjs
          </pre>
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ color: '#f05825', fontSize: '16px', marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
            <Network size={18} style={{ marginRight: '10px' }} /> Offline Fallback
          </h2>
          <p style={{ lineHeight: '1.6' }}>
            If the internet disconnects, keep shooting! The agent will detect the failure and save the intent to a local JSON queue in <code style={{ background: '#111', padding: '2px 6px', color: '#f05825' }}>agents/runtime/</code>. 
            Once the connection is restored, it will automatically process the backlog. Do not close the agent until the queue is empty.
          </p>
        </section>

      </main>
    </div>
  );
}
