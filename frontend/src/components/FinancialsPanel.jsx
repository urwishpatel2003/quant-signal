import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

function fmt(n, isInr = false) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const prefix = isInr ? '₹' : '$';
  if (abs >= 1e12) return `${prefix}${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${prefix}${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e7 && isInr) return `${prefix}${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5 && isInr) return `${prefix}${(n / 1e5).toFixed(2)}L`;
  if (abs >= 1e6)  return `${prefix}${(n / 1e6).toFixed(2)}M`;
  return `${prefix}${n.toFixed(2)}`;
}

function GrowthBadge({ value, suffix = '%' }) {
  if (value == null) return <span style={{ color: '#445', fontSize: 11 }}>—</span>;
  const positive = value >= 0;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
      background: positive ? '#00ff8818' : '#ff444418',
      color: positive ? '#00ff88' : '#ff4444',
      border: `1px solid ${positive ? '#00ff8833' : '#ff444433'}`,
    }}>
      {positive ? '+' : ''}{value}{suffix}
    </span>
  );
}

function BeatBadge({ beat, surprisePct }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
      background: beat ? '#00ff8818' : '#ff444418',
      color: beat ? '#00ff88' : '#ff4444',
      border: `1px solid ${beat ? '#00ff8833' : '#ff444433'}`,
    }}>
      {beat ? '✓ BEAT' : '✗ MISS'}
      {surprisePct != null && ` ${surprisePct > 0 ? '+' : ''}${surprisePct.toFixed(1)}%`}
    </span>
  );
}

function QuarterRow({ q, isInr, isLatest }) {
  const label = q.period
    ? `${q.period} ${q.year || ''}`
    : q.endDate || '—';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr',
      gap: 6, padding: '8px 12px', alignItems: 'center',
      borderBottom: '1px solid #1a1a2a',
      background: isLatest ? '#ff9a0008' : 'transparent',
    }}>
      <div style={{ fontSize: 11, color: isLatest ? '#ff9a00' : '#7788aa', fontWeight: isLatest ? 700 : 400 }}>
        {label}
        {isLatest && <div style={{ fontSize: 9, color: '#ff9a0077' }}>LATEST</div>}
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, color: '#c8d8f0' }}>{fmt(q.revenue, isInr)}</div>
      <div style={{ textAlign: 'right', fontSize: 12, color: q.netIncome >= 0 ? '#00ff88' : '#ff4444' }}>{fmt(q.netIncome, isInr)}</div>
      <div style={{ textAlign: 'right', fontSize: 12, color: '#c8d8f0' }}>{q.eps != null ? (isInr ? `₹${q.eps.toFixed(2)}` : `$${q.eps.toFixed(2)}`) : '—'}</div>
      <div style={{ textAlign: 'right', fontSize: 12, color: '#c8d8f0' }}>{q.grossMargin != null ? `${q.grossMargin}%` : '—'}</div>
      <div style={{ textAlign: 'right', fontSize: 12, color: q.netMargin >= 0 ? '#b0c0dd' : '#ff4444' }}>{q.netMargin != null ? `${q.netMargin}%` : '—'}</div>
    </div>
  );
}

function TableHeader() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr',
      gap: 6, padding: '6px 12px',
      borderBottom: '1px solid #2a2a3e',
    }}>
      {['QUARTER', 'REVENUE', 'NET INCOME', 'EPS', 'GROSS MGN', 'NET MGN'].map(h => (
        <div key={h} style={{ fontSize: 9, color: '#445', letterSpacing: '0.1em', textAlign: h === 'QUARTER' ? 'left' : 'right' }}>{h}</div>
      ))}
    </div>
  );
}

export default function FinancialsPanel({ ticker, market = 'US' }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [view,    setView]    = useState('quarterly'); // quarterly | annual
  const isInr = market === 'INDIA';

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(''); setData(null);
    const endpoint = market === 'INDIA'
      ? `${BASE}/financials/india/${ticker}`
      : `${BASE}/financials/us/${ticker}`;
    fetch(endpoint)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [ticker, market]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '24px 0', color: '#445', fontSize: 12 }}>
      Loading financials...
    </div>
  );

  if (error) return (
    <div style={{ fontSize: 12, color: '#ff444488', padding: '12px 0' }}>
      Financials unavailable: {error}
    </div>
  );

  if (!data) return null;

  const quarters = data.quarters || [];
  const annuals  = data.annuals  || [];
  const growth   = data.growth   || {};
  const eps      = data.epsHistory || [];

  return (
    <div>
      {/* ── Growth summary ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { label: 'Rev QoQ', value: growth.revenueQoQ },
          { label: 'Rev YoY', value: growth.revenueYoY },
          { label: 'NI YoY',  value: growth.netIncomeYoY },
          { label: 'EPS YoY', value: growth.epsYoY },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
            <GrowthBadge value={value} />
          </div>
        ))}
        {data.nextEarnings && (
          <div style={{ background: '#ff9a0011', border: '1px solid #ff9a0033', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 9, color: '#ff9a0077', letterSpacing: '0.1em', marginBottom: 4 }}>NEXT EARNINGS</div>
            <div style={{ fontSize: 12, color: '#ff9a00', fontWeight: 700 }}>{data.nextEarnings}</div>
          </div>
        )}
      </div>

      {/* ── EPS Beat/Miss history ── */}
      {eps.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.1em', marginBottom: 8 }}>EPS SURPRISE HISTORY</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {eps.map((e, i) => (
              <div key={i} style={{ background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6, padding: '8px 12px', minWidth: 100 }}>
                <div style={{ fontSize: 10, color: '#556677', marginBottom: 4 }}>{e.quarter || `Q${i + 1}`}</div>
                <BeatBadge beat={e.beat} surprisePct={e.surprisePct} />
                <div style={{ fontSize: 10, color: '#7788aa', marginTop: 4 }}>
                  {e.epsActual != null ? `Act: ${isInr ? '₹' : '$'}${e.epsActual.toFixed(2)}` : ''}
                  {e.epsEstimate != null ? ` Est: ${isInr ? '₹' : '$'}${e.epsEstimate.toFixed(2)}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── View toggle ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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

      {/* ── Table ── */}
      <div style={{ background: '#0f0f1a', border: '1px solid #2a2a3e', borderRadius: 6, overflow: 'hidden' }}>
        <TableHeader />
        {view === 'quarterly'
          ? quarters.map((q, i) => <QuarterRow key={i} q={q} isInr={isInr} isLatest={i === 0} />)
          : annuals.map((a, i)  => <QuarterRow key={i} q={{ ...a, period: a.endDate?.slice(0, 7) }} isInr={isInr} isLatest={i === 0} />)
        }
        {(view === 'quarterly' ? quarters : annuals).length === 0 && (
          <div style={{ padding: '20px 12px', color: '#445', fontSize: 12 }}>No data available</div>
        )}
      </div>

      <div style={{ fontSize: 10, color: '#2a2a3e', marginTop: 8 }}>
        {market === 'INDIA' ? 'Source: Yahoo Finance · INR values' : 'Source: Polygon.io · USD values'}
        {' · '}Not investment advice
      </div>
    </div>
  );
}