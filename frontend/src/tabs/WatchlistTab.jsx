import { useState, useEffect } from 'react';
import { SC, MC } from '../utils/constants';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain } from '../api/tradier';
import { runPriceAnalysis } from '../api/claude';

export default function WatchlistTab({ macro, onOpenScanner, onOpenOptions, externalAdd }) {
  const [watchlist,   setWatchlist]   = useState(() => { try { return JSON.parse(localStorage.getItem('qs-watchlist') || '[]'); } catch { return []; } });
  const [watchInput,  setWatchInput]  = useState('');
  const [watchEntry,  setWatchEntry]  = useState('');
  const [watchExit,   setWatchExit]   = useState('');
  const [watchAlert,  setWatchAlert]  = useState('');
  const [watchNote,   setWatchNote]   = useState('');
  const [scanningAll, setScanningAll] = useState(false);

  useEffect(() => { localStorage.setItem('qs-watchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { if (externalAdd?.ticker) addItem(externalAdd.ticker, externalAdd.analysis, externalAdd.price); }, [externalAdd]);

  const addItem = (ticker, analysis, price) => {
    if (!ticker) return;
    const t = ticker.toUpperCase().trim();
    if (watchlist.find(w => w.ticker === t)) return;
    setWatchlist(prev => [...prev, {
      ticker: t, entry: '', exit: '', alert: '', note: '',
      signal: analysis?.signal, confidence: analysis?.confidence,
      price, priceTarget: analysis?.priceTarget, stopLoss: analysis?.stopLoss,
      macroImpact: analysis?.macroImpact, globalTrend: analysis?.globalMarketTrend,
      scanned: price ? new Date().toLocaleTimeString() : null,
    }]);
  };

  const addFromForm = () => {
    if (!watchInput.trim()) return;
    const t = watchInput.toUpperCase().trim();
    if (watchlist.find(w => w.ticker === t)) { setWatchInput(''); return; }
    setWatchlist(prev => [...prev, { ticker: t, entry: watchEntry, exit: watchExit, alert: watchAlert, note: watchNote, signal: null }]);
    setWatchInput(''); setWatchEntry(''); setWatchExit(''); setWatchAlert(''); setWatchNote('');
  };

  const remove = ticker => setWatchlist(prev => prev.filter(w => w.ticker !== ticker));

  const scanAll = async () => {
    setScanningAll(true);
    for (const item of watchlist) {
      try {
        const [p, q, f, n] = await Promise.all([fetchPrice(item.ticker), fetchTradierQuote(item.ticker), fetchFundamentals(item.ticker), fetchStockNews(item.ticker)]);
        const exps = await fetchTradierExpirations(item.ticker);
        const o = exps.length > 0 ? await fetchTradierChain(item.ticker, exps[0], q?.last || p?.current) : null;
        const a = await runPriceAnalysis(item.ticker, q?.last || p?.current, p, f, o, n, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar);
        setWatchlist(prev => prev.map(w => w.ticker === item.ticker ? {
          ...w, signal: a.signal, confidence: a.confidence, price: q?.last || p?.current,
          priceTarget: a.priceTarget, stopLoss: a.stopLoss, macroImpact: a.macroImpact,
          globalTrend: a.globalMarketTrend, scanned: new Date().toLocaleTimeString()
        } : w));
      } catch (e) { console.error(item.ticker, e); }
    }
    setScanningAll(false);
  };

  return (
    <div>
      {/* ── Add form ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.2em', marginBottom: 12 }}>ADD TO WATCHLIST</div>
        <div className="watchlist-form">
          {[
            { label: 'TICKER *', val: watchInput, set: e => setWatchInput(e.target.value.toUpperCase()), ph: 'AAPL' },
            { label: 'ENTRY',    val: watchEntry, set: e => setWatchEntry(e.target.value),               ph: '$150' },
            { label: 'EXIT',     val: watchExit,  set: e => setWatchExit(e.target.value),                ph: '$180' },
            { label: 'ALERT',    val: watchAlert, set: e => setWatchAlert(e.target.value),               ph: '$160' },
            { label: 'NOTES',    val: watchNote,  set: e => setWatchNote(e.target.value),                ph: 'Why watching...' },
          ].map(({ label, val, set, ph }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: '#99aacc', marginBottom: 4 }}>{label}</div>
              <input className="input" value={val} onChange={set} placeholder={ph}
                onKeyDown={e => e.key === 'Enter' && addFromForm()} />
            </div>
          ))}
          <button className="btn" onClick={addFromForm} style={{ alignSelf: 'flex-end' }}>+ ADD</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" disabled={scanningAll || watchlist.length === 0} onClick={scanAll}>
          {scanningAll ? 'SCANNING ALL...' : `SCAN ALL (${watchlist.length})`}
        </button>
        {scanningAll && <div className="pulse" style={{ fontSize: 10, color: '#ffaa00' }}>RUNNING AI ANALYSIS...</div>}
      </div>

      {watchlist.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#333' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>No tickers in watchlist</div>
          <div style={{ fontSize: 11 }}>Add tickers above or use "+ WATCHLIST" from the scanner</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {watchlist.map(item => (
            <div key={item.ticker} className="card" style={{ borderColor: item.signal ? SC[item.signal] + '33' : '#1e1e2e' }}>
              {/* Desktop layout */}
              <div className="hide-mobile">
                <div className="watchlist-item">
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22 }}>{item.ticker}</div>
                    {item.price && <div style={{ fontSize: 10, color: '#99aacc' }}>${typeof item.price === 'number' ? item.price.toFixed(2) : item.price}</div>}
                  </div>
                  <div>
                    {item.signal
                      ? <span className="tag" style={{ background: SC[item.signal] + '22', color: SC[item.signal], border: `1px solid ${SC[item.signal]}44` }}>{item.signal} {item.confidence}%</span>
                      : <span style={{ fontSize: 10, color: '#333' }}>NOT SCANNED</span>}
                  </div>
                  <div>
                    {item.macroImpact && <>
                      <div style={{ fontSize: 9, color: '#8899bb', marginBottom: 2 }}>MACRO</div>
                      <span style={{ fontSize: 10, color: { BULLISH: '#00ff88', BEARISH: '#ff4444', NEUTRAL: '#ffaa00' }[item.macroImpact] }}>{item.macroImpact}</span>
                    </>}
                  </div>
                  <div><div style={{ fontSize: 9, color: '#8899bb' }}>ENTRY</div><div style={{ fontSize: 12, color: '#00ff88' }}>{item.entry || '—'}</div></div>
                  <div><div style={{ fontSize: 9, color: '#8899bb' }}>EXIT</div><div style={{ fontSize: 12, color: '#ffaa00' }}>{item.exit || '—'}</div></div>
                  <div>
                    <div style={{ fontSize: 9, color: '#8899bb' }}>TARGETS</div>
                    {item.priceTarget && <div style={{ fontSize: 10, color: '#99aacc' }}>T: <span style={{ color: '#00ff88' }}>${typeof item.priceTarget === 'number' ? item.priceTarget.toFixed(2) : item.priceTarget}</span></div>}
                    {item.stopLoss    && <div style={{ fontSize: 10, color: '#99aacc' }}>S: <span style={{ color: '#ff4444' }}>${typeof item.stopLoss === 'number' ? item.stopLoss.toFixed(2) : item.stopLoss}</span></div>}
                  </div>
                  <div style={{ fontSize: 11, color: '#aabbcc', fontStyle: 'italic' }}>{item.note || ''}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-sm" onClick={() => onOpenScanner(item.ticker)}>SCAN</button>
                    <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044' }} onClick={() => onOpenOptions(item.ticker)}>OPTS</button>
                    <button className="btn-sm btn-danger" onClick={() => remove(item.ticker)}>✕</button>
                  </div>
                </div>
              </div>

              {/* Mobile layout */}
              <div className="show-mobile">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22 }}>{item.ticker}</div>
                    {item.price && <div style={{ fontSize: 10, color: '#99aacc' }}>${typeof item.price === 'number' ? item.price.toFixed(2) : item.price}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-sm" onClick={() => onOpenScanner(item.ticker)}>SCAN</button>
                    <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044' }} onClick={() => onOpenOptions(item.ticker)}>OPTS</button>
                    <button className="btn-sm btn-danger" onClick={() => remove(item.ticker)}>✕</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                  {item.signal
                    ? <span className="tag" style={{ background: SC[item.signal] + '22', color: SC[item.signal], border: `1px solid ${SC[item.signal]}44` }}>{item.signal} {item.confidence}%</span>
                    : <span style={{ fontSize: 10, color: '#333' }}>NOT SCANNED</span>}
                  {item.priceTarget && <span style={{ fontSize: 10, color: '#00ff88' }}>T: ${typeof item.priceTarget === 'number' ? item.priceTarget.toFixed(2) : item.priceTarget}</span>}
                  {item.stopLoss    && <span style={{ fontSize: 10, color: '#ff4444' }}>S: ${typeof item.stopLoss === 'number' ? item.stopLoss.toFixed(2) : item.stopLoss}</span>}
                </div>
                {item.note && <div style={{ fontSize: 11, color: '#aabbcc', fontStyle: 'italic' }}>{item.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}