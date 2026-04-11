import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';

const BASE = import.meta.env.VITE_API_BASE;

// ── Safe date parser — handles MM/DD/YYYY, YYYY-MM-DD, M/D/YY, "Jan 15, 2024" etc ──
function parseDateSafe(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // Already ISO: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY or M/D/YYYY (Robinhood, Schwab, TD)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? (parseInt(y) > 50 ? '19' + y : '20' + y) : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // MM-DD-YYYY
  const mdyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyDash) {
    const [, m, d, y] = mdyDash;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // "Jan 15, 2024" or "January 15, 2024"
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const longDate = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (longDate) {
    const m = months[longDate[1].toLowerCase().slice(0,3)];
    if (m) return `${longDate[3]}-${String(m).padStart(2,'0')}-${longDate[2].padStart(2,'0')}`;
  }

  // Last resort: let browser parse but catch errors
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}

  return null; // unparseable — skip row
}

// ── Broker CSV field mappings ─────────────────────────────────────────────────
const BROKER_PROFILES = {
  robinhood: {
    name: 'Robinhood',
    dateField:   ['Activity Date', 'Process Date', 'Date'],
    typeField:   ['Trans Code', 'Type', 'Transaction Type'],
    symbolField: ['Instrument', 'Symbol'],  // Instrument = ticker, NOT Description
    qtyField:    ['Quantity'],
    priceField:  ['Price'],
    amountField: ['Amount'],
    descField:   ['Description'],  // extra: human label for the transaction
    typeMap: {
      // Equity trades
      'Buy': 'BUY', 'Sell': 'SELL',
      // Options
      'BTO': 'BUY', 'STO': 'OTHER', 'BTC': 'BUY', 'STC': 'SELL',
      'OEXP': 'OTHER', 'OCA': 'OTHER', 'OEX': 'OTHER',
      // Dividends
      'CDIV': 'DIV', 'DIV': 'DIV', 'SDIV': 'DIV', 'REIN': 'DIV',
      // Transfers / cash
      'ACH':   'TRANSFER', 'ACATS': 'TRANSFER', 'JNLC': 'TRANSFER',
      'JNLS':  'TRANSFER', 'RTP':   'TRANSFER', 'WIRE': 'TRANSFER',
      // Fees / misc
      'GOLD': 'OTHER', 'MISC': 'OTHER', 'SLIP': 'OTHER',
      'REORG': 'OTHER', 'SPL': 'SPLIT', 'SPLIT': 'SPLIT',
    },
  },
  fidelity: {
    name: 'Fidelity',
    dateField:   ['Run Date', 'Date'],
    typeField:   ['Action'],
    symbolField: ['Symbol'],
    qtyField:    ['Quantity'],
    priceField:  ['Price ($)','Price'],
    amountField: ['Amount ($)','Amount'],
    typeMap: { 'YOU BOUGHT': 'BUY', 'YOU SOLD': 'SELL', 'DIVIDEND RECEIVED': 'DIV', 'REINVESTMENT': 'BUY', 'STOCK SPLIT': 'SPLIT', 'TRANSFERRED': 'TRANSFER' },
  },
  schwab: {
    name: 'Charles Schwab',
    dateField:   ['Date'],
    typeField:   ['Action'],
    symbolField: ['Symbol'],
    qtyField:    ['Quantity'],
    priceField:  ['Price'],
    amountField: ['Amount'],
    typeMap: { 'Buy': 'BUY', 'Sell': 'SELL', 'Qual Div': 'DIV', 'Cash Div': 'DIV', 'Stock Split': 'SPLIT', 'Wire Funds': 'TRANSFER', 'Journal': 'TRANSFER' },
  },
  td: {
    name: 'TD Ameritrade',
    dateField:   ['DATE'],
    typeField:   ['TRANSACTION TYPE'],
    symbolField: ['SYMBOL'],
    qtyField:    ['QUANTITY'],
    priceField:  ['PRICE'],
    amountField: ['AMOUNT'],
    typeMap: { 'BUY': 'BUY', 'SELL': 'SELL', 'DIVIDEND': 'DIV', 'DIV': 'DIV', 'SPLIT': 'SPLIT', 'WIRE': 'TRANSFER' },
  },
  generic: {
    name: 'Generic / Other',
    dateField:   ['Date','date','DATE','Transaction Date'],
    typeField:   ['Type','type','TYPE','Action','Trans Code','Transaction Type'],
    symbolField: ['Symbol','symbol','SYMBOL','Ticker','Instrument'],
    qtyField:    ['Quantity','quantity','QTY','Shares'],
    priceField:  ['Price','price','PRICE'],
    amountField: ['Amount','amount','AMOUNT','Total','Net Amount'],
    typeMap: { 'buy': 'BUY', 'sell': 'SELL', 'Buy': 'BUY', 'Sell': 'SELL', 'BUY': 'BUY', 'SELL': 'SELL', 'Dividend': 'DIV', 'DIV': 'DIV', 'DIVIDEND': 'DIV', 'Split': 'SPLIT' },
  },
};

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  // Find header row (first row with recognizable field names)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (/date|symbol|amount|quantity|type|action|trans/i.test(lines[i])) { headerIdx = i; break; }
  }
  const headers = lines[headerIdx].split(',').map(h => h.replace(/['"]/g, '').trim());
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/['"$, ]/g, '').trim());
    if (cols.length < 2 || cols.every(c => !c)) continue;
    const row = {};
    headers.forEach((h, j) => { row[h] = cols[j] || ''; });
    rows.push(row);
  }
  return rows;
}

function getField(row, fields) {
  for (const f of fields) { if (row[f] !== undefined && row[f] !== '') return row[f]; }
  return '';
}

function detectBroker(headers) {
  const h = headers.join(' ').toLowerCase();
  if (h.includes('trans code') || h.includes('activity date')) return 'robinhood';
  if (h.includes('run date') || h.includes('you bought'))      return 'fidelity';
  if (h.includes('qual div') || h.includes('schwab'))          return 'schwab';
  if (h.includes('transaction type') && h.includes('symbol'))  return 'td';
  return 'generic';
}

function normalizeTransactions(rows, brokerKey) {
  const profile = BROKER_PROFILES[brokerKey] || BROKER_PROFILES.generic;
  const txs = [];
  for (const row of rows) {
    const rawType = getField(row, profile.typeField).trim();
    const type    = profile.typeMap[rawType] || profile.typeMap[rawType?.toLowerCase()] || 'OTHER';

    // Symbol: use Instrument field (ticker only), NOT Description (which has long names)
    let symbol = getField(row, profile.symbolField).trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '') || null;
    // If symbol looks like a description (>6 chars, no dot), clear it
    if (symbol && symbol.length > 6 && !symbol.includes('.')) symbol = null;

    const dateRaw = getField(row, profile.dateField);
    const date    = parseDateSafe(dateRaw);
    if (!date) continue;

    const qtyRaw    = getField(row, profile.qtyField).replace(/[^0-9.-]/g, '');
    const priceRaw  = getField(row, profile.priceField).replace(/[^0-9.-]/g, '');
    const amountRaw = getField(row, profile.amountField).replace(/[^0-9.-]/g, '');

    const quantity = qtyRaw    ? parseFloat(qtyRaw)    : null;
    const price    = priceRaw  ? parseFloat(priceRaw)  : null;
    const amount   = amountRaw ? parseFloat(amountRaw) : null;

    // Description for display — use descField if available, else rawType
    const description = profile.descField
      ? (getField(row, profile.descField).trim() || rawType)
      : rawType;

    // Skip rows with no useful data
    if (!symbol && type === 'OTHER' && !amount) continue;

    txs.push({ date, type, symbol, quantity, price, amount, description, raw: JSON.stringify(row) });
  }
  // Keep: trades with symbol, dividends, transfers with amount
  return txs.filter(t => t.date && (
    (t.symbol && (t.type === 'BUY' || t.type === 'SELL' || t.type === 'DIV' || t.type === 'SPLIT')) ||
    (t.type === 'TRANSFER' && t.amount) ||
    (t.type === 'DIV' && t.amount)
  ));
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtD  = n => n == null ? '—' : `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtP  = n => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtN  = n => n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const SC    = { BUY: '#00ff88', HOLD: '#ffaa00', SELL: '#ff4444' };

// ── Signal badge ──────────────────────────────────────────────────────────────
function SignalBadge({ signal, confidence, loading, onScan }) {
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'var(--fs-xs)', color:'#556677' }}>
      <div style={{ width:10, height:10, borderRadius:'50%', border:'1.5px solid #ffaa0044', borderTop:'1.5px solid #ffaa00', animation:'spin .7s linear infinite' }} />
      Analyzing...
    </div>
  );
  if (!signal) return (
    <button onClick={onScan} style={{ fontSize:'var(--fs-xs)', color:'#ffaa00', background:'#ffaa0011', border:'1px solid #ffaa0033', borderRadius:3, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit' }}>
      ⚡ SCAN
    </button>
  );
  const c = SC[signal] || '#b0c0dd';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div style={{ background:c+'18', border:`1px solid ${c}44`, borderRadius:3, padding:'2px 8px', fontSize:'var(--fs-xs)', color:c, fontWeight:700 }}>{signal}</div>
      {confidence && <div style={{ fontSize:'var(--fs-xs)', color:c+'99' }}>{confidence}%</div>}
    </div>
  );
}

// ── Position row ──────────────────────────────────────────────────────────────
function PositionRow({ pos, aiCache, scanningSet, onScan, totalValue }) {
  const [open, setOpen] = useState(false);
  const ai = aiCache[pos.ticker];
  const pnlColor = pos.unrealPnl >= 0 ? '#00ff88' : '#ff4444';
  const alloc    = totalValue > 0 ? (pos.mktValue / totalValue * 100) : 0;

  return (
    <div style={{ borderBottom:'1px solid #1a1a2e' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', cursor:'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background='#ffffff05'}
        onMouseLeave={e => e.currentTarget.style.background='transparent'}>

        {/* Ticker */}
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(16px,1.6vw,20px)', color:'#ffaa00', width:64, flexShrink:0 }}>{pos.ticker}</div>

        {/* Shares + avg cost */}
        <div style={{ width:90, flexShrink:0 }}>
          <div style={{ fontSize:'var(--fs-sm)', color:'#c8d8f0', fontWeight:600 }}>{fmtN(pos.shares)} sh</div>
          <div style={{ fontSize:'var(--fs-xs)', color:'#7788aa' }}>avg {fmtD(pos.avg_cost)}</div>
        </div>

        {/* Market value */}
        <div style={{ width:90, flexShrink:0 }}>
          <div style={{ fontSize:'var(--fs-sm)', color:'#c8d8f0', fontWeight:600 }}>{fmtD(pos.mktValue)}</div>
          <div style={{ fontSize:'var(--fs-xs)', color:'#7788aa' }}>{alloc.toFixed(1)}% of port</div>
        </div>

        {/* P&L */}
        <div style={{ width:96, flexShrink:0 }}>
          <div style={{ fontSize:'var(--fs-sm)', fontWeight:700, color:pnlColor }}>{pos.unrealPnl >= 0 ? '+' : ''}{fmtD(pos.unrealPnl)}</div>
          <div style={{ fontSize:'var(--fs-xs)', color:pnlColor+'99' }}>{fmtP(pos.unrealPct)}</div>
        </div>

        {/* Day change */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'var(--fs-xs)', color:pos.dayChange >= 0 ? '#00ff88' : '#ff4444' }}>
            {pos.dayChange >= 0 ? '+' : ''}{fmtD(pos.dayChange)} today
          </div>
        </div>

        {/* AI Signal */}
        <div style={{ flexShrink:0, marginRight:8 }}>
          <SignalBadge signal={ai?.signal} confidence={ai?.confidence} loading={scanningSet.has(pos.ticker)} onScan={() => onScan(pos.ticker)} />
        </div>

        {/* Expand arrow */}
        <div style={{ fontSize:'var(--fs-xs)', color:'#445566', flexShrink:0 }}>{open ? '▲' : '▼'}</div>
      </div>

      {open && ai && (
        <div style={{ padding:'0 14px 14px 78px', display:'flex', flexDirection:'column', gap:10 }}>
          {/* Thesis */}
          <div style={{ fontSize:'var(--fs-sm)', color:'#c8d8f0', lineHeight:1.65, borderLeft:'2px solid #ffaa0044', paddingLeft:12 }}>
            {ai.thesis}
          </div>
          {/* Bull / Bear factors */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <div style={{ fontSize:'var(--fs-xs)', color:'#00ff88', letterSpacing:'.08em', marginBottom:4 }}>BULL CASE</div>
              {(ai.bull_factors || []).map((f, i) => (
                <div key={i} style={{ fontSize:'var(--fs-xs)', color:'#b0c0dd', marginBottom:3 }}>▲ {f}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize:'var(--fs-xs)', color:'#ff4444', letterSpacing:'.08em', marginBottom:4 }}>BEAR CASE</div>
              {(ai.bear_factors || []).map((f, i) => (
                <div key={i} style={{ fontSize:'var(--fs-xs)', color:'#b0c0dd', marginBottom:3 }}>▼ {f}</div>
              ))}
            </div>
          </div>
          {/* Target / Stop */}
          {(ai.price_target || ai.stop_loss) && (
            <div style={{ display:'flex', gap:16, fontSize:'var(--fs-xs)' }}>
              {ai.price_target && <span style={{ color:'#00ff88' }}>Target: {fmtD(ai.price_target)}</span>}
              {ai.stop_loss    && <span style={{ color:'#ff4444' }}>Stop: {fmtD(ai.stop_loss)}</span>}
              {ai.risk_level   && <span style={{ color:'#ffaa00' }}>Risk: {ai.risk_level}</span>}
            </div>
          )}
          {/* Re-scan button */}
          <button onClick={() => onScan(pos.ticker)} style={{ alignSelf:'flex-start', fontSize:'var(--fs-xs)', color:'#ffaa00', background:'transparent', border:'1px solid #ffaa0033', borderRadius:3, padding:'3px 10px', cursor:'pointer', fontFamily:'inherit' }}>
            ↻ Re-scan
          </button>
        </div>
      )}
    </div>
  );
}

// ── Allocation bar ────────────────────────────────────────────────────────────
const ALLOC_COLORS = ['#ffaa00','#00ff88','#4488ff','#ff4444','#aa44ff','#ff8844','#00ccff','#ff44aa','#44ffaa','#ffcc44'];

function AllocationBar({ positions, totalValue }) {
  if (!positions.length) return null;
  const sorted = [...positions].sort((a, b) => b.mktValue - a.mktValue).slice(0, 10);
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:'var(--fs-xs)', color:'#7788aa', letterSpacing:'.1em', marginBottom:8 }}>ALLOCATION</div>
      {/* Bar */}
      <div style={{ display:'flex', height:8, borderRadius:4, overflow:'hidden', marginBottom:10 }}>
        {sorted.map((p, i) => (
          <div key={p.ticker} title={`${p.ticker}: ${(p.mktValue/totalValue*100).toFixed(1)}%`}
            style={{ width:`${p.mktValue/totalValue*100}%`, background:ALLOC_COLORS[i%ALLOC_COLORS.length], minWidth:2 }} />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 14px' }}>
        {sorted.map((p, i) => (
          <div key={p.ticker} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'var(--fs-xs)', color:'#b0c0dd' }}>
            <div style={{ width:8, height:8, borderRadius:2, background:ALLOC_COLORS[i%ALLOC_COLORS.length], flexShrink:0 }} />
            {p.ticker} <span style={{ color:'#7788aa' }}>{(p.mktValue/totalValue*100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────
function TxRow({ tx }) {
  const typeColors = { BUY:'#00ff88', SELL:'#ff4444', DIV:'#ffaa00', SPLIT:'#4488ff', TRANSFER:'#8899bb', OTHER:'#556677' };
  const c = typeColors[tx.type] || '#8899bb';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderBottom:'1px solid #12121e', fontSize:'var(--fs-sm)' }}>
      <div style={{ color:'#7788aa', width:84, flexShrink:0 }}>{tx.date}</div>
      <div style={{ background:c+'18', border:`1px solid ${c}33`, borderRadius:3, padding:'1px 6px',
        fontSize:'var(--fs-xs)', color:c, fontWeight:700, width:56, textAlign:'center', flexShrink:0 }}>
        {tx.type}
      </div>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'var(--fs-body)', color:'#ffaa00',
        width:60, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {tx.symbol || '—'}
      </div>
      {/* Description for non-trade rows */}
      {!tx.symbol && tx.description && (
        <div style={{ flex:1, fontSize:'var(--fs-xs)', color:'#7788aa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>
          {tx.description.length > 28 ? tx.description.slice(0,28)+'…' : tx.description}
        </div>
      )}
      {tx.symbol && <div style={{ flex:1 }} />}
      <div style={{ color:'#c8d8f0', width:68, flexShrink:0 }}>{tx.quantity ? fmtN(tx.quantity) : '—'}</div>
      <div style={{ color:'#c8d8f0', width:68, flexShrink:0 }}>{tx.price ? fmtD(tx.price) : '—'}</div>
      <div style={{ color: tx.amount >= 0 ? '#00ff88' : '#ff4444', width:84, textAlign:'right', fontWeight:600, flexShrink:0 }}>
        {tx.amount != null ? (tx.amount >= 0 ? '+' : '') + fmtD(tx.amount) : '—'}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PortfolioTab({ macro }) {
  const { user } = useUser();
  const [tab,        setTab]        = useState('positions'); // positions | transactions
  const [showUpload, setShowUpload] = useState(false);      // show upload screen
  const [portfolio, setPortfolio] = useState(null);
  const [aiCache, setAiCache]     = useState({});
  const [scanningSet, setScanningSet] = useState(new Set());
  const [loading, setLoading]     = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError]         = useState('');
  const [dragOver, setDragOver]   = useState(false);
  const [preview, setPreview]     = useState(null); // { rows, broker, txs }
  const [txFilter, setTxFilter]   = useState('ALL');
  const fileRef = useRef(null);

  // Load portfolio on mount
  useEffect(() => {
    if (!user?.id) return;
    loadPortfolio();
  }, [user?.id]);

  const loadPortfolio = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res  = await fetch(`${BASE}/portfolio/${user.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPortfolio(data);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh prices every 60s while on positions tab
  useEffect(() => {
    if (!portfolio || showUpload) return;
    const interval = setInterval(loadPortfolio, 60000);
    return () => clearInterval(interval);
  }, [portfolio, tab]);

  // Parse CSV file
  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = parseCSV(text);
      if (!rows.length) { setError('Could not parse CSV — check the file format'); return; }
      const headers   = Object.keys(rows[0]);
      const brokerKey = detectBroker(headers);
      const txs       = normalizeTransactions(rows, brokerKey);
      setPreview({ rows, broker: brokerKey, txs });
      setError('');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) handleFile(file);
    else setError('Please drop a .csv file');
  };

  const handleImport = async () => {
    if (!preview || !user?.id) return;
    setImporting(true); setError('');
    try {
      const res  = await fetch(`${BASE}/portfolio/${user.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: preview.txs, broker: preview.broker }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(null);
      setImporting(false);
      setShowUpload(false);
      await loadPortfolio();
      setTab('positions');
    } catch (e) {
      setError(e.message);
      setImporting(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear all portfolio data?')) return;
    await fetch(`${BASE}/portfolio/${user.id}`, { method: 'DELETE' });
    setPortfolio(null); setAiCache({}); setShowUpload(false);
  };

  // Scan a position with AI
  const scanPosition = useCallback(async (ticker) => {
    setScanningSet(s => new Set([...s, ticker]));
    try {
      const res  = await fetch(`${BASE}/portfolio/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: ticker, bonds: macro?.bonds, macroNews: macro?.macroNews, intlMarkets: macro?.intlMarkets, calendar: macro?.calendar }),
      });
      const data = await res.json();
      if (res.ok && data.signal) {
        setAiCache(c => ({ ...c, [ticker]: {
          signal: data.signal, confidence: data.confidence,
          thesis: data.thesis, price_target: data.priceTarget,
          stop_loss: data.stopLoss, risk_level: data.riskLevel,
          bull_factors: data.bullFactors, bear_factors: data.bearFactors,
        }}));
      }
    } catch {}
    finally { setScanningSet(s => { const n = new Set(s); n.delete(ticker); return n; }); }
  }, [macro]);

  const scanAll = () => {
    (portfolio?.positions || []).forEach(p => {
      if (!aiCache[p.ticker]) scanPosition(p.ticker);
    });
  };

  const summary  = portfolio?.summary;
  const totalVal = summary?.totalValue || 0;
  const positions = portfolio?.positions || [];
  const txs = (portfolio?.transactions || []).filter(t => txFilter === 'ALL' || t.type === txFilter);

  const TX_TYPES = ['ALL','BUY','SELL','DIV','SPLIT','TRANSFER'];

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(22px,2.5vw,32px)', color:'#ffaa00', letterSpacing:'.1em' }}>
            📊 PORTFOLIO TRACKER
          </div>
          <div style={{ fontSize:'var(--fs-xs)', color:'#7788aa' }}>
            Import your broker CSV · Live P&L · AI analysis per holding
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {portfolio && (
            <>
              <button onClick={scanAll} style={{ fontSize:'var(--fs-xs)', color:'#00ff88', background:'#00ff8811', border:'1px solid #00ff8833', borderRadius:3, padding:'5px 12px', cursor:'pointer', fontFamily:'inherit' }}>
                ⚡ SCAN ALL
              </button>
              <button onClick={() => setShowUpload(true)} style={{ fontSize:'var(--fs-xs)', color:'#ffaa00', background:'#ffaa0011', border:'1px solid #ffaa0033', borderRadius:3, padding:'5px 12px', cursor:'pointer', fontFamily:'inherit' }}>
                ↑ REIMPORT
              </button>
              <button onClick={handleClear} style={{ fontSize:'var(--fs-xs)', color:'#ff4444', background:'transparent', border:'1px solid #ff444433', borderRadius:3, padding:'5px 12px', cursor:'pointer', fontFamily:'inherit' }}>
                ✕ CLEAR
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background:'#ff444411', border:'1px solid #ff444433', borderRadius:4, padding:'10px 14px', fontSize:'var(--fs-sm)', color:'#ff8888', marginBottom:16 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Empty state / Upload ── */}
      {(!portfolio || showUpload) && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Broker instructions */}
          {!preview && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10, marginBottom:8 }}>
              {[
                { broker:'Robinhood',  steps:'Account → Statements → Download CSV' },
                { broker:'Fidelity',   steps:'Activity & Orders → Export' },
                { broker:'Schwab',     steps:'History → Export' },
                { broker:'TD / IBKR',  steps:'Transactions → Download CSV' },
              ].map(b => (
                <div key={b.broker} style={{ background:'#0f0f1a', border:'1px solid #1a1a2e', borderRadius:6, padding:'12px 14px' }}>
                  <div style={{ fontSize:'var(--fs-sm)', color:'#ffaa00', fontWeight:700, marginBottom:4 }}>{b.broker}</div>
                  <div style={{ fontSize:'var(--fs-xs)', color:'#b0c0dd', lineHeight:1.6 }}>{b.steps}</div>
                </div>
              ))}
            </div>
          )}

          {/* Drop zone */}
          {!preview && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{ border:`2px dashed ${dragOver ? '#ffaa00' : '#2a2a3e'}`, borderRadius:8, padding:'40px 20px', textAlign:'center', cursor:'pointer', background: dragOver ? '#ffaa0008' : 'transparent', transition:'all .2s' }}>
              <div style={{ fontSize:'clamp(28px,3vw,40px)', marginBottom:12 }}>📁</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(18px,2vw,22px)', color:'#ffaa00', letterSpacing:'.1em', marginBottom:8 }}>
                DROP CSV HERE OR CLICK TO BROWSE
              </div>
              <div style={{ fontSize:'var(--fs-sm)', color:'#7788aa' }}>
                Supports Robinhood, Fidelity, Schwab, TD Ameritrade, IBKR and most brokers
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }}
                onChange={e => handleFile(e.target.files[0])} />
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div style={{ background:'#0f0f1a', border:'1px solid #ffaa0033', borderRadius:6, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid #1a1a2e', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                <div>
                  <div style={{ fontSize:'var(--fs-body)', fontWeight:700, color:'#ffaa00' }}>
                    {BROKER_PROFILES[preview.broker]?.name || preview.broker} detected
                  </div>
                  <div style={{ fontSize:'var(--fs-xs)', color:'#b0c0dd' }}>
                    {preview.txs.length} transactions parsed · {[...new Set(preview.txs.map(t=>t.symbol).filter(Boolean))].length} tickers
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setPreview(null)} style={{ fontSize:'var(--fs-xs)', color:'#b0c0dd', background:'transparent', border:'1px solid #2a2a3e', borderRadius:3, padding:'6px 14px', cursor:'pointer', fontFamily:'inherit' }}>
                    ← CANCEL
                  </button>
                  <button onClick={handleImport} disabled={importing} style={{ fontSize:'var(--fs-xs)', color:'#07070e', background:'#ffaa00', border:'none', borderRadius:3, padding:'6px 16px', cursor:'pointer', fontFamily:'inherit', fontWeight:700, opacity:importing?0.6:1 }}>
                    {importing ? 'IMPORTING...' : '✓ IMPORT'}
                  </button>
                </div>
              </div>
              {/* Sample rows */}
              <div style={{ overflowX:'auto' }}>
                <div style={{ display:'flex', padding:'8px 14px', borderBottom:'1px solid #1a1a2e', fontSize:'var(--fs-xs)', color:'#7788aa', gap:8, minWidth:500 }}>
                  <div style={{ width:84 }}>DATE</div>
                  <div style={{ width:56 }}>TYPE</div>
                  <div style={{ width:60 }}>SYMBOL</div>
                  <div style={{ flex:1 }}>DESCRIPTION</div>
                  <div style={{ width:68 }}>QTY</div>
                  <div style={{ width:68 }}>PRICE</div>
                  <div style={{ width:84, textAlign:'right' }}>AMOUNT</div>
                </div>
                {preview.txs.slice(0, 8).map((t, i) => <TxRow key={i} tx={t} />)}
                {preview.txs.length > 8 && (
                  <div style={{ padding:'8px 16px', fontSize:'var(--fs-xs)', color:'#7788aa', textAlign:'center' }}>
                    +{preview.txs.length - 8} more transactions
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Portfolio loaded ── */}
      {portfolio && !showUpload && (
        <>
          {/* Summary cards */}
          {summary && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10, marginBottom:20 }}>
              {[
                { label:'PORTFOLIO VALUE', value:fmtD(summary.totalValue), color:'#c8d8f0' },
                { label:'TOTAL P&L', value:(summary.totalPnl>=0?'+':'')+fmtD(summary.totalPnl), color:summary.totalPnl>=0?'#00ff88':'#ff4444' },
                { label:'RETURN', value:fmtP(summary.totalPnlPct), color:summary.totalPnlPct>=0?'#00ff88':'#ff4444' },
                { label:'TODAY', value:(summary.dayChange>=0?'+':'')+fmtD(summary.dayChange), color:summary.dayChange>=0?'#00ff88':'#ff4444' },
                { label:'POSITIONS', value:summary.positionCount, color:'#ffaa00' },
              ].map(c => (
                <div key={c.label} style={{ background:'#0f0f1a', border:'1px solid #1a1a2e', borderRadius:6, padding:'12px 14px' }}>
                  <div style={{ fontSize:'var(--fs-xs)', color:'#7788aa', letterSpacing:'.08em', marginBottom:4 }}>{c.label}</div>
                  <div style={{ fontSize:'var(--fs-lg)', fontWeight:700, color:c.color, fontFamily:"'JetBrains Mono',monospace" }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Allocation bar */}
          {positions.length > 0 && <AllocationBar positions={positions} totalValue={totalVal} />}

          {/* Sub-tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #1a1a2e', marginBottom:16 }}>
            {[['positions','POSITIONS'],['transactions','HISTORY']].map(([key,label]) => (
              <button key={key} onClick={() => setTab(key)} style={{ background:'none', border:'none', cursor:'pointer', padding:'9px 18px', fontSize:'var(--fs-sm)', fontFamily:'inherit', fontWeight:700, letterSpacing:'.06em', color:tab===key?'#ffaa00':'#7788aa', borderBottom:`2px solid ${tab===key?'#ffaa00':'transparent'}`, marginBottom:-1, transition:'color .15s' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Positions tab */}
          {tab === 'positions' && (
            loading ? (
              <div style={{ padding:'40px 0', textAlign:'center', color:'#7788aa', fontSize:'var(--fs-sm)' }}>
                <div style={{ width:32, height:32, borderRadius:'50%', border:'2px solid #ffaa0022', borderTop:'2px solid #ffaa00', animation:'spin .8s linear infinite', margin:'0 auto 12px' }} />
                Building positions from transactions...
              </div>
            ) : positions.length === 0 ? (
              <div style={{ padding:'40px 20px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📭</div>
                <div style={{ fontSize:'var(--fs-body)', color:'#c8d8f0', marginBottom:8 }}>No open positions found</div>
                <div style={{ fontSize:'var(--fs-sm)', color:'#7788aa', maxWidth:320, margin:'0 auto', lineHeight:1.7 }}>
                  This can happen if all positions were sold, or if the CSV only contains cash transfers.
                  Check the <button onClick={() => setTab('transactions')} style={{ background:'none', border:'none', color:'#ffaa00', cursor:'pointer', fontSize:'inherit', fontFamily:'inherit', padding:0, textDecoration:'underline' }}>transaction history</button> to verify your data imported correctly.
                </div>
              </div>
            ) : (
              <div style={{ background:'#0a0a14', border:'1px solid #1a1a2e', borderRadius:6, overflow:'hidden' }}>
                {/* Column headers */}
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom:'1px solid #1a1a2e', fontSize:'var(--fs-xs)', color:'#556677' }}>
                  <div style={{ width:64 }}>TICKER</div>
                  <div style={{ width:90 }}>SHARES / COST</div>
                  <div style={{ width:90 }}>MKT VALUE</div>
                  <div style={{ width:96 }}>UNREAL P&L</div>
                  <div style={{ flex:1 }}>TODAY</div>
                  <div style={{ width:100, textAlign:'right' }}>AI SIGNAL</div>
                  <div style={{ width:20 }}></div>
                </div>
                {positions.map(p => (
                  <PositionRow key={p.ticker} pos={p} aiCache={aiCache} scanningSet={scanningSet} onScan={scanPosition} totalValue={totalVal} />
                ))}
              </div>
            )
          )}

          {/* Transactions tab */}
          {tab === 'transactions' && (
            <div>
              {/* Type filter */}
              <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                {TX_TYPES.map(t => (
                  <button key={t} onClick={() => setTxFilter(t)} style={{ fontSize:'var(--fs-xs)', color:txFilter===t?'#ffaa00':'#7788aa', background:txFilter===t?'#ffaa0011':'transparent', border:`1px solid ${txFilter===t?'#ffaa0044':'#2a2a3e'}`, borderRadius:3, padding:'4px 10px', cursor:'pointer', fontFamily:'inherit', fontWeight:txFilter===t?700:400 }}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ background:'#0a0a14', border:'1px solid #1a1a2e', borderRadius:6, overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom:'1px solid #1a1a2e', fontSize:'var(--fs-xs)', color:'#556677' }}>
                  <div style={{ width:88 }}>DATE</div>
                  <div style={{ width:60 }}>TYPE</div>
                  <div style={{ width:56 }}>TICKER</div>
                  <div style={{ width:72 }}>QTY</div>
                  <div style={{ width:72 }}>PRICE</div>
                  <div style={{ flex:1, textAlign:'right' }}>AMOUNT</div>
                </div>
                {txs.length === 0 ? (
                  <div style={{ padding:'30px', textAlign:'center', fontSize:'var(--fs-sm)', color:'#7788aa' }}>No transactions found</div>
                ) : (
                  txs.map((t, i) => <TxRow key={i} tx={t} />)
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}