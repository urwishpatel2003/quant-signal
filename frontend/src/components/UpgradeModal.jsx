import { useUser } from '@clerk/clerk-react';

const BASE = import.meta.env.VITE_API_BASE;

export default function UpgradeModal({ type, onClose }) {
  const { user } = useUser();

  const handleUpgrade = async () => {
    try {
      const res  = await fetch(`${BASE}/stripe/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          email:  user?.primaryEmailAddress?.emailAddress,
        }),
      });
      const data = await res.json();
      if (data.alreadyPro) { onClose(); return; }
      if (data.url) window.location.href = data.url;
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(7,7,14,0.92)', backdropFilter: 'blur(6px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#0f0f1a', border: '1px solid #ffaa0044',
        padding: 32, maxWidth: 400, width: '100%', textAlign: 'center',
      }}>
        {/* Icon */}
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚡</div>

        {/* Title */}
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32,
          color: '#ffaa00', marginBottom: 8 }}>
          UPGRADE TO PRO
        </div>

        {/* Message */}
        <div style={{ fontSize: 13, color: '#b0c0dd', marginBottom: 24, lineHeight: 1.6 }}>
          {type === 'scan'
            ? "You've used all 10 free scans today."
            : "You've used all 5 free options analyses today."}
          <br />
          Upgrade to Pro for unlimited access.
        </div>

        {/* Features */}
        <div style={{ background: '#070710', padding: 16, marginBottom: 24, textAlign: 'left' }}>
          {[
            '✅ Unlimited stock scans',
            '✅ Unlimited options analyses',
            '✅ All 4 timeframes',
            '✅ Full indicator suite',
            '✅ Priority AI processing',
          ].map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: '#d0d8f0', padding: '4px 0',
              borderBottom: i < 4 ? '1px solid #1a1a2e' : 'none' }}>{f}</div>
          ))}
        </div>

        {/* Price */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: '#ffaa00' }}>$5</span>
          <span style={{ fontSize: 14, color: '#b0c0dd' }}>/month</span>
        </div>

        {/* CTA */}
        <button className="btn" onClick={handleUpgrade}
          style={{ width: '100%', fontSize: 15, padding: '14px', marginBottom: 12 }}>
          UPGRADE NOW →
        </button>

        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: '#7788aa', fontSize: 12, fontFamily: 'inherit' }}>
          Maybe later
        </button>

        <div style={{ fontSize: 10, color: '#556', marginTop: 16 }}>
          Secure payment via Stripe · Cancel anytime
        </div>
      </div>
    </div>
  );
}