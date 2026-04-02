// src/components/ScannerResults.jsx
import { useState } from 'react';
import { SC, MC, GC } from '../utils/constants';
import { TIMEFRAMES } from '../utils/indicators';
import MiniChart from './MiniChart';

function AccordionCard({ id, activeId, setActiveId, label, preview, children }) {
  const isOpen = activeId === id;
  return (
    <div
      style={{
        background: '#0f0f1a',
        border: `1px solid ${isOpen ? '#ffaa0044' : '#2a2a40'}`,
        borderRadius: 6,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header — always visible, tap to toggle */}
      <div
        onClick={() => setActiveId(isOpen ? null : id)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer',
          background: isOpen ? '#ffaa0008' : 'transparent',
          transition: 'background 0.15s',
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

      {/* Expanded content */}
      {isOpen && (
        <div style={{ padding: '0 16px 20px', borderTop: '1px solid #1e1e30' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function ScannerResults({ scan, macro, onBack, onOpenOptions }) {
  const [activeId, setActiveId] = useState('ticker');

  const livePrice = scan.quote?.last || scan.ohlcv?.current;
  const pct = scan.ohlcv?.current && scan.ohlcv?.prev && scan.ohlcv.prev !== 0
    ? ((scan.ohlcv.current - scan.ohlcv.prev) / scan.ohlcv.prev * 100)
    : null;
  const sigColor = SC[scan.analysis.signal];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
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

        <button
          className="btn-sm"
          style={{ color: '#ffaa00', borderColor: '#ffaa0044' }}
          onClick={() => onOpenOptions(scan.ticker)}
        >⚡ OPTIONS</button>
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
          <div style={{ fontSize: 10, color: '#6677aa', letterSpacing: '0.15em', marginTop: 2 }}>
            {TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${livePrice?.toFixed(2)}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: pct !== null && pct >= 0 ? '#00ff88' : '#ff4444' }}>
            {pct !== null ? `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <MiniChart data={scan.ohlcv} />
        </div>
      </div>

      {/* ── Accordion 1: Ticker / Price / Decision ── */}
      <AccordionCard
        id="ticker"
        activeId={activeId}
        setActiveId={setActiveId}
        label="PRICE & DECISION"
        preview={`$${livePrice?.toFixed(2)} · ${scan.analysis.signal} ${scan.analysis.confidence}% · Target $${scan.analysis.priceTarget?.toFixed(2)}`}
      >
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Key levels */}
          <div style={{ display: 'flex', justifyContent: 'space-around', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['TARGET', `$${scan.analysis.priceTarget?.toFixed(2)}`, '#00ff88'],
              ['ENTRY',  `$${livePrice?.toFixed(2)}`,                '#ffffff'],
              ['STOP',   `$${scan.analysis.stopLoss?.toFixed(2)}`,   '#ff4444'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
                <div style={{ fontSize: 10, color: '#b0c0dd', letterSpacing: '0.15em', marginBottom: 6 }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Signal confidence bar */}
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

          {/* Risk metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6 }}>
            {[
              ['RISK',     scan.analysis.riskLevel,             scan.analysis.riskLevel === 'LOW' ? '#00ff88' : scan.analysis.riskLevel === 'HIGH' ? '#ff4444' : '#ffaa00'],
              ['MACRO',    scan.analysis.macroImpact,           MC[scan.analysis.macroImpact]],
              ['GLOBAL',   scan.analysis.globalMarketTrend,     GC[scan.analysis.globalMarketTrend]],
              ['GEO RISK', scan.analysis.geopoliticalRisk,      scan.analysis.geopoliticalRisk === 'LOW' ? '#00ff88' : scan.analysis.geopoliticalRisk === 'HIGH' ? '#ff4444' : '#ffaa00'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: '#070710', padding: '8px 10px', textAlign: 'center', borderRadius: 4 }}>
                <div style={{ fontSize: 9, color: '#b0c0dd', marginBottom: 4, letterSpacing: '0.1em' }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </AccordionCard>

      {/* ── Accordion 2: Signal Overview + Bull/Bear ── */}
      <AccordionCard
        id="signal"
        activeId={activeId}
        setActiveId={setActiveId}
        label="SIGNAL OVERVIEW"
        preview={`▲ ${scan.analysis.bullFactors?.length} bull · ▼ ${scan.analysis.bearFactors?.length} bear · ${scan.analysis.thesis?.slice(0, 60)}...`}
      >
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Thesis */}
          {scan.analysis.thesis && (
            <div style={{
              fontSize: 13, color: '#d0d8f0', lineHeight: 1.8,
              borderLeft: `3px solid ${sigColor}55`, paddingLeft: 14, fontStyle: 'italic',
            }}>
              {scan.analysis.thesis}
            </div>
          )}

          {/* Bull / Bear */}
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

      {/* ── Accordion 3: Fundamentals & Technicals ── */}
      <AccordionCard
        id="fundamentals"
        activeId={activeId}
        setActiveId={setActiveId}
        label="FUNDAMENTALS & TECHNICALS"
        preview={[
          scan.fundamentals?.pe    ? `P/E ${scan.fundamentals.pe?.toFixed(1)}` : null,
          scan.fundamentals?.eps   ? `EPS $${scan.fundamentals.eps?.toFixed(2)}` : null,
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
                  ['P/E Ratio',    scan.fundamentals.pe?.toFixed(1)],
                  ['EPS',          scan.fundamentals.eps ? `$${scan.fundamentals.eps.toFixed(2)}` : null],
                  ['Beta',         scan.fundamentals.beta?.toFixed(2)],
                  ['52W High',     scan.fundamentals.fiftyTwoWeekHigh ? `$${scan.fundamentals.fiftyTwoWeekHigh.toFixed(2)}` : null],
                  ['52W Low',      scan.fundamentals.fiftyTwoWeekLow  ? `$${scan.fundamentals.fiftyTwoWeekLow.toFixed(2)}`  : null],
                  ['ROE',          scan.fundamentals.roe ? `${(scan.fundamentals.roe * 100).toFixed(1)}%` : null],
                  ['Gross Margin', scan.fundamentals.grossMargins ? `${(scan.fundamentals.grossMargins * 100).toFixed(1)}%` : null],
                  ['Rev Growth',   scan.fundamentals.revenueGrowth ? `${(scan.fundamentals.revenueGrowth * 100).toFixed(1)}%` : null],
                  ['D/E Ratio',    scan.fundamentals.debtToEquity?.toFixed(2)],
                  ['Analyst Target', scan.fundamentals.targetMeanPrice ? `$${scan.fundamentals.targetMeanPrice.toFixed(2)}` : null],
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
                  ['RSI (14)',    scan.ta.rsi14,            scan.ta.rsi14 > 70 ? '#ff4444' : scan.ta.rsi14 < 30 ? '#00ff88' : '#ffaa00'],
                  ['Trend',      scan.ta.trendSignal,       scan.ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444'],
                  ['Volume',     `${scan.ta.volumeRatio}x`, scan.ta.volumeSignal === 'HIGH' ? '#ffaa00' : '#e8e8f0'],
                  ['MACD',       scan.ta.macd?.cross,       scan.ta.macd?.cross === 'BULLISH_CROSS' ? '#00ff88' : scan.ta.macd?.cross === 'BEARISH_CROSS' ? '#ff4444' : '#e8e8f0'],
                  ['SMA 20',     scan.ta.sma20 ? `$${scan.ta.sma20}` : null, '#e8e8f0'],
                  ['SMA 50',     scan.ta.sma50 ? `$${scan.ta.sma50}` : null, '#e8e8f0'],
                  ['SMA 200',    scan.ta.sma200 ? `$${scan.ta.sma200}` : null, '#e8e8f0'],
                  ['ATR (14)',   scan.ta.atr?.atr,          scan.ta.atr?.volatility === 'HIGH' ? '#ffaa00' : '#e8e8f0'],
                  ['BB Position',scan.ta.bb?.position,      scan.ta.bb?.position === 'NEAR_UPPER' ? '#ff4444' : scan.ta.bb?.position === 'NEAR_LOWER' ? '#00ff88' : '#e8e8f0'],
                  ['StochRSI K', scan.ta.stochRSI?.k,       scan.ta.stochRSI?.k > 90 ? '#ff4444' : scan.ta.stochRSI?.k < 10 ? '#00ff88' : '#ffaa00'],
                  ['Support',    scan.ta.sr?.nearestSupport ? `$${scan.ta.sr.nearestSupport}` : null, '#00ff88'],
                  ['Resistance', scan.ta.sr?.nearestResistance ? `$${scan.ta.sr.nearestResistance}` : null, '#ff4444'],
                ].filter(([, v]) => v != null).map(([k, v, c]) => (
                  <div key={k} style={{ background: '#070710', padding: '8px 10px', borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 3, letterSpacing: '0.1em' }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options Flow */}
          {scan.options && (
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
        id="news"
        activeId={activeId}
        setActiveId={setActiveId}
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
                <a
                  href={n.url} target="_blank" rel="noopener noreferrer"
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

    </div>
  );
}