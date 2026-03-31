export default function UsageBadge({ used, limit, label, plan }) {
  const isPro      = plan === 'pro' || limit >= 999;
  const remaining  = limit - used;
  const pct        = (used / limit) * 100;
  const color      = remaining === 0 ? '#ff4444' : remaining <= 2 ? '#ffaa00' : '#00ff88';

  if (isPro) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: '#8899bb', letterSpacing: '0.1em' }}>{label}</div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#ffaa00',
          background: '#ffaa0011', border: '1px solid #ffaa0033',
          padding: '2px 8px', borderRadius: 2, letterSpacing: '0.1em',
        }}>
          PRO ∞
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <div style={{ fontSize: 9, color: '#8899bb', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: limit }).map((_, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i < used ? color : '#2a2a3e',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 10, color, fontWeight: 600 }}>
        {used}/{limit}
      </div>
    </div>
  );
}