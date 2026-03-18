export default function UpgradeModal({ type, onClose }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(7,7,14,0.92)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ background: '#0f0f18', border: '1px solid #ffaa0044', padding: 32,
        maxWidth: 400, width: '100%', textAlign: 'center' }}>

        <div style={{ fontSize: 32, marginBottom: 16 }}>⚡</div>

        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28,
          color: '#ffaa00', marginBottom: 8 }}>
          DAILY LIMIT REACHED
        </div>

        <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 24 }}>
          You've used all your free {type === 'scan' ? 'scans' : 'options analyses'} for today.
          <br />Limits reset at midnight.
        </div>

        <div style={{ background: '#070710', border: '1px solid #ffaa0022',
          padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
          <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 12 }}>
            PRO PLAN — $15/mo
          </div>
          {[
            'Unlimited scans & options analyses',
            'All 4 timeframes unlocked',
            'Priority AI processing',
            'Early access to new features',
          ].map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '4px 0',
              display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: '#00ff88' }}>✓</span>{f}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <button className="btn" style={{ width: '100%', fontSize: 14, padding: '14px' }}
            onClick={() => alert('Stripe coming soon! Check back in a few days.')}>
            UPGRADE TO PRO →
          </button>
          <button className="btn-sm" onClick={onClose}
            style={{ width: '100%', fontSize: 12, padding: '10px' }}>
            MAYBE LATER — WAIT UNTIL TOMORROW
          </button>
        </div>

        <div style={{ fontSize: 10, color: '#7788aa', marginTop: 16 }}>
          Free plan resets daily at midnight · No credit card required to start
        </div>
      </div>
    </div>
  );
}