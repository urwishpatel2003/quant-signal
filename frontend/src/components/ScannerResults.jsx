// src/components/ScannerResults.jsx
import { useState } from 'react';
import { SC, MC, GC } from '../utils/constants';
import { TIMEFRAMES } from '../utils/indicators';
import MiniChart from './MiniChart';
import FinancialsPanel from './FinancialsPanel';

function AccordionCard({ id, activeId, setActiveId, label, preview, children }) {
  const isOpen = activeId === id;
  return (
    <div style={{
      background: '#0f0f1a',
      border: `1px solid ${isOpen ? '#ffaa0044' : '#2a2a40'}`,
      borderRadius: 6, overflow: 'hidden', transition: 'border-color 0.15s',
    }}>
      <div
        onClick={() => setActiveId(isOpen ? null : id)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer',
          background: isOpen ? '#ffaa0008' : 'transparent', transition: 'background 0.15s',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: isOpen ? '#ffaa00' : '#b0c0dd', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 4 }}>
            {label}
          </div>
          {!isOpen && (
            <div style={{ fontSize: 11, color: '#7788aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </div>
          )}
        </div>
        <div style={{ fontSize: 14, color: isOpen ? '#ffaa00' : '#7788aa', marginLeft: 12, flexShrink: 0 }}>
          {isOpen ? '▲' : '▼'}
        </div>
      </div>
      {isOpen && (
        <div style={{ padding: '0 16px 20px', borderTop: '1px solid #1e1e30' }}>
          {children}
        </div>
      )}
      {/* ── Sim Modal ── */}
      {showSimModal && (
        <SimModal
          scan={scan}
          livePrice={livePrice}
          currency={currency}
          market={market}
          onConfirm={async (pos) => {
            await onAddToSim(pos);
            setSimAdded(true);
            setShowSimModal(false);
          }}
          onClose={() => setShowSimModal(false)}
        />
      )}
    </div>
  );
}

// ── Sim Modal ──────────────────────────────────────────────────────────────────
export default function ScannerResults({ scan, macro, onBack, onOpenOptions, currency = '$', market = 'US', companyName = '', onAddToWatchlist, onAddToSim }) {
  const [activeId, setActiveId] = useState('ticker');

  const livePrice = scan.quote?.last || scan.ohlcv?.current;
  const pct = scan.ohlcv?.current && scan.ohlcv?.prev && scan.ohlcv.prev !== 0
    ? ((scan.ohlcv.current - scan.ohlcv.prev) / scan.ohlcv.prev * 100)
    : null;
  const sigColor  = SC[scan.analysis.signal];
  const isIndia   = currency === '₹';
  const [watchlistAdded,   setWatchlistAdded]   = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [simAdded,         setSimAdded]         = useState(false);
  const [showSimModal,     setShowSimModal]     = useState(false);

  const handleAddToWatchlist = async () => {
    if (!onAddToWatchlist || watchlistAdded || watchlistLoading) return;
    setWatchlistLoading(true);
    try {
      await onAddToWatchlist(scan.ticker);
      setWatchlistAdded(true);
    } catch { /* non-critical */ }
    setWatchlistLoading(false);
  };

  // Helper to format price with correct currency symbol
  const fmt = (val, decimals = 2) => val != null ? `${currency}${parseFloat(val).toFixed(decimals)}` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: '1px solid #2a2a40',
            color: '#b0c0dd', cursor: 'pointer', borderRadius: 4,
            padding: '8px 14px', fontSize: 12, fontFamily: 'inherit',
            letterSpacing: '0.1em', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffaa0066'; e.currentTarget.style.color = '#ffaa00'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a40'; e.currentTarget.style.color = '#b0c0dd'; }}
        >← BACK TO SCANNER</button>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isIndia && (
            <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044' }}
              onClick={() => onOpenOptions(scan.ticker)}>
              ⚡ OPTIONS
            </button>
          )}
          {onAddToWatchlist && (
            <button
              className="btn-sm"
              onClick={handleAddToWatchlist}
              disabled={watchlistAdded || watchlistLoading}
              style={{
                color:       watchlistAdded ? '#00ff88' : '#b0c0dd',
                borderColor: watchlistAdded ? '#00ff8844' : '#3a3a5e',
                background:  watchlistAdded ? '#00ff8811' : '#1a1a2e',
                opacity:     watchlistLoading ? 0.6 : 1,
              }}>
              {watchlistAdded ? '✓ WATCHLIST' : watchlistLoading ? '...' : '+ WATCHLIST'}
            </button>
          )}
          {onAddToSim && (() => {
            const conf       = scan.analysis?.confidence || 0;
            const highConf   = conf >= 75;
            const tooltip    = !highConf ? `Confidence too low (${conf}%) — need 75%+ to simulate` : '';
            return (
              <div title={tooltip} style={{ position: 'relative' }}>
                <button
                  className="btn-sm"
                  onClick={() => highConf && !simAdded && setShowSimModal(true)}
                  disabled={simAdded || !highConf}
                  style={{
                    color:       simAdded ? '#00ff88' : highConf ? '#aa66ff' : '#445566',
                    borderColor: simAdded ? '#00ff8844' : highConf ? '#aa66ff44' : '#2a2a3e',
                    background:  simAdded ? '#00ff8811' : highConf ? '#aa66ff11' : '#0a0a14',
                    opacity:     !highConf ? 0.5 : 1,
                    cursor:      !highConf ? 'not-allowed' : 'pointer',
                  }}>
                  {simAdded ? '✓ IN SIMULATOR' : highConf ? '📊 SIMULATE' : `📊 ${conf}% CONF`}
                </button>
                {!highConf && !simAdded && (
                  <div style={{
                    fontSize: 9, color: '#556677', marginTop: 3,
                    textAlign: 'center', letterSpacing: '0.05em',
                  }}>
                    75%+ required
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Price summary bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: '#0f0f1a', border: `1px solid ${sigColor}33`,
        padding: '14px 16px', borderRadius: 6,
      }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, lineHeight: 1, color: '#fff' }}>
            {scan.ticker}
          </div>
          {companyName && (
            <div style={{ fontSize: 12, color: '#c8d8f0', fontWeight: 500, marginTop: 2, maxWidth: 220,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {companyName}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#6677aa', letterSpacing: '0.15em', marginTop: 2 }}>
            {TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(livePrice)}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: pct !== null && pct >= 0 ? '#00ff88' : '#ff4444' }}>
            {pct !== null ? `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <MiniChart data={scan.ohlcv} />
        </div>
      </div>

      {/* ── Accordion 1: Price & Decision ── */}
      <AccordionCard
        id="ticker" activeId={activeId} setActiveId={setActiveId}
        label="PRICE & DECISION"
        preview={`${fmt(livePrice)} · ${scan.analysis.signal} ${scan.analysis.confidence}% · Target ${fmt(scan.analysis.priceTarget)}`}
      >
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['TARGET', fmt(scan.analysis.priceTarget), '#00ff88'],
              ['ENTRY',  fmt(livePrice),                 '#ffffff'],
              ['STOP',   fmt(scan.analysis.stopLoss),    '#ff4444'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
                <div style={{ fontSize: 10, color: '#b0c0dd', letterSpacing: '0.15em', marginBottom: 6 }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ background: sigColor + '0d', border: `1px solid ${sigColor}33`, borderRadius: 4, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: sigColor, lineHeight: 1 }}>
              {scan.analysis.signal}
            </div>
            <div style={{ fontSize: 13, color: '#b0c0dd', marginTop: 6 }}>CONFIDENCE</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: sigColor }}>{scan.analysis.confidence}%</div>
            <div style={{ background: '#1a1a2e', borderRadius: 2, height: 5, margin: '10px auto 0', maxWidth: 260, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${scan.analysis.confidence}%`, background: sigColor, borderRadius: 2 }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6 }}>
            {[
              ['RISK',     scan.analysis.riskLevel,         scan.analysis.riskLevel === 'LOW' ? '#00ff88' : scan.analysis.riskLevel === 'HIGH' ? '#ff4444' : '#ffaa00'],
              ['MACRO',    scan.analysis.macroImpact,       MC[scan.analysis.macroImpact]],
              ['GLOBAL',   scan.analysis.globalMarketTrend, GC[scan.analysis.globalMarketTrend]],
              ['GEO RISK', scan.analysis.geopoliticalRisk,  scan.analysis.geopoliticalRisk === 'LOW' ? '#00ff88' : scan.analysis.geopoliticalRisk === 'HIGH' ? '#ff4444' : '#ffaa00'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: '#070710', padding: '8px 10px', textAlign: 'center', borderRadius: 4 }}>
                <div style={{ fontSize: 9, color: '#b0c0dd', marginBottom: 4, letterSpacing: '0.1em' }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Thesis */}
          <div style={{
            background: '#0a0a14', borderRadius: 4, padding: '12px 14px',
            borderLeft: `3px solid ${sigColor}55`,
          }}>
            <div style={{ fontSize: 9, color: sigColor, fontWeight: 700, letterSpacing: '0.15em', marginBottom: 6 }}>
              AI THESIS
            </div>
            <div style={{ fontSize: 12, color: '#d0d8f0', lineHeight: 1.8, fontStyle: 'italic' }}>
              {scan.analysis.thesis || scan.analysis.reasoning || '—'}
            </div>
          </div>
        </div>
      </AccordionCard>

      {/* ── Accordion 2: Quarterly Financials ── */}
      <AccordionCard
        id="financials" activeId={activeId} setActiveId={setActiveId}
        label="QUARTERLY FINANCIALS"
        preview={scan.financials ? [
          scan.financials.yoy?.revenueYoY != null ? `Rev YoY ${scan.financials.yoy.revenueYoY > 0 ? '+' : ''}${scan.financials.yoy.revenueYoY}%` : null,
          scan.financials.yoy?.netIncomeYoY != null ? `NI YoY ${scan.financials.yoy.netIncomeYoY > 0 ? '+' : ''}${scan.financials.yoy.netIncomeYoY}%` : null,
          scan.financials.epsHistory?.length ? `EPS ${scan.financials.epsHistory[0]?.beat ? 'BEAT' : 'MISS'} last qtr` : null,
          scan.financials.nextEarnings ? `Earnings ${scan.financials.nextEarnings}` : null,
        ].filter(Boolean).join(' · ') || 'Revenue, EPS, margins'
        : 'Revenue · Net Income · Diluted EPS · Net Margin'}
      >
        <div style={{ paddingTop: 16 }}>
          <FinancialsPanel ticker={scan.ticker} market={market} />
        </div>
      </AccordionCard>

      {/* ── Accordion 3: Signal Overview ── */}
      <AccordionCard
        id="signal" activeId={activeId} setActiveId={setActiveId}
        label="SIGNAL OVERVIEW"
        preview={`▲ ${scan.analysis.bullFactors?.length} bull factors · ▼ ${scan.analysis.bearFactors?.length} bear factors`}
      >
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Auto-generated technical narrative from TA data */}
          {scan.ta && (() => {
            const ta = scan.ta;
            const parts = [];
            // Trend
            if (ta.trendSignal && ta.trendSignal !== 'UNKNOWN') {
              const trendDesc = ta.trendSignal === 'BULLISH'
                ? `Price is in a ${ta.sma20 && ta.sma50 ? 'bullish structure with SMA20 above SMA50' : 'bullish trend above SMA20'}`
                : `Price is in a ${ta.sma20 && ta.sma50 ? 'bearish structure with SMA20 below SMA50' : 'bearish trend below SMA20'}`;
              parts.push(trendDesc);
            }
            // RSI
            if (ta.rsi14) {
              if (ta.rsi14 > 70)      parts.push(`RSI at ${ta.rsi14} is overbought — mean reversion risk elevated`);
              else if (ta.rsi14 < 30) parts.push(`RSI at ${ta.rsi14} is oversold — potential bounce setup`);
              else                    parts.push(`RSI at ${ta.rsi14} is neutral with room to run`);
            }
            // MACD
            if (ta.macd?.cross) {
              if (ta.macd.cross === 'BULLISH_CROSS') parts.push('MACD has made a bullish crossover signaling momentum shift upward');
              else                                    parts.push('MACD shows a bearish crossover indicating weakening momentum');
            }
            // BB
            if (ta.bb?.position) {
              if (ta.bb.position === 'NEAR_UPPER') parts.push('price is near the upper Bollinger Band suggesting extended conditions');
              else if (ta.bb.position === 'NEAR_LOWER') parts.push('price is near the lower Bollinger Band suggesting potential support');
              else if (ta.bb.squeeze) parts.push('Bollinger Band squeeze detected — breakout likely imminent');
            }
            // StochRSI
            if (ta.stochRSI?.signal === 'OVERBOUGHT') parts.push('StochRSI is extremely overbought above 90');
            else if (ta.stochRSI?.signal === 'OVERSOLD') parts.push('StochRSI is extremely oversold below 10 — high probability bounce zone');
            // Volume
            if (ta.volumeSignal === 'HIGH') parts.push(`volume is running ${ta.volumeRatio}x average confirming the move`);
            // ATR volatility
            if (ta.atr?.volatility === 'HIGH') parts.push(`ATR indicates high volatility — size positions accordingly`);
            // S/R
            if (ta.sr?.nearestResistance && ta.sr.distToResistance < 5)
              parts.push(`key resistance at ${fmt(ta.sr.nearestResistance)} just ${ta.sr.distToResistance}% away`);
            if (ta.sr?.nearestSupport && ta.sr.distToSupport < 5)
              parts.push(`key support at ${fmt(ta.sr.nearestSupport)} just ${ta.sr.distToSupport}% below`);

            if (!parts.length) return null;

            // Build narrative: first part capitalized, rest joined with commas/semicolons
            const narrative = parts[0].charAt(0).toUpperCase() + parts[0].slice(1) +
              (parts.length > 1 ? '; ' + parts.slice(1).join(', ') : '') + '.';

            return (
              <div style={{
                fontSize: 12, color: '#b0c8e8', lineHeight: 1.8,
                background: '#070710', borderRadius: 4,
                padding: '12px 14px',
                borderLeft: '3px solid #4488ff55',
              }}>
                <div style={{ fontSize: 9, color: '#4488ff', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 6 }}>
                  TECHNICAL READING
                </div>
                {narrative}
              </div>
            );
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#070e0a', border: '1px solid #00ff8822', borderRadius: 4, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#00ff88', fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em' }}>▲ BULL FACTORS</div>
              {scan.analysis.bullFactors?.map((f, i) => (
                <div key={i} style={{
                  fontSize: 12, color: '#d0d8f0', padding: '6px 0',
                  borderBottom: i < scan.analysis.bullFactors.length - 1 ? '1px solid #0f1a14' : 'none',
                  display: 'flex', gap: 8, lineHeight: 1.5,
                }}>
                  <span style={{ color: '#00ff88', flexShrink: 0 }}>▲</span>{f}
                </div>
              ))}
            </div>
            <div style={{ background: '#0e0707', border: '1px solid #ff444422', borderRadius: 4, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#ff4444', fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em' }}>▼ BEAR FACTORS</div>
              {scan.analysis.bearFactors?.map((f, i) => (
                <div key={i} style={{
                  fontSize: 12, color: '#d0d8f0', padding: '6px 0',
                  borderBottom: i < scan.analysis.bearFactors.length - 1 ? '1px solid #1a0f0f' : 'none',
                  display: 'flex', gap: 8, lineHeight: 1.5,
                }}>
                  <span style={{ color: '#ff4444', flexShrink: 0 }}>▼</span>{f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </AccordionCard>

      {/* ── Accordion 4: Fundamentals & Technicals ── */}
      <AccordionCard
        id="fundamentals" activeId={activeId} setActiveId={setActiveId}
        label="FUNDAMENTALS & TECHNICALS"
        preview={[
          scan.fundamentals?.pe    ? `P/E ${scan.fundamentals.pe?.toFixed(1)}` : null,
          scan.fundamentals?.eps   ? `EPS ${fmt(scan.fundamentals.eps)}` : null,
          scan.ta?.rsi14           ? `RSI ${scan.ta.rsi14}` : null,
          scan.ta?.trendSignal     ? scan.ta.trendSignal : null,
        ].filter(Boolean).join(' · ') || 'Fundamentals and technical indicators'}
      >
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Fundamentals */}
          {scan.fundamentals && (
            <div>
              <div style={{ fontSize: 10, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 10 }}>
                FUNDAMENTALS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['P/E Ratio',      scan.fundamentals.pe?.toFixed(1)],
                  ['EPS',            scan.fundamentals.eps        ? fmt(scan.fundamentals.eps)                              : null],
                  ['Beta',           scan.fundamentals.beta?.toFixed(2)],
                  ['52W High',       scan.fundamentals.fiftyTwoWeekHigh ? fmt(scan.fundamentals.fiftyTwoWeekHigh)           : null],
                  ['52W Low',        scan.fundamentals.fiftyTwoWeekLow  ? fmt(scan.fundamentals.fiftyTwoWeekLow)            : null],
                  ['ROE',            scan.fundamentals.roe         ? `${(scan.fundamentals.roe * 100).toFixed(1)}%`         : null],
                  ['Gross Margin',   scan.fundamentals.grossMargins ? `${(scan.fundamentals.grossMargins * 100).toFixed(1)}%` : null],
                  ['Rev Growth',     scan.fundamentals.revenueGrowth ? `${(scan.fundamentals.revenueGrowth * 100).toFixed(1)}%` : null],
                  ['D/E Ratio',      scan.fundamentals.debtToEquity?.toFixed(2)],
                  ['Analyst Target', scan.fundamentals.targetMeanPrice ? fmt(scan.fundamentals.targetMeanPrice)             : null],
                ].filter(([, v]) => v != null).map(([k, v]) => (
                  <div key={k} style={{ background: '#070710', padding: '8px 10px', borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 3, letterSpacing: '0.1em' }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical Indicators */}
          {scan.ta && (
            <div>
              <div style={{ fontSize: 10, color: '#4488ff', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 10 }}>
                TECHNICAL INDICATORS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['RSI (14)',    scan.ta.rsi14,                                       scan.ta.rsi14 > 70 ? '#ff4444' : scan.ta.rsi14 < 30 ? '#00ff88' : '#ffaa00'],
                  ['Trend',      scan.ta.trendSignal,                                  scan.ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444'],
                  ['Volume',     scan.ta.volumeRatio ? `${scan.ta.volumeRatio}x` : null, scan.ta.volumeSignal === 'HIGH' ? '#ffaa00' : '#e8e8f0'],
                  ['MACD',       scan.ta.macd?.cross,                                  scan.ta.macd?.cross === 'BULLISH_CROSS' ? '#00ff88' : scan.ta.macd?.cross === 'BEARISH_CROSS' ? '#ff4444' : '#e8e8f0'],
                  ['SMA 20',     scan.ta.sma20  ? fmt(scan.ta.sma20)  : null,          '#e8e8f0'],
                  ['SMA 50',     scan.ta.sma50  ? fmt(scan.ta.sma50)  : null,          '#e8e8f0'],
                  ['SMA 200',    scan.ta.sma200 ? fmt(scan.ta.sma200) : null,          '#e8e8f0'],
                  ['ATR (14)',   scan.ta.atr?.atr,                                     scan.ta.atr?.volatility === 'HIGH' ? '#ffaa00' : '#e8e8f0'],
                  ['BB Position',scan.ta.bb?.position,                                 scan.ta.bb?.position === 'NEAR_UPPER' ? '#ff4444' : scan.ta.bb?.position === 'NEAR_LOWER' ? '#00ff88' : '#e8e8f0'],
                  ['StochRSI K', scan.ta.stochRSI?.k,                                  scan.ta.stochRSI?.k > 90 ? '#ff4444' : scan.ta.stochRSI?.k < 10 ? '#00ff88' : '#ffaa00'],
                  ['Support',    scan.ta.sr?.nearestSupport    ? fmt(scan.ta.sr.nearestSupport)    : null, '#00ff88'],
                  ['Resistance', scan.ta.sr?.nearestResistance ? fmt(scan.ta.sr.nearestResistance) : null, '#ff4444'],
                ].filter(([, v]) => v != null).map(([k, v, c]) => (
                  <div key={k} style={{ background: '#070710', padding: '8px 10px', borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 3, letterSpacing: '0.1em' }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options Flow — US only */}
          {scan.options && !isIndia && (
            <div>
              <div style={{ fontSize: 10, color: '#b0c0dd', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 10 }}>
                OPTIONS FLOW <span style={{ color: '#00ff8866', fontSize: 9 }}>⚡ LIVE</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[
                  ['Put/Call', scan.options.putCallRatio?.toFixed(2), scan.options.putCallRatio > 1 ? '#ff4444' : '#00ff88'],
                  ['Call IV',  `${scan.options.avgCallIV}%`,          '#ffaa00'],
                  ['Put IV',   `${scan.options.avgPutIV}%`,           '#ffaa00'],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ background: '#070710', padding: '8px 10px', borderRadius: 4, textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 3, letterSpacing: '0.1em' }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AccordionCard>

      {/* ── Accordion 4: News ── */}
      <AccordionCard
        id="news" activeId={activeId} setActiveId={setActiveId}
        label={`RECENT NEWS${scan.news?.length ? ` (${scan.news.length})` : ''}`}
        preview={scan.news?.[0]?.title || 'No recent news available'}
      >
        <div style={{ paddingTop: 16 }}>
          {scan.news?.length > 0 ? (
            scan.news.slice(0, 10).map((n, i) => (
              <div key={i} style={{
                padding: '12px 0',
                borderBottom: i < Math.min(scan.news.length, 10) - 1 ? '1px solid #1a1a26' : 'none',
              }}>
                <a href={n.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#c8d8f0', fontSize: 13, lineHeight: 1.5, display: 'block', textDecoration: 'none', marginBottom: 4 }}
                  onMouseEnter={e => { if (n.url) e.currentTarget.style.color = '#ffaa00'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#c8d8f0'; }}
                >
                  {n.title}
                </a>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ color: '#7788aa', fontSize: 11 }}>{n.publisher}</span>
                  <span style={{ color: '#3a3a5e', fontSize: 11 }}>·</span>
                  <span style={{ color: '#7788aa', fontSize: 11 }}>
                    {new Date(n.time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {n.url && (
                    <a href={n.url} target="_blank" rel="noopener noreferrer"
                      style={{ marginLeft: 'auto', fontSize: 10, color: '#ffaa0077', textDecoration: 'none', letterSpacing: '0.1em' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ffaa00'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#ffaa0077'; }}
                    >READ →</a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: '#7788aa', padding: '8px 0' }}>No recent news available</div>
          )}
        </div>
      </AccordionCard>
      {/* ── Sim Modal ── */}
      {showSimModal && (
        <SimModal
          scan={scan}
          livePrice={livePrice}
          currency={currency}
          market={market}
          onConfirm={async (pos) => {
            await onAddToSim(pos);
            setSimAdded(true);
            setShowSimModal(false);
          }}
          onClose={() => setShowSimModal(false)}
        />
      )}
    </div>
  );
}

// ── Sim Modal ──────────────────────────────────────────────────────────────────
function SimModal({ scan, livePrice, currency, market, onConfirm, onClose }) {
  const isIndia  = currency === '₹';
  const [direction, setDirection] = useState(scan.analysis?.signal === 'SELL' ? 'SHORT' : 'LONG');
  const [quantity,  setQuantity]  = useState('1');
  const [loading,   setLoading]   = useState(false);
  const price     = livePrice || 0;
  const notional  = price * parseFloat(quantity || 0);
  const sigColor  = scan.analysis?.signal === 'BUY' ? '#00ff88' : scan.analysis?.signal === 'SELL' ? '#ff4444' : '#ffaa00';

  const confirm = async () => {
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return;
    setLoading(true);
    await onConfirm({
      ticker:      scan.ticker,
      market,
      direction,
      entryPrice:  price,
      quantity:    qty,
      signal:      scan.analysis?.signal,
      confidence:  scan.analysis?.confidence,
      timeframe:   scan.timeframe,
      priceTarget: scan.analysis?.priceTarget,
      stopLoss:    scan.analysis?.stopLoss,
      thesis:      scan.analysis?.thesis,
    });
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: '#0f0f1a', border: '1px solid #aa66ff44',
        borderRadius: 10, padding: 24, width: '100%', maxWidth: 360,
      }} onClick={e => e.stopPropagation()}>

        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#aa66ff', marginBottom: 4 }}>
          ADD TO SIMULATOR
        </div>
        <div style={{ fontSize: 12, color: '#556677', marginBottom: 20 }}>
          Track this signal with virtual money
        </div>

        {/* Ticker + signal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#e8e8f0' }}>{scan.ticker}</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: sigColor }}>{scan.analysis?.signal} · {scan.analysis?.confidence}%</div>
            <div style={{ fontSize: 11, color: '#7788aa' }}>Entry: {currency}{price.toFixed(2)}</div>
          </div>
        </div>

        {/* Target / Stop */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#0a0a14', border: '1px solid #00ff8833', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 9, color: '#445', marginBottom: 2 }}>TARGET</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#00ff88' }}>
              {scan.analysis?.priceTarget ? `${currency}${parseFloat(scan.analysis.priceTarget).toFixed(2)}` : '—'}
            </div>
          </div>
          <div style={{ flex: 1, background: '#0a0a14', border: '1px solid #ff444433', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 9, color: '#445', marginBottom: 2 }}>STOP LOSS</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ff4444' }}>
              {scan.analysis?.stopLoss ? `${currency}${parseFloat(scan.analysis.stopLoss).toFixed(2)}` : '—'}
            </div>
          </div>
        </div>

        {/* Direction */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#445', letterSpacing: '0.1em', marginBottom: 8 }}>DIRECTION</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['LONG', 'SHORT'].map(d => (
              <button key={d} onClick={() => setDirection(d)} style={{
                flex: 1, padding: '10px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em',
                border: `1px solid ${direction === d ? (d === 'LONG' ? '#00ff88' : '#ff4444') : '#2a2a3e'}`,
                background: direction === d ? (d === 'LONG' ? '#00ff8811' : '#ff444411') : '#0a0a14',
                color: direction === d ? (d === 'LONG' ? '#00ff88' : '#ff4444') : '#556677',
              }}>
                {d === 'LONG' ? '↑ LONG' : '↓ SHORT'}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#445', letterSpacing: '0.1em', marginBottom: 8 }}>
            SHARES / UNITS
          </div>
          <input
            type="number" min="0.01" step="0.01" value={quantity}
            onChange={e => setQuantity(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6,
              color: '#e8e8f0', fontSize: 18, fontWeight: 700, fontFamily: 'inherit',
              padding: '10px 14px', textAlign: 'right',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: '#556677' }}>Total notional</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#c8d8f0' }}>
              {currency}{notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 6, cursor: 'pointer',
            background: 'none', border: '1px solid #2a2a3e', color: '#556677',
            fontFamily: 'inherit', fontSize: 13,
          }}>CANCEL</button>
          <button onClick={confirm} disabled={loading || !parseFloat(quantity)} style={{
            flex: 2, padding: '12px', borderRadius: 6, cursor: 'pointer',
            background: '#aa66ff22', border: '1px solid #aa66ff',
            color: '#aa66ff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            letterSpacing: '0.08em', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'ADDING...' : `OPEN ${direction}`}
          </button>
        </div>
      </div>
    </div>
  );

}