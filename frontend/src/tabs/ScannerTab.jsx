import { useState, useEffect, useRef } from 'react';
import { SC, MC, GC, RC } from '../utils/constants';
import { useScan } from '../hooks/useScan';
import { TIMEFRAMES } from '../utils/indicators';
import { useUsage } from '../hooks/useUsage';
import MiniChart      from '../components/MiniChart';
import BondPanel      from '../components/BondPanel';
import TechnicalPanel from '../components/TechnicalPanel';
import UsageBadge     from '../components/UsageBadge';
import UpgradeModal   from '../components/UpgradeModal';
import ScannerResults from '../components/ScannerResults';

const TF_KEYS = ['short', 'swing', 'position', 'longterm'];
const BASE = import.meta.env.VITE_API_BASE;

const STAGE_LABELS = {
  price:        'FETCHING PRICE DATA...',
  fundamentals: 'LOADING FUNDAMENTALS...',
  options:      'SCANNING OPTIONS FLOW...',
  news:         'GATHERING NEWS...',
  claude:       'RUNNING AI ANALYSIS...',
};
const STAGES = ['price', 'fundamentals', 'options', 'news', 'claude'];

const TABS = [
  { key: 'gainers', label: '▲ GAINERS', color: '#00ff88' },
  { key: 'losers',  label: '▼ LOSERS',  color: '#ff4444' },
  { key: 'volume',  label: '◉ VOLUME',  color: '#4488ff' },
];

const MARKET_TYPES = [
  { key: 'stocks', label: '📈 STOCKS' },
  { key: 'crypto', label: '₿ CRYPTO'  },
];

function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

function fmtPrice(p) {
  if (!p) return '—';
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

export default function ScannerTab({ macro, onOpenOptions, onAddToWatchlist }) {
  const [inputVal,     setInputVal]     = useState('');
  const [suggestions,  setSuggestions]  = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx,    setActiveIdx]    = useState(-1);
  const [showUpgrade,  setShowUpgrade]  = useState(false);
  const [isWide,       setIsWide]       = useState(window.innerWidth > 768);
  const [marketType,   setMarketType]   = useState('stocks');
  const [moversTab,    setMoversTab]    = useState('gainers');
  const [moversOpen,   setMoversOpen]   = useState(true);
  const [movers,       setMovers]       = useState({ gainers: [], losers: [], volume: [] });
  const [crypto,       setCrypto]       = useState({ gainers: [], losers: [], volume: [] });
  const [moversLoad,   setMoversLoad]   = useState(true);
  const [cryptoLoad,   setCryptoLoad]   = useState(true);
  const [showResults,  setShowResults]  = useState(false);

  const dropdownRef = useRef(null);
  const skipSearch  = useRef(false);
  const searchCache = useRef({});

  const scan = useScan(macro);
  const { usage, limits, plan, canScan, canOptions, trackScan } = useUsage();

  const livePrice = scan.quote?.last || scan.ohlcv?.current;
  const pct = scan.ohlcv?.current && scan.ohlcv?.prev && scan.ohlcv.prev !== 0
    ? ((scan.ohlcv.current - scan.ohlcv.prev) / scan.ohlcv.prev * 100)
    : null;

  useEffect(() => {
    fetch(`${BASE}/movers`)
      .then(r => r.json())
      .then(data => { setMovers(data); setMoversLoad(false); })
      .catch(() => setMoversLoad(false));
  }, []);

  useEffect(() => {
    if (marketType !== 'crypto' || !cryptoLoad) return;
    fetch(`${BASE}/crypto`)
      .then(r => r.json())
      .then(data => { setCrypto(data); setCryptoLoad(false); })
      .catch(() => setCryptoLoad(false));
  }, [marketType]);

  useEffect(() => {
    if (scan.loading) setMoversOpen(false);
  }, [scan.loading]);



  useEffect(() => {
    if (!showResults && !scan.analysis) setMoversOpen(true);
  }, [scan.analysis]); // only trigger when analysis changes

  useEffect(() => {
    const handler = () => setIsWide(window.innerWidth > 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return; }
    if (inputVal.length < 1) { setSuggestions([]); setShowDropdown(false); return; }
    if (searchCache.current[inputVal]) {
      setSuggestions(searchCache.current[inputVal]);
      setShowDropdown(searchCache.current[inputVal].length > 0);
      setActiveIdx(-1);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`${BASE}/search?q=${encodeURIComponent(inputVal)}`);
        const data = await res.json();
        searchCache.current[inputVal] = data;
        setSuggestions(data);
        setShowDropdown(data.length > 0);
        setActiveIdx(-1);
      } catch { setSuggestions([]); }
    }, 150);
    return () => clearTimeout(timer);
  }, [inputVal]);

  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleScan = (ticker, tf = null) => {
    if (!canScan()) { setShowUpgrade(true); return; }
    trackScan();
    skipSearch.current = true;
    setShowDropdown(false);
    setSuggestions([]);
    setInputVal(ticker);
    setShowResults(false);
    if (tf) { scan.setTimeframe(tf); scan.runScan(ticker, tf); }
    else    { scan.runScan(ticker); }
  };

  const selectTicker = ticker => {
    skipSearch.current = true;
    setShowDropdown(false);
    setSuggestions([]);
    setActiveIdx(-1);
    setInputVal(ticker);
    handleScan(ticker);
  };

  const handleKeyDown = e => {
    if (!showDropdown) {
      if (e.key === 'Enter' && !scan.loading) handleScan(inputVal);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) selectTicker(suggestions[activeIdx].ticker);
      else { skipSearch.current = true; setShowDropdown(false); handleScan(inputVal); }
    }
    if (e.key === 'Escape') setShowDropdown(false);
  };

  const handleNewScan = () => {
    setShowResults(false);
    scan.reset();
    setInputVal('');
    setMoversOpen(true);
  };

  const activeData = marketType === 'crypto' ? crypto  : movers;
  const isLoading  = marketType === 'crypto' ? cryptoLoad : moversLoad;
  const list       = activeData[moversTab] || [];

  return (
    <div style={{ position: 'relative' }}>
      {showUpgrade && <UpgradeModal type="scan" onClose={() => setShowUpgrade(false)} />}

      {/* ── Results page — full swap ── */}
      {showResults && scan.analysis && (
        <ScannerResults
          scan={scan}
          macro={macro}
          onBack={() => { setShowResults(false); setMoversOpen(true); }}
          onOpenOptions={(ticker) => {
            setShowResults(false);
            if (!canOptions()) { setShowUpgrade(true); return; }
            onOpenOptions(ticker);
          }}
        />
      )}

      {/* ── Loading overlay ── */}
      {scan.loading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(7, 7, 14, 0.88)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%',
            border: '3px solid #ffaa0022', borderTop: '3px solid #ffaa00',
            animation: 'spin 0.8s linear infinite' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24,
              color: '#ffaa00', letterSpacing: '0.15em', marginBottom: 8 }}>ANALYZING</div>
            <div style={{ fontSize: 12, color: '#ffaa0066', letterSpacing: '0.2em' }}>
              {STAGE_LABELS[scan.stage] || 'LOADING...'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {STAGES.map((s, i) => {
              const currentIdx = STAGES.indexOf(scan.stage);
              const done   = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={s} style={{
                  width: active ? 12 : 8, height: active ? 12 : 8,
                  borderRadius: '50%',
                  background: done ? '#00ff88' : active ? '#ffaa00' : '#2a2a3e',
                  transition: 'all 0.3s',
                  boxShadow:  active ? '0 0 10px #ffaa00' : done ? '0 0 6px #00ff88' : 'none',
                }} />
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#7788aa' }}>
            {scan.ticker && `${scan.ticker} · `}This may take 10–20 seconds
          </div>
        </div>
      )}

      {/* ── Scanner view — hidden when showing results ── */}
      {!showResults && (
        <>
      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <div ref={dropdownRef} style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 12, zIndex: 1 }}>$</span>
            <input
              value={inputVal}
              onChange={e => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="SEARCH TICKER..."
              className="input"
              style={{ padding: '10px 12px 10px 26px', fontSize: 13, fontWeight: 600 }}
              autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
            />
            {showDropdown && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: '#0a0a14', border: '1px solid #ffaa0044',
                borderTop: 'none', maxHeight: 320, overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              }}>
                {suggestions.map((s, i) => (
                  <div key={s.ticker}
                    onMouseDown={e => { e.preventDefault(); selectTicker(s.ticker); }}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', cursor: 'pointer',
                      background: i === activeIdx ? '#ffaa0015' : 'transparent',
                      borderBottom: '1px solid #12121e', transition: 'background 0.08s',
                    }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17,
                      color: '#ffaa00', minWidth: 64 }}>{s.ticker}</span>
                    <span style={{ fontSize: 11, color: '#b0c0dd', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 9, color: '#7788aa', flexShrink: 0,
                      background: '#1a1a2e', padding: '1px 6px', borderRadius: 2 }}>{s.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn" disabled={scan.loading}
            onClick={() => handleScan(inputVal)}
            style={{ whiteSpace: 'nowrap' }}>
            {scan.loading ? 'SCANNING...' : 'RUN SCAN'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {scan.ticker && !scan.loading && (
              <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044' }}
                onClick={() => {
                  if (!canOptions()) { setShowUpgrade(true); return; }
                  onOpenOptions(scan.ticker);
                }}>⚡ OPTIONS</button>
            )}
            {scan.analysis && !scan.loading && (
              <button className="btn-sm" style={{ color: '#b0c0dd', borderColor: '#3a3a5e' }}
                onClick={handleNewScan}>
                ← NEW SCAN
              </button>
            )}
            {scan.error && <div style={{ fontSize: 11, color: '#ff4444' }}>{scan.error}</div>}
          </div>
          <UsageBadge used={usage.scans} limit={limits.scans} label="SCANS" plan={plan} />
        </div>
      </div>

      {/* ── Timeframe selector ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#b0c0dd', fontWeight: 700, marginBottom: 8, letterSpacing: '0.1em' }}>TIMEFRAME:</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {TF_KEYS.map(key => {
            const tf     = TIMEFRAMES[key];
            const active = scan.timeframe === key;
            return (
              <button key={key} className="btn-sm"
                disabled={scan.loading}
                onClick={() => scan.setTimeframe(key)}
                style={{
                  color:       active ? '#ffaa00' : '#b0c0dd',
                  borderColor: active ? '#ffaa00' : '#3a3a5e',
                  background:  active ? '#ffaa0011' : '#1a1a2e',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '8px 12px', lineHeight: 1.3,
                }}>
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500 }}>{tf.label}</span>
                <span style={{ fontSize: 10, color: active ? '#ffaa0088' : '#7788aa' }}>{tf.sublabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Movers card ── */}
      <div className="card" style={{ marginBottom: 16 }}>

        {/* Market type toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10,
          borderBottom: '1px solid #1e1e30', paddingBottom: 8 }}>
          {MARKET_TYPES.map(m => (
            <button key={m.key}
              onClick={() => { setMarketType(m.key); setMoversTab('gainers'); setMoversOpen(true); }}
              style={{
                background:  marketType === m.key ? '#ffaa0011' : 'none',
                border:      marketType === m.key ? '1px solid #ffaa0033' : '1px solid transparent',
                cursor:      'pointer', padding: '4px 12px',
                fontSize:    11, letterSpacing: '0.1em',
                fontFamily:  'inherit', borderRadius: 2,
                color:       marketType === m.key ? '#ffaa00' : '#b0c0dd',
                fontWeight:  marketType === m.key ? 700 : 500,
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Sub-tabs */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: moversOpen ? '1px solid #1e1e30' : 'none',
          marginBottom: moversOpen ? 12 : 0,
        }}>
          {TABS.map(t => (
            <button key={t.key}
              onClick={() => { setMoversTab(t.key); setMoversOpen(true); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 14px', fontSize: 12, letterSpacing: '0.1em',
                textTransform: 'uppercase', fontFamily: 'inherit', fontWeight: 700,
                color:        moversTab === t.key ? t.color : '#b0c0dd',
                borderBottom: moversTab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
                marginBottom: -1,
              }}>
              {t.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 4 }}>
            {scan.ticker && !moversOpen && (
              <span style={{ fontSize: 11, color: '#b0c0dd', fontWeight: 600 }}>
                {scan.ticker} · {TIMEFRAMES[scan.timeframe]?.label}
              </span>
            )}
            <button onClick={() => setMoversOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: '#b0c0dd', fontSize: 13, padding: '4px 8px', fontFamily: 'inherit' }}>
              {moversOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* List */}
        {moversOpen && (
          isLoading ? (
            <div className="pulse" style={{ fontSize: 12, color: '#b0c0dd', textAlign: 'center', padding: '20px 0' }}>
              LOADING {marketType === 'crypto' ? 'CRYPTO' : 'MARKET'} MOVERS...
            </div>
          ) : list.length === 0 ? (
            <div style={{ fontSize: 12, color: '#7788aa', textAlign: 'center', padding: '20px 0' }}>
              {marketType === 'crypto' ? 'Crypto data unavailable' : 'Market data unavailable — market may be closed'}
            </div>
          ) : moversTab === 'volume' ? (

            // ── Volume layout ──
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {list.map((m, i) => {
                const isGainer  = m.changePct >= 0;
                const pctColor  = isGainer ? '#00ff88' : '#ff4444';
                const isActive  = scan.ticker === m.ticker;
                const isUnusual = m.volVsAvg && m.volVsAvg >= 2;
                const isCrypto  = m.type === 'crypto';
                return (
                  <div key={m.ticker}
                    onClick={() => handleScan(m.ticker, 'swing')}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '9px 10px', cursor: 'pointer', borderRadius: 2,
                      background:   isActive ? '#4488ff08' : 'transparent',
                      borderLeft:   `2px solid ${isActive ? '#4488ff' : 'transparent'}`,
                      borderBottom: i < list.length - 1 ? '1px solid #1a1a26' : 'none',
                      transition:   'background 0.1s', gap: 8,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#ffffff08'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ fontSize: 11, color: '#7788aa', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16,
                      color: isCrypto ? '#aa88ff' : '#ffaa00', width: 52, flexShrink: 0 }}>{m.ticker}</div>
                    <div style={{ fontSize: 12, color: '#e8e8f0', width: 62, flexShrink: 0, fontWeight: 600 }}>
                      {isCrypto ? fmtPrice(m.price) : `$${m.price?.toFixed(2)}`}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#4488ff',
                        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {fmtVol(m.volume)}
                        {isUnusual && (
                          <span style={{ fontSize: 9, color: '#ffaa00',
                            background: '#ffaa0011', border: '1px solid #ffaa0033',
                            padding: '1px 5px', borderRadius: 2, whiteSpace: 'nowrap' }}>
                            {m.volVsAvg}x
                          </span>
                        )}
                      </div>
                      {m.avgVolume > 0 && (
                        <div style={{ fontSize: 10, color: '#7788aa' }}>avg {fmtVol(m.avgVolume)}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: pctColor,
                      flexShrink: 0, textAlign: 'right', minWidth: 60 }}>
                      {isGainer ? '▲' : '▼'} {Math.abs(m.changePct).toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 10, color: isActive ? '#4488ff' : '#7788aa', flexShrink: 0 }}>
                      {isActive ? '●' : '→'}
                    </div>
                  </div>
                );
              })}
            </div>

          ) : (

            // ── Gainers / Losers layout ──
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {list.map((m, i) => {
                const isGainer = m.changePct >= 0;
                const color    = isGainer ? '#00ff88' : '#ff4444';
                const isActive = scan.ticker === m.ticker;
                const isCrypto = m.type === 'crypto';
                return (
                  <div key={m.ticker}
                    onClick={() => handleScan(m.ticker, 'longterm')}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '9px 10px', cursor: 'pointer', borderRadius: 2,
                      background:   isActive ? '#ffaa0008' : 'transparent',
                      borderLeft:   `2px solid ${isActive ? '#ffaa00' : 'transparent'}`,
                      borderBottom: i < list.length - 1 ? '1px solid #1a1a26' : 'none',
                      transition:   'background 0.1s', gap: 8,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#ffffff08'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ fontSize: 11, color: '#7788aa', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16,
                      color: isCrypto ? '#aa88ff' : '#ffaa00', width: 52, flexShrink: 0 }}>{m.ticker}</div>
                    <div style={{ fontSize: 12, color: '#e8e8f0', width: 70, flexShrink: 0, fontWeight: 600 }}>
                      {isCrypto ? fmtPrice(m.price) : `$${m.price?.toFixed(2)}`}
                    </div>
                    {isCrypto && (
                      <div style={{ fontSize: 11, color: '#b0c0dd', flex: 1, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{m.name}</div>
                    )}
                    {!isCrypto && <div style={{ flex: 1 }} />}
                    {!isCrypto && (
                      <div style={{ fontSize: 11, color: color + '99', flexShrink: 0,
                        textAlign: 'right', minWidth: 52, fontWeight: 600 }}>
                        {isGainer ? '+' : ''}${m.change?.toFixed(2)}
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700, color,
                      flexShrink: 0, textAlign: 'right', minWidth: 66 }}>
                      {isGainer ? '▲' : '▼'} {Math.abs(m.changePct).toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 10, color: isActive ? '#ffaa00' : '#7788aa', flexShrink: 0 }}>
                      {isActive ? '●' : '→'}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* ── View Results button ── */}
      {scan.analysis && !scan.loading && (
        <div className="fade-in" style={{ marginTop: 8 }}>
          <button
            className="btn"
            style={{ width: '100%', fontSize: 14, padding: '13px' }}
            onClick={() => { setShowResults(true); setMoversOpen(false); }}
          >
            ◉ VIEW SCAN RESULTS — {scan.ticker}
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}