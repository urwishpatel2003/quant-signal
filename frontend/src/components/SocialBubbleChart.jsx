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
  if (s > 0.2)  return '#00c853';
  if (s < -0.2) return '#ff3d3d';
  return '#ffaa00';
}

function sentimentBg(s) {
  if (s > 0.2)  return '#003d1a';
  if (s < -0.2) return '#3d0000';
  return '#2a1f00';
}

function sentimentLabel(s) {
  if (s > 0.3)  return 'BULLISH';
  if (s > 0)    return 'SLIGHT BULL';
  if (s < -0.3) return 'BEARISH';
  if (s < 0)    return 'SLIGHT BEAR';
  return 'NEUTRAL';
}

// Pack bubbles into a fixed canvas height — spiral outward from center
function packBubbles(items, width, height) {
  if (!items.length) return [];

  const MIN_R = 24, MAX_R = 56;
  const maxMentions = Math.max(...items.map(t => t.mentions), 1);
  const GAP = 3;

  const bubbles = items.map(t => ({
    ...t,
    r: Math.round(MIN_R + Math.sqrt(t.mentions / maxMentions) * (MAX_R - MIN_R)),
    x: 0, y: 0,
  }));

  // Sort largest first
  bubbles.sort((a, b) => b.r - a.r);

  const placed = [];
  const cx = width / 2;
  const cy = height / 2;

  for (const b of bubbles) {
    if (placed.length === 0) {
      b.x = cx;
      b.y = cy;
      placed.push(b);
      continue;
    }

    let best = null;
    let bestDist = Infinity;

    // Try many angles and distances from center, pick closest valid position
    for (let spiral = b.r; spiral < Math.max(width, height) * 1.5; spiral += 4) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
        const tx = cx + spiral * Math.cos(angle);
        const ty = cy + spiral * Math.sin(angle);

        // Must stay within canvas bounds
        if (tx - b.r < GAP || tx + b.r > width - GAP) continue;
        if (ty - b.r < GAP || ty + b.r > height - GAP) continue;

        // No overlap with placed bubbles
        const overlaps = placed.some(p => {
          const dx = p.x - tx, dy = p.y - ty;
          return Math.sqrt(dx * dx + dy * dy) < p.r + b.r + GAP;
        });

        if (!overlaps) {
          const dist = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            best = { x: tx, y: ty };
          }
          break; // take first valid at this radius
        }
      }
      if (best) break;
    }

    if (best) {
      b.x = best.x;
      b.y = best.y;
    } else {
      // Truly can't fit — skip
      continue;
    }
    placed.push(b);
  }

  return placed;
}

export default function SocialBubbleChart({ onScan }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [hovered,     setHovered]     = useState(null);
  const [filter,      setFilter]      = useState('all');
  const [bubbles,     setBubbles]     = useState([]);
  const [svgHeight,   setSvgHeight]   = useState(400);
  const [width,       setWidth]       = useState(360);
  const [lastRefresh, setLastRefresh] = useState(null);
  const containerRef = useRef(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/social/trending`)
      .then(r => r.json())
      .then(d => { setData(d); setLastRefresh(new Date()); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Re-pack when data, filter, or width changes
  useEffect(() => {
    if (!data?.tickers?.length || width < 100) return;

    // Fewer bubbles on narrow screens — they need to fit in fixed height
    const maxBubbles = width < 420 ? 16 : width < 640 ? 20 : 26;
    const h = width < 420 ? 360 : width < 640 ? 420 : 480;
    setSvgHeight(h);

    const filtered = data.tickers
      .filter(t => {
        if (filter === 'bullish') return t.sentiment > 0.1;
        if (filter === 'bearish') return t.sentiment < -0.1;
        return true;
      })
      .slice(0, maxBubbles);

    const packed = packBubbles(filtered, width, h);
    setBubbles(packed);
  }, [data, filter, width]);

  const hov = bubbles.find(b => b.symbol === hovered);

  return (
    <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #1a1a2e', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16,
            color: '#ffaa00', letterSpacing: '.1em' }}>🔥 SOCIAL BUZZ</div>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#556677', marginTop: 1 }}>
            {Object.values(SOURCE_LABELS).join(' · ')} · refreshes every 15min
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['all', 'bullish', 'bearish'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 'var(--fs-xs)', fontWeight: 700,
              border: `1px solid ${filter === f ? (f === 'bullish' ? '#00c85344' : f === 'bearish' ? '#ff3d3d44' : '#ffaa0044') : '#2a2a3e'}`,
              background: filter === f ? (f === 'bullish' ? '#00c85318' : f === 'bearish' ? '#ff3d3d18' : '#ffaa0018') : 'transparent',
              color: filter === f ? (f === 'bullish' ? '#00c853' : f === 'bearish' ? '#ff3d3d' : '#ffaa00') : '#556677',
              textTransform: 'uppercase',
            }}>{f}</button>
          ))}
          <button onClick={refresh} disabled={loading} style={{
            padding: '4px 9px', borderRadius: 3, background: 'transparent',
            border: '1px solid #2a2a3e', color: loading ? '#334455' : '#8899bb',
            cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13,
          }}>{loading ? '…' : '↻'}</button>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
        {loading ? (
          <div style={{ height: 260, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%',
              border: '2px solid #ffaa0022', borderTop: '2px solid #ffaa00',
              animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#556677' }}>Scanning social feeds...</div>
          </div>
        ) : bubbles.length === 0 ? (
          <div style={{ height: 180, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 'var(--fs-sm)', color: '#556677' }}>
            No trending tickers found
          </div>
        ) : (
          <svg width="100%" viewBox={`0 0 ${width} ${svgHeight}`}
            style={{ display: 'block' }}>
            {bubbles.map(b => {
              const isHov  = hovered === b.symbol;
              const stroke = sentimentColor(b.sentiment);
              const fill   = sentimentBg(b.sentiment);
              const textColor = '#ffffff';

              return (
                <g key={b.symbol}
                  onClick={() => onScan && onScan(b.symbol)}
                  onMouseEnter={() => setHovered(b.symbol)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'pointer' }}>

                  {/* Solid opaque circle */}
                  <circle
                    cx={b.x} cy={b.y} r={b.r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isHov ? 2.5 : 1.5}
                    opacity={1}
                  />

                  {/* Ticker symbol */}
                  <text
                    x={b.x} y={b.r >= 40 ? b.y - 6 : b.y + 4}
                    textAnchor="middle" dominantBaseline="middle"
                    fontFamily="'Bebas Neue', sans-serif"
                    fontSize={Math.min(b.r * 0.52, 20)}
                    fill={textColor}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{b.symbol}</text>

                  {/* Mention count — only on larger bubbles */}
                  {b.r >= 40 && (
                    <text
                      x={b.x} y={b.y + 10}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.min(b.r * 0.25, 11)}
                      fill={stroke}
                      opacity={0.9}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{b.mentions}x</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Hover tooltip — fixed top-left */}
        {hov && (
          <div style={{
            position: 'absolute', top: 8, left: 8, zIndex: 10,
            background: '#0f0f1a', border: `1px solid ${sentimentColor(hov.sentiment)}55`,
            borderLeft: `3px solid ${sentimentColor(hov.sentiment)}`,
            borderRadius: 6, padding: '10px 14px', minWidth: 160,
            pointerEvents: 'none',
          }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22,
              color: '#fff', lineHeight: 1, marginBottom: 4 }}>{hov.symbol}</div>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700,
              color: sentimentColor(hov.sentiment), marginBottom: 6 }}>
              {sentimentLabel(hov.sentiment)}
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#8899bb', marginBottom: 4 }}>
              {hov.mentions} mention{hov.mentions !== 1 ? 's' : ''}
            </div>
            {(hov.bullPct != null || hov.bearPct != null) && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: '#00c853' }}>▲ {hov.bullPct || 0}%</span>
                <span style={{ fontSize: 'var(--fs-xs)', color: '#ff3d3d' }}>▼ {hov.bearPct || 0}%</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {hov.sources.map(s => (
                <span key={s} style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 2,
                  background: (SOURCE_COLORS[s] || '#888') + '22',
                  color: SOURCE_COLORS[s] || '#888',
                  border: `1px solid ${SOURCE_COLORS[s] || '#888'}44`,
                }}>{SOURCE_LABELS[s] || s}</span>
              ))}
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#ffaa00', letterSpacing: '.06em' }}>
              TAP TO SCAN →
            </div>
          </div>
        )}
      </div>

      {/* Updated time + legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', borderTop: '1px solid #1a1a2e', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[['#00c853', 'Bullish'], ['#ff3d3d', 'Bearish'], ['#ffaa00', 'Neutral']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 'var(--fs-xs)', color: '#556677' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
            </div>
          ))}
        </div>
        {lastRefresh && (
          <div style={{ fontSize: 'var(--fs-xs)', color: '#334455' }}>
            {lastRefresh.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}