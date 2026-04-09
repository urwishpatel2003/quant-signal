import { useState, useEffect, useCallback } from 'react';
import SocialBubbleChart      from '../components/SocialBubbleChart';
import UnusualActivityPanel   from '../components/UnusualActivityPanel';
import SectorRotationPanel    from '../components/SectorRotationPanel';

const BASE = import.meta.env.VITE_API_BASE;

// ── Shared helpers ────────────────────────────────────────────────────────────





// ── India macro tiles ────────────────────────────────────────────────────────
function IndiaMacroBar({ macro }) {
  if (!macro) return null;
  const { usdInr, crude, gold, india10Y, sectors } = macro;

  const tiles = [
    { label:'USD/INR',   value: usdInr?.price   ? `₹${usdInr.price.toFixed(2)}`      : '—', pct: usdInr?.changePct,   color:'#4488ff' },
    { label:'GOLD',      value: gold?.priceInr   ? `₹${Math.round(gold.priceInr)}/g`  : gold?.priceUsd ? `$${gold.priceUsd.toFixed(0)}` : '—', pct: gold?.changePct, color:'#ffcc00' },
    { label:'CRUDE',     value: crude?.price     ? `$${crude.price.toFixed(1)}`        : '—', pct: crude?.changePct,    color:'#ff8844' },
    { label:'10Y YIELD', value: india10Y?.yield  ? `${india10Y.yield.toFixed(2)}%`     : '—', pct: india10Y?.changePct, color:'#aa44ff' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {/* Macro tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:8 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background:'#0f0f1a', border:`1px solid ${t.color}22`,
            borderTop:`2px solid ${t.color}44`, borderRadius:6, padding:'10px 12px' }}>
            <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginBottom:3 }}>{t.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:t.color, lineHeight:1 }}>{t.value}</div>
            {t.pct != null && (
              <div style={{ fontSize:'var(--fs-xs)', color: t.pct >= 0 ? '#00ff88' : '#ff4444', marginTop:2 }}>
                {t.pct >= 0 ? '▲' : '▼'} {Math.abs(t.pct).toFixed(2)}%
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sector pulse */}
      {sectors?.length > 0 && (
        <div style={{ background:'#0a0a14', border:'1px solid #1a1a2e', borderRadius:8, padding:'12px 14px' }}>
          <div style={{ fontSize:'var(--fs-xs)', color:'#556677', letterSpacing:'.1em', marginBottom:10 }}>SECTOR PULSE</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {sectors.slice(0, 6).map(s => {
              const pct = s.changePct || 0;
              const color = pct > 1 ? '#00ff88' : pct < -1 ? '#ff4444' : pct > 0 ? '#44cc88' : '#cc6644';
              const barW = Math.min(100, Math.abs(pct) * 15);
              return (
                <div key={s.symbol} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:'var(--fs-xs)', color:'#8899bb', width:90, flexShrink:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {s.name || s.symbol}
                  </div>
                  <div style={{ flex:1, background:'#1a1a2e', borderRadius:2, height:5, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${barW}%`, background:color, borderRadius:2,
                      marginLeft: pct < 0 ? `${100-barW}%` : 0 }} />
                  </div>
                  <div style={{ fontSize:'var(--fs-xs)', color, fontWeight:700, width:48, textAlign:'right', flexShrink:0 }}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── US regime card ────────────────────────────────────────────────────────────
function USRegimeCard({ regime }) {
  if (!regime?.regime) return null;
  const colors = { STRONG_BULL:'#00ff88', BULL:'#44cc88', NEUTRAL:'#ffaa00', BEAR:'#ff8844', STRONG_BEAR:'#ff4444' };
  const color = colors[regime.regime] || '#ffaa00';
  return (
    <div style={{ background: color + '0a', border:`1px solid ${color}33`,
      borderLeft:`3px solid ${color}`, borderRadius:6, padding:'10px 14px',
      display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
      <div>
        <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginBottom:2 }}>MARKET REGIME</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color, lineHeight:1 }}>
          {regime.regime.replace('_', ' ')}
        </div>
        <div style={{ fontSize:'var(--fs-xs)', color:'#445566', marginTop:2 }}>{regime.confidence}% confidence</div>
      </div>
      {regime.summary && (
        <div style={{ fontSize:'var(--fs-xs)', color:'#8899bb', lineHeight:1.6, flex:1 }}>{regime.summary}</div>
      )}
    </div>
  );
}

// ── India regime card ─────────────────────────────────────────────────────────
function IndiaRegimeCard({ macro, movers }) {
  if (!macro) return null;
  // Derive regime from Nifty movers + sector breadth
  const sectors   = macro.sectors || [];
  const advancing = sectors.filter(s => (s.changePct || 0) > 0).length;
  const declining = sectors.filter(s => (s.changePct || 0) < 0).length;
  const breadth   = sectors.length > 0 ? advancing / sectors.length : 0.5;
  const usdInr    = macro.usdInr?.price;
  const inrWeak   = usdInr > 84;

  const regime    = breadth > 0.7 ? 'BULL' : breadth > 0.5 ? 'MILD BULL' : breadth < 0.3 ? 'BEAR' : 'NEUTRAL';
  const color     = breadth > 0.6 ? '#00ff88' : breadth < 0.4 ? '#ff4444' : '#ffaa00';

  return (
    <div style={{ background: color + '0a', border:`1px solid ${color}33`,
      borderLeft:`3px solid ${color}`, borderRadius:6, padding:'10px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginBottom:2 }}>NIFTY REGIME</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color, lineHeight:1 }}>{regime}</div>
          <div style={{ fontSize:'var(--fs-xs)', color:'#445566', marginTop:2 }}>
            {advancing} sectors up · {declining} sectors down
          </div>
        </div>
        <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'var(--fs-xs)', color:'#556677' }}>USD/INR</div>
            <div style={{ fontSize:'var(--fs-sm)', fontWeight:700, color: inrWeak ? '#ff8844' : '#00ff88' }}>
              ₹{usdInr?.toFixed(2) || '—'}
            </div>
          </div>
          {macro.globalSignals?.nifty && (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'var(--fs-xs)', color:'#556677' }}>NIFTY</div>
              <div style={{ fontSize:'var(--fs-sm)', fontWeight:700,
                color: (macro.globalSignals.nifty.changePct || 0) >= 0 ? '#00ff88' : '#ff4444' }}>
                {(macro.globalSignals.nifty.changePct || 0) >= 0 ? '▲' : '▼'} {Math.abs(macro.globalSignals.nifty.changePct || 0).toFixed(2)}%
              </div>
            </div>
          )}
        </div>
        {inrWeak && (
          <div style={{ fontSize:'var(--fs-xs)', color:'#ff884488', borderLeft:'2px solid #ff884433', paddingLeft:8, lineHeight:1.6 }}>
            ⚠ Weak INR — watch FII outflows and import-heavy sectors
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage({ user, market, onNavigate, onScan }) {
  const [regime,    setRegime]    = useState(null);
  const [indiaMacro, setIndiaMacro] = useState(null);
  const [time,      setTime]      = useState(new Date());

  const isIndia = market === 'INDIA';

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);



  useEffect(() => {
    if (isIndia) {
      fetch(`${BASE}/india/macro`).then(r => r.json()).then(setIndiaMacro).catch(() => {});
    } else {
      fetch(`${BASE}/regime`).then(r => r.json()).then(setRegime).catch(() => {});
    }
  }, [isIndia]);

  const handleScan = useCallback((ticker) => {
    onScan(ticker);
    onNavigate('scanner');
  }, [onScan, onNavigate]);



  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* ── Greeting + market flag ── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(20px,4vw,30px)', color:'#ffaa00', lineHeight:1 }}>
            {greeting()}{user?.firstName ? `, ${user.firstName}` : ''}
          </div>
          <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginTop:3 }}>
            {time.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
            {' · '}
            <span style={{ color: isIndia ? '#ff9a00' : '#4488ff' }}>
              {isIndia ? '🇮🇳 NSE India' : '🇺🇸 US Markets'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Regime card — different for US vs India ── */}
      {!isIndia && <USRegimeCard regime={regime} />}
      {isIndia  && <IndiaRegimeCard macro={indiaMacro} movers={null} />}



      {/* ── Social Buzz — US only ── */}
      {!isIndia && <SocialBubbleChart onScan={handleScan} />}

      {/* ── Unusual Activity ── */}
      <UnusualActivityPanel onScan={handleScan} market={market} />

      {/* ── Sector Rotation ── */}
      {!isIndia && <SectorRotationPanel onScan={handleScan} />}

      {/* ── India macro tiles — India only ── */}
      {isIndia && <IndiaMacroBar macro={indiaMacro} />}




    </div>
  );
}