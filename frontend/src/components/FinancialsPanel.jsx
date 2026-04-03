import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

function fmtVal(n, isInr = false) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const sym  = isInr ? '₹' : '$';
  if (isInr) {
    if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e7)  return `${sign}${sym}${(abs / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5)  return `${sign}${sym}${(abs / 1e5).toFixed(2)}L`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
  return `${sign}${sym}${abs.toFixed(2)}`;
}

function fmtEps(n, isInr) {
  if (n == null) return '—';
  return isInr ? `₹${n.toFixed(2)}` : `$${n.toFixed(2)}`;
}

function fmtPct(n, suffix = '%', alwaysSign = true) {
  if (n == null) return '—';
  const sign = alwaysSign && n > 0 ? '+' : '';
  return `${sign}${parseFloat(n).toFixed(2)}${suffix}`;
}

function YoYBadge({ value, isBps = false }) {
  if (value == null) return <span style={{ color: '#445', fontSize: 10 }}>—</span>;
  const up  = value >= 0;
  const txt = isBps
    ? `${up ? '+' : ''}${value.toFixed(2)}pp`
    : `${up ? '+' : ''}${value}%`;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
      background: up ? '#00ff8815' : '#ff444415',
      color:      up ? '#00ff88'   : '#ff4444',
    }}>
      {up ? '▲' : '▼'} {txt}
    </span>
  );
}

function BeatBadge({ beat, surprisePct }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
      background: beat ? '#00ff8815' : '#ff444415',
      color:      beat ? '#00ff88'   : '#ff4444',
    }}>
      {beat ? '✓ BEAT' : '✗ MISS'}
      {surprisePct != null && ` ${surprisePct > 0 ? '+' : ''}${surprisePct.toFixed(1)}%`}
    </span>
  );
}

const COL_STYLE = { fontSize: 13, color: '#c8d8f0', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" };
const HDR_STYLE = { fontSize: 9, color: '#445', letterSpacing: '0.1em', textAlign: 'right' };
const HDR_LEFT  = { fontSize: 9, color: '#445', letterSpacing: '0.1em', textAlign: 'left' };
const PERIOD_STYLE = { fontSize: 11, color: '#7788aa' };

export default function FinancialsPanel({ ticker, market = 'US' }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [view,    setView]    = useState('quarterly');
  const isInr = market === 'INDIA';

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(''); setData(null);
    const url = `${BASE}/financials/${market === 'INDIA' ? 'india' : 'us'}/${ticker}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [ticker, market]);

  if (loading) return <div style={{ color: '#445', fontSize: 12, padding: '16px 0' }}>Loading financials...</div>;
  if (error)   return <div style={{ color: '#ff444488', fontSize: 12, padding: '8px 0' }}>Unavailable: {error}</div>;
  if (!data)   return null;

  const rows  = view === 'quarterly' ? data.quarters : data.annuals;
  const yoy   = data.yoy || {};
  const eps   = data.epsHistory || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── YoY summary badges ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Revenue YoY',    value: yoy.revenueYoY,   isBps: false },
          { label: 'Net Income YoY', value: yoy.netIncomeYoY, isBps: false },
          { label: 'EPS YoY',        value: yoy.epsYoY,       isBps: false },
          { label: 'Net Margin YoY', value: yoy.netMarginYoY, isBps: true  },
        ].map(({ label, value, isBps }) => (
          <div key={label} style={{ background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6, padding: '7px 12px' }}>
            <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
            <YoYBadge value={value} isBps={isBps} />
          </div>
        ))}
        {data.nextEarnings && (
          <div style={{ background: '#ff9a0011', border: '1px solid #ff9a0033', borderRadius: 6, padding: '7px 12px' }}>
            <div style={{ fontSize: 9, color: '#ff9a0077', letterSpacing: '0.1em', marginBottom: 4 }}>NEXT EARNINGS</div>
            <div style={{ fontSize: 12, color: '#ff9a00', fontWeight: 700 }}>{data.nextEarnings}</div>
          </div>
        )}
      </div>

      {/* ── EPS beat/miss strip ── */}
      {eps.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.1em', marginBottom: 8 }}>EPS SURPRISE HISTORY</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {eps.map((e, i) => (
              <div key={i} style={{ background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 5, padding: '6px 10px', minWidth: 90 }}>
                <div style={{ fontSize: 10, color: '#556677', marginBottom: 4 }}>{e.quarter || `Q${i + 1}`}</div>
                <BeatBadge beat={e.beat} surprisePct={e.surprisePct} />
                <div style={{ fontSize: 10, color: '#7788aa', marginTop: 3 }}>
                  {e.epsActual   != null && `Act: ${fmtEps(e.epsActual, isInr)}`}
                  {e.epsEstimate != null && ` Est: ${fmtEps(e.epsEstimate, isInr)}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── View toggle ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['quarterly', 'QUARTERLY'], ['annual', 'ANNUAL']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: '4px 12px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
            border: `1px solid ${view === k ? '#ff9a00' : '#2a2a3e'}`,
            background: view === k ? '#ff9a0011' : '#0a0a14',
            color: view === k ? '#ff9a00' : '#556677',
            fontFamily: 'inherit', letterSpacing: '0.08em',
          }}>{l}</button>
        ))}
      </div>

      {/* ── Main table ── */}
      <div style={{ background: '#0f0f1a', border: '1px solid #2a2a3e', borderRadius: 6, overflowX: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr 1fr', gap: 8, padding: '8px 12px', borderBottom: '1px solid #2a2a3e', minWidth: 420 }}>
          <div style={HDR_LEFT}>PERIOD</div>
          <div style={HDR_STYLE}>REVENUE</div>
          <div style={HDR_STYLE}>NET INCOME</div>
          <div style={HDR_STYLE}>DILUTED EPS</div>
          <div style={HDR_STYLE}>NET MARGIN</div>
        </div>

        {/* Rows */}
        {(rows || []).map((q, i) => {
          // YoY for individual row = compare to row 4 quarters ago
          const prior = (rows || [])[i + 4];
          const rowRevYoY = prior ? calcYoY(q.revenue,   prior.revenue)   : null;
          const rowNiYoY  = prior ? calcYoY(q.netIncome, prior.netIncome) : null;
          const rowEpsYoY = prior ? calcYoY(q.epsDiluted,prior.epsDiluted): null;
          const rowNmYoY  = prior && q.netMargin != null && prior.netMargin != null
            ? parseFloat((q.netMargin - prior.netMargin).toFixed(2)) : null;

          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr 1fr',
              gap: 8, padding: '10px 12px',
              borderBottom: i < rows.length - 1 ? '1px solid #1a1a2a' : 'none',
              background: i === 0 ? '#ff9a0008' : 'transparent',
              minWidth: 420,
            }}>
              <div>
                <div style={{ ...PERIOD_STYLE, color: i === 0 ? '#ff9a00' : '#7788aa', fontWeight: i === 0 ? 700 : 400 }}>
                  {q.period || q.endDate?.slice(0, 7)}
                </div>
                {i === 0 && <div style={{ fontSize: 8, color: '#ff9a0077', marginTop: 1 }}>LATEST</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={COL_STYLE}>{fmtVal(q.revenue, isInr)}</div>
                {rowRevYoY != null && <div style={{ marginTop: 2, textAlign: 'right' }}><YoYBadge value={rowRevYoY} /></div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...COL_STYLE, color: (q.netIncome ?? 0) >= 0 ? '#00ff88' : '#ff4444' }}>{fmtVal(q.netIncome, isInr)}</div>
                {rowNiYoY != null && <div style={{ marginTop: 2, textAlign: 'right' }}><YoYBadge value={rowNiYoY} /></div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={COL_STYLE}>{fmtEps(q.epsDiluted, isInr)}</div>
                {rowEpsYoY != null && <div style={{ marginTop: 2, textAlign: 'right' }}><YoYBadge value={rowEpsYoY} /></div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...COL_STYLE, color: (q.netMargin ?? 0) >= 0 ? '#b0c0dd' : '#ff4444' }}>
                  {q.netMargin != null ? `${q.netMargin}%` : '—'}
                </div>
                {rowNmYoY != null && <div style={{ marginTop: 2, textAlign: 'right' }}><YoYBadge value={rowNmYoY} isBps /></div>}
              </div>
            </div>
          );
        })}

        {(!rows || rows.length === 0) && (
          <div style={{ padding: '20px 12px', color: '#445', fontSize: 12 }}>No data available</div>
        )}
      </div>

      <div style={{ fontSize: 10, color: '#2a2a3e' }}>
        {market === 'INDIA' ? 'Source: Yahoo Finance · INR' : 'Source: Polygon.io · USD'} · Not investment advice
      </div>
    </div>
  );
}

// helper used inside row rendering
function calcYoY(a, b) {
  if (a == null || b == null || b === 0) return null;
  return parseFloat(((a - b) / Math.abs(b) * 100).toFixed(1));
}