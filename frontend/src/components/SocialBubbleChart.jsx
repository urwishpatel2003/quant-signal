import { useEffect, useRef, useState } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

function sentColor(s, a) {
  if (s > 0.15)  return `rgba(0,255,136,${a})`;
  if (s < -0.15) return `rgba(255,68,68,${a})`;
  return `rgba(255,170,0,${a})`;
}

function packBubbles(items, W) {
  if (!items.length || !W) return [];
  const maxM  = Math.max(...items.map(t => t.mentions), 1);
  const count = items.length;
  const MAX_R = Math.max(14, Math.min(54, Math.floor(W * Math.sqrt(0.65 / (count * Math.PI)))));
  const MIN_R = Math.max(10, Math.floor(MAX_R * 0.45));
  const GAP   = Math.max(3, Math.floor(MAX_R * 0.1));

  const bs = items.map(t => ({
    ...t,
    r: Math.round(MIN_R + Math.sqrt(t.mentions / maxM) * (MAX_R - MIN_R)),
    x: 0, y: 0,
    z: 0.4 + (t.mentions / maxM) * 0.6,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.25,
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
      for (let a = 0; a < Math.PI * 2; a += 0.15)
        cands.push({ x: p.x + d * Math.cos(a), y: p.y + d * Math.sin(a) });
    }
    for (const c of cands) {
      if (c.x - b.r < GAP || c.x + b.r > W - GAP) continue;
      if (c.y - b.r < GAP) continue;
      if (placed.some(p => Math.hypot(p.x - c.x, p.y - c.y) < p.r + b.r + GAP - 0.5)) continue;
      const score = c.y * 4 + Math.abs(c.x - W / 2);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (best) { b.x = best.x; b.y = best.y; }
    else { const mY = Math.max(...placed.map(p => p.y + p.r), 0); b.x = W/2; b.y = mY + b.r + GAP; }
    placed.push(b);
  }

  // Translate so cluster fits snugly
  const minX = Math.min(...placed.map(b => b.x - b.r));
  const maxX = Math.max(...placed.map(b => b.x + b.r));
  const minY = Math.min(...placed.map(b => b.y - b.r));
  const maxY = Math.max(...placed.map(b => b.y + b.r));
  const shiftX = (W - (maxX - minX)) / 2 - minX;
  const shiftY = GAP * 2 - minY;
  placed.forEach(b => { b.x += shiftX; b.y += shiftY; });
  return { bubbles: placed.sort((a,b) => a.z - b.z), H: (maxY - minY) + GAP * 4 };
}

function drawBubble(ctx, b, tick, isHov) {
  const pulse = 1 + Math.sin(tick * 0.035 + b.phase) * 0.012;
  const r = b.r * pulse * (isHov ? 1.07 : 1);
  const { x, y, z, sentiment } = b;

  // Shadow
  ctx.save(); ctx.globalAlpha = z * 0.2;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x + r*0.12, y + r*0.88, r*0.68, r*0.15, 0, 0, Math.PI*2);
  ctx.fill(); ctx.restore();

  // Glow ring
  const gr = ctx.createRadialGradient(x, y, r*0.55, x, y, r * (isHov ? 1.75 : 1.45));
  gr.addColorStop(0, sentColor(sentiment, z * (isHov ? 0.45 : 0.2)));
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r * 1.75, 0, Math.PI*2); ctx.fill();

  // Sphere body
  const body = ctx.createRadialGradient(x - r*0.3, y - r*0.32, r*0.04, x, y, r);
  body.addColorStop(0,    sentColor(sentiment, 0.48 + z*0.28));
  body.addColorStop(0.4,  sentColor(sentiment, 0.3  + z*0.18));
  body.addColorStop(0.73, 'rgba(4,4,12,0.25)');
  body.addColorStop(1,    sentColor(sentiment, 0.52 + z*0.18));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

  // Inner depth
  const depth = ctx.createRadialGradient(x+r*0.08, y+r*0.1, 0, x, y, r*0.9);
  depth.addColorStop(0, 'rgba(0,0,0,0)');
  depth.addColorStop(1, `rgba(0,0,0,${0.3 + (1-z)*0.25})`);
  ctx.fillStyle = depth;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

  // Main specular
  const s1 = ctx.createRadialGradient(x-r*0.33, y-r*0.36, 0, x-r*0.18, y-r*0.18, r*0.6);
  s1.addColorStop(0, `rgba(255,255,255,${0.5 + z*0.22})`);
  s1.addColorStop(0.5, `rgba(255,255,255,${0.1 + z*0.06})`);
  s1.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

  // Rim
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.strokeStyle = sentColor(sentiment, 0.28 + z*0.38);
  ctx.lineWidth = isHov ? 1.8 : 0.85; ctx.stroke();

  // Text
  const fs = Math.max(9, Math.round(r * 0.42));
  ctx.font = `700 ${fs}px 'JetBrains Mono',monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,255,255,${0.72 + z*0.22})`;
  ctx.fillText(b.symbol, x, y + (r > 22 ? -fs*0.48 : 0));
  if (r > 22) {
    const ms = Math.max(8, Math.round(r * 0.27));
    ctx.font = `400 ${ms}px monospace`;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + z*0.18})`;
    ctx.fillText(b.mentions, x, y + fs*0.62);
  }
}

export default function SocialBubbleChart({ onScan }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('all');
  const [lastRefresh, setLastRefresh] = useState(null);
  const wrapRef  = useRef(null);
  const cvRef    = useRef(null);
  const stateRef = useRef({ bubbles: [], hovered: null, tick: 0, raf: null });

  // Fetch
  useEffect(() => {
    fetch(`${BASE}/social/trending`)
      .then(r => r.json())
      .then(d => { setData(d); setLastRefresh(new Date()); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Main effect — runs whenever data/filter change, sets up canvas + loop
  useEffect(() => {
    const cv   = cvRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;

    const state = stateRef.current;
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }

    if (!data?.tickers?.length) return;

    const W   = wrap.offsetWidth || 360;
    const dpr = window.devicePixelRatio || 1;

    const filtered = data.tickers.filter(t => {
      if (filter === 'bullish') return t.sentiment > 0.1;
      if (filter === 'bearish') return t.sentiment < -0.1;
      return true;
    }).slice(0, 30);

    if (!filtered.length) return;

    const { bubbles, H } = packBubbles(filtered, W);
    state.bubbles = bubbles;

    // Size canvas properly
    cv.width       = Math.round(W * dpr);
    cv.height      = Math.round(H * dpr);
    cv.style.width  = W + 'px';
    cv.style.height = H + 'px';

    const loop = () => {
      state.tick++;
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.8);
      bg.addColorStop(0, '#0d0d1a'); bg.addColorStop(1, '#07070e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.016)'; ctx.lineWidth = 0.5;
      for (let gx = 0; gx < W; gx += 60) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
      for (let gy = 0; gy < H; gy += 60) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }

      // Physics
      const bs = state.bubbles;
      for (const b of bs) {
        b.x += b.vx; b.y += b.vy;
        const pad = b.r + 2;
        if (b.x < pad || b.x > W - pad) { b.vx *= -0.82; b.x = Math.max(pad, Math.min(W-pad, b.x)); }
        if (b.y < pad || b.y > H - pad) { b.vy *= -0.82; b.y = Math.max(pad, Math.min(H-pad, b.y)); }
        for (const o of bs) {
          if (o === b) continue;
          const dx = b.x-o.x, dy = b.y-o.y, dist = Math.hypot(dx, dy);
          const minD = b.r + o.r + 4;
          if (dist < minD && dist > 0.1) { const f = (minD-dist)/dist*0.15; b.vx += dx*f*0.1; b.vy += dy*f*0.1; }
        }
        b.vx *= 0.975; b.vy *= 0.975;
        b.vx += (Math.random()-0.5)*0.03; b.vy += (Math.random()-0.5)*0.02;
      }

      // Draw
      for (const b of bs) drawBubble(ctx, b, state.tick, state.hovered === b);
      state.raf = requestAnimationFrame(loop);
    };

    state.raf = requestAnimationFrame(loop);
    return () => { if (state.raf) cancelAnimationFrame(state.raf); };
  }, [data, filter]);

  // Hit test
  const getHit = (clientX, clientY) => {
    const cv = cvRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    const sx = (clientX - rect.left) / rect.width  * (cv.width  / dpr);
    const sy = (clientY - rect.top)  / rect.height * (cv.height / dpr);
    return [...stateRef.current.bubbles].reverse().find(b => Math.hypot(b.x-sx, b.y-sy) < b.r) || null;
  };

  const FILTERS = [
    { key:'all',     label:'ALL',    color:'#ffaa00' },
    { key:'bullish', label:'▲ BULL', color:'#00ff88' },
    { key:'bearish', label:'▼ BEAR', color:'#ff4444' },
  ];

  return (
    <div style={{ background:'#07070e', border:'1px solid #1a1a2e', borderRadius:8, overflow:'hidden' }}>
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
        <div style={{ display:'flex', gap:6 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding:'3px 10px', borderRadius:3, cursor:'pointer', fontFamily:'inherit',
              fontSize:'var(--fs-xs)', fontWeight:700, letterSpacing:'.06em',
              background: filter === f.key ? f.color+'22' : 'transparent',
              border:`1px solid ${filter===f.key ? f.color+'66' : '#2a2a3e'}`,
              color: filter===f.key ? f.color : '#556677',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} style={{ width:'100%' }}>
        {loading ? (
          <div style={{ height:240, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:12, background:'#07070e' }}>
            <div style={{ width:32, height:32, borderRadius:'50%',
              border:'2px solid #ffaa0022', borderTop:'2px solid #ffaa00',
              animation:'spin 0.8s linear infinite' }} />
            <div style={{ fontSize:'var(--fs-xs)', color:'#334455' }}>Scanning social feeds...</div>
          </div>
        ) : (
          <canvas ref={cvRef} style={{ display:'block', cursor:'crosshair' }}
            onMouseMove={e => { stateRef.current.hovered = getHit(e.clientX, e.clientY); }}
            onMouseLeave={() => { stateRef.current.hovered = null; }}
            onClick={e => { const h = getHit(e.clientX, e.clientY); if (h) onScan?.(h.symbol); }}
            onTouchStart={e => { e.preventDefault(); const t = e.touches[0]; const h = getHit(t.clientX, t.clientY); if (h) onScan?.(h.symbol); }}
          />
        )}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:14, padding:'7px 14px',
        borderTop:'1px solid #0f0f1a', flexWrap:'wrap', alignItems:'center' }}>
        {[['#00ff88','Bullish'],['#ff4444','Bearish'],['#ffaa00','Neutral']].map(([c,l]) => (
          <span key={l} style={{ display:'flex', alignItems:'center', gap:5,
            fontSize:'var(--fs-xs)', color:'#556677' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:c,
              display:'inline-block', boxShadow:`0 0 4px ${c}` }} />
            {l}
          </span>
        ))}
        {lastRefresh && (
          <span style={{ marginLeft:'auto', fontSize:'var(--fs-xs)', color:'#223344' }}>
            {lastRefresh.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
          </span>
        )}
      </div>
    </div>
  );
}