import { useEffect, useRef } from 'react';

export default function MacroBar({ bonds, intlMarkets, macroNews, loading }) {
  const scrollRef = useRef(null);

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

    // Pause on hover/touch
    const pause = () => cancelAnimationFrame(animId);
    const resume = () => { animId = requestAnimationFrame(tick); };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('touchstart', pause);
    el.addEventListener('touchend', resume);

    return () => {
      cancelAnimationFrame(animId);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', resume);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('touchend', resume);
    };
  }, [bonds, intlMarkets]);

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
      <span style={{ color: '#8899bb' }}>{label} </span>
      <span style={{ color: alert ? '#ff4444' : color, fontWeight: 600 }}>{val}</span>
      {alert && <span style={{ color: '#ff444466', fontSize: 9 }}> ⚠</span>}
    </div>
  );

  const Mkt = ({ label, sym }) => {
    const d = find(sym);
    return d?.current ? (
      <div style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
        <span style={{ color: '#8899bb' }}>{label} </span>
        <span style={{ color: d.changePct >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
          {d.changePct >= 0 ? '▲' : '▼'}{Math.abs(d.changePct)?.toFixed(2)}%
        </span>
      </div>
    ) : null;
  };

  const vix   = find('^VIX');
  const gold  = find('GC=F');
  const oil   = find('CL=F');
  const dxy   = find('DX-Y.NYB');
  const isYahoo = bonds.isYahoo;

  // Build items array — duplicated for infinite scroll effect
  const items = (
    <>
      <div style={{ fontSize: 9, color: '#ffaa0055', letterSpacing: '0.15em', flexShrink: 0 }}>MACRO</div>
      <Div />
      {isYahoo ? (
        <>
          <Stat label="10Y" val={bonds.tnx?.current ? `${bonds.tnx.current.toFixed(2)}%` : '—'} color={bonds.tnx?.changePct > 0 ? '#ff6666' : '#00ff88'} alert={bonds.inverted} />
          <Stat label="2Y"  val={bonds.irx?.current ? `${bonds.irx.current.toFixed(2)}%` : '—'} color="#c8c8d0" />
          <Stat label="CURVE" val={bonds.yieldCurve ? `${bonds.yieldCurve}%` : '—'} color={parseFloat(bonds.yieldCurve) > 0 ? '#00ff88' : '#ff4444'} alert={bonds.inverted} />
        </>
      ) : (
        <>
          <Stat label="TLT"   val={bonds.tlt?.current ? `$${bonds.tlt.current.toFixed(2)}` : '—'} color={bonds.tlt?.changePct > 0 ? '#00ff88' : '#ff4444'} />
          <Stat label="IEF"   val={bonds.ief?.current ? `$${bonds.ief.current.toFixed(2)}` : '—'} color={bonds.ief?.changePct > 0 ? '#00ff88' : '#ff4444'} />
          <Stat label="CURVE" val={bonds.inverted ? 'INV' : 'NORM'} color={bonds.inverted ? '#ff4444' : '#00ff88'} alert={bonds.inverted} />
        </>
      )}
      <Div />
      <Mkt label="N225"  sym="^N225"     />
      <Mkt label="HSI"   sym="^HSI"      />
      <Mkt label="DAX"   sym="^GDAXI"    />
      <Mkt label="FTSE"  sym="^FTSE"     />
      <Mkt label="CAC"   sym="^FCHI"     />
      <Mkt label="INDIA" sym="^BSESN"    />
      <Div />
      {vix?.current  && <Stat label="VIX"  val={vix.current.toFixed(2)}    color={vix.current > 25 ? '#ff4444' : vix.current > 20 ? '#ffaa00' : '#00ff88'} />}
      {gold?.current && <Stat label="GOLD" val={`$${gold.current.toFixed(2)}`} color={gold.changePct > 0 ? '#00ff88' : '#ff4444'} />}
      {oil?.current  && <Stat label="OIL"  val={`$${oil.current.toFixed(2)}`}  color={oil.changePct  > 0 ? '#00ff88' : '#ff4444'} />}
      {dxy?.current  && <Stat label="DXY"  val={dxy.current.toFixed(2)}    color={dxy.changePct  > 0 ? '#ff4444' : '#00ff88'} />}
      <Div />
    </>
  );

  return (
    <div
      ref={scrollRef}
      style={{
        display: 'flex', gap: 16, alignItems: 'center',
        overflowX: 'hidden', flex: 1,
        scrollbarWidth: 'none', cursor: 'default',
        userSelect: 'none',
      }}
    >
      {/* Duplicate content for seamless infinite scroll */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
        {items}
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }} aria-hidden>
        {items}
      </div>
    </div>
  );
}