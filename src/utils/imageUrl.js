const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

/**
 * Resolves any upload record into a reliable Express proxy URL.
 * Also supports Google's high-performance CDN fallback for public files.
 *
 * @param {Object|string} item - The Upload object from DB or file ID string
 * @param {boolean} [download=false] - Whether to trigger forced attachment download
 * @returns {string} Fully qualified proxy image URL
 */
export const resolveImageUrl = (item, download = false) => {
  if (!item) return '';

  const id = typeof item === 'string' ? item : item._id || item.id || item.driveFileId || (item.Path ? item._upload_id : null);
  if (!id) return '';

  // If item explicitly provides an absolute API stream path already, use it
  if (typeof item === 'object' && item.previewUrl && item.previewUrl.includes('/api/uploads/stream')) {
    return download ? `${item.previewUrl}?download=true` : item.previewUrl;
  }

  // Construct standard backend stream URL
  const queryParam = download ? '?download=true' : '';
  const token = localStorage.getItem('gradsync_admin_token');
  const tokenParam = token ? (queryParam ? `&token=${token}` : `?token=${token}`) : '';
  
  return `${BACKEND_URL}/api/uploads/stream/${id}${queryParam}${tokenParam}`;
};

/**
 * Fast Google CDN thumbnail fallback (only works if Drive permissions are 'Anyone with link')
 */
export const resolveCdnThumbnailUrl = (driveFileId, size = 1000) => {
  if (!driveFileId) return '';
  return `https://lh3.googleusercontent.com/d/${driveFileId}=w${size}?authuser=0`;
};
