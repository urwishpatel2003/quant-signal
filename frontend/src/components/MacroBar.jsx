export default function MacroBar({ bonds, intlMarkets, macroNews, loading }) {
  if (loading && !bonds) return (
    <div className="pulse" style={{ fontSize: 10, color: '#ffaa0044', padding: '4px 0' }}>
      LOADING MACRO...
    </div>
  );
  if (!bonds) return null;

  const find = sym => intlMarkets?.find(m => m.symbol === sym);
  const Div  = () => <div style={{ width: 1, height: 14, background: '#2a2a3a', flexShrink: 0 }} />;

  const Stat = ({ label, val, color, alert }) => (
    <div style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
      <span style={{ color: '#445' }}>{label} </span>
      <span style={{ color: alert ? '#ff4444' : color, fontWeight: 600 }}>{val}</span>
      {alert && <span style={{ color: '#ff444466', fontSize: 9 }}> ⚠</span>}
    </div>
  );

  const Mkt = ({ label, sym }) => {
    const d = find(sym);
    return d?.current ? (
      <div style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
        <span style={{ color: '#445' }}>{label} </span>
        <span style={{ color: d.changePct >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
          {d.changePct >= 0 ? '▲' : '▼'}{Math.abs(d.changePct)?.toFixed(2)}%
        </span>
      </div>
    ) : null;
  };

  const vix  = find('^VIX');
  const gold = find('GC=F');
  const isYahoo = bonds.isYahoo;

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center',
      overflowX: 'auto', flex: 1, justifyContent: 'flex-end',
      scrollbarWidth: 'none',
    }}>
      <div style={{ fontSize: 9, color: '#ffaa0055', letterSpacing: '0.15em', flexShrink: 0 }}>MACRO</div>

      {isYahoo ? (
        <>
          <Stat label="10Y"
            val={bonds.tnx?.current ? `${bonds.tnx.current.toFixed(2)}%` : '—'}
            color={bonds.tnx?.changePct > 0 ? '#ff6666' : '#00ff88'}
            alert={bonds.inverted} />
          <Stat label="CURVE"
            val={bonds.yieldCurve ? `${bonds.yieldCurve}%` : '—'}
            color={parseFloat(bonds.yieldCurve) > 0 ? '#00ff88' : '#ff4444'}
            alert={bonds.inverted} />
        </>
      ) : (
        <>
          <Stat label="TLT"
            val={bonds.tlt?.current ? `$${bonds.tlt.current.toFixed(2)}` : '—'}
            color={bonds.tlt?.changePct > 0 ? '#00ff88' : '#ff4444'} />
          <Stat label="CURVE"
            val={bonds.inverted ? 'INV' : 'NORM'}
            color={bonds.inverted ? '#ff4444' : '#00ff88'}
            alert={bonds.inverted} />
        </>
      )}

      <Div />
      <Mkt label="N225" sym="^N225" />
      <Mkt label="HSI"  sym="^HSI"  />
      <Mkt label="DAX"  sym="^GDAXI" />
      <Div />

      {vix?.current && (
        <Stat label="VIX"
          val={vix.current.toFixed(2)}
          color={vix.current > 25 ? '#ff4444' : vix.current > 20 ? '#ffaa00' : '#00ff88'} />
      )}
      {gold?.current && (
        <Stat label="GOLD"
          val={`$${gold.current.toFixed(2)}`}
          color={gold.changePct > 0 ? '#00ff88' : '#ff4444'} />
      )}
      <Mkt label="OIL" sym="CL=F" />
    </div>
  );
}