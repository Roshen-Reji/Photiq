import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

const originalFetch = window.fetch;
window.fetch = async (resource, config = {}) => {
  if (typeof resource === 'string' && resource.startsWith('/api')) {
    const token = localStorage.getItem('gradsync_admin_token');
    if (token) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${token}`
      };
    }
  }
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
