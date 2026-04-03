import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

const SECTOR_COLORS = {
  XLK:  '#4488ff', XLF:  '#ff9a00', XLV:  '#00ff88',
  XLE:  '#ffaa00', XLI:  '#aa88ff', XLY:  '#ff6688',
  XLP:  '#44ddcc', XLU:  '#88aaff', XLRE: '#ffcc44',
  XLB:  '#66dd88', XLC:  '#ff8844',
};

function heatColor(pct) {
  if (pct == null) return '#1a1a2a';
  if (pct >=  2)   return '#00ff8844';
  if (pct >=  1)   return '#00ff8822';
  if (pct >=  0)   return '#00ff8811';
  if (pct >= -1)   return '#ff444411';
  if (pct >= -2)   return '#ff444422';
  return '#ff444444';
}

function textColor(pct) {
  if (pct == null) return '#7788aa';
  return pct >= 0 ? '#00ff88' : '#ff4444';
}

function fmt(n) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${parseFloat(n).toFixed(2)}%`;
}

function SectorTile({ sector, view }) {
  const pct = sector.changePct;
  const isUp = (pct || 0) >= 0;

  if (view === 'grid') {
    return (
      <div style={{
        background: heatColor(pct),
        border: `1px solid ${SECTOR_COLORS[sector.symbol]}33`,
        borderTop: `3px solid ${SECTOR_COLORS[sector.symbol]}`,
        borderRadius: 6, padding: '14px 12px',
        display: 'flex', flexDirection: 'column', gap: 6,
        cursor: 'default', transition: 'all 0.15s',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0', fontFamily: "'JetBrains Mono', monospace" }}>
              {sector.symbol}
            </div>
            <div style={{ fontSize: 10, color: '#556677', marginTop: 2 }}>{sector.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: textColor(pct) }}>{fmt(pct)}</div>
            {sector.price && (
              <div style={{ fontSize: 11, color: '#7788aa', marginTop: 2 }}>
                ${parseFloat(sector.price).toFixed(2)}
              </div>
            )}
          </div>
        </div>
        {/* Mini bar */}
        <div style={{ height: 3, background: '#1a1a2a', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${Math.min(Math.abs(pct || 0) * 20, 100)}%`,
            background: isUp ? '#00ff88' : '#ff4444',
            marginLeft: isUp ? 0 : 'auto',
          }} />
        </div>
        {/* 52W context */}
        {sector.week52High && sector.week52Low && sector.price && (
          <div style={{ fontSize: 9, color: '#445', marginTop: 2 }}>
            52W: ${parseFloat(sector.week52Low).toFixed(0)} – ${parseFloat(sector.week52High).toFixed(0)}
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderBottom: '1px solid #1a1a2a',
      background: heatColor(pct),
    }}>
      <div style={{ width: 4, height: 36, borderRadius: 2, background: SECTOR_COLORS[sector.symbol], flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0', fontFamily: "'JetBrains Mono', monospace" }}>{sector.symbol}</span>
          <span style={{ fontSize: 11, color: '#556677' }}>{sector.name}</span>
        </div>
        {/* Bar */}
        <div style={{ height: 3, background: '#1a1a2e', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${Math.min(Math.abs(pct || 0) * 20, 100)}%`,
            background: isUp ? '#00ff88' : '#ff4444',
            marginLeft: isUp ? 0 : 'auto',
          }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {sector.price && (
          <div style={{ fontSize: 13, color: '#e8e8f0', fontFamily: "'JetBrains Mono', monospace" }}>
            ${parseFloat(sector.price).toFixed(2)}
          </div>
        )}
        <div style={{ fontSize: 13, fontWeight: 700, color: textColor(pct) }}>{fmt(pct)}</div>
      </div>
    </div>
  );
}

export default function USSectorHeatmap() {
  const [sectors,  setSectors]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState('grid'); // grid | list
  const [sortBy,   setSortBy]   = useState('pct');  // pct | name
  const [error,    setError]    = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = () => {
    setLoading(true); setError('');
    fetch(`${BASE}/sectors/us`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setSectors(data.sectors || []);
        setLastUpdate(new Date());
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const sorted = [...sectors].sort((a, b) => {
    if (sortBy === 'pct') return (b.changePct || 0) - (a.changePct || 0);
    return a.name.localeCompare(b.name);
  });

  const gainers = sectors.filter(s => (s.changePct || 0) > 0).length;
  const losers  = sectors.filter(s => (s.changePct || 0) < 0).length;
  const avgPct  = sectors.length
    ? sectors.reduce((a, s) => a + (s.changePct || 0), 0) / sectors.length
    : 0;

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#ff9a00', letterSpacing: '0.06em' }}>
            S&P 500 SECTOR HEATMAP
          </div>
          {lastUpdate && (
            <div style={{ fontSize: 10, color: '#445', marginTop: 2 }}>
              Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' · '}
              <span style={{ color: '#00ff8877' }}>{gainers} ↑</span>
              {' '}
              <span style={{ color: '#ff444477' }}>{losers} ↓</span>
              {' · Avg '}
              <span style={{ color: avgPct >= 0 ? '#00ff8877' : '#ff444477' }}>{fmt(avgPct)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Sort */}
          {[['pct','% CHANGE'],['name','A–Z']].map(([k, l]) => (
            <button key={k} onClick={() => setSortBy(k)} style={{
              padding: '4px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
              border: `1px solid ${sortBy === k ? '#ff9a00' : '#2a2a3e'}`,
              background: sortBy === k ? '#ff9a0011' : '#0a0a14',
              color: sortBy === k ? '#ff9a00' : '#556677',
              fontFamily: 'inherit', letterSpacing: '0.08em',
            }}>{l}</button>
          ))}
          {/* View toggle */}
          {[['grid','⊞'],['list','≡']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{
              padding: '4px 10px', fontSize: 13, cursor: 'pointer', borderRadius: 3,
              border: `1px solid ${view === k ? '#ff9a00' : '#2a2a3e'}`,
              background: view === k ? '#ff9a0011' : '#0a0a14',
              color: view === k ? '#ff9a00' : '#556677',
              fontFamily: 'inherit',
            }}>{l}</button>
          ))}
          <button onClick={load} style={{
            padding: '4px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
            border: '1px solid #2a2a3e', background: '#0a0a14', color: '#556677',
            fontFamily: 'inherit',
          }}>↺</button>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#ff4444', background: '#ff444411',
          border: '1px solid #ff444433', borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#445', fontSize: 12 }}>
          Loading sector data...
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {sorted.map(s => <SectorTile key={s.symbol} sector={s} view="grid" />)}
        </div>
      ) : (
        <div style={{ background: '#0f0f1a', border: '1px solid #2a2a40', borderRadius: 6, overflow: 'hidden' }}>
          {sorted.map(s => <SectorTile key={s.symbol} sector={s} view="list" />)}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          { label: '> +2%', color: '#00ff8844' },
          { label: '+1–2%', color: '#00ff8822' },
          { label: '0–1%', color: '#00ff8811' },
          { label: '-1–0%', color: '#ff444411' },
          { label: '-1–2%', color: '#ff444422' },
          { label: '< -2%', color: '#ff444444' },
        ].map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: l.color, border: '1px solid #2a2a3e' }} />
            <span style={{ fontSize: 10, color: '#445' }}>{l.label}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#2a2a3e', marginTop: 10 }}>
        SPDR Sector ETFs (XLK, XLF, XLV, XLE, XLI, XLY, XLP, XLU, XLRE, XLB, XLC) · Via Tradier · Not investment advice
      </div>
    </div>
  );
}