import { useEffect, useRef, useState, useCallback } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

// ── Color by sentiment ────────────────────────────────────────────────────────
function sentColor(bull, alpha) {
  if (bull > 0.15)  return `rgba(0,255,136,${alpha})`;
  if (bull < -0.15) return `rgba(255,68,68,${alpha})`;
  return `rgba(255,170,0,${alpha})`;
}

// ── Pack bubbles around origin, then translate to fit ────────────────────────
function pack(items, W) {
  if (!items.length || !W) return [];
  const count = items.length;
  const maxM  = Math.max(...items.map(t => t.mentions), 1);
  const MAX_R = Math.max(14, Math.min(56, Math.floor(W * Math.sqrt(0.68 / (count * Math.PI)))));
  const MIN_R = Math.max(10, Math.floor(MAX_R * 0.45));
  const GAP   = Math.max(3, Math.floor(MAX_R * 0.1));

  const bs = items.map(t => ({
    ...t,
    r:  Math.round(MIN_R + Math.sqrt(t.mentions / maxM) * (MAX_R - MIN_R)),
    x: 0, y: 0,
    // depth 0.3–1.0 based on mention rank
    z: 0.4 + (t.mentions / maxM) * 0.6,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.2,
    phase: Math.random() * Math.PI * 2,
  }));
  bs.sort((a, b) => b.r - a.r);

  const placed = [];
  for (const b of bs) {
    if (!placed.length) { b.x = 0; b.y = 0; placed.push(b); continue; }
    let best = null, bestScore = Infinity;
    const cands = [];
    for (const p of placed) {
      const d = p.r + b.r + GAP;
      for (let a = 0; a < Math.PI * 2; a += 0.16) {
        cands.push({ x: p.x + d * Math.cos(a), y: p.y + d * Math.sin(a) });
      }
    }
    for (const c of cands) {
      if (c.x - b.r < GAP || c.x + b.r > W - GAP) continue;
      if (c.y - b.r < GAP) continue;
      if (placed.some(p => {
        const dx = p.x - c.x, dy = p.y - c.y;
        return Math.sqrt(dx*dx + dy*dy) < p.r + b.r + GAP - 0.5;
      })) continue;
      const score = c.y * 4 + Math.abs(c.x - W/2);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (best) { b.x = best.x; b.y = best.y; }
    else {
      const maxY = Math.max(...placed.map(p => p.y + p.r), 0);
      b.x = W / 2; b.y = maxY + b.r + GAP;
    }
    placed.push(b);
  }

  // Translate: center horizontally, top-pad
  const minX = Math.min(...placed.map(b => b.x - b.r));
  const maxX = Math.max(...placed.map(b => b.x + b.r));
  const minY = Math.min(...placed.map(b => b.y - b.r));
  const maxY = Math.max(...placed.map(b => b.y + b.r));
  const shiftX = (W - (maxX - minX)) / 2 - minX;
  const shiftY = GAP * 2 - minY;
  const H = (maxY - minY) + GAP * 4;
  return { bubbles: placed.map(b => ({ ...b, x: b.x + shiftX, y: b.y + shiftY })), H };
}

// ── Draw one 3D bubble ────────────────────────────────────────────────────────
function drawBubble(ctx, b, tick, isHov) {
  const { x, y, z, sentiment, phase } = b;
  const pulse = 1 + Math.sin(tick * 0.035 + phase) * 0.013;
  const r = b.r * pulse * (isHov ? 1.06 : 1);

  // Floor shadow
  ctx.save();
  ctx.globalAlpha = z * 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x + r*0.12, y + r*0.88, r*0.7, r*0.16, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // Outer glow
  const glowR = r * (isHov ? 1.7 : 1.45);
  const glow = ctx.createRadialGradient(x, y, r*0.6, x, y, glowR);
  glow.addColorStop(0, sentColor(sentiment, z * (isHov ? 0.45 : 0.22)));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI*2); ctx.fill();

  // Body gradient — deep sphere illusion
  const body = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r*0.04, x, y, r);
  body.addColorStop(0,    sentColor(sentiment, 0.5 + z*0.3));
  body.addColorStop(0.38, sentColor(sentiment, 0.32 + z*0.2));
  body.addColorStop(0.72, `rgba(4,4,10,${0.25 + z*0.2})`);
  body.addColorStop(1,    sentColor(sentiment, 0.55 + z*0.2));
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = body; ctx.fill();

  // Inner darkness (depth core)
  const dark = ctx.createRadialGradient(x+r*0.08, y+r*0.08, 0, x, y, r*0.88);
  dark.addColorStop(0, 'rgba(0,0,0,0)');
  dark.addColorStop(1, `rgba(0,0,0,${0.28 + (1-z)*0.28})`);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = dark; ctx.fill();

  // Primary specular (top-left)
  const s1 = ctx.createRadialGradient(x-r*0.33, y-r*0.36, 0, x-r*0.18, y-r*0.18, r*0.58);
  s1.addColorStop(0, `rgba(255,255,255,${0.52 + z*0.2})`);
  s1.addColorStop(0.45, `rgba(255,255,255,${0.12 + z*0.08})`);
  s1.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = s1; ctx.fill();

  // Secondary specular (bottom rim bounce)
  const s2 = ctx.createRadialGradient(x+r*0.28, y+r*0.48, 0, x+r*0.28, y+r*0.48, r*0.32);
  s2.addColorStop(0, `rgba(255,255,255,${0.16 * z})`);
  s2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = s2; ctx.fill();

  // Rim stroke
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.strokeStyle = sentColor(sentiment, 0.3 + z*0.35);
  ctx.lineWidth = isHov ? 1.8 : 0.9;
  ctx.stroke();

  // Ticker label
  const fs = Math.max(9, Math.round(r * 0.43));
  ctx.font = `700 ${fs}px 'JetBrains Mono', monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,255,255,${0.7 + z*0.25})`;
  ctx.fillText(b.symbol, x, y + (r > 22 ? -fs*0.5 : 0));

  // Mentions count
  if (r > 22) {
    const ms = Math.max(8, Math.round(r * 0.27));
    ctx.font = `400 ${ms}px monospace`;
    ctx.fillStyle = `rgba(255,255,255,${0.32 + z*0.18})`;
    ctx.fillText(b.mentions, x, y + fs*0.6);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SocialBubbleChart({ onScan }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('all');
  const [lastRefresh, setLastRefresh] = useState(null);
  const canvasRef   = useRef(null);
  const containerRef= useRef(null);
  const bubblesRef  = useRef([]);
  const animRef     = useRef(null);
  const hovRef      = useRef(null);
  const tickRef     = useRef(0);
  const [canvasH, setCanvasH] = useState(400);

  // Fetch data
  useEffect(() => {
    fetch(`${BASE}/social/trending`)
      .then(r => r.json())
      .then(d => { setData(d); setLastRefresh(new Date()); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Build bubble positions when data/filter/size changes
  const rebuild = useCallback(() => {
    const cv = canvasRef.current;
    const ct = containerRef.current;
    if (!cv || !ct || !data?.tickers?.length) return;

    const W = ct.offsetWidth;
    if (!W) return;
    cv.width  = W * window.devicePixelRatio;

    const filtered = data.tickers.filter(t => {
      if (filter === 'bullish') return t.sentiment > 0.1;
      if (filter === 'bearish') return t.sentiment < -0.1;
      return true;
    }).slice(0, 30);

    const { bubbles, H } = pack(filtered, W);
    // Sort back-to-front for painter's algorithm
    bubbles.sort((a, b) => a.z - b.z);
    bubblesRef.current = bubbles;

    const pixH = H * window.devicePixelRatio;
    cv.height = pixH;
    cv.style.width  = W + 'px';
    cv.style.height = H + 'px';
    setCanvasH(H);
  }, [data, filter]);

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => rebuild());
    ro.observe(containerRef.current);
    rebuild();
    return () => ro.disconnect();
  }, [rebuild]);

  // Animation loop
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const loop = () => {
      tickRef.current++;
      const tick = tickRef.current;
      const dpr  = window.devicePixelRatio || 1;
      const W    = cv.width / dpr;
      const H    = cv.height / dpr;
      const ctx  = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H));
      bg.addColorStop(0, '#0d0d1a');
      bg.addColorStop(1, '#07070e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.018)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < W; gx += 64) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += 64) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // Scanlines
      for (let sy = 0; sy < H; sy += 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.03)';
        ctx.fillRect(0, sy, W, 1);
      }

      const bs = bubblesRef.current;
      if (!bs.length) { animRef.current = requestAnimationFrame(loop); return; }

      // Physics
      for (const b of bs) {
        b.x += b.vx; b.y += b.vy;
        const pad = b.r + 2;
        if (b.x < pad || b.x > W - pad) { b.vx *= -0.8; b.x = Math.max(pad, Math.min(W-pad, b.x)); }
        if (b.y < pad || b.y > H - pad) { b.vy *= -0.8; b.y = Math.max(pad, Math.min(H-pad, b.y)); }
        for (const o of bs) {
          if (o === b) continue;
          const dx = b.x-o.x, dy = b.y-o.y;
          const dist = Math.sqrt(dx*dx+dy*dy);
          const minD = b.r + o.r + 4;
          if (dist < minD && dist > 0.1) {
            const f = (minD-dist)/dist * 0.18;
            b.vx += dx*f*0.12; b.vy += dy*f*0.12;
          }
        }
        b.vx *= 0.975; b.vy *= 0.975;
        b.vx += (Math.random()-0.5)*0.04;
        b.vy += (Math.random()-0.5)*0.03;
      }

      // Draw back to front
      for (const b of bs) drawBubble(ctx, b, tick, hovRef.current === b);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Mouse/touch
  const getHit = useCallback((e, isTouch) => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const src  = isTouch ? e.touches[0] : e;
    const sx   = (src.clientX - rect.left) * (cv.width / rect.width / (window.devicePixelRatio||1));
    const sy   = (src.clientY - rect.top)  * (cv.height / rect.height / (window.devicePixelRatio||1));
    return bubblesRef.current.slice().reverse().find(b => Math.hypot(b.x-sx, b.y-sy) < b.r) || null;
  }, []);

  const handleMove  = useCallback(e => { hovRef.current = getHit(e, false); }, [getHit]);
  const handleClick = useCallback(e => { const h = getHit(e, false); if (h) onScan?.(h.symbol); }, [getHit, onScan]);
  const handleTouch = useCallback(e => {
    e.preventDefault();
    const h = getHit(e, true);
    if (h) onScan?.(h.symbol);
  }, [getHit, onScan]);

  const FILTERS = [
    { key: 'all',     label: 'ALL',     color: '#ffaa00' },
    { key: 'bullish', label: '▲ BULL',  color: '#00ff88' },
    { key: 'bearish', label: '▼ BEAR',  color: '#ff4444' },
  ];

  return (
    <div style={{ background: '#07070e', border: '1px solid #1a1a2e', borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', borderBottom:'1px solid #1a1a2e', flexWrap:'wrap', gap:8 }}>
        <div>
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, color:'#ffaa00', letterSpacing:'.1em' }}>
            💬 SOCIAL BUZZ
          </span>
          <span style={{ fontSize:'var(--fs-xs)', color:'#334455', marginLeft:8 }}>
            Reddit · StockTwits · News · tap to scan
          </span>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding:'3px 10px', borderRadius:3, cursor:'pointer', fontFamily:'inherit',
              fontSize:'var(--fs-xs)', fontWeight:700, letterSpacing:'.06em',
              background: filter === f.key ? f.color + '22' : 'transparent',
              border:`1px solid ${filter === f.key ? f.color + '66' : '#2a2a3e'}`,
              color: filter === f.key ? f.color : '#556677',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ width:'100%', position:'relative' }}>
        {loading ? (
          <div style={{ height:240, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:12, background:'#07070e' }}>
            <div style={{ width:32, height:32, borderRadius:'50%',
              border:'2px solid #ffaa0022', borderTop:'2px solid #ffaa00',
              animation:'spin 0.8s linear infinite' }} />
            <div style={{ fontSize:'var(--fs-xs)', color:'#334455' }}>Scanning social feeds...</div>
          </div>
        ) : !data?.tickers?.length ? (
          <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'var(--fs-xs)', color:'#334455', background:'#07070e' }}>
            No social data available
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{ display:'block', cursor:'crosshair' }}
            onMouseMove={handleMove}
            onMouseLeave={() => { hovRef.current = null; }}
            onClick={handleClick}
            onTouchStart={handleTouch}
          />
        )}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:14, padding:'7px 14px',
        borderTop:'1px solid #0f0f1a', flexWrap:'wrap', alignItems:'center' }}>
        {[['#00ff88','Bullish'],['#ff4444','Bearish'],['#ffaa00','Neutral']].map(([c,l]) => (
          <span key={l} style={{ display:'flex', alignItems:'center', gap:5,
            fontSize:'var(--fs-xs)', color:'#556677' }}>
            <span style={{ width:8, height:8, borderRadius:'50%',
              background:c, display:'inline-block', boxShadow:`0 0 4px ${c}` }} />
            {l}
          </span>
        ))}
        {lastRefresh && (
          <span style={{ marginLeft:'auto', fontSize:'var(--fs-xs)', color:'#223344' }}>
            {lastRefresh.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
          </span>
        )}
      </div>
    </div>
  );
}