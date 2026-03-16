export default function UsageBadge({ used, limit, label }) {
  const remaining = limit - used;
  const pct       = (used / limit) * 100;
  const color     = remaining === 0 ? '#ff4444' : remaining === 1 ? '#ffaa00' : '#00ff88';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.1em' }}>{label}</div>
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