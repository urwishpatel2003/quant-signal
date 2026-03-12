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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {macroNews?.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 12 }}>🌍 MACRO & GEO NEWS</div>
          {macroNews.slice(0, 8).map((n, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #1a1a26' }}>
              <div style={{ fontSize: 10, color: '#ffaa0066', marginBottom: 4, letterSpacing: '0.1em' }}>
                {n.topic?.split(' ').slice(0, 3).join(' ')?.toUpperCase()}
              </div>
              {n.url ? (
                <a href={n.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#aab', fontSize: 12, lineHeight: 1.5, textDecoration: 'none' }}
                  onMouseEnter={ev => ev.target.style.color = '#ffaa00'}
                  onMouseLeave={ev => ev.target.style.color = '#aab'}>
                  {n.title}
                </a>
              ) : (
                <div style={{ color: '#aab', fontSize: 12, lineHeight: 1.5 }}>{n.title}</div>
              )}
              {n.publisher && <div style={{ fontSize: 10, color: '#445', marginTop: 3 }}>{n.publisher}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
