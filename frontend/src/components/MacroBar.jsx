import { useEffect, useRef } from 'react';

export default function MacroBar({ bonds, intlMarkets, macroNews, loading, market = 'US' }) {
  const scrollRef = useRef(null);
  const isIndia   = market === 'INDIA';

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pos = 0;
    const speed = 0.5;
    let animId;
    const tick = () => {
      pos += speed;
      if (pos >= el.scrollWidth / 2) pos = 0;
      el.scrollLeft = pos;
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    const pause  = () => cancelAnimationFrame(animId);
    const resume = () => { animId = requestAnimationFrame(tick); };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('touchstart', pause);
    el.addEventListener('touchend',   resume);
    return () => {
      cancelAnimationFrame(animId);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', resume);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('touchend',   resume);
    };
  }, [bonds, intlMarkets]);

  if (loading && !bonds) return (
    <div className="pulse" style={{ fontSize: 11, color: '#ffaa0066', padding: '4px 0' }}>
      LOADING MACRO...
    </div>
  );
  if (!bonds) return null;

  const find = sym => intlMarkets?.find(m => m.symbol === sym);

  const Div = () => (
    <div style={{ width: 1, height: 16, background: '#3a3a5e', flexShrink: 0, margin: '0 4px' }} />
  );

  const Stat = ({ label, val, color, alert }) => (
    <div style={{ fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#c8d0e8', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ color: alert ? '#ff4444' : color, fontWeight: 700 }}>{val}</span>
      {alert && <span style={{ color: '#ff4444', fontSize: 10 }}>⚠</span>}
    </div>
  );

  const Mkt = ({ label, sym }) => {
    const d = find(sym);
    if (!d?.current) return null;
    const isUp = d.changePct >= 0;
    return (
      <div style={{ fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#c8d0e8', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ color: isUp ? '#00ff88' : '#ff4444', fontWeight: 700 }}>
          {isUp ? '▲' : '▼'}{Math.abs(d.changePct)?.toFixed(2)}%
        </span>
      </div>
    );
  };

  const vix  = find('^VIX');
  const gold = find('GC=F');
  const oil  = find('CL=F');
  const dxy  = find('DX-Y.NYB');

  // ── India macro items ──
  const indiaItems = (
    <>
      <div style={{ fontSize: 10, color: '#ff9a00', letterSpacing: '0.2em', fontWeight: 700, flexShrink: 0 }}>
        🇮🇳 MACRO
      </div>
      <Div />
      {/* Indian indices */}
      <Mkt label="NIFTY"  sym="^BSESN" />
      <Mkt label="SENSEX" sym="^BSESN" />
      <Mkt label="N225"   sym="^N225"  />
      <Mkt label="HSI"    sym="^HSI"   />
      <Div />
      {/* Commodities in ₹ context */}
      {gold?.current && (
        <Stat label="GOLD"    val={`$${gold.current.toFixed(0)}`}
          color={gold.changePct > 0 ? '#00ff88' : '#ff4444'} />
      )}
      {oil?.current && (
        <Stat label="CRUDE"   val={`$${oil.current.toFixed(2)}`}
          color={oil.changePct > 0 ? '#00ff88' : '#ff4444'} />
      )}
      {/* USD/INR — DXY as proxy */}
      {dxy?.current && (
        <Stat label="USD/INR" val={`~${(dxy.current * 0.84).toFixed(1)}`}
          color={dxy.changePct > 0 ? '#ff4444' : '#00ff88'} />
      )}
      <Div />
      {/* VIX — global risk signal relevant for India too */}
      {vix?.current && (
        <Stat label="VIX"     val={vix.current.toFixed(2)}
          color={vix.current > 25 ? '#ff4444' : vix.current > 20 ? '#ffaa00' : '#00ff88'} />
      )}
      {/* Global markets */}
      <Mkt label="DAX"    sym="^GDAXI" />
      <Mkt label="FTSE"   sym="^FTSE"  />
      <Div />
    </>
  );

  // ── US macro items ──
  const usItems = (
    <>
      <div style={{ fontSize: 10, color: '#ffaa00', letterSpacing: '0.2em', fontWeight: 700, flexShrink: 0 }}>
        MACRO
      </div>
      <Div />
      {bonds.isYahoo ? (
        <>
          <Stat label="10Y"   val={bonds.tnx?.current ? `${bonds.tnx.current.toFixed(2)}%` : '—'}
            color={bonds.tnx?.changePct > 0 ? '#ff6666' : '#00ff88'} alert={bonds.inverted} />
          <Stat label="2Y"    val={bonds.irx?.current ? `${bonds.irx.current.toFixed(2)}%` : '—'}
            color="#e8e8f0" />
          <Stat label="CURVE" val={bonds.yieldCurve ? `${bonds.yieldCurve}%` : '—'}
            color={parseFloat(bonds.yieldCurve) > 0 ? '#00ff88' : '#ff4444'} alert={bonds.inverted} />
        </>
      ) : (
        <>
          <Stat label="TLT"   val={bonds.tlt?.current ? `$${bonds.tlt.current.toFixed(2)}` : '—'}
            color={bonds.tlt?.changePct > 0 ? '#00ff88' : '#ff4444'} />
          <Stat label="IEF"   val={bonds.ief?.current ? `$${bonds.ief.current.toFixed(2)}` : '—'}
            color={bonds.ief?.changePct > 0 ? '#00ff88' : '#ff4444'} />
          <Stat label="CURVE" val={bonds.inverted ? 'INV' : 'NORM'}
            color={bonds.inverted ? '#ff4444' : '#00ff88'} alert={bonds.inverted} />
        </>
      )}
      <Div />
      <Mkt label="N225"  sym="^N225"  />
      <Mkt label="HSI"   sym="^HSI"   />
      <Mkt label="DAX"   sym="^GDAXI" />
      <Mkt label="FTSE"  sym="^FTSE"  />
      <Mkt label="CAC"   sym="^FCHI"  />
      <Mkt label="INDIA" sym="^BSESN" />
      <Div />
      {vix?.current  && <Stat label="VIX"  val={vix.current.toFixed(2)}
        color={vix.current > 25 ? '#ff4444' : vix.current > 20 ? '#ffaa00' : '#00ff88'} />}
      {gold?.current && <Stat label="GOLD" val={`$${gold.current.toFixed(2)}`}
        color={gold.changePct > 0 ? '#00ff88' : '#ff4444'} />}
      {oil?.current  && <Stat label="OIL"  val={`$${oil.current.toFixed(2)}`}
        color={oil.changePct  > 0 ? '#00ff88' : '#ff4444'} />}
      {dxy?.current  && <Stat label="DXY"  val={dxy.current.toFixed(2)}
        color={dxy.changePct  > 0 ? '#ff4444' : '#00ff88'} />}
      <Div />
    </>
  );

  const items = isIndia ? indiaItems : usItems;

  return (
    <div
      ref={scrollRef}
      style={{
        display: 'flex', gap: 16, alignItems: 'center',
        overflowX: 'hidden', flex: 1,
        scrollbarWidth: 'none', cursor: 'default',
        userSelect: 'none', padding: '0 12px',
      }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
        {items}
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }} aria-hidden>
        {items}
      </div>
    </div>
  );
}