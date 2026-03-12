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
      <div style={{ fontSize: 10, color: '#ff884466', letterSpacing: '0.15em', marginBottom: 12 }}>📅 ECONOMIC CALENDAR</div>
      {calendar.slice(0, 10).map((e, i) => {
        const { impact, color, icon } = getImpact(e.title);
        return (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #1a1208', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#aab', lineHeight: 1.4 }}>{e.title}</div>
              <div style={{ fontSize: 9, color: '#445', marginTop: 2 }}>{e.publisher}</div>
            </div>
            <span style={{ fontSize: 9, color, border: `1px solid ${color}44`, padding: '2px 6px', whiteSpace: 'nowrap' }}>{impact}</span>
          </div>
        );
      })}
    </div>
  );
}
