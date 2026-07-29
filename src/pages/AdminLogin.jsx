import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password) return;
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await res.json();
      
      if (res.ok && data.token) {
        localStorage.setItem('gradsync_admin_token', data.token);
        const from = location.state?.from?.pathname || '/';
        navigate(from, { replace: true });
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error. Ensure server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="monitor-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <main style={{ maxWidth: '400px', width: '100%', padding: '40px', background: '#0a0a0a', border: '1px solid #3b3e3a', textAlign: 'center' }}>
        <ShieldAlert size={48} color="#f05825" style={{ marginBottom: '20px' }} />
        <h1 style={{ color: '#f1f0ea', fontSize: '20px', letterSpacing: '2px', marginBottom: '10px' }}>SYSTEM AUTHENTICATION</h1>
        <p style={{ color: '#93988f', fontSize: '12px', marginBottom: '10px', fontFamily: 'var(--font-mono)' }}>
          AUTHORIZED PERSONNEL ONLY
        </p>
        <p style={{ color: '#75dba6', fontSize: '11px', marginBottom: '30px', fontFamily: 'var(--font-mono)' }}>
          [ DEFAULT CODE: gradsync2026 ]
        </p>

        {error && <div style={{ color: '#050505', background: '#e8542e', padding: '10px', fontSize: '12px', marginBottom: '20px', fontFamily: 'var(--font-mono)' }}>{error}</div>}

        <form onSubmit={handleLogin}>
          <input 
            type="password" 
            placeholder="ENTER CLEARANCE CODE" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ 
              width: '100%', 
              background: '#111', 
              border: '1px solid #3b3e3a', 
              color: '#f1f0ea', 
              padding: '15px',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              marginBottom: '20px',
              textAlign: 'center',
              letterSpacing: '2px'
            }}
          />
          <button 
            type="submit" 
            className="accent-control" 
            disabled={loading}
            style={{ width: '100%', padding: '15px', fontSize: '14px', letterSpacing: '2px' }}
          >
            {loading ? '[ VERIFYING ]' : '[ INITIALIZE SECURE SESSION ]'}
          </button>
        </form>
      </main>
    </div>
  );
}
