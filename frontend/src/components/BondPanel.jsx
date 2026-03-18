export default function BondPanel({ bonds }) {
  if (!bonds) return null;

  const isYahoo = bonds.isYahoo;
  const fmt = (v, isYield) => {
    if (v == null) return '—';
    return isYield ? `${v.toFixed(2)}%` : `$${v.toFixed(2)}`;
  };
  const col = v => v > 0 ? '#ff4444' : '#00ff88'; // rising yields = bearish for bonds
  const pct = v => v != null ? `${v >= 0 ? '▲' : '▼'}${Math.abs(v).toFixed(2)}%` : '';

  return (
    <div className="card">
      <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 10 }}>
        📊 BOND MARKET
        <span style={{ fontSize: 8, color: '#7788aa', marginLeft: 6 }}>
          {isYahoo ? '(LIVE YIELDS)' : '(ETF PRICES)'}
        </span>
      </div>

      {isYahoo ? (
        // Real yield display
        <>
          {[
            ['10Y YIELD',   bonds.tnx, true],
            ['2Y YIELD',    bonds.irx, true],
            ['30Y YIELD',   bonds.tyx, true],
            ['TLT (20Y)',   bonds.tlt, false],
            ['IEF (7-10Y)', bonds.ief, false],
          ].map(([k, d, isYield]) => (
            <div className="kv" key={k}>
              <span className="kv-key">{k}</span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ color: isYield ? col(d?.changePct) : (d?.changePct > 0 ? '#00ff88' : '#ff4444'), fontSize: 11, fontWeight: 500 }}>
                  {fmt(d?.current, isYield)}
                </span>
                {d?.changePct != null && (
                  <span style={{ fontSize: 9, marginLeft: 4, color: '#aabbcc' }}>{pct(d.changePct)}</span>
                )}
              </span>
            </div>
          ))}
          <div className="kv">
            <span className="kv-key">YIELD CURVE</span>
            <span style={{ color: bonds.inverted ? '#ff4444' : '#00ff88', fontSize: 11, fontWeight: 500 }}>
              {bonds.yieldCurve}% {bonds.inverted ? '⚠ INVERTED' : 'NORMAL'}
            </span>
          </div>
        </>
      ) : (
        // ETF price display
        <>
          {[
            ['TLT (20Y)',   bonds.tlt],
            ['IEF (7-10Y)', bonds.ief],
            ['SHY (1-3Y)',  bonds.irx],
          ].map(([k, d]) => (
            <div className="kv" key={k}>
              <span className="kv-key">{k}</span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ color: d?.changePct > 0 ? '#00ff88' : '#ff4444', fontSize: 11, fontWeight: 500 }}>
                  {fmt(d?.current, false)}
                </span>
                {d?.changePct != null && (
                  <span style={{ fontSize: 9, marginLeft: 4, color: '#aabbcc' }}>{pct(d.changePct)}</span>
                )}
              </span>
            </div>
          ))}
          <div className="kv">
            <span className="kv-key">YIELD CURVE</span>
            <span style={{ color: bonds.inverted ? '#ff4444' : '#00ff88', fontSize: 11, fontWeight: 500 }}>
              {bonds.inverted ? '⚠ INVERTED' : 'NORMAL'}
            </span>
          </div>
        </>
      )}

      {bonds.inverted && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#ff444488', borderLeft: '2px solid #ff444433', paddingLeft: 8, lineHeight: 1.5 }}>
          ⚠ Inverted curve — historical recession signal. Favors puts & defensive plays.
        </div>
      )}
    </div>
  );
}