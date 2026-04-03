import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

function fmtPct(n) {
  if (n == null) return '—';
  const s = parseFloat(n).toFixed(2);
  return `${n >= 0 ? '+' : ''}${s}%`;
}
function pctColor(n) {
  if (n == null) return '#7788aa';
  return n >= 0 ? '#00ff88' : '#ff4444';
}
function fmtPrice(n, decimals = 2) {
  if (n == null) return '—';
  return parseFloat(n).toLocaleString('en-IN', { maximumFractionDigits: decimals });
}

const CATEGORY_COLOR = {
  index:     '#ff9a00',
  sector:    '#4488ff',
  commodity: '#ffaa00',
};

// ── Mini stat card ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#e8e8f0', borderColor }) {
  return (
    <div style={{
      background: '#0f0f1a', border: `1px solid ${borderColor || '#2a2a40'}`,
      borderRadius: 6, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 9, color: '#556677', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7788aa', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 24 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#ff9a00', letterSpacing: '0.08em' }}>{title}</div>
    </div>
  );
}

// ── Sector row ────────────────────────────────────────────────────────────────
function SectorRow({ sector }) {
  const isUp = (sector.changePct || 0) >= 0;
  const barWidth = Math.min(Math.abs(sector.changePct || 0) * 10, 100);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderBottom: '1px solid #1a1a2a',
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: 2, flexShrink: 0,
        background: CATEGORY_COLOR[sector.category] || '#7788aa',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#c8d8f0', fontWeight: 500 }}>{sector.name}</div>
        <div style={{ fontSize: 10, color: '#445', marginTop: 2 }}>{sector.symbol}</div>
      </div>
      {/* Bar */}
      <div style={{ width: 80, height: 4, background: '#1a1a2a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${barWidth}%`,
          background: isUp ? '#00ff88' : '#ff4444',
          marginLeft: isUp ? 0 : 'auto',
        }} />
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
        {sector.price && (
          <div style={{ fontSize: 13, color: '#e8e8f0', fontFamily: "'JetBrains Mono',monospace" }}>
            ₹{fmtPrice(sector.price)}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(sector.changePct) }}>
          {fmtPct(sector.changePct)}
        </div>
      </div>
    </div>
  );
}

// ── Mover card ────────────────────────────────────────────────────────────────
function MoverCard({ stock, type }) {
  const color = type === 'gainer' ? '#00ff88' : '#ff4444';
  return (
    <div style={{
      background: '#0f0f1a', border: `1px solid ${color}22`,
      borderRadius: 6, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0' }}>{stock.ticker}</div>
          <div style={{ fontSize: 10, color: '#556677', marginTop: 2 }}>
            {stock.name?.length > 20 ? stock.name.slice(0, 20) + '…' : stock.name}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: color, fontWeight: 700 }}>{fmtPct(stock.changePct)}</div>
          <div style={{ fontSize: 11, color: '#7788aa', marginTop: 2 }}>₹{fmtPrice(stock.price)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Global signal pill ────────────────────────────────────────────────────────
function GlobalPill({ label, changePct }) {
  const isUp = (changePct || 0) >= 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: '#0f0f1a', border: '1px solid #2a2a40',
      borderRadius: 6, padding: '8px 12px',
    }}>
      <span style={{ fontSize: 12, color: '#99aacc' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: pctColor(changePct) }}>{fmtPct(changePct)}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function IndiaMarketsTab() {
  const [macro,   setMacro]   = useState(null);
  const [movers,  setMovers]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [moverTab, setMoverTab] = useState('gainers');
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      fetch(`${BASE}/india/macro`).then(r => r.json()),
      fetch(`${BASE}/india/movers`).then(r => r.json()),
    ]).then(([macroRes, moversRes]) => {
      if (macroRes.status === 'fulfilled' && !macroRes.value?.error) setMacro(macroRes.value);
      if (moversRes.status === 'fulfilled' && !moversRes.value?.error) setMovers(moversRes.value);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const refresh = () => {
    setLoading(true); setError('');
    Promise.allSettled([
      fetch(`${BASE}/india/macro`).then(r => r.json()),
      fetch(`${BASE}/india/movers`).then(r => r.json()),
    ]).then(([macroRes, moversRes]) => {
      if (macroRes.status === 'fulfilled') setMacro(macroRes.value);
      if (moversRes.status === 'fulfilled') setMovers(moversRes.value);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#7788aa' }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#ff9a00', marginBottom: 10 }}>
        LOADING INDIA MARKETS
      </div>
      <div style={{ fontSize: 12 }}>Fetching live NSE data...</div>
    </div>
  );

  const nifty  = macro?.sectors?.find(s => s.symbol === 'NIFTYBEES');
  const gold   = macro?.sectors?.find(s => s.symbol === 'GOLDBEES');
  const bank   = macro?.sectors?.find(s => s.symbol === 'BANKBEES');
  const it     = macro?.sectors?.find(s => s.symbol === 'ITBEES');

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#ff9a00' }}>
            🇮🇳 INDIA MARKETS
          </div>
          <div style={{ fontSize: 11, color: '#556677' }}>
            NSE · Live data · {macro?.updatedAt ? new Date(macro.updatedAt).toLocaleTimeString('en-IN') : '—'}
          </div>
        </div>
        <button
          onClick={refresh}
          style={{ background: 'none', border: '1px solid #2a2a40', color: '#7788aa',
            cursor: 'pointer', borderRadius: 4, padding: '6px 12px', fontSize: 11,
            fontFamily: 'inherit', letterSpacing: '0.08em' }}
        >↺ REFRESH</button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#ff4444', background: '#ff444411',
          border: '1px solid #ff444433', borderRadius: 4, padding: '8px 12px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── Key Metrics ── */}
      <SectionHeader icon="📊" title="KEY METRICS" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        <StatCard
          label="NIFTY 50 (ETF)"
          value={nifty?.price ? `₹${fmtPrice(nifty.price)}` : '—'}
          sub={fmtPct(nifty?.changePct)}
          color={pctColor(nifty?.changePct)}
          borderColor={pctColor(nifty?.changePct) + '44'}
        />
        <StatCard
          label="NIFTY BANK (ETF)"
          value={bank?.price ? `₹${fmtPrice(bank.price)}` : '—'}
          sub={fmtPct(bank?.changePct)}
          color={pctColor(bank?.changePct)}
          borderColor={pctColor(bank?.changePct) + '44'}
        />
        <StatCard
          label="NIFTY IT (ETF)"
          value={it?.price ? `₹${fmtPrice(it.price)}` : '—'}
          sub={fmtPct(it?.changePct)}
          color={pctColor(it?.changePct)}
          borderColor={pctColor(it?.changePct) + '44'}
        />
        <StatCard
          label="USD / INR"
          value={macro?.usdInr?.price ? `₹${fmtPrice(macro.usdInr.price)}` : '—'}
          sub={fmtPct(macro?.usdInr?.changePct)}
          color={macro?.usdInr?.changePct != null
            ? (macro.usdInr.changePct >= 0 ? '#ff4444' : '#00ff88') // rupee weakens if USD rises
            : '#7788aa'}
        />
        <StatCard
          label="GOLD (₹/g)"
          value={macro?.gold?.priceInr ? `₹${fmtPrice(macro.gold.priceInr, 0)}` : '—'}
          sub={fmtPct(macro?.gold?.changePct)}
          color={pctColor(macro?.gold?.changePct)}
          borderColor="#ffaa0033"
        />
        <StatCard
          label="BRENT CRUDE"
          value={macro?.crude?.price ? `$${fmtPrice(macro.crude.price)}` : '—'}
          sub={fmtPct(macro?.crude?.changePct)}
          color={macro?.crude?.changePct != null
            ? (macro.crude.changePct >= 0 ? '#ff4444' : '#00ff88') // high crude = bad for India
            : '#7788aa'}
        />
        {macro?.india10Y?.yield && (
          <StatCard
            label="INDIA 10Y YIELD"
            value={`${fmtPrice(macro.india10Y.yield)}%`}
            sub="Govt bond yield"
            color="#4488ff"
          />
        )}
      </div>

      {/* ── Macro context note ── */}
      <div style={{ background: '#0a0a14', border: '1px solid #1a1a2a', borderRadius: 6,
        padding: '10px 14px', marginTop: 12, fontSize: 11, color: '#556677', lineHeight: 1.7 }}>
        <span style={{ color: '#ff9a0077' }}>💡 </span>
        Rising USD/INR = rupee weakness → FII outflows pressure. Rising crude = inflation risk for RBI.
        India 10Y yield rise = tighter liquidity. Gold up = risk-off sentiment.
      </div>

      {/* ── Sector Heatmap ── */}
      <SectionHeader icon="🏭" title="SECTOR PERFORMANCE" />
      <div style={{ background: '#0f0f1a', border: '1px solid #2a2a40', borderRadius: 6, overflow: 'hidden' }}>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, padding: '8px 14px', borderBottom: '1px solid #1a1a2a' }}>
          {Object.entries(CATEGORY_COLOR).map(([k, c]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 10, color: '#556677', textTransform: 'capitalize' }}>{k}</span>
            </div>
          ))}
        </div>
        {macro?.sectors?.length > 0
          ? macro.sectors
              .sort((a, b) => (b.changePct || 0) - (a.changePct || 0))
              .map(s => <SectorRow key={s.symbol} sector={s} />)
          : <div style={{ padding: '20px 14px', color: '#445', fontSize: 13 }}>No sector data available</div>
        }
      </div>

      {/* ── Market Movers ── */}
      <SectionHeader icon="🚀" title="MARKET MOVERS" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['gainers','🟢 GAINERS'], ['losers','🔴 LOSERS'], ['volume','📊 VOLUME']].map(([k, l]) => (
          <button key={k} onClick={() => setMoverTab(k)} style={{
            padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
            border: `1px solid ${moverTab === k ? '#ff9a00' : '#2a2a3e'}`,
            background: moverTab === k ? '#ff9a0018' : '#0f0f1a',
            color: moverTab === k ? '#ff9a00' : '#7788aa',
            fontFamily: 'inherit', fontSize: 11, letterSpacing: '0.08em',
          }}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {movers && (movers[moverTab] || []).slice(0, 10).map((s, i) => (
          <MoverCard key={i} stock={s} type={moverTab === 'losers' ? 'loser' : 'gainer'} />
        ))}
        {(!movers || !(movers[moverTab] || []).length) && (
          <div style={{ color: '#445', fontSize: 13, padding: '20px 0', gridColumn: '1/-1' }}>
            No data available
          </div>
        )}
      </div>

      {/* ── Global Signals ── */}
      {macro?.globalSignals && Object.keys(macro.globalSignals).length > 0 && (
        <>
          <SectionHeader icon="🌍" title="GLOBAL SIGNALS" />
          <div style={{ fontSize: 11, color: '#556677', marginBottom: 10 }}>
            Key global markets that drive FII flows into India
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.values(macro.globalSignals).map((s, i) => (
              <GlobalPill key={i} label={s.label} changePct={s.changePct} />
            ))}
          </div>
          <div style={{ background: '#0a0a14', border: '1px solid #1a1a2a', borderRadius: 6,
            padding: '10px 14px', marginTop: 12, fontSize: 11, color: '#556677', lineHeight: 1.7 }}>
            <span style={{ color: '#ff9a0077' }}>💡 </span>
            S&P 500 up + DXY flat = positive FII flows likely. DXY rising sharply = FII pullback risk.
            China weakness = rotation to India possible.
          </div>
        </>
      )}

      <div style={{ fontSize: 10, color: '#2a2a3e', marginTop: 28, textAlign: 'center' }}>
        Data from NSE via stock-nse-india / Yahoo Finance · Refreshed every 5 min · Not investment advice
      </div>
    </div>
  );
}