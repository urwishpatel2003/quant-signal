import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

const TYPE_META = {
  VOLUME:    { icon: '📈', color: '#ffaa00', label: 'Volume' },
  PRICE:     { icon: '💥', color: '#4488ff', label: 'Move'   },
  NEWS:      { icon: '📰', color: '#aa44ff', label: 'News'   },
  BREAKOUT:  { icon: '🚀', color: '#00ff88', label: 'Break'  },
  BREAKDOWN: { icon: '⚠',  color: '#ff4444', label: 'Break↓' },
};

export default function UnusualActivityPanel({ onScan, market = 'US' }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const currency = market === 'INDIA' ? '₹' : '$';

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/unusual/activity?market=${market}`)
      .then(r => r.json())
      .then(d => { setData(d); setLastRefresh(new Date()); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [market]);

  const tickers = data?.tickers || [];

  return (
    <div style={{ background:'#0a0a14', border:'1px solid #1a1a2e', borderRadius:8, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', borderBottom:'1px solid #1a1a2e' }}>
        <div>
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15,
            color:'#ffaa00', letterSpacing:'.1em' }}>⚡ UNUSUAL ACTIVITY</span>
          <span style={{ fontSize:'var(--fs-xs)', color:'#445566', marginLeft:8 }}>
            volume · price · news · breakouts
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lastRefresh && (
            <span style={{ fontSize:'var(--fs-xs)', color:'#334455' }}>
              {lastRefresh.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
            </span>
          )}
          <button onClick={load} disabled={loading} style={{
            padding:'3px 8px', borderRadius:3, background:'transparent',
            border:'1px solid #2a2a3e', color: loading ? '#334455' : '#8899bb',
            cursor: loading ? 'default' : 'pointer', fontFamily:'inherit', fontSize:12,
          }}>{loading ? '…' : '↻'}</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding:'24px', textAlign:'center' }}>
          <div style={{ width:24, height:24, borderRadius:'50%', border:'2px solid #ffaa0022',
            borderTop:'2px solid #ffaa00', animation:'spin 0.8s linear infinite', margin:'0 auto 8px' }} />
          <div style={{ fontSize:'var(--fs-xs)', color:'#556677' }}>
            Scanning {market === 'INDIA' ? '30 NSE' : '80'} tickers...
          </div>
        </div>
      ) : tickers.length === 0 ? (
        <div style={{ padding:'20px', textAlign:'center', fontSize:'var(--fs-xs)', color:'#334455' }}>
          No unusual activity detected right now
        </div>
      ) : (
        <div>
          {/* Column headers */}
          <div style={{ display:'grid', gridTemplateColumns:'72px 1fr auto',
            padding:'5px 14px', borderBottom:'1px solid #12121e' }}>
            <span style={{ fontSize:'var(--fs-xs)', color:'#334455', letterSpacing:'.06em' }}>TICKER</span>
            <span style={{ fontSize:'var(--fs-xs)', color:'#334455', letterSpacing:'.06em' }}>SIGNALS</span>
            <span style={{ fontSize:'var(--fs-xs)', color:'#334455', letterSpacing:'.06em' }}>VOL</span>
          </div>

          {tickers.map((t, i) => {
            const up = t.changePct >= 0;
            return (
              <div key={t.ticker} onClick={() => onScan?.(t.ticker)}
                style={{
                  display:'grid', gridTemplateColumns:'72px 1fr auto',
                  alignItems:'center', gap:8,
                  padding:'8px 14px', cursor:'pointer',
                  borderBottom: i < tickers.length-1 ? '1px solid #12121e' : 'none',
                  background: i % 2 === 0 ? '#0c0c18' : 'transparent',
                  transition:'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#ffffff08'}
                onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? '#0c0c18' : 'transparent'}
              >
                {/* Ticker */}
                <div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15,
                    color:'#ffaa00', lineHeight:1 }}>{t.ticker}</div>
                  <div style={{ fontSize:'var(--fs-xs)', color:'#c8d8f0', marginTop:1 }}>
                    {currency}{t.price?.toFixed(market==='INDIA'?1:2)}
                  </div>
                  <div style={{ fontSize:'var(--fs-xs)', fontWeight:700,
                    color: up ? '#00ff88' : '#ff4444' }}>
                    {up?'▲':'▼'}{Math.abs(t.changePct).toFixed(1)}%
                  </div>
                </div>

                {/* Signal pills — compact */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {t.signals.map((s, si) => {
                    const meta = TYPE_META[s.type] || { icon:'•', color:'#888', label:s.type };
                    return (
                      <span key={si} style={{
                        display:'inline-flex', alignItems:'center', gap:3,
                        padding:'2px 7px', borderRadius:10,
                        background: meta.color + '18',
                        border:`1px solid ${meta.color}33`,
                        fontSize:'var(--fs-xs)', color: meta.color,
                        fontWeight:600, whiteSpace:'nowrap',
                      }}>
                        {meta.icon} {s.label}
                      </span>
                    );
                  })}
                </div>

                {/* Vol ratio */}
                <div style={{ textAlign:'right', minWidth:36 }}>
                  <div style={{ fontSize:'var(--fs-sm)', fontWeight:700,
                    color: t.volRatio >= 5 ? '#ff4444' : t.volRatio >= 3 ? '#ffaa00' : '#8899bb' }}>
                    {t.volRatio}x
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}