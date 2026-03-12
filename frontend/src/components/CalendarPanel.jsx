const IMPACT_MAP = {
  'fed fomc':         { impact: 'HIGH',   color: '#ff4444', icon: '🏦' },
  'cpi':              { impact: 'HIGH',   color: '#ff4444', icon: '📈' },
  'nonfarm payroll':  { impact: 'HIGH',   color: '#ff4444', icon: '💼' },
  'gdp':              { impact: 'HIGH',   color: '#ff4444', icon: '📊' },
  'ecb':              { impact: 'MEDIUM', color: '#ffaa00', icon: '🇪🇺' },
  'bank of japan':    { impact: 'MEDIUM', color: '#ffaa00', icon: '🇯🇵' },
  'pmi':              { impact: 'MEDIUM', color: '#ffaa00', icon: '🏭' },
  'earnings':         { impact: 'MEDIUM', color: '#ffaa00', icon: '💰' },
};

function getImpact(text) {
  const lower = (text || '').toLowerCase();
  for (const [key, val] of Object.entries(IMPACT_MAP)) {
    if (lower.includes(key)) return val;
  }
  return { impact: 'LOW', color: '#00ff88', icon: '📌' };
}

export default function CalendarPanel({ calendar }) {
  if (!calendar?.length) return null;
  return (
    <div className="card">
      <div style={{ fontSize: 11, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 12 }}>📅 ECONOMIC CALENDAR</div>
      {calendar.slice(0, 8).map((e, i) => (
        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #1a1a26' }}>
          <div style={{ fontSize: 10, color: '#ffaa0088', marginBottom: 4, letterSpacing: '0.1em' }}>
            {e.category?.split(' ').slice(0, 3).join(' ')?.toUpperCase()}
          </div>
          {e.url ? (
            <a href={e.url} target="_blank" rel="noopener noreferrer"
              style={{ color: '#aab', fontSize: 12, lineHeight: 1.5, textDecoration: 'none', cursor: 'pointer' }}
              onMouseEnter={ev => ev.target.style.color = '#ffaa00'}
              onMouseLeave={ev => ev.target.style.color = '#aab'}>
              {e.title}
            </a>
          ) : (
            <div style={{ color: '#aab', fontSize: 12, lineHeight: 1.5 }}>{e.title}</div>
          )}
          {e.publisher && <div style={{ fontSize: 10, color: '#445', marginTop: 3 }}>{e.publisher}</div>}
        </div>
      ))}
    </div>
  );
}