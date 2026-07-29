import React from 'react';
import { X } from 'lucide-react';

const levelColors = {
  success: { bg: 'rgba(117, 219, 166, 0.15)', border: '#75dba6', color: '#75dba6' },
  error:   { bg: 'rgba(240, 88, 37, 0.15)',   border: '#f05825', color: '#f05825' },
  warning: { bg: 'rgba(255, 193, 7, 0.15)',    border: '#ffc107', color: '#ffc107' },
  info:    { bg: 'rgba(174, 180, 170, 0.15)',   border: '#aeb4aa', color: '#aeb4aa' },
};

export default function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: '8px',
      maxWidth: '380px',
      width: '100%',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const colors = levelColors[toast.level] || levelColors.info;
        return (
          <div
            key={toast.id}
            style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              color: colors.color,
              padding: '12px 16px',
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              pointerEvents: 'auto',
              animation: 'toastSlideIn 0.3s ease-out',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            <span style={{ flex: 1, lineHeight: '1.4' }}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.color,
                cursor: 'pointer',
                padding: '2px',
                flexShrink: 0,
                opacity: 0.7,
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
