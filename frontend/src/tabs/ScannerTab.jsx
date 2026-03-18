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

function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

export default function ScannerTab({ macro, onOpenOptions, onAddToWatchlist }) {
  const [inputVal,     setInputVal]     = useState('');
  const [suggestions,  setSuggestions]  = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx,    setActiveIdx]    = useState(-1);
  const [showUpgrade,  setShowUpgrade]  = useState(false);
  const [isWide,       setIsWide]       = useState(window.innerWidth > 768);
  const [moversTab,    setMoversTab]    = useState('gainers');
  const [moversOpen,   setMoversOpen]   = useState(true);
  const [movers,       setMovers]       = useState({ gainers: [], losers: [], volume: [] });
  const [moversLoad,   setMoversLoad]   = useState(true);

  const dropdownRef = useRef(null);
  const skipSearch  = useRef(false);
  const searchCache = useRef({});

  const scan = useScan(macro);
  const { usage, limits, canScan, canOptions, trackScan } = useUsage();

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
    if (scan.loading) setMoversOpen(false);
  }, [scan.loading]);

  useEffect(() => {
    if (!scan.analysis && !scan.loading) setMoversOpen(true);
  }, [scan.analysis, scan.loading]);

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

  const activeTab = TABS.find(t => t.key === moversTab) || TABS[0];
  const list = movers[moversTab] || [];

  return (
    <div style={{ position: 'relative' }}>
      {showUpgrade && <UpgradeModal type="scan" onClose={() => setShowUpgrade(false)} />}

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
                  width:      active ? 12 : 8, height: active ? 12 : 8,
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
                      color: '#ffaa00', minWidth: 64, letterSpacing: '0.05em' }}>{s.ticker}</span>
                    <span style={{ fontSize: 11, color: '#aabbcc', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 9, color: '#2a2a3e', flexShrink: 0,
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
              <button className="btn-sm" style={{ color: '#99aacc', borderColor: '#2a2a3e' }}
                onClick={() => { scan.reset(); setInputVal(''); }}>
                ← NEW SCAN
              </button>
            )}
            {scan.error && <div style={{ fontSize: 11, color: '#ff4444' }}>{scan.error}</div>}
          </div>
          <UsageBadge used={usage.scans} limit={limits.scans} label="SCANS" />
        </div>
      </div>

      {/* ── Timeframe selector ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#8899bb', marginBottom: 8 }}>TIMEFRAME:</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {TF_KEYS.map(key => {
            const tf     = TIMEFRAMES[key];
            const active = scan.timeframe === key;
            return (
              <button key={key} className="btn-sm"
                disabled={scan.loading}
                onClick={() => scan.setTimeframe(key)}
                style={{
                  color:       active ? '#ffaa00' : '#99aacc',
                  borderColor: active ? '#ffaa00' : '#2a2a3e',
                  background:  active ? '#ffaa0011' : '#1a1a2e',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '8px 12px', lineHeight: 1.3,
                }}>
                <span style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{tf.label}</span>
                <span style={{ fontSize: 9, color: active ? '#ffaa0088' : '#7788aa' }}>{tf.sublabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Movers: Gainers / Losers / Volume — collapsible ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        {/* Tab header */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: moversOpen ? '1px solid #1e1e2e' : 'none',
          marginBottom: moversOpen ? 16 : 0,
        }}>
          {TABS.map(t => (
            <button key={t.key}
              onClick={() => { setMoversTab(t.key); setMoversOpen(true); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 14px', fontSize: 11, letterSpacing: '0.1em',
                textTransform: 'uppercase', fontFamily: 'inherit',
                color:        moversTab === t.key ? t.color : '#8899bb',
                borderBottom: moversTab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
                marginBottom: -1,
              }}>
              {t.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, paddingRight: 4 }}>
            {scan.ticker && !moversOpen && (
              <span style={{ fontSize: 10, color: '#8899bb' }}>
                {scan.ticker} · {TIMEFRAMES[scan.timeframe]?.label}
              </span>
            )}
            <button onClick={() => setMoversOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: '#8899bb', fontSize: 12, padding: '4px 8px', fontFamily: 'inherit' }}>
              {moversOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* List */}
        {moversOpen && (
          moversLoad ? (
            <div className="pulse" style={{ fontSize: 11, color: '#8899bb', textAlign: 'center', padding: '20px 0' }}>
              LOADING MARKET MOVERS...
            </div>
          ) : list.length === 0 ? (
            <div style={{ fontSize: 11, color: '#7788aa', textAlign: 'center', padding: '20px 0' }}>
              Market data unavailable — market may be closed
            </div>
          ) : moversTab === 'volume' ? (
            // ── Volume tab layout ──
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {list.map((m, i) => {
                const isGainer = m.changePct >= 0;
                const pctColor = isGainer ? '#00ff88' : '#ff4444';
                const isActive = scan.ticker === m.ticker;
                const isUnusual = m.volVsAvg && m.volVsAvg >= 2;
                return (
                  <div key={m.ticker}
                    onClick={() => handleScan(m.ticker, 'swing')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', cursor: 'pointer', borderRadius: 2,
                      background:   isActive ? '#4488ff08' : 'transparent',
                      borderLeft:   `2px solid ${isActive ? '#4488ff' : 'transparent'}`,
                      borderBottom: i < list.length - 1 ? '1px solid #1a1a26' : 'none',
                      transition:   'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#ffffff08'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ fontSize: 10, color: '#7788aa', minWidth: 18, textAlign: 'right' }}>{i + 1}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#ffaa00', minWidth: 60 }}>{m.ticker}</div>
                    <div style={{ fontSize: 13, color: '#c8c8d0', minWidth: 66 }}>${m.price?.toFixed(2)}</div>
                    {/* Volume */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#4488ff' }}>
                        {fmtVol(m.volume)}
                        {isUnusual && (
                          <span style={{ fontSize: 9, color: '#ffaa00', marginLeft: 6,
                            background: '#ffaa0011', border: '1px solid #ffaa0033',
                            padding: '1px 5px', borderRadius: 2 }}>
                            {m.volVsAvg}x AVG
                          </span>
                        )}
                      </div>
                      {m.avgVolume > 0 && (
                        <div style={{ fontSize: 9, color: '#7788aa' }}>avg {fmtVol(m.avgVolume)}</div>
                      )}
                    </div>
                    {/* Change % */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: pctColor, minWidth: 64, textAlign: 'right' }}>
                      {isGainer ? '▲' : '▼'} {Math.abs(m.changePct).toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 10, color: isActive ? '#4488ff' : '#7788aa' }}>
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
                return (
                  <div key={m.ticker}
                    onClick={() => handleScan(m.ticker, 'longterm')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '9px 12px', cursor: 'pointer', borderRadius: 2,
                      background:   isActive ? '#ffaa0008' : 'transparent',
                      borderLeft:   `2px solid ${isActive ? '#ffaa00' : 'transparent'}`,
                      borderBottom: i < list.length - 1 ? '1px solid #1a1a26' : 'none',
                      transition:   'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#ffffff08'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ fontSize: 10, color: '#7788aa', minWidth: 18, textAlign: 'right' }}>{i + 1}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#ffaa00', minWidth: 60 }}>{m.ticker}</div>
                    <div style={{ fontSize: 13, color: '#c8c8d0', minWidth: 70 }}>${m.price?.toFixed(2)}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color, marginLeft: 'auto', minWidth: 70, textAlign: 'right' }}>
                      {isGainer ? '▲' : '▼'} {Math.abs(m.changePct).toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 11, color: color + '88', minWidth: 60, textAlign: 'right' }}>
                      {isGainer ? '+' : ''}${m.change?.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: isActive ? '#ffaa00' : '#7788aa' }}>
                      {isActive ? '●' : '→'}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* ── Clean Price Bar ── */}
      {scan.ohlcv && (
        <div className="fade-in" style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          background: '#0f0f18', border: '1px solid #1e1e2e',
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, lineHeight: 1, color: '#fff' }}>
              {scan.ticker}
            </div>
            <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.1em', marginTop: 2 }}>
              {TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#fff' }}>${livePrice?.toFixed(2)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: pct !== null && pct >= 0 ? '#00ff88' : '#ff4444' }}>
              {pct !== null ? `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%` : '—'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <MiniChart data={scan.ohlcv} />
            {scan.analysis && (
              <div style={{
                textAlign: 'center',
                background: SC[scan.analysis.signal] + '11',
                border: `1px solid ${SC[scan.analysis.signal]}44`,
                padding: '8px 16px', borderRadius: 2, minWidth: 80,
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: SC[scan.analysis.signal], lineHeight: 1 }}>
                  {scan.analysis.signal}
                </div>
                <div style={{ fontSize: 10, color: '#99aacc', marginTop: 2 }}>{scan.analysis.confidence}%</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Signal Overview Card ── */}
      {scan.analysis && (
        <div className="card fade-in" style={{ marginBottom: 16, borderColor: SC[scan.analysis.signal] + '33' }}>
          <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 12 }}>
            SIGNAL OVERVIEW
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 12 }}>
            {[
              ['TARGET',   `$${scan.analysis.priceTarget?.toFixed(2)}`,  '#00ff88'],
              ['STOP',     `$${scan.analysis.stopLoss?.toFixed(2)}`,      '#ff4444'],
              ['RISK',     scan.analysis.riskLevel,                        scan.analysis.riskLevel === 'LOW' ? '#00ff88' : scan.analysis.riskLevel === 'HIGH' ? '#ff4444' : '#ffaa00'],
              ['MACRO',    scan.analysis.macroImpact,                      MC[scan.analysis.macroImpact]],
              ['GLOBAL',   scan.analysis.globalMarketTrend,                GC[scan.analysis.globalMarketTrend]],
              ['GEO RISK', scan.analysis.geopoliticalRisk,                 scan.analysis.geopoliticalRisk === 'LOW' ? '#00ff88' : scan.analysis.geopoliticalRisk === 'HIGH' ? '#ff4444' : '#ffaa00'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: '#070710', padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#8899bb', marginBottom: 4, letterSpacing: '0.1em' }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          {scan.analysis.thesis && (
            <div style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.7,
              borderLeft: `2px solid ${SC[scan.analysis.signal]}44`, paddingLeft: 12 }}>
              {scan.analysis.thesis}
            </div>
          )}
        </div>
      )}

      {/* ── Results: Bull/Bear/News left, Details right ── */}
      {scan.analysis && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isWide ? 'minmax(0, 1.6fr) minmax(0, 1fr)' : '1fr',
          gap: 16, alignItems: 'start',
        }}>
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="card">
                <div style={{ fontSize: 10, color: '#00ff8866', marginBottom: 10 }}>BULL FACTORS</div>
                {scan.analysis.bullFactors?.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #0f1a14', display: 'flex', gap: 6 }}>
                    <span style={{ color: '#00ff88', flexShrink: 0 }}>▲</span>{f}
                  </div>
                ))}
              </div>
              <div className="card">
                <div style={{ fontSize: 10, color: '#ff444466', marginBottom: 10 }}>BEAR FACTORS</div>
                {scan.analysis.bearFactors?.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #1a0f0f', display: 'flex', gap: 6 }}>
                    <span style={{ color: '#ff4444', flexShrink: 0 }}>▼</span>{f}
                  </div>
                ))}
              </div>
            </div>

            {scan.news?.length > 0 && (
              <div className="card">
                <div style={{ fontSize: 10, color: '#8899bb', marginBottom: 12 }}>RECENT NEWS</div>
                {scan.news.slice(0, 5).map((n, i) => (
                  <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #1a1a26', fontSize: 11 }}>
                    <a href={n.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#aab', lineHeight: 1.4, marginBottom: 2, display: 'block', textDecoration: 'none' }}
                      onMouseEnter={e => { if (n.url) e.currentTarget.style.color = '#ffaa00'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#aab'; }}>
                      {n.title}
                    </a>
                    <div style={{ color: '#8899bb', fontSize: 10 }}>
                      {n.publisher} · {new Date(n.time * 1000).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {scan.fundamentals && (
              <div className="card fade-in">
                <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.2em', marginBottom: 12 }}>FUNDAMENTALS</div>
                {[
                  ['P/E',          scan.fundamentals.pe?.toFixed(1)],
                  ['EPS',          scan.fundamentals.eps ? `$${scan.fundamentals.eps.toFixed(2)}` : null],
                  ['Beta',         scan.fundamentals.beta?.toFixed(2)],
                  ['52W High',     scan.fundamentals.fiftyTwoWeekHigh ? `$${scan.fundamentals.fiftyTwoWeekHigh.toFixed(2)}` : null],
                  ['52W Low',      scan.fundamentals.fiftyTwoWeekLow  ? `$${scan.fundamentals.fiftyTwoWeekLow.toFixed(2)}`  : null],
                  ['ROE',          scan.fundamentals.roe ? `${(scan.fundamentals.roe * 100).toFixed(1)}%` : null],
                  ['Gross Margin', scan.fundamentals.grossMargins ? `${(scan.fundamentals.grossMargins * 100).toFixed(1)}%` : null],
                  ['Rev Growth',   scan.fundamentals.revenueGrowth ? `${(scan.fundamentals.revenueGrowth * 100).toFixed(1)}%` : null],
                  ['D/E',          scan.fundamentals.debtToEquity?.toFixed(2)],
                  ['Target',       scan.fundamentals.targetMeanPrice ? `$${scan.fundamentals.targetMeanPrice.toFixed(2)}` : null],
                ].filter(([, v]) => v != null).map(([k, v]) => (
                  <div className="kv" key={k}>
                    <span className="kv-key">{k}</span>
                    <span style={{ color: '#c8c8d0', fontWeight: 500, fontSize: 11 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {scan.ta && <TechnicalPanel ta={scan.ta} />}
            <BondPanel bonds={macro?.bonds} />
            {scan.options && (
              <div className="card fade-in">
                <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.2em', marginBottom: 12 }}>OPTIONS FLOW <span style={{ color: '#00ff8844', fontSize: 9 }}>⚡ LIVE</span></div>
                <div className="kv"><span className="kv-key">Put/Call</span><span style={{ color: scan.options.putCallRatio > 1 ? '#ff4444' : '#00ff88', fontWeight: 500, fontSize: 11 }}>{scan.options.putCallRatio?.toFixed(2)}</span></div>
                <div className="kv"><span className="kv-key">Call IV</span><span style={{ color: '#ffaa00', fontWeight: 500, fontSize: 11 }}>{scan.options.avgCallIV}%</span></div>
                <div className="kv"><span className="kv-key">Put IV</span><span style={{ color: '#ffaa00', fontWeight: 500, fontSize: 11 }}>{scan.options.avgPutIV}%</span></div>
                <div style={{ marginTop: 10 }}>
                  <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044', width: '100%' }}
                    onClick={() => onOpenOptions(scan.ticker)}>⚡ OPTIONS PLAYS →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}