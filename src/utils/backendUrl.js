// src/utils/backendUrl.js
export function getBackendOrigin(fallbackToOrigin = true) {
  const raw = import.meta.env.VITE_BACKEND_URL || '';
  const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(raw);
  const viewerIsLocalhost = typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  
  if (!raw || (isLoopback && !viewerIsLocalhost)) {
    return fallbackToOrigin && typeof window !== 'undefined' ? window.location.origin : '';
  }
  return raw.replace(/\/$/, '');
}

