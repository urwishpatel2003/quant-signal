import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useMarket } from '../context/MarketContext';

const BASE = import.meta.env.VITE_API_BASE;

const TYPE_COPY = {
  scan:      { title: 'SCAN LIMIT REACHED',     desc: 'You\'ve used your free scans for today. Upgrade to Pro for unlimited stock scans across all timeframes.' },
  options:   { title: 'OPTIONS LIMIT REACHED',  desc: 'You\'ve used your free options analyses for today. Upgrade to Pro for unlimited options plays with exact entry, exit, and stop loss.' },
  watchlist: { title: 'WATCHLIST LIMIT REACHED', desc: 'Free tier allows 5 watchlist items per market. Upgrade to Pro for unlimited US and India watchlist tracking.' },
};

export default function UpgradeModal({ type = 'scan', onClose }) {
  const { user }   = useUser();
  const { market } = useMarket();
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState('');
  const isIndia = market === 'INDIA';
  const copy    = TYPE_COPY[type] || TYPE_COPY.scan;

  const handleUpgrade = async () => {
    if (!user?.id) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${BASE}/stripe/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.primaryEmailAddress?.emailAddress, market }),
      });
      const data = await res.json();
      if (data.alreadyPro) { onClose(); return; }
      if (data.error) throw new Error(data.error);
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const accentColor = isIndia ? '#ff9a00' : '#ffaa00';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0f0f1a', border: `1px solid ${accentColor}44`,
        borderTop: `3px solid ${accentColor}`,
        borderRadius: 6, padding: 'clamp(24px,4vw,40px)',
        maxWidth: 480, width: '100%',
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        {/* Header */}
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(22px,4vw,30px)',
          color: accentColor, marginBottom: 10 }}>
          {copy.title}
        </div>
        <div style={{ fontSize: 13, color: '#99aacc', lineHeight: 1.7, marginBottom: 24 }}>
          {copy.desc}
        </div>

        {/* Price highlight */}
        <div style={{ background: accentColor + '11', border: `1px solid ${accentColor}33`,
          borderRadius: 4, padding: '16px 20px', marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: accentColor, letterSpacing: '0.15em', marginBottom: 6 }}>
            {isIndia ? 'PRO — INDIA 🇮🇳' : 'PRO PLAN'}
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif",
            fontSize: 'clamp(36px,6vw,48px)', color: accentColor, lineHeight: 1 }}>
            {isIndia ? '₹249' : '$5'}<span style={{ fontSize: 18 }}>/mo</span>
          </div>
          <div style={{ fontSize: 11, color: '#7788aa', marginTop: 4 }}>
            No commitment · Cancel anytime
          </div>
        </div>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {(isIndia ? [
            'Unlimited stock scans — Nifty 500',
            'Unlimited India watchlist',
            'RBI / FII / Budget macro context',
            'All 4 timeframes',
            'Priority signal processing',
          ] : [
            'Unlimited stock scans',
            'Unlimited options analyses',
            'Unlimited US & India watchlist',
            'All 4 timeframes',
            'Priority signal processing',
          ]).map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center',
              fontSize: 12, color: '#b0c0dd' }}>
              <span style={{ color: accentColor }}>✓</span>{f}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#ff4444', marginBottom: 16,
            background: '#ff444411', border: '1px solid #ff444433',
            padding: '8px 12px', borderRadius: 3 }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button onClick={handleUpgrade} disabled={loading} style={{
          width: '100%', padding: '14px',
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: 14, fontWeight: 700, letterSpacing: '0.1em',
          background: accentColor + '22', border: `1px solid ${accentColor}`,
          color: accentColor, cursor: loading ? 'not-allowed' : 'pointer',
          borderRadius: 3, marginBottom: 10, opacity: loading ? 0.6 : 1,
        }}>
          {loading ? 'REDIRECTING...' : `UPGRADE TO PRO ${isIndia ? '· ₹249/mo' : '· $5/mo'} →`}
        </button>

        <button onClick={onClose} style={{
          width: '100%', padding: '10px',
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: 12, background: 'none', border: '1px solid #2a2a3e',
          color: '#7788aa', cursor: 'pointer', borderRadius: 3,
        }}>
          MAYBE LATER
        </button>
      </div>
    </div>
  );
}