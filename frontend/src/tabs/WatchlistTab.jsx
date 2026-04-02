// src/tabs/WatchlistTab.jsx
import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useUsage } from '../hooks/useUsage';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierChain, fetchTradierExpirations } from '../api/tradier';
import { calcIndicators } from '../utils/indicators';
import { runPriceAnalysis } from '../api/claude';
import { SC } from '../utils/constants';
import UpgradeModal from '../components/UpgradeModal';

const BASE       = import.meta.env.VITE_API_BASE;
const FREE_LIMIT = 5;

function fmtPrice(p) {
  if (!p) return '—';
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function Accordion({ id, activeId, setActiveId, label, preview, children }) {
  const isOpen = activeId === id;
  return (
    <div style={{
      background: '#070710', border: `1px solid ${isOpen ? '#ffaa0044' : '#1e1e2e'}`,
      borderRadius: 4, overflow: 'hidden', transition: 'border-color 0.15s',
    }}>
      <div
        onClick={() => setActiveId(isOpen ? null : id)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', cursor: 'pointer',
          background: isOpen ? '#ffaa0008' : 'transparent',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: isOpen ? '#ffaa00' : '#b0c0dd', fontWeight: 700, letterSpacing: '0.15em' }}>
            {label}
          </div>
          {!isOpen && preview && (
            <div style={{ fontSize: 10, color: '#7788aa', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: isOpen ? '#ffaa00' : '#7788aa', marginLeft: 8 }}>
          {isOpen ? '▲' : '▼'}
        </div>
      </div>
      {isOpen && (
        <div style={{ padding: '0 12px 14px', borderTop: '1px solid #1e1e2e' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function WatchlistItem({ item, onRemove, onOpenOptions }) {
  const [expanded, setExpanded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanData, setScanData] = useState(null);
  const [activeId, setActiveId] = useState('technicals');
  const [removing, setRemoving] = useState(false);

  const isUp     = item.changePct > 0;
  const isDown   = item.changePct < 0;
  const pctColor = isUp ? '#00ff88' : isDown ? '#ff4444' : '#7788aa';
  const sigColor = scanData?.analysis ? SC[scanData.analysis.signal] : '#7788aa';

  const runScan = async () => {
    if (scanData || scanning) { setExpanded(true); return; }
    setScanning(true); setExpanded(true);
    try {
      const [p, q, f, n] = await Promise.all([
        fetchPrice(item.ticker, '1y', '1d'),
        fetchTradierQuote(item.ticker),
        fetchFundamentals(item.ticker),
        fetchStockNews(item.ticker),
      ]);
      const ta        = calcIndicators(p, 'longterm');
      const livePrice = q?.last || p?.current;
      const exps      = await fetchTradierExpirations(item.ticker).catch(() => []);
      let optData     = null;
      if (exps.length > 0) {
        optData = await fetchTradierChain(item.ticker, exps[0], livePrice).catch(() => null);
      }
      const analysis = await runPriceAnalysis(
        item.ticker, livePrice, p, f, optData, n,
        null, null, null, null, ta, 'longterm'
      );
      setScanData({ p, q, f, n, ta, analysis, livePrice });
    } catch (e) { console.error('[watchlist scan]', e.message); }
    setScanning(false);
  };

  const handleRemove = async () => {
    setRemoving(true);
    await onRemove(item.ticker);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* ── Row ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
          background: expanded ? '#141420' : '#0f0f1a',
          transition: 'background 0.15s',
        }}
        onClick={runScan}
      >
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#ffaa00', lineHeight: 1, minWidth: 70, flexShrink: 0 }}>
          {item.ticker}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{fmtPrice(item.price)}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: pctColor, marginTop: 1 }}>
            {item.changePct != null ? `${isUp ? '▲' : isDown ? '▼' : '—'} ${Math.abs(item.changePct).toFixed(2)}%` : '—'}
          </div>
        </div>

        {scanning && <div style={{ fontSize: 10, color: '#ffaa0077', letterSpacing: '0.1em' }}>ANALYZING...</div>}
        {scanData?.analysis && !scanning && (
          <div style={{
            background: sigColor + '11', border: `1px solid ${sigColor}44`,
            padding: '5px 10px', borderRadius: 2, textAlign: 'center', flexShrink: 0,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: sigColor, lineHeight: 1 }}>{scanData.analysis.signal}</div>
            <div style={{ fontSize: 9, color: '#b0c0dd', marginTop: 1 }}>{scanData.analysis.confidence}%</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onOpenOptions(item.ticker)}
            style={{
              background: '#4488ff11', border: '1px solid #4488ff33', color: '#4488ff',
              cursor: 'pointer', borderRadius: 4, padding: '6px 10px',
              fontSize: 10, fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#4488ff22'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#4488ff11'; }}
          >⚡</button>
          <button
            onClick={handleRemove}
            disabled={removing}
            style={{
              background: 'none', border: '1px solid #ff444422', color: '#ff444466',
              cursor: 'pointer', borderRadius: 4, padding: '6px 10px',
              fontSize: 10, fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff4444'; e.currentTarget.style.borderColor = '#ff4444'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#ff444466'; e.currentTarget.style.borderColor = '#ff444422'; }}
          >{removing ? '...' : '✕'}</button>
        </div>
      </div>

      {/* ── Expanded ── */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1e1e2e' }}>
          {scanning && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 11, color: '#ffaa0077', letterSpacing: '0.2em' }}>
              RUNNING LONG TERM ANALYSIS...
            </div>
          )}

          {scanData && !scanning && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>

              {/* Signal summary */}
              {scanData.analysis && (
                <div style={{
                  background: sigColor + '0d', border: `1px solid ${sigColor}33`,
                  borderRadius: 4, padding: '10px 12px', marginBottom: 4,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: sigColor }}>
                      {scanData.analysis.signal} · {scanData.analysis.confidence}%
                    </div>
                    <div style={{ fontSize: 10, color: '#7788aa' }}>LONG TERM</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[
                      ['TARGET', `$${scanData.analysis.priceTarget?.toFixed(2)}`, '#00ff88'],
                      ['STOP',   `$${scanData.analysis.stopLoss?.toFixed(2)}`,    '#ff4444'],
                      ['RISK',   scanData.analysis.riskLevel,                      scanData.analysis.riskLevel === 'LOW' ? '#00ff88' : scanData.analysis.riskLevel === 'HIGH' ? '#ff4444' : '#ffaa00'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ background: '#070710', padding: '5px 10px', borderRadius: 2 }}>
                        <div style={{ fontSize: 8, color: '#7788aa', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {scanData.analysis.thesis && (
                    <div style={{ fontSize: 11, color: '#99aacc', lineHeight: 1.6, fontStyle: 'italic' }}>
                      {scanData.analysis.thesis}
                    </div>
                  )}
                </div>
              )}

              {/* Accordion 1: Technicals */}
              <Accordion
                id="technicals"
                activeId={activeId}
                setActiveId={setActiveId}
                label="TECHNICALS & FUNDAMENTALS"
                preview={scanData.ta ? `RSI ${scanData.ta.rsi14} · ${scanData.ta.trendSignal} · Vol ${scanData.ta.volumeRatio}x` : ''}
              >
                <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {scanData.ta && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[
                        ['RSI (14)',    scanData.ta.rsi14,             scanData.ta.rsi14 > 70 ? '#ff4444' : scanData.ta.rsi14 < 30 ? '#00ff88' : '#ffaa00'],
                        ['Trend',      scanData.ta.trendSignal,        scanData.ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444'],
                        ['Volume',     `${scanData.ta.volumeRatio}x`,  scanData.ta.volumeSignal === 'HIGH' ? '#ffaa00' : '#e8e8f0'],
                        ['MACD',       scanData.ta.macd?.cross,        scanData.ta.macd?.cross === 'BULLISH_CROSS' ? '#00ff88' : scanData.ta.macd?.cross === 'BEARISH_CROSS' ? '#ff4444' : '#e8e8f0'],
                        ['SMA 50',     scanData.ta.sma50  ? `$${scanData.ta.sma50}`  : null, '#e8e8f0'],
                        ['SMA 200',    scanData.ta.sma200 ? `$${scanData.ta.sma200}` : null, '#e8e8f0'],
                        ['ATR (14)',   scanData.ta.atr?.atr,           scanData.ta.atr?.volatility === 'HIGH' ? '#ffaa00' : '#e8e8f0'],
                        ['StochRSI K', scanData.ta.stochRSI?.k,        scanData.ta.stochRSI?.k > 90 ? '#ff4444' : scanData.ta.stochRSI?.k < 10 ? '#00ff88' : '#ffaa00'],
                        ['Support',    scanData.ta.sr?.nearestSupport    ? `$${scanData.ta.sr.nearestSupport}`    : null, '#00ff88'],
                        ['Resistance', scanData.ta.sr?.nearestResistance ? `$${scanData.ta.sr.nearestResistance}` : null, '#ff4444'],
                      ].filter(([, v]) => v != null).map(([k, v, c]) => (
                        <div key={k} style={{ background: '#0a0a14', padding: '7px 8px', borderRadius: 3 }}>
                          <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 2, letterSpacing: '0.1em' }}>{k}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {scanData.f && (
                    <>
                      <div style={{ fontSize: 10, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.15em' }}>FUNDAMENTALS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {[
                          ['P/E',        scanData.f.pe?.toFixed(1)],
                          ['EPS',        scanData.f.eps ? `$${scanData.f.eps.toFixed(2)}` : null],
                          ['Beta',       scanData.f.beta?.toFixed(2)],
                          ['52W High',   scanData.f.fiftyTwoWeekHigh ? `$${scanData.f.fiftyTwoWeekHigh.toFixed(2)}` : null],
                          ['52W Low',    scanData.f.fiftyTwoWeekLow  ? `$${scanData.f.fiftyTwoWeekLow.toFixed(2)}`  : null],
                          ['ROE',        scanData.f.roe ? `${(scanData.f.roe * 100).toFixed(1)}%` : null],
                          ['Rev Growth', scanData.f.revenueGrowth ? `${(scanData.f.revenueGrowth * 100).toFixed(1)}%` : null],
                          ['D/E',        scanData.f.debtToEquity?.toFixed(2)],
                          ['Target',     scanData.f.targetMeanPrice ? `$${scanData.f.targetMeanPrice.toFixed(2)}` : null],
                        ].filter(([, v]) => v != null).map(([k, v]) => (
                          <div key={k} style={{ background: '#0a0a14', padding: '7px 8px', borderRadius: 3 }}>
                            <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 2, letterSpacing: '0.1em' }}>{k}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#e8e8f0' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Accordion>

              {/* Accordion 2: News */}
              <Accordion
                id="news"
                activeId={activeId}
                setActiveId={setActiveId}
                label={`RECENT NEWS${scanData.n?.length ? ` (${scanData.n.length})` : ''}`}
                preview={scanData.n?.[0]?.title || 'No recent news available'}
              >
                <div style={{ paddingTop: 10 }}>
                  {scanData.n?.length > 0 ? (
                    scanData.n.slice(0, 8).map((n, i) => (
                      <div key={i} style={{
                        padding: '9px 0',
                        borderBottom: i < Math.min(scanData.n.length, 8) - 1 ? '1px solid #1a1a26' : 'none',
                      }}>
                        <a href={n.url} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#c8d8f0', fontSize: 12, lineHeight: 1.5, display: 'block', textDecoration: 'none', marginBottom: 3 }}
                          onMouseEnter={e => { if (n.url) e.currentTarget.style.color = '#ffaa00'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#c8d8f0'; }}
                        >{n.title}</a>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: '#7788aa', fontSize: 10 }}>{n.publisher}</span>
                          <span style={{ color: '#3a3a5e', fontSize: 10 }}>·</span>
                          <span style={{ color: '#7788aa', fontSize: 10 }}>
                            {new Date(n.time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {n.url && (
                            <a href={n.url} target="_blank" rel="noopener noreferrer"
                              style={{ marginLeft: 'auto', fontSize: 9, color: '#ffaa0077', textDecoration: 'none' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#ffaa00'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = '#ffaa0077'; }}
                            >READ →</a>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 11, color: '#7788aa', padding: '8px 0' }}>No recent news available</div>
                  )}
                </div>
              </Accordion>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#7788aa', fontSize: 10, fontFamily: 'inherit',
                letterSpacing: '0.1em', padding: '4px 8px',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#b0c0dd'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#7788aa'; }}
            >▲ COLLAPSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────
export default function WatchlistTab({ onOpenScanner, onOpenOptions }) {
  const { user } = useUser();
  const userId   = user?.id;
  const { plan } = useUsage();

  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [inputVal,   setInputVal]   = useState('');
  const [adding,     setAdding]     = useState(false);
  const [error,      setError]      = useState('');
  const [showUpgrade,setShowUpgrade]= useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWatchlist = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res  = await fetch(`${BASE}/watchlist/${userId}`);
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {}
    setLoading(false); setRefreshing(false);
  }, [userId]);

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  useEffect(() => {
    const interval = setInterval(() => fetchWatchlist(true), 60000);
    return () => clearInterval(interval);
  }, [fetchWatchlist]);

  const handleAdd = async () => {
    const ticker = inputVal.trim().toUpperCase();
    if (!ticker || !userId) return;
    if (plan !== 'pro' && items.length >= FREE_LIMIT) { setShowUpgrade(true); return; }
    setAdding(true); setError('');
    try {
      const res  = await fetch(`${BASE}/watchlist/${userId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('limit')) setShowUpgrade(true);
        else setError(data.error);
      } else { setInputVal(''); fetchWatchlist(true); }
    } catch (e) { setError(e.message); }
    setAdding(false);
  };

  const handleRemove = async (ticker) => {
    try {
      await fetch(`${BASE}/watchlist/${userId}/${ticker}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.ticker !== ticker));
    } catch {}
  };

  const isPro  = plan === 'pro';
  const isFull = !isPro && items.length >= FREE_LIMIT;

  return (
    <div>
      {showUpgrade && <UpgradeModal type="watchlist" onClose={() => setShowUpgrade(false)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#ffaa00', lineHeight: 1 }}>WATCHLIST</div>
          <div style={{ fontSize: 10, color: '#7788aa', marginTop: 2 }}>
            {isPro ? `${items.length} tickers · unlimited` : `${items.length} / ${FREE_LIMIT} tickers · free tier`}
          </div>
        </div>
        <button onClick={() => fetchWatchlist(true)} disabled={refreshing}
          style={{
            background: 'none', border: '1px solid #2a2a40', color: refreshing ? '#7788aa' : '#b0c0dd',
            cursor: refreshing ? 'default' : 'pointer', borderRadius: 4,
            padding: '6px 12px', fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.1em',
          }}>
          {refreshing ? 'REFRESHING...' : '↻ REFRESH'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 12 }}>$</span>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !adding && handleAdd()}
            placeholder={isFull ? 'UPGRADE TO ADD MORE' : 'ADD TICKER...'}
            disabled={isFull && !isPro}
            className="input"
            style={{ padding: '10px 12px 10px 26px', fontSize: 13, fontWeight: 600, opacity: isFull ? 0.5 : 1 }}
            autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
          />
        </div>
        <button className="btn" onClick={handleAdd}
          disabled={adding || !inputVal.trim() || (isFull && !isPro)}
          style={{ whiteSpace: 'nowrap', opacity: isFull && !isPro ? 0.4 : 1 }}>
          {adding ? 'ADDING...' : '+ ADD'}
        </button>
      </div>

      {error && <div style={{ fontSize: 11, color: '#ff4444', marginBottom: 12 }}>{error}</div>}

      {!isPro && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em' }}>WATCHLIST CAPACITY</span>
            <span style={{ fontSize: 10, color: isFull ? '#ff4444' : '#b0c0dd' }}>{items.length}/{FREE_LIMIT}</span>
          </div>
          <div style={{ background: '#1a1a2e', borderRadius: 2, height: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min((items.length / FREE_LIMIT) * 100, 100)}%`,
              background: isFull ? '#ff4444' : '#ffaa00', borderRadius: 2, transition: 'width 0.3s',
            }} />
          </div>
          {isFull && (
            <div style={{ fontSize: 11, color: '#ff4444', marginTop: 6 }}>
              Limit reached —{' '}
              <button onClick={() => setShowUpgrade(true)}
                style={{ background: 'none', border: 'none', color: '#ffaa00', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>
                upgrade to Pro
              </button>{' '}for unlimited
            </div>
          )}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 12, color: '#7788aa' }}>LOADING WATCHLIST...</div>}

      {!loading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👁</div>
          <div style={{ fontSize: 14, color: '#99aacc', marginBottom: 8 }}>Your watchlist is empty</div>
          <div style={{ fontSize: 11, color: '#7788aa', lineHeight: 1.8 }}>
            Add tickers above to track them here<br />
            Click any ticker to see long term AI analysis
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <WatchlistItem key={item.ticker} item={item} onRemove={handleRemove} onOpenOptions={onOpenOptions} />
          ))}
        </div>
      )}

      {!isPro && items.length > 0 && (
        <div style={{
          marginTop: 20, padding: '14px 16px',
          background: '#ffaa0008', border: '1px solid #ffaa0022',
          borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.1em' }}>UPGRADE TO PRO</div>
            <div style={{ fontSize: 11, color: '#7788aa', marginTop: 2 }}>Unlimited watchlist + unlimited scans & options</div>
          </div>
          <button className="btn" onClick={() => setShowUpgrade(true)} style={{ fontSize: 11, padding: '8px 20px' }}>$5/MO →</button>
        </div>
      )}
    </div>
  );
}