import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

const SC = { BUY:'#00ff88', SELL:'#ff4444', HOLD:'#ffaa00' };
const OC = { WIN:'#00ff88', LOSS:'#ff4444', SCRATCH:'#ffaa00', PENDING:'#556677' };

const TF_LABELS = {
  short:    'Short Term (5d)',
  swing:    'Swing (4wk)',
  position: 'Position (3mo)',
  longterm: 'Long Term (1y)',
};

function StatCard({ label, value, sub, color = '#ffaa00' }) {
  return (
    <div style={{ background:'#0f0f1a', border:`1px solid ${color}22`,
      borderTop:`2px solid ${color}55`, borderRadius:6, padding:'14px 16px' }}>
      <div style={{ fontSize:10, color:'#8899bb', letterSpacing:'.1em', marginBottom:6 }}>{label}</div>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color, lineHeight:1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize:11, color:'#7788aa', marginTop:4 }}>{sub}</div>}
    </div>
  );
}

export default function PublicAccuracyTab() {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [market,    setMarket]    = useState('US');
  const [tfFilter,  setTfFilter]  = useState('all');
  const [sigFilter, setSigFilter] = useState('all');
  const [page,      setPage]      = useState(0);
  const PAGE_SIZE = 30;

  useEffect(() => {
    setLoading(true);
    setPage(0);
    const params = new URLSearchParams({ market, limit: 500 });
    fetch(`${BASE}/batch/signals?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [market]);

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px 0', color:'#7788aa' }}>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22,
        color:'#ffaa00', marginBottom:10 }}>LOADING SIGNAL TRACKER</div>
      <div style={{ fontSize:12 }}>Fetching system signals...</div>
    </div>
  );

  if (error) return (
    <div style={{ padding:20, color:'#ff4444', fontSize:13 }}>Error: {error}</div>
  );

  const signals  = data?.signals || [];
  const stats    = data?.stats   || {};
  const byTf     = stats.byTimeframe || {};
  const bySignal = stats.bySignal    || {};

  // Filter signals
  const filtered = signals.filter(s => {
    if (tfFilter  !== 'all' && s.timeframe     !== tfFilter)  return false;
    if (sigFilter !== 'all' && s.signal        !== sigFilter) return false;
    return true;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const fmtPct = v => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  const winRate = n => n?.total ? `${Math.round(n.wins / n.total * 100)}%` : '—';

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
        marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:'#ffaa00' }}>
            SYSTEM SIGNAL TRACKER
          </div>
          <div style={{ fontSize:11, color:'#556677', marginTop:2 }}>
            30 US + 30 India stocks · 4 timeframes · auto-tracked outcomes
          </div>
        </div>
        {/* Market toggle */}
        <div style={{ display:'flex', border:'1px solid #2a2a3e', borderRadius:4, overflow:'hidden' }}>
          {[['US','🇺🇸 US'],['INDIA','🇮🇳 INDIA']].map(([key,label]) => (
            <button key={key} onClick={() => setMarket(key)} style={{
              padding:'8px 18px', background: market===key ? '#ffaa0018' : 'transparent',
              border:'none', color: market===key ? '#ffaa00' : '#7788aa',
              cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace",
              fontSize:11, letterSpacing:'.08em', fontWeight:700 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Overall stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, marginBottom:20 }}>
        <StatCard label="TOTAL RESOLVED"  value={stats.total}   color='#ffaa00' />
        <StatCard label="WIN RATE"        value={stats.winRate != null ? `${stats.winRate}%` : '—'} color='#00ff88'
          sub={`${stats.wins}W / ${stats.losses}L / ${stats.scratches}S`} />
        <StatCard label="PENDING"         value={stats.pending} color='#4488ff' sub="awaiting outcome" />
        <StatCard label="BUY WIN RATE"    value={winRate(bySignal.BUY)}  color='#00ff88'
          sub={bySignal.BUY?.total ? `${bySignal.BUY.total} signals` : null} />
        <StatCard label="SELL WIN RATE"   value={winRate(bySignal.SELL)} color='#ff4444'
          sub={bySignal.SELL?.total ? `${bySignal.SELL.total} signals` : null} />
        <StatCard label="HOLD WIN RATE"   value={winRate(bySignal.HOLD)} color='#ffaa00'
          sub={bySignal.HOLD?.total ? `${bySignal.HOLD.total} signals` : null} />
      </div>

      {/* By timeframe breakdown */}
      {Object.keys(byTf).length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',
          gap:8, marginBottom:20 }}>
          {Object.entries(byTf).map(([tf, d]) => (
            <div key={tf} style={{ background:'#0f0f1a', border:'1px solid #1a1a2e',
              borderRadius:4, padding:'10px 14px' }}>
              <div style={{ fontSize:10, color:'#8899bb', letterSpacing:'.08em', marginBottom:6 }}>
                {TF_LABELS[tf] || tf}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22,
                  color: d.total ? (d.wins/d.total >= .5 ? '#00ff88' : '#ff4444') : '#556677' }}>
                  {d.total ? `${Math.round(d.wins/d.total*100)}%` : '—'}
                </span>
                <span style={{ fontSize:11, color:'#556677' }}>{d.total} resolved</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'#556677' }}>FILTER:</span>
        {/* Timeframe filter */}
        <div style={{ display:'flex', gap:4 }}>
          {[['all','All TF'],['short','Short'],['swing','Swing'],['position','Position'],['longterm','Long']].map(([k,l]) => (
            <button key={k} onClick={() => { setTfFilter(k); setPage(0); }} style={{
              padding:'4px 10px', background: tfFilter===k ? '#ffaa0018' : 'transparent',
              border: `1px solid ${tfFilter===k ? '#ffaa0044' : '#2a2a3e'}`,
              color: tfFilter===k ? '#ffaa00' : '#7788aa', cursor:'pointer',
              fontFamily:"'IBM Plex Mono',monospace", fontSize:10, borderRadius:3 }}>
              {l}
            </button>
          ))}
        </div>
        {/* Signal filter */}
        <div style={{ display:'flex', gap:4 }}>
          {[['all','All'],['BUY','BUY'],['SELL','SELL'],['HOLD','HOLD']].map(([k,l]) => (
            <button key={k} onClick={() => { setSigFilter(k); setPage(0); }} style={{
              padding:'4px 10px', background: sigFilter===k ? (SC[k]+'18'||'#ffaa0018') : 'transparent',
              border: `1px solid ${sigFilter===k ? (SC[k]+'44'||'#ffaa0044') : '#2a2a3e'}`,
              color: sigFilter===k ? (SC[k]||'#ffaa00') : '#7788aa', cursor:'pointer',
              fontFamily:"'IBM Plex Mono',monospace", fontSize:10, borderRadius:3 }}>
              {l}
            </button>
          ))}
        </div>
        <span style={{ fontSize:11, color:'#556677', marginLeft:'auto' }}>
          {filtered.length} signals
        </span>
      </div>

      {/* Signals table */}
      <div style={{ background:'#0a0a14', border:'1px solid #1a1a2e', borderRadius:6, overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'grid',
          gridTemplateColumns:'80px 90px 70px 60px 70px 70px 80px 80px 1fr',
          gap:0, padding:'8px 12px', borderBottom:'1px solid #1a1a2e',
          fontSize:9, color:'#556677', letterSpacing:'.12em', background:'#0c0c18' }}>
          <span>TICKER</span><span>DATE</span><span>TF</span><span>SIGNAL</span>
          <span>CONF</span><span>ENTRY</span><span>TARGET</span><span>RESULT</span><span>P&L</span>
        </div>

        {paginated.length === 0 ? (
          <div style={{ padding:'32px 16px', textAlign:'center', fontSize:12, color:'#556677' }}>
            {stats.pending > 0
              ? `${stats.pending} signals pending — outcomes will appear as timeframes elapse`
              : 'No signals yet — batch runs weekly'}
          </div>
        ) : (
          paginated.map((s, i) => {
            const isEven = i % 2 === 0;
            const pctColor = s.outcome_pct == null ? '#7788aa'
              : s.outcome_pct > 0 ? '#00ff88' : s.outcome_pct < 0 ? '#ff4444' : '#ffaa00';
            return (
              <div key={s.id} style={{
                display:'grid',
                gridTemplateColumns:'80px 90px 70px 60px 70px 70px 80px 80px 1fr',
                gap:0, padding:'9px 12px',
                background: isEven ? '#0c0c18' : 'transparent',
                borderBottom: i < paginated.length-1 ? '1px solid #12121e' : 'none',
                fontSize:12, alignItems:'center' }}>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15,
                  color:'#ffaa00' }}>{s.ticker}</span>
                <span style={{ color:'#7788aa', fontSize:11 }}>
                  {new Date(s.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                </span>
                <span style={{ color:'#8899bb', fontSize:10 }}>{TF_LABELS[s.timeframe]?.split(' ')[0] || s.timeframe}</span>
                <span style={{ color: SC[s.signal] || '#fff', fontWeight:700 }}>{s.signal}</span>
                <span style={{ color:'#b0c0dd' }}>{s.confidence}%</span>
                <span style={{ color:'#c8d8f0' }}>
                  {s.market==='INDIA' ? '₹' : '$'}{s.price_at_signal?.toFixed(2)}
                </span>
                <span style={{ color:'#7788aa', fontSize:11 }}>
                  {s.price_target ? `${s.market==='INDIA'?'₹':'$'}${s.price_target}` : '—'}
                </span>
                <span style={{ color: OC[s.outcome_result] || '#556677', fontWeight:700, fontSize:11 }}>
                  {s.outcome_result === 'PENDING' ? '⏳ PENDING' : s.outcome_result}
                </span>
                <span style={{ color: pctColor, fontWeight: s.outcome_pct != null ? 700 : 400 }}>
                  {s.outcome_pct != null ? fmtPct(s.outcome_pct) : '—'}
                  {s.outcome_price && (
                    <span style={{ color:'#556677', fontWeight:400, marginLeft:6, fontSize:10 }}>
                      → {s.market==='INDIA'?'₹':'$'}{s.outcome_price?.toFixed(2)}
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:14, alignItems:'center' }}>
          <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} style={{
            padding:'5px 14px', background:'transparent', border:'1px solid #2a2a3e',
            color: page===0 ? '#334455' : '#8899bb', cursor: page===0 ? 'default' : 'pointer',
            fontFamily:"'IBM Plex Mono',monospace", fontSize:11, borderRadius:3 }}>← PREV</button>
          <span style={{ fontSize:11, color:'#556677' }}>{page+1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages-1,p+1))} disabled={page===totalPages-1} style={{
            padding:'5px 14px', background:'transparent', border:'1px solid #2a2a3e',
            color: page===totalPages-1 ? '#334455' : '#8899bb',
            cursor: page===totalPages-1 ? 'default' : 'pointer',
            fontFamily:"'IBM Plex Mono',monospace", fontSize:11, borderRadius:3 }}>NEXT →</button>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ marginTop:20, padding:'12px 16px', background:'#0a0a0f',
        border:'1px solid #1a1a2e', borderRadius:4, fontSize:11, color:'#445566', lineHeight:1.7 }}>
        ⚠ System signals are generated automatically every Sunday (US) and Monday (India) for the top 30 stocks in each market across all 4 timeframes. Outcomes are checked daily once the timeframe elapses. This is for accuracy demonstration only — not financial advice.
      </div>
    </div>
  );
}