// src/tabs/WatchlistTab.jsx
import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useUsage } from '../hooks/useUsage';
import UpgradeModal from '../components/UpgradeModal';

const BASE       = import.meta.env.VITE_API_BASE;
const FREE_LIMIT = 5;

const SC = { BUY: '#00ff88', SELL: '#ff4444', HOLD: '#ffaa00' };

function fmtPrice(p, currency = '$') {
  if (!p) return '—';
  if (p >= 1000) return `${currency}${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1)    return `${currency}${p.toFixed(2)}`;
  if (p >= 0.01) return `${currency}${p.toFixed(4)}`;
  return `${currency}${p.toFixed(6)}`;
}

// ── Accordion card ─────────────────────────────────────────────────────────────
function AccordionCard({ id, activeId, setActiveId, label, preview, children }) {
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
          padding: '10px 14px', cursor: 'pointer',
          background: isOpen ? '#ffaa0008' : 'transparent',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, color: isOpen ? '#ffaa00' : '#b0c0dd', fontWeight: 700, letterSpacing: '0.15em', marginBottom: isOpen ? 0 : 2 }}>
            {label}
          </div>
          {!isOpen && preview && (
            <div style={{ fontSize: 16, color: '#d0dff0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </div>
          )}
        </div>
        <div style={{ fontSize: 15, color: isOpen ? '#ffaa00' : '#7788aa', marginLeft: 10, flexShrink: 0 }}>
          {isOpen ? '▲' : '▼'}
        </div>
      </div>
      {isOpen && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #1e1e30' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Watchlist item card ────────────────────────────────────────────────────────
function WatchlistItem({ item, onRemove, removing, onOpenOptions, preloadedScan, currency, isIndia }) {
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const scanData  = preloadedScan?.data    || null;
  const scanning  = preloadedScan?.loading || false;
  const scanError = preloadedScan?.error   || '';

  const isUp     = item.changePct > 0;
  const isDown   = item.changePct < 0;
  const pctColor = isUp ? '#00ff88' : isDown ? '#ff4444' : '#7788aa';
  const sigColor = scanData?.analysis ? SC[scanData.analysis.signal] : '#7788aa';

  const fmt = (val, dec = 2) => val != null ? `${currency}${parseFloat(val).toFixed(dec)}` : null;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* ── Main row ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'grid',
          gridTemplateColumns: '64px 100px 88px auto 20px',
          alignItems: 'center', gap: 8,
          padding: '14px 16px', cursor: 'pointer',
          background: expanded ? '#0f0f1a' : 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = '#0d0d18'; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Ticker */}
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#ffaa00', lineHeight: 1, overflow: 'hidden' }}>
          {item.ticker}
        </div>

        {/* Price + change */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
            {fmtPrice(item.price, currency)}
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: pctColor, marginTop: 2 }}>
            {item.changePct != null
              ? `${isUp ? '▲' : isDown ? '▼' : '—'} ${Math.abs(item.changePct).toFixed(2)}%`
              : '—'}
          </div>
        </div>

        {/* Signal badge */}
        <div style={{ textAlign: 'center' }}>
          {scanning ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #ffaa0022', borderTop: '2px solid #ffaa00', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 15, color: '#ffaa00aa', letterSpacing: '0.05em' }}>ANALYZING</div>
            </div>
          ) : scanData?.analysis ? (
            <div style={{ background: sigColor + '11', border: `1px solid ${sigColor}44`, padding: '5px 6px', borderRadius: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: sigColor, lineHeight: 1 }}>{scanData.analysis.signal}</div>
              <div style={{ fontSize: 15, color: sigColor + '88', marginTop: 2 }}>{scanData.analysis.confidence}% · LT</div>
            </div>
          ) : (
            <div style={{ fontSize: 15, color: '#3a3a5e' }}>—</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          {!isIndia && (
            <button
              onClick={() => onOpenOptions(item.ticker)}
              style={{
                background: '#4488ff11', border: '1px solid #4488ff33',
                color: '#4488ff', cursor: 'pointer', borderRadius: 4,
                padding: '6px 10px', fontSize: 16, fontFamily: 'inherit', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#4488ff22'; e.currentTarget.style.borderColor = '#4488ff66'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#4488ff11'; e.currentTarget.style.borderColor = '#4488ff33'; }}
            >⚡</button>
          )}
          <button
            onClick={() => onRemove(item.ticker)}
            disabled={removing === item.ticker}
            style={{
              background: 'none', border: '1px solid #ff444422',
              color: '#ff4444aa', cursor: 'pointer', borderRadius: 4,
              padding: '6px 10px', fontSize: 16, fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff4444'; e.currentTarget.style.borderColor = '#ff4444'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#ff444466'; e.currentTarget.style.borderColor = '#ff444422'; }}
          >{removing === item.ticker ? '...' : '✕'}</button>
        </div>

        {/* Expand chevron */}
        <div style={{ fontSize: 15, color: expanded ? '#ffaa00' : '#3a3a5e', textAlign: 'center' }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* ── Expanded section ── */}
      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid #1e1e2e' }}>
          {scanError && <div style={{ fontSize: 17, color: '#ff4444', padding: '10px 0' }}>{scanError}</div>}
          {scanning && (
            <div style={{ fontSize: 17, color: '#ffaa00aa', padding: '12px 0', textAlign: 'center', letterSpacing: '0.15em' }}>
              RUNNING LONG TERM ANALYSIS...
            </div>
          )}
          {scanData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
              {scanData.analysis && (
                <div style={{ fontSize: 15, color: '#d0d8f0', lineHeight: 1.7, borderLeft: `2px solid ${sigColor}44`, paddingLeft: 10, fontStyle: 'italic', marginBottom: 4 }}>
                  {scanData.analysis.thesis}
                </div>
              )}

              <AccordionCard id="technicals" activeId={activeId} setActiveId={setActiveId}
                label="TECHNICALS & FUNDAMENTALS"
                preview={scanData.ta ? `RSI ${scanData.ta.rsi14} · ${scanData.ta.trendSignal} · Vol ${scanData.ta.volumeRatio}x` : ''}
              >
                <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {scanData.ta && (
                    <div>
                      <div style={{ fontSize: 15, color: '#4488ff', letterSpacing: '0.15em', fontWeight: 700, marginBottom: 8 }}>TECHNICAL</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        {[
                          ['RSI (14)',    scanData.ta.rsi14,            scanData.ta.rsi14 > 70 ? '#ff4444' : scanData.ta.rsi14 < 30 ? '#00ff88' : '#ffaa00'],
                          ['Trend',      scanData.ta.trendSignal,       scanData.ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444'],
                          ['Volume',     `${scanData.ta.volumeRatio}x`, scanData.ta.volumeSignal === 'HIGH' ? '#ffaa00' : '#e8e8f0'],
                          ['MACD',       scanData.ta.macd?.cross,       scanData.ta.macd?.cross === 'BULLISH_CROSS' ? '#00ff88' : scanData.ta.macd?.cross === 'BEARISH_CROSS' ? '#ff4444' : '#e8e8f0'],
                          ['SMA 50',     scanData.ta.sma50  ? fmt(scanData.ta.sma50)  : null, '#e8e8f0'],
                          ['SMA 200',    scanData.ta.sma200 ? fmt(scanData.ta.sma200) : null, '#e8e8f0'],
                          ['ATR',        scanData.ta.atr?.atr,          scanData.ta.atr?.volatility === 'HIGH' ? '#ffaa00' : '#e8e8f0'],
                          ['StochRSI K', scanData.ta.stochRSI?.k,       scanData.ta.stochRSI?.k > 90 ? '#ff4444' : scanData.ta.stochRSI?.k < 10 ? '#00ff88' : '#ffaa00'],
                          ['Support',    scanData.ta.sr?.nearestSupport    ? fmt(scanData.ta.sr.nearestSupport)    : null, '#00ff88'],
                          ['Resistance', scanData.ta.sr?.nearestResistance ? fmt(scanData.ta.sr.nearestResistance) : null, '#ff4444'],
                        ].filter(([, v]) => v != null).map(([k, v, c]) => (
                          <div key={k} style={{ background: '#0a0a12', padding: '6px 8px', borderRadius: 3 }}>
                            <div style={{ fontSize: 14, color: '#d0dff0', marginBottom: 2, letterSpacing: '0.1em' }}>{k}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {scanData.fundamentals && (
                    <div>
                      <div style={{ fontSize: 15, color: '#ffaa00', letterSpacing: '0.15em', fontWeight: 700, marginBottom: 8 }}>FUNDAMENTALS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        {[
                          ['P/E',        scanData.fundamentals.pe?.toFixed(1)],
                          ['EPS',        scanData.fundamentals.eps        ? fmt(scanData.fundamentals.eps)                   : null],
                          ['Beta',       scanData.fundamentals.beta?.toFixed(2)],
                          ['52W High',   scanData.fundamentals.fiftyTwoWeekHigh ? fmt(scanData.fundamentals.fiftyTwoWeekHigh) : null],
                          ['52W Low',    scanData.fundamentals.fiftyTwoWeekLow  ? fmt(scanData.fundamentals.fiftyTwoWeekLow)  : null],
                          ['ROE',        scanData.fundamentals.roe         ? `${(scanData.fundamentals.roe * 100).toFixed(1)}%`         : null],
                          ['Rev Growth', scanData.fundamentals.revenueGrowth ? `${(scanData.fundamentals.revenueGrowth * 100).toFixed(1)}%` : null],
                          ['Target',     scanData.fundamentals.targetMeanPrice ? fmt(scanData.fundamentals.targetMeanPrice)  : null],
                        ].filter(([, v]) => v != null).map(([k, v]) => (
                          <div key={k} style={{ background: '#0a0a12', padding: '6px 8px', borderRadius: 3 }}>
                            <div style={{ fontSize: 14, color: '#d0dff0', marginBottom: 2, letterSpacing: '0.1em' }}>{k}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f0' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {scanData.analysis && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ background: '#070e0a', border: '1px solid #00ff8822', borderRadius: 4, padding: '10px' }}>
                        <div style={{ fontSize: 15, color: '#00ff88', fontWeight: 700, marginBottom: 8, letterSpacing: '0.1em' }}>▲ BULL</div>
                        {scanData.analysis.bullFactors?.slice(0, 3).map((f, i) => (
                          <div key={i} style={{ fontSize: 16, color: '#d0d8f0', padding: '3px 0', borderBottom: i < 2 ? '1px solid #0f1a14' : 'none', display: 'flex', gap: 5, lineHeight: 1.4 }}>
                            <span style={{ color: '#00ff88', flexShrink: 0 }}>▲</span>{f}
                          </div>
                        ))}
                      </div>
                      <div style={{ background: '#0e0707', border: '1px solid #ff444422', borderRadius: 4, padding: '10px' }}>
                        <div style={{ fontSize: 15, color: '#ff4444', fontWeight: 700, marginBottom: 8, letterSpacing: '0.1em' }}>▼ BEAR</div>
                        {scanData.analysis.bearFactors?.slice(0, 3).map((f, i) => (
                          <div key={i} style={{ fontSize: 16, color: '#d0d8f0', padding: '3px 0', borderBottom: i < 2 ? '1px solid #1a0f0f' : 'none', display: 'flex', gap: 5, lineHeight: 1.4 }}>
                            <span style={{ color: '#ff4444', flexShrink: 0 }}>▼</span>{f}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionCard>

              <AccordionCard id="news" activeId={activeId} setActiveId={setActiveId}
                label={`RECENT NEWS${scanData.news?.length ? ` (${scanData.news.length})` : ''}`}
                preview={scanData.news?.[0]?.title || 'No recent news'}
              >
                <div style={{ paddingTop: 10 }}>
                  {scanData.news?.length > 0 ? (
                    scanData.news.slice(0, 6).map((n, i) => (
                      <div key={i} style={{ padding: '8px 0', borderBottom: i < Math.min(scanData.news.length, 6) - 1 ? '1px solid #1a1a26' : 'none' }}>
                        <a href={n.url} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#c8d8f0', fontSize: 17, lineHeight: 1.5, display: 'block', textDecoration: 'none', marginBottom: 3 }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ffaa00'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#c8d8f0'; }}
                        >{n.title}</a>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: '#d0dff0', fontSize: 15 }}>{n.publisher}</span>
                          <span style={{ color: '#d0dff0', fontSize: 15 }}>
                            {new Date(n.time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 17, color: '#d0dff0', padding: '8px 0' }}>No recent news available</div>
                  )}
                </div>
              </AccordionCard>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main WatchlistTab ──────────────────────────────────────────────────────────
export default function WatchlistTab({ onOpenScanner, onOpenOptions, watchlistScans, onTickerAdded, onTickerRemoved, market = 'US' }) {
  const { user } = useUser();
  const userId   = user?.id;
  const { plan } = useUsage();

  const isIndia  = market === 'INDIA';
  const currency = isIndia ? '₹' : '$';

  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [inputVal,    setInputVal]    = useState('');
  const [adding,      setAdding]      = useState(false);
  const [error,       setError]       = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [removing,    setRemoving]    = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);

  const fetchWatchlist = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res  = await fetch(`${BASE}/watchlist/${userId}?market=${market}`);
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [userId, market]);

  // Refetch when market switches
  useEffect(() => {
    setItems([]);
    setLoading(true);
    fetchWatchlist();
  }, [market]);

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
        body: JSON.stringify({ ticker, market }),
      });
      const data = await res.json();
      if (data.error) { if (data.error.includes('limit')) setShowUpgrade(true); else setError(data.error); }
      else { setInputVal(''); fetchWatchlist(true); onTickerAdded?.(ticker); }
    } catch (e) { setError(e.message); }
    setAdding(false);
  };

  const handleRemove = async (ticker) => {
    if (!userId) return;
    setRemoving(ticker);
    try {
      await fetch(`${BASE}/watchlist/${userId}/${ticker}?market=${market}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.ticker !== ticker));
      onTickerRemoved?.(ticker);
    } catch {}
    setRemoving(null);
  };

  const isPro  = plan === 'pro';
  const isFull = !isPro && items.length >= FREE_LIMIT;

  return (
    <div>
      {showUpgrade && <UpgradeModal type="watchlist" onClose={() => setShowUpgrade(false)} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#ffaa00', lineHeight: 1 }}>
            {isIndia ? '🇮🇳 WATCHLIST' : 'WATCHLIST'}
          </div>
          <div style={{ fontSize: 16, color: '#d0dff0', marginTop: 2 }}>
            {isPro ? `${items.length} tickers · unlimited` : `${items.length} / ${FREE_LIMIT} · free tier`}
            {isIndia && ' · NSE India'}
          </div>
        </div>
        <button onClick={() => fetchWatchlist(true)} disabled={refreshing}
          style={{ background: 'none', border: '1px solid #2a2a40', color: refreshing ? '#7788aa' : '#b0c0dd', cursor: refreshing ? 'default' : 'pointer', borderRadius: 4, padding: '6px 12px', fontSize: 17, fontFamily: 'inherit', letterSpacing: '0.1em' }}>
          {refreshing ? 'REFRESHING...' : '↻ REFRESH'}
        </button>
      </div>

      {/* Add input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 16 }}>
            {currency}
          </span>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !adding && handleAdd()}
            placeholder={isFull ? 'UPGRADE TO ADD MORE' : isIndia ? 'ADD NSE TICKER...' : 'ADD TICKER...'}
            disabled={isFull && !isPro}
            className="input"
            style={{ padding: '10px 12px 10px 26px', fontSize: 16, fontWeight: 600, opacity: isFull ? 0.5 : 1 }}
            autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
          />
        </div>
        <button className="btn" onClick={handleAdd} disabled={adding || !inputVal.trim() || (isFull && !isPro)}
          style={{ whiteSpace: 'nowrap', opacity: isFull && !isPro ? 0.4 : 1 }}>
          {adding ? 'ADDING...' : '+ ADD'}
        </button>
      </div>

      {error && <div style={{ fontSize: 17, color: '#ff4444', marginBottom: 10 }}>{error}</div>}

      {!isPro && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 16, color: '#d0dff0', letterSpacing: '0.1em' }}>CAPACITY</span>
            <span style={{ fontSize: 16, color: isFull ? '#ff4444' : '#b0c0dd' }}>{items.length}/{FREE_LIMIT}</span>
          </div>
          <div style={{ background: '#1a1a2e', borderRadius: 2, height: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((items.length / FREE_LIMIT) * 100, 100)}%`, background: isFull ? '#ff4444' : '#ffaa00', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          {isFull && (
            <div style={{ fontSize: 17, color: '#ff4444', marginTop: 5 }}>
              Limit reached —{' '}
              <button onClick={() => setShowUpgrade(true)} style={{ background: 'none', border: 'none', color: '#ffaa00', cursor: 'pointer', fontSize: 17, fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>
                upgrade to Pro
              </button>{' '}for unlimited
            </div>
          )}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 15, color: '#d0dff0' }}>LOADING WATCHLIST...</div>}

      {!loading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{isIndia ? '🇮🇳' : '👁'}</div>
          <div style={{ fontSize: 17, color: '#d0dff0', marginBottom: 8 }}>
            Your {isIndia ? 'India' : 'US'} watchlist is empty
          </div>
          <div style={{ fontSize: 17, color: '#d0dff0', lineHeight: 1.8 }}>
            {isIndia
              ? 'Add NSE tickers above (e.g. RELIANCE, TCS, INFY)\nClick any ticker to see long term analysis'
              : 'Add tickers above · Click any ticker to see long term analysis'
            }<br />Prices refresh every minute
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <WatchlistItem
              key={item.ticker}
              item={item}
              onRemove={handleRemove}
              removing={removing}
              onOpenOptions={onOpenOptions}
              preloadedScan={watchlistScans?.[item.ticker]}
              currency={currency}
              isIndia={isIndia}
            />
          ))}
        </div>
      )}

      {!isPro && items.length > 0 && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#ffaa0008', border: '1px solid #ffaa0022', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 17, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.1em' }}>UPGRADE TO PRO</div>
            <div style={{ fontSize: 17, color: '#d0dff0', marginTop: 2 }}>Unlimited watchlist + unlimited scans & options</div>
          </div>
          <button className="btn" onClick={() => setShowUpgrade(true)} style={{ fontSize: 17, padding: '8px 20px' }}>$5/MO →</button>
        </div>
      )}
    </div>
  );
}