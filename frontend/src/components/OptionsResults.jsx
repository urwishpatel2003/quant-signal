// src/components/OptionsResults.jsx
import { useState } from 'react';
import { SC, RC, MC, GC } from '../utils/constants';
import MiniChart      from './MiniChart';
import ContractCard   from './ContractCard';
import TradeSetupCard  from './TradeSetupCard';
import RiskRewardBar   from './RiskRewardBar';
import PLSimulator     from './PLSimulator';
import TradeChecklist  from './TradeChecklist';
import EarningsWarning from './EarningsWarning';
import TechnicalPanel from './TechnicalPanel';

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
      {isOpen && (
        <div style={{ padding: '0 16px 20px', borderTop: '1px solid #1e1e30' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function OptionsResults({
  ticker, livePrice, changePct, ohlcv,
  priceSignal, optionsSignal,
  ta, macro, selectedExpiry,
  onBack,
}) {
  const [activeId,     setActiveId]     = useState('ai');
  const [selectedSide, setSelectedSide] = useState(null);

  const recColor   = optionsSignal.recommendation === 'CALL' ? '#00ff88'
    : optionsSignal.recommendation === 'PUT' ? '#ff4444' : '#ffaa00';
  const ivColor    = optionsSignal.ivRank === 'LOW' ? '#00ff88'
    : optionsSignal.ivRank === 'HIGH' ? '#ff4444' : '#ffaa00';
  const activeSide   = selectedSide || optionsSignal.recommendation || 'CALL';
  const activeSignal = { ...optionsSignal, recommendation: activeSide };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      paddingTop: 8,
    }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
        paddingTop: 'max(8px, env(safe-area-inset-top))',
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
        >← BACK TO OPTIONS</button>
      </div>

      {/* ── Price summary bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: '#0f0f18', border: `1px solid ${recColor}33`,
        padding: '14px 16px', borderRadius: 6,
      }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, lineHeight: 1, color: '#fff' }}>
            {ticker}
          </div>
          <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.1em', marginTop: 2 }}>
            {selectedExpiry}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#fff' }}>${livePrice?.toFixed(2)}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: changePct !== null && changePct >= 0 ? '#00ff88' : '#ff4444' }}>
            {changePct !== null ? `${changePct >= 0 ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <MiniChart data={ohlcv} />
          <div style={{
            background: recColor + '11', border: `1px solid ${recColor}44`,
            padding: '8px 14px', borderRadius: 4, textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: recColor, lineHeight: 1 }}>
              {optionsSignal.recommendation === 'NEUTRAL' ? 'NEUTRAL' : `LONG ${optionsSignal.recommendation}S`}
            </div>
            <div style={{ fontSize: 11, color: '#99aacc', marginTop: 2 }}>{optionsSignal.confidence}%</div>
          </div>
        </div>
      </div>

      <EarningsWarning ticker={ticker} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />

      {/* ── Accordion 1: AI Recommendation ── */}
      <AccordionCard
        id="ai"
        activeId={activeId}
        setActiveId={setActiveId}
        label="AI RECOMMENDATION"
        preview={`${optionsSignal.recommendation === 'NEUTRAL' ? 'NEUTRAL' : `LONG ${optionsSignal.recommendation}S`} · ${optionsSignal.confidence}% · ${optionsSignal.ivRank} IV`}
      >
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Big recommendation */}
          <div style={{
            background: recColor + '0d', border: `1px solid ${recColor}33`,
            borderRadius: 6, padding: '20px 16px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(32px,7vw,52px)', color: recColor, lineHeight: 1 }}>
              {optionsSignal.recommendation === 'NEUTRAL' ? 'STAY NEUTRAL' : `LONG ${optionsSignal.recommendation}S`}
            </div>
            <div style={{ fontSize: 13, color: '#b0c0dd', marginTop: 10 }}>CONFIDENCE</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: recColor }}>{optionsSignal.confidence}%</div>
            <div style={{ background: '#1a1a2e', borderRadius: 2, height: 5, margin: '10px auto 0', maxWidth: 260, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${optionsSignal.confidence}%`, background: recColor, borderRadius: 2 }} />
            </div>
          </div>

          {/* Reasoning */}
          <div style={{ fontSize: 13, color: '#d0d8f0', lineHeight: 1.8 }}>
            {optionsSignal.reasoning}
          </div>
          {optionsSignal.macroSetup && (
            <div style={{ fontSize: 12, color: '#ffaa0099', borderLeft: '2px solid #ffaa0033', paddingLeft: 12, fontStyle: 'italic' }}>
              📊 {optionsSignal.macroSetup}
            </div>
          )}
          {optionsSignal.calendarWarning && (
            <div style={{ fontSize: 12, color: '#ff884488', borderLeft: '2px solid #ff884433', paddingLeft: 12 }}>
              📅 {optionsSignal.calendarWarning}
            </div>
          )}

          {/* IV */}
          <div style={{ background: '#070710', padding: '12px 14px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ fontSize: 9, color: '#8899bb', marginBottom: 4 }}>IV ENVIRONMENT</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: ivColor }}>{optionsSignal.ivRank} IV</div>
            </div>
            <div style={{ fontSize: 12, color: '#aabbcc', flex: 1, lineHeight: 1.6 }}>{optionsSignal.ivComment}</div>
          </div>

          {optionsSignal.positionSizing && (
            <div style={{ background: '#070710', padding: '12px 14px', fontSize: 12, color: '#8899aa', borderLeft: '3px solid #ffaa0044', borderRadius: 2 }}>
              💰 {optionsSignal.positionSizing}
            </div>
          )}
        </div>
      </AccordionCard>

      {/* ── Accordion 2: Contract Plays ── */}
      <AccordionCard
        id="contract"
        activeId={activeId}
        setActiveId={setActiveId}
        label="CONTRACT PLAYS"
        preview={`CALL $${optionsSignal.bestCall?.strike} ~$${optionsSignal.bestCall?.mid?.toFixed(2)} · PUT $${optionsSignal.bestPut?.strike} ~$${optionsSignal.bestPut?.mid?.toFixed(2)}`}
      >
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="options-contracts">
            <ContractCard data={optionsSignal.bestCall} type="CALL" selected={activeSide === 'CALL'} onClick={() => setSelectedSide('CALL')} />
            <ContractCard data={optionsSignal.bestPut}  type="PUT"  selected={activeSide === 'PUT'}  onClick={() => setSelectedSide('PUT')}  />
          </div>
          <TradeChecklist ta={ta} priceSignal={priceSignal} optionsSignal={activeSignal} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />
          <PLSimulator optionsSignal={{ ...activeSignal, ticker }} livePrice={livePrice} />
          <TradeSetupCard optionsSignal={activeSignal} priceSignal={priceSignal} ticker={ticker} selectedExpiry={selectedExpiry} />
          <RiskRewardBar optionsSignal={activeSignal} />
        </div>
      </AccordionCard>

      {/* ── Accordion 3: Technical & Risk ── */}
      <AccordionCard
        id="technical"
        activeId={activeId}
        setActiveId={setActiveId}
        label="TECHNICAL & RISK"
        preview={ta ? `RSI ${ta.rsi14?.toFixed(1)} · ${ta.trendSignal} · Vol ${ta.volumeRatio}x · ${optionsSignal.catalysts?.length || 0} catalysts · ${optionsSignal.keyRisks?.length || 0} risks` : 'Technical indicators & risk factors'}
      >
        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Technical + Underlying */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {ta && <TechnicalPanel ta={ta} />}
            {priceSignal && (
              <div className="card" style={{ borderColor: SC[priceSignal.signal] + '33' }}>
                <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.15em', marginBottom: 10 }}>UNDERLYING SIGNAL</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    ['SIGNAL',   priceSignal.signal,                        SC[priceSignal.signal]],
                    ['CONF',     `${priceSignal.confidence}%`,              '#fff'],
                    ['TARGET',   `$${priceSignal.priceTarget?.toFixed(2)}`, '#00ff88'],
                    ['STOP',     `$${priceSignal.stopLoss?.toFixed(2)}`,    '#ff4444'],
                    ['MACRO',    priceSignal.macroImpact,                   MC[priceSignal.macroImpact]],
                    ['GEO RISK', priceSignal.geopoliticalRisk,              RC[priceSignal.geopoliticalRisk]],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ background: '#070710', padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 8, color: '#8899bb', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {ta && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                    {[
                      ['RSI 14', ta.rsi14,            ta.rsi14 > 70 ? '#ff4444' : ta.rsi14 < 30 ? '#00ff88' : '#ffaa00'],
                      ['TREND',  ta.trendSignal,       ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444'],
                      ['VOLUME', `${ta.volumeRatio}x`, ta.volumeSignal === 'HIGH' ? '#ffaa00' : '#c8c8d0'],
                      ['GLOBAL', priceSignal.globalMarketTrend, GC[priceSignal.globalMarketTrend]],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ background: '#070710', padding: '6px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#8899bb', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#aabbcc', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                  {priceSignal.thesis}
                </div>
                {priceSignal.bondSignal && (
                  <div style={{ fontSize: 10, color: '#ffaa0077', marginTop: 6, borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>
                    📊 {priceSignal.bondSignal}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Catalysts / Risks / Macro */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div className="card">
              <div style={{ fontSize: 10, color: '#ffaa0066', marginBottom: 8, fontWeight: 700 }}>⚡ CATALYSTS</div>
              {optionsSignal.catalysts?.map((c, i) => (
                <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: i < optionsSignal.catalysts.length - 1 ? '1px solid #1a1a26' : 'none', display: 'flex', gap: 6, lineHeight: 1.5 }}>
                  <span style={{ color: '#ffaa00', flexShrink: 0 }}>→</span>{c}
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{ fontSize: 10, color: '#ff444466', marginBottom: 8, fontWeight: 700 }}>⚠ KEY RISKS</div>
              {optionsSignal.keyRisks?.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: i < optionsSignal.keyRisks.length - 1 ? '1px solid #1a0f0f' : 'none', display: 'flex', gap: 6, lineHeight: 1.5 }}>
                  <span style={{ color: '#ff4444', flexShrink: 0 }}>!</span>{r}
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{ fontSize: 10, color: '#ff884466', marginBottom: 8, fontWeight: 700 }}>🌍 MACRO RISKS</div>
              {optionsSignal.macroRisks?.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: i < optionsSignal.macroRisks.length - 1 ? '1px solid #1a1008' : 'none', display: 'flex', gap: 6, lineHeight: 1.5 }}>
                  <span style={{ color: '#ff8844', flexShrink: 0 }}>⊕</span>{r}
                </div>
              ))}
              {optionsSignal.globalMarketRisk && (
                <div style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', display: 'flex', gap: 6 }}>
                  <span style={{ color: '#ff8844', flexShrink: 0 }}>🌍</span>{optionsSignal.globalMarketRisk}
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#333', textAlign: 'center' }}>
            ⚠ NOT FINANCIAL ADVICE. OPTIONS INVOLVE SIGNIFICANT RISK.
          </div>
        </div>
      </AccordionCard>

    </div>
  );
}