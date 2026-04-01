// src/components/ModalShell.jsx
import { useEffect } from 'react';

export default function ModalShell({ onClose, children, title, subtitle }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(7,7,14,0.92)', backdropFilter: 'blur(6px)',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{
        maxWidth: 900, margin: '0 auto',
        padding: '16px 12px 100px',
        minHeight: '100%',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(7,7,14,0.95)', backdropFilter: 'blur(8px)',
          padding: '10px 0', borderBottom: '1px solid #1e1e30',
        }}>
          <div>
            {title && (
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22, color: '#ffaa00', letterSpacing: '0.1em', lineHeight: 1,
              }}>{title}</div>
            )}
            {subtitle && (
              <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.15em', marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          {/* Top close button */}
          <button
            onClick={onClose}
            style={{
              background: '#1a1a2e', border: '1px solid #2a2a40',
              color: '#b0c0dd', cursor: 'pointer', borderRadius: 4,
              padding: '8px 14px', fontSize: 12, fontFamily: 'inherit',
              letterSpacing: '0.1em', flexShrink: 0, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffaa0066'; e.currentTarget.style.color = '#ffaa00'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a40'; e.currentTarget.style.color = '#b0c0dd'; }}
          >✕ CLOSE</button>
        </div>

        {/* Content */}
        {children}

        {/* Bottom close bar — always reachable on mobile */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 11,
          padding: '10px 16px',
          background: 'rgba(7,7,14,0.97)',
          borderTop: '1px solid #1e1e30',
          display: 'flex', justifyContent: 'center',
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#1a1a2e', border: '1px solid #2a2a40',
              color: '#b0c0dd', cursor: 'pointer', borderRadius: 4,
              padding: '12px 0', fontSize: 13, fontFamily: 'inherit',
              letterSpacing: '0.1em', width: '100%', maxWidth: 500,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffaa0066'; e.currentTarget.style.color = '#ffaa00'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a40'; e.currentTarget.style.color = '#b0c0dd'; }}
          >✕ CLOSE</button>
        </div>
      </div>
    </div>
  );
}