export default function BondPanel({ bonds }) {
  if (!bonds) return null;
  return (
    <div className="card">
      <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 10 }}>📊 BOND MARKET</div>
      {[
        ['10Y YIELD',   `${bonds.tnx?.current?.toFixed(2)}%`, bonds.tnx?.changePct > 0 ? '#ff4444' : '#00ff88', `${bonds.tnx?.changePct > 0 ? '▲' : '▼'}${Math.abs(bonds.tnx?.changePct)?.toFixed(2)}%`],
        ['2Y YIELD',    `${bonds.irx?.current?.toFixed(2)}%`, '#c8c8d0', ''],
        ['30Y YIELD',   `${bonds.tyx?.current?.toFixed(2)}%`, '#c8c8d0', ''],
        ['YIELD CURVE', `${bonds.yieldCurve}%`,               bonds.inverted ? '#ff4444' : '#00ff88', bonds.inverted ? '⚠ INVERTED' : 'NORMAL'],
        ['TLT (20Y)',   `$${bonds.tlt?.current?.toFixed(2)}`, bonds.tlt?.changePct > 0 ? '#00ff88' : '#ff4444', `${bonds.tlt?.changePct > 0 ? '▲' : '▼'}${Math.abs(bonds.tlt?.changePct)?.toFixed(2)}%`],
        ['IEF (7-10Y)', `$${bonds.ief?.current?.toFixed(2)}`, bonds.ief?.changePct > 0 ? '#00ff88' : '#ff4444', ''],
      ].map(([k, v, c, sub]) => (
        <div className="kv" key={k}>
          <span className="kv-key">{k}</span>
          <span style={{ textAlign: 'right' }}>
            <span style={{ color: c, fontSize: 11, fontWeight: 500 }}>{v}</span>
            {sub && <span style={{ color: c, fontSize: 9, marginLeft: 4 }}>{sub}</span>}
          </span>
        </div>
      ))}
      {bonds.inverted && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#ff444488', borderLeft: '2px solid #ff444433', paddingLeft: 8, lineHeight: 1.5 }}>
          ⚠ Inverted curve — historical recession signal. Favors puts &amp; defensive plays.
        </div>
      )}
    </div>
  );
}
