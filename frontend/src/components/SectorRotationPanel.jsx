import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

export default function SectorRotationPanel({ onScan }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch(`${BASE}/sector/rotation`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sectors = data?.sectors || [];
  const maxAbs  = Math.max(...sectors.map(s => Math.abs(s.changePct)), 0.1);

  return (
    <div style={{ background:'#0a0a14', border:'1px solid #1a1a2e', borderRadius:8, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #1a1a2e' }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'#ffaa00', letterSpacing:'.1em' }}>
          🔄 SECTOR ROTATION
        </div>
        <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginTop:1 }}>
          Where money is flowing today — tap a sector to see its key stocks
        </div>
      </div>

      {loading ? (
        <div style={{ padding:'24px 16px', textAlign:'center' }}>
          <div style={{ width:24, height:24, borderRadius:'50%', border:'2px solid #ffaa0022',
            borderTop:'2px solid #ffaa00', animation:'spin 0.8s linear infinite', margin:'0 auto' }} />
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {sectors.map((s, i) => {
            const isExp = expanded === s.etf;
            const barW  = Math.abs(s.changePct) / maxAbs * 100;
            const up    = s.changePct >= 0;
            return (
              <div key={s.etf}>
                <div onClick={() => setExpanded(isExp ? null : s.etf)}
                  style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'9px 16px', cursor:'pointer',
                    borderBottom:'1px solid #12121e',
                    background: isExp ? '#ffffff08' : i % 2 === 0 ? '#0c0c18' : 'transparent',
                    transition:'background .1s',
                  }}
                  onMouseEnter={e => !isExp && (e.currentTarget.style.background = '#ffffff06')}
                  onMouseLeave={e => !isExp && (e.currentTarget.style.background = i%2===0?'#0c0c18':'transparent')}
                >
                  {/* Sector name + momentum */}
                  <div style={{ minWidth:110, flexShrink:0 }}>
                    <div style={{ fontSize:'var(--fs-sm)', color:'#c8d8f0', fontWeight:600 }}>{s.name}</div>
                    <div style={{ fontSize:'var(--fs-xs)', color:'#445566' }}>{s.etf}</div>
                  </div>

                  {/* Bar */}
                  <div style={{ flex:1, position:'relative', height:6,
                    background:'#1a1a2e', borderRadius:3, overflow:'hidden' }}>
                    <div style={{
                      position:'absolute', height:'100%', borderRadius:3,
                      width:`${barW}%`, background: s.color,
                      left: up ? '50%' : `${50 - barW/2}%`,
                      transform: up ? 'none' : 'translateX(-50%)',
                      maxWidth:'50%',
                    }} />
                    {/* Center line */}
                    <div style={{ position:'absolute', left:'50%', top:0, bottom:0,
                      width:1, background:'#2a2a3e' }} />
                  </div>

                  {/* Stats */}
                  <div style={{ minWidth:80, textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:'var(--fs-sm)', fontWeight:700, color: s.color }}>
                      {up ? '+' : ''}{s.changePct}%
                    </div>
                    <div style={{ fontSize:'var(--fs-xs)', color:'#445566' }}>
                      {s.volRatio}x vol
                    </div>
                  </div>

                  {/* Momentum badge */}
                  <div style={{ flexShrink:0, minWidth:60, textAlign:'right' }}>
                    <span style={{ fontSize:9, fontWeight:700, color: s.color,
                      background: s.color + '18', border:`1px solid ${s.color}33`,
                      padding:'2px 6px', borderRadius:3, letterSpacing:'.04em' }}>
                      {s.momentum}
                    </span>
                  </div>
                </div>

                {/* Expanded — show niche tickers in this sector */}
                {isExp && (
                  <div style={{ padding:'10px 16px 12px', background:'#080810',
                    borderBottom:'1px solid #1a1a2e' }}>
                    <div style={{ fontSize:'var(--fs-xs)', color:'#445566', marginBottom:8, letterSpacing:'.08em' }}>
                      KEY NAMES IN {s.name.toUpperCase()} — tap to scan
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {s.tickers.map(t => (
                        <button key={t} onClick={() => onScan?.(t)} style={{
                          padding:'5px 12px', borderRadius:4,
                          background: s.color + '12',
                          border:`1px solid ${s.color}33`,
                          color: s.color, cursor:'pointer',
                          fontFamily:"'Bebas Neue',sans-serif",
                          fontSize:15, letterSpacing:'.04em',
                          transition:'background .1s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = s.color + '22'}
                          onMouseLeave={e => e.currentTarget.style.background = s.color + '12'}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}