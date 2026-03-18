import CalendarPanel from '../components/CalendarPanel';

const REGIONS = [
  { label: '🇯🇵 JAPAN',     syms: [{ name: 'Nikkei 225', sym: '^N225', fmt: v => v ? `$${v.toFixed(2)}` : '—' }] },
  { label: '🇨🇳 CHINA / HK', syms: [
      { name: 'Shanghai',  sym: '000001.SS', fmt: v => v ? `$${v.toFixed(2)}` : '—' },
      { name: 'Hang Seng', sym: '^HSI',      fmt: v => v ? `$${v.toFixed(2)}` : '—' },
    ]
  },
  { label: '🇮🇳 INDIA',     syms: [{ name: 'Sensex (INDA)', sym: '^BSESN', fmt: v => v ? `$${v.toFixed(2)}` : '—' }] },
  { label: '🇪🇺 EUROPE',    syms: [
      { name: 'DAX (EWG)',        sym: '^GDAXI',    fmt: v => v ? `$${v.toFixed(2)}` : '—' },
      { name: 'FTSE (EWU)',       sym: '^FTSE',     fmt: v => v ? `$${v.toFixed(2)}` : '—' },
      { name: 'CAC 40 (EWQ)',     sym: '^FCHI',     fmt: v => v ? `$${v.toFixed(2)}` : '—' },
      { name: 'Euro Stoxx (FEZ)', sym: '^STOXX50E', fmt: v => v ? `$${v.toFixed(2)}` : '—' },
    ]
  },
  { label: '📊 SIGNALS',    syms: [
      { name: 'VIX (VIXY)',    sym: '^VIX',     fmt: v => v ? `$${v.toFixed(2)}` : '—' },
      { name: 'DXY (UUP)',     sym: 'DX-Y.NYB', fmt: v => v ? `$${v.toFixed(2)}` : '—' },
      { name: 'Gold (GLD)',    sym: 'GC=F',     fmt: v => v ? `$${v.toFixed(2)}` : '—' },
      { name: 'Oil (USO)',     sym: 'CL=F',     fmt: v => v ? `$${v.toFixed(2)}` : '—' },
    ]
  },
];

function Row({ name, data, fmt }) {
  if (!data?.current) return null;
  const up = data.changePct >= 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderBottom: '1px solid #1a1a26' }}>
      <div style={{ fontSize: 12, color: '#aab' }}>{name}</div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(data.current)}</div>
        <div style={{ fontSize: 10, color: up ? '#00ff88' : '#ff4444' }}>
          {up ? '▲' : '▼'} {Math.abs(data.changePct)?.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

export default function MarketsTab({ intlMarkets, bonds, macroNews, calendar }) {
  const find = sym => intlMarkets?.find(m => m.symbol === sym);

  if (!intlMarkets?.length) return (
    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
      <div className="pulse" style={{ fontSize: 12, color: '#666' }}>Loading global markets...</div>
    </div>
  );

  const vix  = find('^VIX');
  const gold = find('GC=F');

  const sentimentSyms = ['^N225', '^HSI', '000001.SS', '^BSESN', '^GDAXI', '^FTSE', '^FCHI'].map(find);
  const upCount = sentimentSyms.filter(m => m?.changePct > 0).length;
  const validCount = sentimentSyms.filter(m => m?.current).length;
  const globalSentiment = validCount === 0 ? 'LOADING' : upCount >= 5 ? 'RISK ON' : upCount <= 2 ? 'RISK OFF' : 'MIXED';
  const sentimentColor  = globalSentiment === 'RISK ON' ? '#00ff88' : globalSentiment === 'RISK OFF' ? '#ff4444' : '#ffaa00';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Summary cards ── */}
      <div className="markets-summary">
        {[
          ['GLOBAL SENTIMENT', globalSentiment, sentimentColor, validCount > 0 ? `${upCount}/${validCount} markets ↑` : 'Awaiting data'],
          ['VIX · FEAR INDEX',
            vix?.current ? vix.current.toFixed(2) : '—',
            vix?.current > 25 ? '#ff4444' : vix?.current > 20 ? '#ffaa00' : '#00ff88',
            vix?.current > 30 ? 'EXTREME FEAR' : vix?.current > 25 ? 'HIGH FEAR' : vix?.current > 20 ? 'ELEVATED' : 'CALM'],
          ['YIELD CURVE',
            bonds?.inverted ? 'INVERTED' : 'NORMAL',
            bonds?.inverted ? '#ff4444' : '#00ff88',
            bonds?.inverted ? '⚠ TLT < SHY' : 'TLT > SHY'],
          ['GOLD (GLD)',
            gold?.current ? `$${gold.current.toFixed(2)}` : '—',
            gold?.changePct > 0 ? '#00ff88' : '#ff4444',
            gold?.changePct != null ? `${gold.changePct > 0 ? '▲' : '▼'} ${Math.abs(gold.changePct).toFixed(2)}%` : ''],
        ].map(([l, v, c, sub]) => (
          <div key={l} className="card" style={{ textAlign: 'center', borderColor: c + '33' }}>
            <div style={{ fontSize: 10, color: '#8899bb', marginBottom: 4 }}>{l}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(20px, 4vw, 28px)', color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: c }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── ETF proxy notice ── */}
      <div style={{ fontSize: 10, color: '#7788aa', textAlign: 'center' }}>
        * International markets shown as ETF proxy prices (EWJ, EWH, FXI, INDA, EWG, EWU, EWQ, FEZ, VIXY, UUP, GLD, USO)
      </div>

      {/* ── Markets grid ── */}
      <div className="markets-grid">
        {REGIONS.map(r => (
          <div key={r.label} className="card">
            <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 10 }}>{r.label}</div>
            {r.syms.map(({ name, sym, fmt }) => <Row key={sym} name={name} data={find(sym)} fmt={fmt} />)}
          </div>
        ))}

        {bonds && (
          <div className="card">
            <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 10 }}>📊 US BONDS <span style={{ fontSize: 8, color: '#7788aa' }}>(ETF PRICES)</span></div>
            {[
              ['TLT (20Y)',    bonds.tlt, bonds.tlt?.changePct > 0 ? '#00ff88' : '#ff4444'],
              ['IEF (7-10Y)',  bonds.ief, bonds.ief?.changePct > 0 ? '#00ff88' : '#ff4444'],
              ['SHY (1-3Y)',   bonds.irx, bonds.irx?.changePct > 0 ? '#00ff88' : '#ff4444'],
            ].map(([k, d, c]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #1a1a26' }}>
                <div style={{ fontSize: 12, color: '#aab' }}>{k}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c }}>
                    {d?.current ? `$${d.current.toFixed(2)}` : '—'}
                  </div>
                  {d?.changePct != null && (
                    <div style={{ fontSize: 10, color: c }}>
                      {d.changePct > 0 ? '▲' : '▼'} {Math.abs(d.changePct).toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
            {bonds.inverted && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#ff444488', borderLeft: '2px solid #ff444433', paddingLeft: 8 }}>
                ⚠ Inverted curve — historical recession precursor
              </div>
            )}
          </div>
        )}

        <CalendarPanel calendar={calendar} />

        {macroNews?.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 10 }}>🌍 MACRO & GEO NEWS</div>
            {macroNews.slice(0, 8).map((n, i) => (
              <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid #1a1a26', fontSize: 10 }}>
                <div style={{ color: '#ffaa0055', fontSize: 9, marginBottom: 2 }}>
                  {n.topic?.split(' ').slice(0, 3).join(' ')?.toUpperCase()}
                </div>
                <div style={{ color: '#aab', lineHeight: 1.4 }}>{n.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}