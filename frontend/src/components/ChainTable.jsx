export default function ChainTable({ chain, selectedExpiry, livePrice }) {
  if (!chain) return null;
  return (
    <div className="card fade-in">
      <div style={{ fontSize: 10, color: '#8899bb', marginBottom: 2 }}>ATM CHAIN — {selectedExpiry}</div>
      <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 6 }}>near ${livePrice?.toFixed(2)} | STRIKE BID ASK MID IV Δ OI</div>
      {[['CALLS', chain.topCalls, '#00ff8866', '#0a1a0a'], ['PUTS', chain.topPuts, '#ff444466', '#1a0a0a']].map(([label, contracts, color, bg]) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color, marginBottom: 3 }}>{label}</div>
          {contracts?.slice(0, 5).map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '45px 35px 35px 38px 35px 38px 35px', gap: 2, fontSize: 9, padding: '3px 0', borderBottom: `1px solid ${bg}` }}>
              <span style={{ color: c.inTheMoney ? (label === 'CALLS' ? '#00ff88' : '#ff4444') : '#aabbcc' }}>${c.strike}</span>
              <span style={{ color: '#ff6666' }}>${c.bid}</span>
              <span style={{ color: '#66ff88' }}>${c.ask}</span>
              <span style={{ color: '#ffaa00', fontWeight: 600 }}>${c.mid}</span>
              <span style={{ color: '#99aacc' }}>{c.iv}%</span>
              <span style={{ color: '#8899bb' }}>{c.delta}</span>
              <span style={{ color: '#7788aa' }}>{c.oi > 999 ? `${(c.oi / 1000).toFixed(1)}k` : c.oi}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
