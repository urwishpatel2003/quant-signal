import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

const TYPE_COLORS = {
  VOLUME:    '#ffaa00',
  PRICE:     '#4488ff',
  NEWS:      '#aa44ff',
  BREAKOUT:  '#00ff88',
  BREAKDOWN: '#ff4444',
};
const TYPE_ICONS = {
  VOLUME:    '📈',
  PRICE:     '💥',
  NEWS:      '📰',
  BREAKOUT:  '🚀',
  BREAKDOWN: '⚠',
};
const SEV_OPACITY = { high: '99', medium: '66', low: '44' };

export default function UnusualActivityPanel({ onScan }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/unusual/activity`)
      .then(r => r.json())
      .then(d => { setData(d); setLastRefresh(new Date()); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const tickers = data?.tickers || [];

  return (
    <div style={{ background:'#0a0a14', border:'1px solid #1a1a2e', borderRadius:8, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'12px 16px', borderBottom:'1px solid #1a1a2e', flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'#ffaa00', letterSpacing:'.1em' }}>
            ⚡ UNUSUAL ACTIVITY
          </div>
          <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginTop:1 }}>
            Volume spikes · Price moves · News velocity · 52W breakouts · refreshes every 30min
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{
          padding:'4px 9px', borderRadius:3, background:'transparent',
          border:'1px solid #2a2a3e', color: loading ? '#334455' : '#8899bb',
          cursor: loading ? 'default' : 'pointer', fontFamily:'inherit', fontSize:13,
        }}>{loading ? '…' : '↻'}</button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding:'32px 16px', textAlign:'center' }}>
          <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #ffaa0022',
            borderTop:'2px solid #ffaa00', animation:'spin 0.8s linear infinite', margin:'0 auto 10px' }} />
          <div style={{ fontSize:'var(--fs-xs)', color:'#556677' }}>Scanning 80 tickers...</div>
        </div>
      ) : tickers.length === 0 ? (
        <div style={{ padding:'24px 16px', textAlign:'center', fontSize:'var(--fs-xs)', color:'#334455' }}>
          No unusual activity detected
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column' }}>
          {tickers.map((t, i) => {
            const up = t.changePct >= 0;
            return (
              <div key={t.ticker} onClick={() => onScan?.(t.ticker)}
                style={{
                  display:'flex', alignItems:'flex-start', gap:12,
                  padding:'10px 16px', cursor:'pointer',
                  borderBottom: i < tickers.length-1 ? '1px solid #12121e' : 'none',
                  background: i % 2 === 0 ? '#0c0c18' : 'transparent',
                  transition:'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#ffffff08'}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#0c0c18' : 'transparent'}
              >
                {/* Ticker + price */}
                <div style={{ minWidth:80, flexShrink:0 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:17, color:'#ffaa00', lineHeight:1 }}>
                    {t.ticker}
                  </div>
                  <div style={{ fontSize:'var(--fs-xs)', color:'#c8d8f0', marginTop:2 }}>
                    ${t.price?.toFixed(2)}
                  </div>
                  <div style={{ fontSize:'var(--fs-xs)', fontWeight:700, color: up ? '#00ff88' : '#ff4444' }}>
                    {up ? '▲' : '▼'} {Math.abs(t.changePct).toFixed(2)}%
                  </div>
                </div>

                {/* Signal badges */}
                <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:5, paddingTop:2 }}>
                  {t.signals.map((s, si) => (
                    <div key={si} style={{
                      display:'inline-flex', alignItems:'center', gap:4,
                      padding:'3px 8px', borderRadius:3,
                      background: (TYPE_COLORS[s.type] || '#888') + (SEV_OPACITY[s.severity] || '44'),
                      border:`1px solid ${TYPE_COLORS[s.type] || '#888'}44`,
                      fontSize:'var(--fs-xs)', color: TYPE_COLORS[s.type] || '#888',
                      fontWeight:600, whiteSpace:'nowrap',
                    }}>
                      {TYPE_ICONS[s.type]} {s.label}
                    </div>
                  ))}
                </div>

                {/* Vol ratio */}
                <div style={{ flexShrink:0, textAlign:'right' }}>
                  <div style={{ fontSize:'var(--fs-xs)', color:'#556677' }}>VOL</div>
                  <div style={{ fontSize:'var(--fs-sm)', fontWeight:700,
                    color: t.volRatio >= 3 ? '#ffaa00' : '#8899bb' }}>
                    {t.volRatio}x
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastRefresh && (
        <div style={{ padding:'6px 16px', borderTop:'1px solid #12121e',
          fontSize:'var(--fs-xs)', color:'#334455', textAlign:'right' }}>
          {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}