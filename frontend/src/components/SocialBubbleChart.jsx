import { useEffect, useState, useRef, useCallback } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

const SOURCE_COLORS = {
  reddit_wsb:    '#ff4422',
  reddit_stocks: '#ff8844',
  reddit_inv:    '#ffaa44',
  reddit_opts:   '#ffcc44',
  stocktwits:    '#4488ff',
  finnhub:       '#aa44ff',
  yahoo:         '#ffaa00',
  yahoo_active:  '#ff6600',
};

const SOURCE_LABELS = {
  reddit_wsb:    'r/WSB',
  reddit_stocks: 'r/stocks',
  reddit_inv:    'r/investing',
  reddit_opts:   'r/options',
  stocktwits:    'StockTwits',
  finnhub:       'Finnhub',
  yahoo:         'Yahoo',
  yahoo_active:  'Yahoo Active',
};

function sentimentColor(s) {
  if (s > 0.3)  return '#00ff88';
  if (s > 0)    return '#44cc88';
  if (s < -0.3) return '#ff4444';
  if (s < 0)    return '#cc6644';
  return '#ffaa00';
}

function sentimentLabel(s, bullPct, bearPct) {
  if (s > 0.3)  return `BULLISH ${bullPct ? bullPct + '%' : ''}`;
  if (s > 0)    return `SLIGHT BULL`;
  if (s < -0.3) return `BEARISH ${bearPct ? bearPct + '%' : ''}`;
  if (s < 0)    return `SLIGHT BEAR`;
  return 'NEUTRAL';
}

// Physics-based bubble layout — repel each other, stay in bounds
function layoutBubbles(tickers, width, height) {
  const MIN_R = 22, MAX_R = 72;
  const bubbles = tickers.map((t, i) => {
    const r = MIN_R + t.normalizedSize * (MAX_R - MIN_R);
    // Start in a rough grid
    const cols = Math.ceil(Math.sqrt(tickers.length));
    const col  = i % cols;
    const row  = Math.floor(i / cols);
    return {
      ...t, r,
      x: (width  / (cols + 1)) * (col + 1),
      y: (height / (Math.ceil(tickers.length / cols) + 1)) * (row + 1),
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
    };
  });

  // Run physics simulation to separate bubbles
  for (let iter = 0; iter < 200; iter++) {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], b = bubbles[j];
        const dx   = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 0.1;
        const minD = a.r + b.r + 6;
        if (dist < minD) {
          const force = (minD - dist) / dist * 0.5;
          const fx = dx * force, fy = dy * force;
          a.x -= fx; a.y -= fy;
          b.x += fx; b.y += fy;
        }
      }
      // Keep in bounds
      bubbles[i].x = Math.max(bubbles[i].r + 4, Math.min(width  - bubbles[i].r - 4, bubbles[i].x));
      bubbles[i].y = Math.max(bubbles[i].r + 4, Math.min(height - bubbles[i].r - 4, bubbles[i].y));
    }
  }
  return bubbles;
}

export default function SocialBubbleChart({ onScan }) {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [hovered,  setHovered]  = useState(null);
  const [dims,     setDims]     = useState({ w: 360, h: 320 });
  const [bubbles,  setBubbles]  = useState([]);
  const [filter,   setFilter]   = useState('all'); // all | bullish | bearish
  const [lastRefresh, setLastRefresh] = useState(null);
  const svgRef   = useRef(null);
  const containerRef = useRef(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/social/trending`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLastRefresh(new Date());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        const h = Math.max(280, Math.min(420, Math.floor(w * 0.75)));
        setDims({ w, h });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Layout bubbles whenever data or dims change
  useEffect(() => {
    if (!data?.tickers?.length) return;
    const filtered = data.tickers.filter(t => {
      if (filter === 'bullish') return t.sentiment > 0;
      if (filter === 'bearish') return t.sentiment < 0;
      return true;
    }).slice(0, 35);
    setBubbles(layoutBubbles(filtered, dims.w, dims.h));
  }, [data, dims, filter]);

  const hoveredBubble = bubbles.find(b => b.symbol === hovered);

  return (
    <div style={{ background:'#0a0a14', border:'1px solid #1a1a2e', borderRadius:8, overflow:'hidden' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1a1a2e', flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'#ffaa00', letterSpacing:'.1em' }}>
            🔥 SOCIAL BUZZ
          </div>
          <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginTop:1 }}>
            Reddit WSB · StockTwits · Finnhub · Yahoo · refreshes every 15min
          </div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {/* Filter */}
          {['all','bullish','bearish'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding:'3px 10px', borderRadius:3, cursor:'pointer',
              fontFamily:'inherit', fontSize:'var(--fs-xs)', fontWeight:700,
              border:`1px solid ${filter===f ? (f==='bullish'?'#00ff8844':f==='bearish'?'#ff444444':'#ffaa0044') : '#2a2a3e'}`,
              background: filter===f ? (f==='bullish'?'#00ff8811':f==='bearish'?'#ff444411':'#ffaa0011') : 'transparent',
              color: filter===f ? (f==='bullish'?'#00ff88':f==='bearish'?'#ff4444':'#ffaa00') : '#556677',
              textTransform:'uppercase',
            }}>{f}</button>
          ))}
          <button onClick={refresh} disabled={loading} style={{
            padding:'3px 8px', borderRadius:3, background:'transparent',
            border:'1px solid #2a2a3e', color:'#556677', cursor:'pointer',
            fontFamily:'inherit', fontSize:'var(--fs-xs)',
          }}>{loading ? '...' : '↻'}</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:14, padding:'8px 16px', borderBottom:'1px solid #1a1a2e', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'var(--fs-xs)', color:'#556677' }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:'#00ff88' }} />Bullish sentiment
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'var(--fs-xs)', color:'#556677' }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:'#ff4444' }} />Bearish sentiment
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'var(--fs-xs)', color:'#556677' }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:'#ffaa00' }} />Neutral
        </div>
        <div style={{ fontSize:'var(--fs-xs)', color:'#556677' }}>Bigger = more mentions</div>
        {lastRefresh && (
          <div style={{ marginLeft:'auto', fontSize:'var(--fs-xs)', color:'#334455' }}>
            Updated {lastRefresh.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Bubble chart */}
      <div ref={containerRef} style={{ position:'relative', width:'100%' }}>
        {loading ? (
          <div style={{ height:280, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', border:'2px solid #ffaa0022', borderTop:'2px solid #ffaa00', animation:'spin 0.8s linear infinite' }} />
            <div style={{ fontSize:'var(--fs-xs)', color:'#556677' }}>Scanning social feeds...</div>
          </div>
        ) : bubbles.length === 0 ? (
          <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'var(--fs-sm)', color:'#556677' }}>
            No trending tickers found
          </div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            style={{ display:'block', cursor:'default' }}
          >
            {bubbles.map(b => {
              const isHov  = hovered === b.symbol;
              const color  = sentimentColor(b.sentiment);
              const r      = isHov ? b.r + 4 : b.r;
              const showTicker = b.r >= 28;
              const showMentions = b.r >= 38;
              return (
                <g key={b.symbol}
                  onClick={() => onScan && onScan(b.symbol)}
                  onMouseEnter={() => setHovered(b.symbol)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor:'pointer' }}
                >
                  {/* Glow ring on hover */}
                  {isHov && (
                    <circle cx={b.x} cy={b.y} r={r + 6}
                      fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
                  )}
                  {/* Main bubble */}
                  <circle
                    cx={b.x} cy={b.y} r={r}
                    fill={color + (isHov ? '33' : '1a')}
                    stroke={color}
                    strokeWidth={isHov ? 2 : 1}
                  />
                  {/* Source dots around edge */}
                  {b.sources.slice(0, 3).map((src, si) => {
                    const angle = (si / 3) * Math.PI * 2 - Math.PI / 2;
                    return (
                      <circle key={src}
                        cx={b.x + (r - 6) * Math.cos(angle)}
                        cy={b.y + (r - 6) * Math.sin(angle)}
                        r={3}
                        fill={SOURCE_COLORS[src] || '#888'}
                      />
                    );
                  })}
                  {/* Ticker text */}
                  {showTicker && (
                    <text x={b.x} y={b.y + (showMentions ? -4 : 4)}
                      textAnchor="middle" dominantBaseline="middle"
                      fontFamily="'Bebas Neue', sans-serif"
                      fontSize={Math.min(b.r * 0.55, 18)}
                      fill={isHov ? '#fff' : '#e8e8f0'}
                      fontWeight="400"
                    >{b.symbol}</text>
                  )}
                  {showMentions && (
                    <text x={b.x} y={b.y + 12}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.min(b.r * 0.28, 11)}
                      fill={color} opacity="0.8"
                    >{b.mentions}x</text>
                  )}
                  {/* Very small bubbles — just a dot with tooltip */}
                  {!showTicker && (
                    <text x={b.x} y={b.y}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fill={color} fontWeight="700"
                    >{b.symbol.slice(0, 3)}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Tooltip */}
        {hoveredBubble && (
          <div style={{
            position:'absolute', top:8, left:8,
            background:'#0c0c18', border:`1px solid ${sentimentColor(hoveredBubble.sentiment)}44`,
            borderLeft:`3px solid ${sentimentColor(hoveredBubble.sentiment)}`,
            borderRadius:6, padding:'10px 14px', pointerEvents:'none',
            minWidth:160, zIndex:10,
          }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'#fff', marginBottom:4 }}>
              {hoveredBubble.symbol}
            </div>
            <div style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:sentimentColor(hoveredBubble.sentiment), marginBottom:6 }}>
              {sentimentLabel(hoveredBubble.sentiment, hoveredBubble.bullPct, hoveredBubble.bearPct)}
            </div>
            <div style={{ fontSize:'var(--fs-xs)', color:'#8899bb', marginBottom:4 }}>
              {hoveredBubble.mentions} mentions
            </div>
            {(hoveredBubble.bullPct || hoveredBubble.bearPct) && (
              <div style={{ display:'flex', gap:10, marginBottom:6 }}>
                <span style={{ fontSize:'var(--fs-xs)', color:'#00ff88' }}>▲ {hoveredBubble.bullPct||0}%</span>
                <span style={{ fontSize:'var(--fs-xs)', color:'#ff4444' }}>▼ {hoveredBubble.bearPct||0}%</span>
              </div>
            )}
            {/* Sentiment bar */}
            <div style={{ background:'#1a1a2e', borderRadius:2, height:4, marginBottom:8, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:2,
                width:`${Math.round((hoveredBubble.bullPct||50))}%`,
                background: `linear-gradient(90deg, #00ff88, ${sentimentColor(hoveredBubble.sentiment)})`,
              }} />
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
              {hoveredBubble.sources.map(s => (
                <span key={s} style={{
                  fontSize:9, padding:'1px 5px', borderRadius:2,
                  background: SOURCE_COLORS[s] + '22',
                  color: SOURCE_COLORS[s], border:`1px solid ${SOURCE_COLORS[s]}44`,
                }}>{SOURCE_LABELS[s]}</span>
              ))}
            </div>
            <div style={{ fontSize:'var(--fs-xs)', color:'#ffaa00', letterSpacing:'.06em' }}>
              TAP TO SCAN →
            </div>
          </div>
        )}
      </div>

      {/* Source legend */}
      <div style={{ display:'flex', gap:10, padding:'8px 16px', borderTop:'1px solid #1a1a2e', flexWrap:'wrap' }}>
        {Object.entries(SOURCE_LABELS).map(([k, v]) => (
          <div key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:'var(--fs-xs)', color:'#445566' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:SOURCE_COLORS[k] }} />
            {v}
          </div>
        ))}
      </div>
    </div>
  );
}