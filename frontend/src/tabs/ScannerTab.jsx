import { useState, useEffect, useRef } from 'react';
import { SC, MC, GC, RC } from '../utils/constants';
import { useScan } from '../hooks/useScan';
import { TIMEFRAMES } from '../utils/indicators';
import { useUsage } from '../hooks/useUsage';
import MiniChart      from '../components/MiniChart';
import SignalCard     from '../components/SignalCard';
import BondPanel      from '../components/BondPanel';
import TechnicalPanel from '../components/TechnicalPanel';
import UsageBadge     from '../components/UsageBadge';
import UpgradeModal   from '../components/UpgradeModal';

const TF_KEYS = ['short', 'swing', 'position', 'longterm'];

const STAGE_LABELS = {
  price:        'FETCHING PRICE DATA...',
  fundamentals: 'LOADING FUNDAMENTALS...',
  options:      'SCANNING OPTIONS FLOW...',
  news:         'GATHERING NEWS...',
  claude:       'RUNNING AI ANALYSIS...',
};
const STAGES = ['price', 'fundamentals', 'options', 'news', 'claude'];

export default function ScannerTab({ macro, onOpenOptions, onAddToWatchlist }) {
  const [inputVal,     setInputVal]     = useState('');
  const [suggestions,  setSuggestions]  = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx,    setActiveIdx]    = useState(-1);
  const [showUpgrade,  setShowUpgrade]  = useState(false);
  const [isWide,       setIsWide]       = useState(window.innerWidth > 768);
  const dropdownRef = useRef(null);
  const scan = useScan(macro);
  const { usage, limits, canScan, trackScan } = useUsage();

  const livePrice = scan.quote?.last || scan.ohlcv?.current;
  const pct = scan.ohlcv?.current && scan.ohlcv?.prev && scan.ohlcv.prev !== 0
    ? ((scan.ohlcv.current - scan.ohlcv.prev) / scan.ohlcv.prev * 100)
    : null;

  useEffect(() => {
    const handler = () => setIsWide(window.innerWidth > 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (inputVal.length < 1) { setSuggestions([]); setShowDropdown(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(inputVal)}`);
        const data = await res.json();
        setSuggestions(data);
        setShowDropdown(data.length > 0);
        setActiveIdx(-1);
      } catch { setSuggestions([]); }
    }, 250);
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

  const handleScan = ticker => {
    if (!canScan()) { setShowUpgrade(true); return; }
    trackScan();
    setShowDropdown(false);
    setSuggestions([]);
    scan.runScan(ticker);
  };

  const selectTicker = ticker => {
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
      else { setShowDropdown(false); handleScan(inputVal); }
    }
    if (e.key === 'Escape') setShowDropdown(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      {showUpgrade && <UpgradeModal type="scan" onClose={() => setShowUpgrade(false)} />}

      {/* ── Full screen loading overlay ── */}
      {scan.loading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(7, 7, 14, 0.88)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            border: '3px solid #ffaa0022', borderTop: '3px solid #ffaa00',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 24, color: '#ffaa00',
              letterSpacing: '0.15em', marginBottom: 8,
            }}>
              ANALYZING
            </div>
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
                  width:        active ? 12 : 8,
                  height:       active ? 12 : 8,
                  borderRadius: '50%',
                  background:   done ? '#00ff88' : active ? '#ffaa00' : '#2a2a3e',
                  transition:   'all 0.3s',
                  boxShadow:    active ? '0 0 10px #ffaa00' : done ? '0 0 6px #00ff88' : 'none',
                }} />
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#334' }}>
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
                background: '#0f0f18', border: '1px solid #ffaa0044',
                borderTop: 'none', maxHeight: 280, overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              }}>
                {suggestions.map((s, i) => (
                  <div key={s.ticker} onClick={() => selectTicker(s.ticker)}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', cursor: 'pointer',
                      background: i === activeIdx ? '#ffaa0011' : 'transparent',
                      borderBottom: '1px solid #1a1a26', transition: 'background 0.1s',
                    }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: '#ffaa00', minWidth: 60 }}>{s.ticker}</span>
                    <span style={{ fontSize: 11, color: '#8899aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 9, color: '#334', flexShrink: 0 }}>{s.type}</span>
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
                onClick={() => onOpenOptions(scan.ticker)}>⚡ OPTIONS</button>
            )}
            {scan.error && <div style={{ fontSize: 11, color: '#ff4444' }}>{scan.error}</div>}
          </div>
          <UsageBadge used={usage.scans} limit={limits.scans} label="SCANS" />
        </div>
      </div>

      {/* ── Timeframe selector ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#444', marginBottom: 8 }}>TIMEFRAME:</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {TF_KEYS.map(key => {
            const tf     = TIMEFRAMES[key];
            const active = scan.timeframe === key;
            return (
              <button key={key} className="btn-sm"
                disabled={scan.loading}
                onClick={() => scan.setTimeframe(key)}
                style={{
                  color:       active ? '#ffaa00' : '#556',
                  borderColor: active ? '#ffaa00' : '#2a2a3e',
                  background:  active ? '#ffaa0011' : '#1a1a2e',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '8px 12px', lineHeight: 1.3,
                }}>
                <span style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{tf.label}</span>
                <span style={{ fontSize: 9, color: active ? '#ffaa0088' : '#334' }}>{tf.sublabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Clean Price Bar — ticker, price, change, chart only ── */}
      {scan.ohlcv && (
        <div className="fade-in" style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: '#0f0f18', border: '1px solid #1e1e2e',
          padding: '12px 16px', marginBottom: 16,
        }}>
          {/* Ticker + company */}
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, lineHeight: 1 }}>{scan.ticker}</div>
            <div style={{ fontSize: 10, color: '#445', letterSpacing: '0.1em' }}>
              {TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()}
            </div>
          </div>

          {/* Price + change */}
          <div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>${livePrice?.toFixed(2)}</div>
            <div style={{ fontSize: 13, fontWeight: 600,
              color: pct !== null && pct >= 0 ? '#00ff88' : '#ff4444' }}>
              {pct !== null ? `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%` : '—'}
            </div>
          </div>

          {/* Chart */}
          <div style={{ marginLeft: 'auto' }}>
            <MiniChart data={scan.ohlcv} />
          </div>

          {/* Signal badge */}
          {scan.analysis && (
            <div style={{
              textAlign: 'center', background: SC[scan.analysis.signal] + '11',
              border: `1px solid ${SC[scan.analysis.signal]}44`,
              padding: '8px 16px', borderRadius: 2,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: SC[scan.analysis.signal], lineHeight: 1 }}>
                {scan.analysis.signal}
              </div>
              <div style={{ fontSize: 10, color: '#556' }}>{scan.analysis.confidence}%</div>
            </div>
          )}
        </div>
      )}

      {/* ── Quick signals card — shown after scan ── */}
      {scan.analysis && (
        <div className="card fade-in" style={{ marginBottom: 16, borderColor: SC[scan.analysis.signal] + '33' }}>
          <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 12 }}>
            SIGNAL OVERVIEW
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
            {[
              ['TARGET',   `$${scan.analysis.priceTarget?.toFixed(2)}`,  '#00ff88'],
              ['STOP',     `$${scan.analysis.stopLoss?.toFixed(2)}`,      '#ff4444'],
              ['RISK',     scan.analysis.riskLevel,                        scan.analysis.riskLevel === 'LOW' ? '#00ff88' : scan.analysis.riskLevel === 'HIGH' ? '#ff4444' : '#ffaa00'],
              ['MACRO',    scan.analysis.macroImpact,                      MC[scan.analysis.macroImpact]],
              ['GLOBAL',   scan.analysis.globalMarketTrend,                GC[scan.analysis.globalMarketTrend]],
              ['GEO RISK', scan.analysis.geopoliticalRisk,                 scan.analysis.geopoliticalRisk === 'LOW' ? '#00ff88' : scan.analysis.geopoliticalRisk === 'HIGH' ? '#ff4444' : '#ffaa00'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: '#070710', padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#445', marginBottom: 4, letterSpacing: '0.1em' }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          {scan.analysis.thesis && (
            <div style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.7, marginTop: 12,
              borderLeft: `2px solid ${SC[scan.analysis.signal]}44`, paddingLeft: 12 }}>
              {scan.analysis.thesis}
            </div>
          )}
        </div>
      )}

      {/* ── Results: SignalCard left, Details right on desktop ── */}
      {scan.analysis && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isWide ? 'minmax(0, 1.6fr) minmax(0, 1fr)' : '1fr',
          gap: 16,
          alignItems: 'start',
        }}>
          {/* Left — Full Signal Card (bull/bear/news) */}
          <div className="fade-in">
            <SignalCard analysis={scan.analysis} news={scan.news} />
          </div>

          {/* Right — Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {scan.fundamentals && (
              <div className="card fade-in">
                <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>FUNDAMENTALS</div>
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
                <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>OPTIONS FLOW <span style={{ color: '#00ff8844', fontSize: 9 }}>⚡ LIVE</span></div>
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