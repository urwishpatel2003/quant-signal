import { useState, useRef } from 'react';
import { SC, MC } from '../utils/constants';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain } from '../api/tradier';
import { runPriceAnalysis } from '../api/claude';

function parseRobinhoodCSV(text) {
  const lines   = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  const rows    = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
  const positions = {};
  rows.forEach(row => {
    const symbol   = row['symbol'] || row['instrument'] || row['ticker'];
    const qty      = parseFloat(row['quantity'] || row['shares'] || row['qty'] || 0);
    const avgPrice = parseFloat(row['average cost'] || row['avg cost'] || row['average_cost'] || row['price'] || 0);
    const type     = row['type'] || row['trans_code'] || row['activity'] || '';
    if (!symbol || symbol === 'symbol') return;
    const isBuy = type.toLowerCase().includes('buy') || type === '' || type.toLowerCase().includes('shs');
    if (!isBuy && type !== '') return;
    if (!positions[symbol]) positions[symbol] = { symbol, qty: 0, totalCost: 0 };
    positions[symbol].qty += qty;
    positions[symbol].totalCost += qty * avgPrice;
  });
  return Object.values(positions).filter(p => p.qty > 0).map(p => ({
    symbol: p.symbol, qty: p.qty.toFixed(4),
    avg_entry_price: (p.totalCost / p.qty).toFixed(2),
    current_price: null, market_value: null, unrealized_pl: null, unrealized_plpc: null,
  }));
}

export default function PortfolioTab({ macro, onOpenScanner, onOpenOptions }) {
  const [positions,       setPositions]       = useState([]);
  const [positionSignals, setPositionSignals] = useState({});
  const [portfolioLoading,setPortfolioLoading]= useState(false);
  const [csvError,        setCsvError]        = useState('');
  const [isDragging,      setIsDragging]      = useState(false);
  const fileInputRef = useRef(null);

  const handleCSV = async file => {
    setCsvError('');
    if (!file || !file.name.endsWith('.csv')) { setCsvError('Please upload a .csv file'); return; }
    try {
      const text    = await file.text();
      const parsed  = parseRobinhoodCSV(text);
      if (!parsed.length) { setCsvError('No positions found — check CSV format'); return; }
      const enriched = await Promise.all(parsed.map(async pos => {
        try {
          const [q, p] = await Promise.all([fetchTradierQuote(pos.symbol), fetchPrice(pos.symbol)]);
          const cp  = q?.last || p?.current || 0;
          const avg = parseFloat(pos.avg_entry_price);
          const qty = parseFloat(pos.qty);
          return { ...pos, current_price: cp.toFixed(2), market_value: (cp * qty).toFixed(2), unrealized_pl: ((cp - avg) * qty).toFixed(2), unrealized_plpc: avg ? ((cp - avg) / avg).toFixed(4) : 0 };
        } catch { return pos; }
      }));
      setPositions(enriched); setPositionSignals({});
    } catch (e) { setCsvError('Error: ' + e.message); }
  };

  const scanPositions = async () => {
    setPortfolioLoading(true);
    for (const pos of positions) {
      try {
        const [p, q, f, n] = await Promise.all([fetchPrice(pos.symbol), fetchTradierQuote(pos.symbol), fetchFundamentals(pos.symbol), fetchStockNews(pos.symbol)]);
        const exps = await fetchTradierExpirations(pos.symbol);
        const o    = exps.length > 0 ? await fetchTradierChain(pos.symbol, exps[0], q?.last || p?.current) : null;
        const a    = await runPriceAnalysis(pos.symbol, q?.last || p?.current, p, f, o, n, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar);
        setPositionSignals(prev => ({ ...prev, [pos.symbol]: a }));
      } catch (e) { console.error(pos.symbol, e); }
    }
    setPortfolioLoading(false);
  };

  const totalValue = positions.reduce((s, p) => s + parseFloat(p.market_value || 0), 0);
  const totalPL    = positions.reduce((s, p) => s + parseFloat(p.unrealized_pl || 0), 0);
  const overallRisk = () => {
    const sigs = Object.values(positionSignals);
    if (!sigs.length) return null;
    const ratio = sigs.filter(s => s.signal === 'SELL').length / sigs.length;
    return ratio > 0.5 ? 'HIGH' : ratio > 0.2 ? 'MEDIUM' : 'LOW';
  };
  const riskColors = { LOW: '#00ff88', MEDIUM: '#ffaa00', HIGH: '#ff4444' };

  return (
    <div>
      {positions.length === 0 ? (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>HOW TO EXPORT FROM ROBINHOOD</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[['01', 'Open Robinhood App', 'Account → Statements & History'], ['02', 'Export CSV', 'Export → Select date range → Download'], ['03', 'Upload Here', 'Drag & drop or click below']].map(([n, title, desc]) => (
                <div key={n} style={{ background: '#070710', padding: 16, borderLeft: '2px solid #ffaa0044' }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#ffaa0044', marginBottom: 4 }}>{n}</div>
                  <div style={{ fontSize: 12, color: '#ffaa00', marginBottom: 6 }}>{title}</div>
                  <div style={{ fontSize: 11, color: '#556' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={`drop-zone${isDragging ? ' dragging' : ''}`}
            onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleCSV(e.dataTransfer.files[0]); }}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleCSV(e.target.files[0])} />
            <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: '#ffaa00', marginBottom: 8 }}>DROP ROBINHOOD CSV HERE</div>
            <div style={{ fontSize: 11, color: '#445' }}>or click to browse</div>
            {csvError && <div style={{ fontSize: 11, color: '#ff4444', marginTop: 12 }}>{csvError}</div>}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              ['PORTFOLIO VALUE', `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, '#fff'],
              ['TOTAL P&L',       `${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(2)}`,                    totalPL >= 0 ? '#00ff88' : '#ff4444'],
              ['POSITIONS',       positions.length,                                                        '#ffaa00'],
              ['OVERALL RISK',    overallRisk() || 'RUN SCAN',                                             riskColors[overallRisk()] || '#444'],
            ].map(([l, v, c]) => (
              <div key={l} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#445', marginBottom: 6 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn" disabled={portfolioLoading} onClick={scanPositions}>{portfolioLoading ? 'SCANNING...' : 'SCAN ALL WITH AI'}</button>
            <button className="btn-sm" onClick={() => { setPositions([]); setPositionSignals({}); }}>CLEAR</button>
            {portfolioLoading && <div className="pulse" style={{ fontSize: 10, color: '#ffaa00', alignSelf: 'center' }}>ANALYZING WITH GLOBAL MACRO...</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {positions.map(pos => {
              const sig  = positionSignals[pos.symbol];
              const pl   = parseFloat(pos.unrealized_pl   || 0);
              const plPct= parseFloat(pos.unrealized_plpc || 0) * 100;
              return (
                <div key={pos.symbol} className="card fade-in" style={{ borderColor: sig ? SC[sig.signal] + '44' : '#1e1e2e' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 130px 140px 140px 1fr auto', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22 }}>{pos.symbol}</div>
                      <div style={{ fontSize: 10, color: '#556' }}>{parseFloat(pos.qty).toFixed(2)} shs</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#445' }}>CURRENT / AVG</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>${parseFloat(pos.current_price || 0).toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: '#445' }}>avg ${parseFloat(pos.avg_entry_price || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#445' }}>P&L</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: pl >= 0 ? '#00ff88' : '#ff4444' }}>{pl >= 0 ? '+' : ''}${pl.toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: pl >= 0 ? '#00ff8888' : '#ff444488' }}>{plPct >= 0 ? '+' : ''}{plPct.toFixed(2)}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#445' }}>MKT VALUE</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>${parseFloat(pos.market_value || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      {sig ? (
                        <div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                            <span className="tag" style={{ background: SC[sig.signal] + '22', color: SC[sig.signal], border: `1px solid ${SC[sig.signal]}44` }}>{sig.signal} {sig.confidence}%</span>
                            {sig.macroImpact && <span style={{ fontSize: 9, color: MC[sig.macroImpact] }}>{sig.macroImpact}</span>}
                          </div>
                          <div style={{ fontSize: 10, color: '#667' }}>{sig.thesis?.slice(0, 90)}...</div>
                          {sig.calendarRisk && <div style={{ fontSize: 9, color: '#ff884477', marginTop: 2 }}>📅 {sig.calendarRisk}</div>}
                        </div>
                      ) : <span style={{ fontSize: 10, color: '#333' }}>Click "SCAN ALL WITH AI"</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button className="btn-sm" onClick={() => onOpenScanner(pos.symbol)}>SCAN</button>
                      <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044' }} onClick={() => onOpenOptions(pos.symbol)}>OPTS</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
