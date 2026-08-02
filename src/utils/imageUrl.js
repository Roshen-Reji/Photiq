const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');

function withBackendOrigin(url) {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return `${BACKEND_URL}${url}`;
}

function addQueryParameter(url, name, value) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

/**
 * Resolves only server-issued proxy URLs. Browser code must never construct a
 * URL from a Drive ID, local path, Mongo ID, or object URL.
 */
export const resolveImageUrl = (item, download = false) => {
  if (!item || typeof item !== 'object') return '';

  let url = download ? (item.downloadUrl || item.imageUrl) : item.imageUrl;
  if (!url) return '';
  url = withBackendOrigin(url);

  if (download && !item.downloadUrl) {
    url = addQueryParameter(url, 'download', 'true');
  }

  // Bust browser cache if a refresh key is provided (e.g., when original finishes uploading)
  if (item._refreshKey) {
    url = addQueryParameter(url, 't', item._refreshKey);
  }

  // Monitor/admin image routes require the existing admin session. Student
  // routes are secured by their QR token and deliberately receive no admin JWT.
  if (/\/api\/uploads(?:\/|$)/.test(url) && !/[?&]token=/.test(url)) {
    const token = localStorage.getItem('gradsync_admin_token');
    if (token) url = addQueryParameter(url, 'token', token);
  }

  return url;
};
