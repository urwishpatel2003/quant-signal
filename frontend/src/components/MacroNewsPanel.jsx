const TOPIC_LABELS = {
  'geopolitical risk war conflict':        '🌍 GEO',
  'Federal Reserve interest rates policy': '🏦 FED',
  'US Treasury bonds yield curve':         '📊 BONDS',
  'trade war tariffs sanctions':           '⚔️ TRADE',
  'China economy slowdown':               '🇨🇳 CHINA',
  'Japan Bank of Japan yen':              '🇯🇵 BOJ',
  'India economy growth RBI':             '🇮🇳 RBI',
  'Europe ECB recession':                 '🇪🇺 ECB',
};

export default function MacroNewsPanel({ macroNews, calendar }) {
  if (!macroNews?.length && !calendar?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {calendar?.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 10, color: '#ff884466', letterSpacing: '0.15em', marginBottom: 10 }}>📅 ECONOMIC CALENDAR</div>
          {calendar.slice(0, 5).map((e, i) => (
            <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid #1a1208', fontSize: 10 }}>
              <div style={{ color: '#ffaa0077', fontSize: 9, marginBottom: 2 }}>{e.category?.split(' ').slice(0, 3).join(' ')?.toUpperCase()}</div>
              <div style={{ color: '#aab', lineHeight: 1.4 }}>{e.title}</div>
            </div>
          ))}
        </div>
      )}
      {macroNews?.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 10 }}>🌍 MACRO & GEO NEWS</div>
          {macroNews.slice(0, 7).map((n, i) => (
            <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid #1a1a26', fontSize: 10 }}>
              <div style={{ color: '#ffaa0055', fontSize: 9, marginBottom: 2 }}>{TOPIC_LABELS[n.topic] || n.topic?.split(' ').slice(0, 2).join(' ')?.toUpperCase()}</div>
              <div style={{ color: '#aab', lineHeight: 1.4 }}>{n.title}</div>
              <div style={{ color: '#334', fontSize: 9, marginTop: 2 }}>{n.publisher}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
