// src/components/OptionsModal.jsx
import { useState } from 'react';
import { SC, RC, MC, GC } from '../utils/constants';
import ModalShell     from './ModalShell';
import MiniChart      from './MiniChart';
import ContractCard   from './ContractCard';
import BondPanel      from './BondPanel';
import TechnicalPanel from './TechnicalPanel';
import TradeSetupCard  from './TradeSetupCard';
import RiskRewardBar   from './RiskRewardBar';
import PLSimulator     from './PLSimulator';
import TradeChecklist  from './TradeChecklist';
import EarningsWarning from './EarningsWarning';

export default function OptionsModal({
  ticker, livePrice, changePct, ohlcv,
  priceSignal, optionsSignal,
  ta, macro, selectedExpiry,
  onClose,
}) {
  const [selectedSide, setSelectedSide] = useState(null);

  if (!optionsSignal) return null;

  const recColor   = optionsSignal.recommendation === 'CALL' ? '#00ff88' : optionsSignal.recommendation === 'PUT' ? '#ff4444' : '#ffaa00';
  const ivColor    = optionsSignal.ivRank === 'LOW' ? '#00ff88' : optionsSignal.ivRank === 'HIGH' ? '#ff4444' : '#ffaa00';
  const activeSide = selectedSide || optionsSignal.recommendation || 'CALL';
  const activeSignal = { ...optionsSignal, recommendation: activeSide };

  return (
    <ModalShell
      onClose={onClose}
      title={`${ticker} OPTIONS`}
      subtitle={`EXPIRY: ${selectedExpiry} · AI OPTIONS ANALYSIS`}
    >
      {/* Price Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: '#0f0f18', border: '1px solid #1e1e2e',
        padding: '14px 16px', marginBottom: 16, borderRadius: 4,
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
          <div style={{ fontSize: 24, fontWeight: 600, color: '#fff' }}>${livePrice?.toFixed(2)}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: changePct !== null && changePct >= 0 ? '#00ff88' : '#ff4444' }}>
            {changePct !== null ? `${changePct >= 0 ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <MiniChart data={ohlcv} />
          <div style={{
            textAlign: 'center',
            background: recColor + '11',
            border: `1px solid ${recColor}44`,
            padding: '10px 18px', borderRadius: 2, minWidth: 100,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: recColor, lineHeight: 1 }}>
              {optionsSignal.recommendation === 'NEUTRAL' ? 'NEUTRAL' : `LONG ${optionsSignal.recommendation}S`}
            </div>
            <div style={{ fontSize: 11, color: '#99aacc', marginTop: 2 }}>{optionsSignal.confidence}%</div>
          </div>
        </div>
      </div>

      <EarningsWarning ticker={ticker} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />

      {/* AI Recommendation */}
      <div className="card fade-in" style={{ borderColor: recColor + '44', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.2em', marginBottom: 4 }}>
              AI OPTIONS RECOMMENDATION · {selectedExpiry}
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(28px, 5vw, 44px)', color: recColor, lineHeight: 1 }}>
              {optionsSignal.recommendation === 'NEUTRAL' ? 'STAY NEUTRAL' : `LONG ${optionsSignal.recommendation}S`}
            </div>
            <div style={{ fontSize: 12, color: '#8899aa', marginTop: 8, lineHeight: 1.6 }}>
              {optionsSignal.reasoning}
            </div>
            {optionsSignal.macroSetup      && <div style={{ fontSize: 11, color: '#ffaa0088', marginTop: 6, fontStyle: 'italic', borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>📊 {optionsSignal.macroSetup}</div>}
            {optionsSignal.calendarWarning && <div style={{ fontSize: 11, color: '#ff884477', marginTop: 6, borderLeft: '2px solid #ff884433', paddingLeft: 8 }}>📅 {optionsSignal.calendarWarning}</div>}
          </div>
          <div style={{ textAlign: 'right', minWidth: 120 }}>
            <div style={{ fontSize: 11, color: '#99aacc' }}>CONFIDENCE</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{optionsSignal.confidence}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${optionsSignal.confidence}%`, background: recColor }} /></div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, color: '#8899bb' }}>IV ENVIRONMENT</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: ivColor }}>{optionsSignal.ivRank} IV</div>
              <div style={{ fontSize: 11, color: '#aabbcc' }}>{optionsSignal.ivComment}</div>
            </div>
          </div>
        </div>
        {optionsSignal.positionSizing && (
          <div style={{ background: '#070710', padding: 10, fontSize: 12, color: '#8899aa', borderLeft: '2px solid #ffaa0044' }}>
            💰 {optionsSignal.positionSizing}
          </div>
        )}
      </div>

      {/* Contract Cards */}
      <div className="options-contracts" style={{ marginBottom: 16 }}>
        <ContractCard data={optionsSignal.bestCall} type="CALL" selected={activeSide === 'CALL'} onClick={() => setSelectedSide('CALL')} />
        <ContractCard data={optionsSignal.bestPut}  type="PUT"  selected={activeSide === 'PUT'}  onClick={() => setSelectedSide('PUT')}  />
      </div>

      <TradeChecklist ta={ta} priceSignal={priceSignal} optionsSignal={activeSignal} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />
      <PLSimulator optionsSignal={{ ...activeSignal, ticker }} livePrice={livePrice} />
      <TradeSetupCard optionsSignal={activeSignal} priceSignal={priceSignal} ticker={ticker} selectedExpiry={selectedExpiry} />
      <RiskRewardBar optionsSignal={activeSignal} />

      {/* Technical + Underlying */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
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

      <BondPanel bonds={macro?.bonds} />

      {/* Catalysts / Risks / Macro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 10, color: '#ffaa0066', marginBottom: 8 }}>⚡ CATALYSTS</div>
          {optionsSignal.catalysts?.map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #1a1a26', display: 'flex', gap: 6 }}>
              <span style={{ color: '#ffaa00' }}>→</span>{c}
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, color: '#ff444466', marginBottom: 8 }}>⚠ KEY RISKS</div>
          {optionsSignal.keyRisks?.map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #1a0f0f', display: 'flex', gap: 6 }}>
              <span style={{ color: '#ff4444' }}>!</span>{r}
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, color: '#ff884466', marginBottom: 8 }}>🌍 MACRO RISKS</div>
          {optionsSignal.macroRisks?.map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #1a1008', display: 'flex', gap: 6 }}>
              <span style={{ color: '#ff8844' }}>⊕</span>{r}
            </div>
          ))}
          {optionsSignal.globalMarketRisk && (
            <div style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', display: 'flex', gap: 6 }}>
              <span style={{ color: '#ff8844' }}>🌍</span>{optionsSignal.globalMarketRisk}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#333', textAlign: 'center', marginTop: 8 }}>
        ⚠ NOT FINANCIAL ADVICE. OPTIONS INVOLVE SIGNIFICANT RISK.
      </div>
    </ModalShell>
  );
}