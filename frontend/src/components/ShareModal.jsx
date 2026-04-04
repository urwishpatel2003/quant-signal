// ShareModal.jsx
// Renders card preview, handles PNG download via html2canvas, and shareable link generation
import { useState, useRef } from 'react';
import { SignalCard, SimulatorCard } from './ShareCard';

const BASE = import.meta.env.VITE_API_BASE;

export default function ShareModal({ type, data, onClose }) {
  const [copying,      setCopying]      = useState(false);
  const [downloading,  setDownloading]  = useState(false);
  const [shareUrl,     setShareUrl]     = useState('');
  const [copied,       setCopied]       = useState(false);
  const [linkError,    setLinkError]    = useState('');
  const cardRef = useRef(null);

  const getShareUrl = async () => {
    if (shareUrl) return shareUrl;
    setCopying(true); setLinkError('');
    try {
      const res  = await fetch(`${BASE}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setShareUrl(json.url);
      return json.url;
    } catch (e) {
      setLinkError(e.message);
      return null;
    } finally { setCopying(false); }
  };

  const handleCopyLink = async () => {
    const url = await getShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { setLinkError('Could not copy to clipboard'); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js')).default;
      const el = document.getElementById('share-card');
      if (!el) throw new Error('Card element not found');
      const canvas = await html2canvas(el, {
        backgroundColor: null,
        scale: 2, // retina quality
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `quaint-signal-${type}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      // Fallback: use browser print if html2canvas fails
      window.print();
    }
    setDownloading(false);
  };

  const handleShare = async (platform) => {
    const url = await getShareUrl();
    if (!url) return;
    const text = type === 'signal'
      ? `📊 ${data.ticker} ${data.signal} signal — ${data.confidence}% confidence via QuAInt Signal`
      : `📈 My QuAInt Signal simulator: ${data.totalReturnPct >= 0 ? '+' : ''}${data.totalReturnPct?.toFixed(1)}% return, ${data.winRate}% win rate`;
    const shareText = encodeURIComponent(`${text}\n${url}`);
    const urls = {
      twitter:  `https://twitter.com/intent/tweet?text=${shareText}`,
      whatsapp: `https://wa.me/?text=${shareText}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    };
    window.open(urls[platform], '_blank', 'width=600,height=400');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      zIndex: 9999, overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}>
      {/* Fixed close button — always visible, outside scroll area */}
      <button onClick={onClose} style={{
        position: 'fixed', top: 16, right: 16, zIndex: 10000,
        background: '#1a1a2e', border: '1px solid #3a3a4e', cursor: 'pointer',
        color: '#e8e8f0', fontSize: 20, width: 44, height: 44,
        borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'manipulation', boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
      }}>✕</button>

      <div style={{
        width: '100%', maxWidth: 580, margin: '0 auto',
        padding: '70px 16px 60px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#e8e8f0', letterSpacing: '0.08em' }}>
          SHARE YOUR RESULTS
        </div>

        {/* Card preview */}
        <div ref={cardRef} style={{ display: 'flex', justifyContent: 'center' }}>
          {type === 'signal'
            ? <SignalCard data={data} compact />
            : <SimulatorCard data={data} compact />
          }
        </div>

        {/* Download PNG */}
        <button onClick={handleDownload} disabled={downloading} style={{
          width: '100%', padding: '14px', borderRadius: 8, cursor: 'pointer',
          background: '#1a1a2e', border: '1px solid #4488ff44',
          color: '#4488ff', fontFamily: 'inherit', fontSize: 13,
          fontWeight: 700, letterSpacing: '0.1em',
          opacity: downloading ? 0.6 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {downloading ? '⏳ GENERATING...' : '⬇ DOWNLOAD AS IMAGE'}
        </button>

        {/* Copy link */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1, background: '#0a0a14', border: '1px solid #2a2a3e',
            borderRadius: 6, padding: '10px 14px',
            fontSize: 11, color: '#556677', fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {shareUrl || 'Generate link to copy...'}
          </div>
          <button onClick={handleCopyLink} disabled={copying} style={{
            padding: '10px 18px', borderRadius: 6, cursor: 'pointer',
            background: copied ? '#00ff8811' : '#aa66ff11',
            border: `1px solid ${copied ? '#00ff8844' : '#aa66ff44'}`,
            color: copied ? '#00ff88' : '#aa66ff',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.08em', whiteSpace: 'nowrap',
            opacity: copying ? 0.6 : 1,
          }}>
            {copied ? '✓ COPIED' : copying ? '...' : '🔗 COPY LINK'}
          </button>
        </div>

        {linkError && (
          <div style={{ fontSize: 11, color: '#ff444488' }}>{linkError}</div>
        )}

        {/* Social share buttons */}
        <div>
          <div style={{ fontSize: 10, color: '#445', letterSpacing: '0.1em', marginBottom: 10 }}>SHARE TO</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { key: 'twitter',  label: '𝕏 Twitter',  color: '#1da1f2' },
              { key: 'whatsapp', label: '💬 WhatsApp', color: '#25d366' },
              { key: 'telegram', label: '✈ Telegram', color: '#0088cc' },
              { key: 'linkedin', label: 'in LinkedIn', color: '#0077b5' },
            ].map(p => (
              <button key={p.key} onClick={() => handleShare(p.key)} style={{
                flex: 1, padding: '10px 6px', borderRadius: 6, cursor: 'pointer',
                background: `${p.color}11`, border: `1px solid ${p.color}33`,
                color: p.color, fontFamily: 'inherit', fontSize: 11,
                fontWeight: 700, letterSpacing: '0.05em',
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 10, color: '#2a2a3e', textAlign: 'center' }}>
          Share links expire after 90 days · quaint-signal.tech
        </div>
      </div>
    </div>
  );
}