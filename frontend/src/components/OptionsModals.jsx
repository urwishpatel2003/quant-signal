// src/components/OptionsModals.jsx
import { useState } from 'react';
import { SC, RC, MC, GC } from '../utils/constants';
import ModalShell     from './ModalShell';
import ContractCard   from './ContractCard';
import TradeSetupCard  from './TradeSetupCard';
import RiskRewardBar   from './RiskRewardBar';
import PLSimulator     from './PLSimulator';
import TradeChecklist  from './TradeChecklist';
import TechnicalPanel from './TechnicalPanel';

// ── Modal 1: AI Recommendation ───────────────────────────────────────────────
export function AIRecModal({ ticker, optionsSignal, selectedExpiry, onClose }) {
  const recColor = optionsSignal.recommendation === 'CALL' ? '#00ff88'
    : optionsSignal.recommendation === 'PUT' ? '#ff4444' : '#ffaa00';
  const ivColor  = optionsSignal.ivRank === 'LOW' ? '#00ff88'
    : optionsSignal.ivRank === 'HIGH' ? '#ff4444' : '#ffaa00';

  return (
    <ModalShell
      onClose={onClose}
      title="AI RECOMMENDATION"
      subtitle={`${ticker} · ${selectedExpiry}`}
    >
      {/* Big recommendation */}
      <div style={{
        background: recColor + '0d',
        border: `1px solid ${recColor}44`,
        borderRadius: 6, padding: '32px 24px',
        textAlign: 'center', marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, color: '#8899bb', letterSpacing: '0.2em', marginBottom: 8 }}>
          AI OPTIONS RECOMMENDATION · {selectedExpiry}
        </div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(40px, 8vw, 64px)',
          color: recColor, lineHeight: 1, letterSpacing: '0.03em',
        }}>
          {optionsSignal.recommendation === 'NEUTRAL' ? 'STAY NEUTRAL' : `LONG ${optionsSignal.recommendation}S`}
        </div>

        {/* Confidence */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, color: '#99aacc', letterSpacing: '0.15em', marginBottom: 6 }}>CONFIDENCE</div>
          <div style={{ fontSize: 48, fontWeight: 700, color: recColor, lineHeight: 1 }}>
            {optionsSignal.confidence}%
          </div>
          <div style={{
            background: '#1a1a2e', borderRadius: 2, height: 6,
            margin: '12px auto 0', maxWidth: 280, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${optionsSignal.confidence}%`,
              background: recColor, borderRadius: 2, transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
          REASONING
        </div>
        <div style={{ fontSize: 13, color: '#d0d8f0', lineHeight: 1.8 }}>
          {optionsSignal.reasoning}
        </div>
        {optionsSignal.macroSetup && (
          <div style={{
            fontSize: 12, color: '#ffaa0099', marginTop: 14,
            borderLeft: '2px solid #ffaa0033', paddingLeft: 12, fontStyle: 'italic',
          }}>
            📊 {optionsSignal.macroSetup}
          </div>
        )}
        {optionsSignal.calendarWarning && (
          <div style={{
            fontSize: 12, color: '#ff884488', marginTop: 10,
            borderLeft: '2px solid #ff884433', paddingLeft: 12,
          }}>
            📅 {optionsSignal.calendarWarning}
          </div>
        )}
      </div>

      {/* IV Environment */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#b0c0dd', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
          IV ENVIRONMENT
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 4 }}>IV RANK</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: ivColor }}>{optionsSignal.ivRank} IV</div>
          </div>
          <div style={{ flex: 1, fontSize: 13, color: '#aabbcc', lineHeight: 1.6 }}>
            {optionsSignal.ivComment}
          </div>
        </div>
      </div>

      {/* Position sizing */}
      {optionsSignal.positionSizing && (
        <div style={{
          background: '#070710', padding: '14px 16px', fontSize: 13,
          color: '#8899aa', borderLeft: '3px solid #ffaa0044', borderRadius: 2,
        }}>
          💰 {optionsSignal.positionSizing}
        </div>
      )}
    </ModalShell>
  );
}

// ── Modal 2: Contract Cards + Checklist + PL + Setup + RR ────────────────────
export function ContractModal({ ticker, livePrice, optionsSignal, priceSignal, ta, macro, selectedExpiry, onClose }) {
  const [selectedSide, setSelectedSide] = useState(null);
  const activeSide   = selectedSide || optionsSignal.recommendation || 'CALL';
  const activeSignal = { ...optionsSignal, recommendation: activeSide };

  return (
    <ModalShell
      onClose={onClose}
      title="CONTRACT PLAYS"
      subtitle={`${ticker} · ${selectedExpiry}`}
    >
      {/* Contract cards */}
      <div className="options-contracts" style={{ marginBottom: 16 }}>
        <ContractCard
          data={optionsSignal.bestCall} type="CALL"
          selected={activeSide === 'CALL'}
          onClick={() => setSelectedSide('CALL')}
        />
        <ContractCard
          data={optionsSignal.bestPut} type="PUT"
          selected={activeSide === 'PUT'}
          onClick={() => setSelectedSide('PUT')}
        />
      </div>

      <TradeChecklist
        ta={ta}
        priceSignal={priceSignal}
        optionsSignal={activeSignal}
        calendar={macro?.calendar}
        selectedExpiry={selectedExpiry}
      />
      <PLSimulator
        optionsSignal={{ ...activeSignal, ticker }}
        livePrice={livePrice}
      />
      <TradeSetupCard
        optionsSignal={activeSignal}
        priceSignal={priceSignal}
        ticker={ticker}
        selectedExpiry={selectedExpiry}
      />
      <RiskRewardBar optionsSignal={activeSignal} />
    </ModalShell>
  );
}

// ── Modal 3: Technical + Underlying + Catalysts/Risks ────────────────────────
export function TechnicalModal({ ticker, optionsSignal, priceSignal, ta, onClose }) {
  const recColor = optionsSignal.recommendation === 'CALL' ? '#00ff88'
    : optionsSignal.recommendation === 'PUT' ? '#ff4444' : '#ffaa00';

  return (
    <ModalShell
      onClose={onClose}
      title="TECHNICAL & RISK"
      subtitle={ticker}
    >
      {/* Technical + Underlying side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        {ta && <TechnicalPanel ta={ta} />}
        {priceSignal && (
          <div className="card" style={{ borderColor: SC[priceSignal.signal] + '33' }}>
            <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.15em', marginBottom: 10 }}>
              UNDERLYING SIGNAL
            </div>
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

      {/* Catalysts / Key Risks / Macro Risks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 10, color: '#ffaa0066', marginBottom: 8, fontWeight: 700, letterSpacing: '0.1em' }}>
            ⚡ CATALYSTS
          </div>
          {optionsSignal.catalysts?.map((c, i) => (
            <div key={i} style={{
              fontSize: 12, color: '#8899aa', padding: '6px 0',
              borderBottom: i < optionsSignal.catalysts.length - 1 ? '1px solid #1a1a26' : 'none',
              display: 'flex', gap: 6, lineHeight: 1.5,
            }}>
              <span style={{ color: '#ffaa00', flexShrink: 0 }}>→</span>{c}
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, color: '#ff444466', marginBottom: 8, fontWeight: 700, letterSpacing: '0.1em' }}>
            ⚠ KEY RISKS
          </div>
          {optionsSignal.keyRisks?.map((r, i) => (
            <div key={i} style={{
              fontSize: 12, color: '#8899aa', padding: '6px 0',
              borderBottom: i < optionsSignal.keyRisks.length - 1 ? '1px solid #1a0f0f' : 'none',
              display: 'flex', gap: 6, lineHeight: 1.5,
            }}>
              <span style={{ color: '#ff4444', flexShrink: 0 }}>!</span>{r}
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, color: '#ff884466', marginBottom: 8, fontWeight: 700, letterSpacing: '0.1em' }}>
            🌍 MACRO RISKS
          </div>
          {optionsSignal.macroRisks?.map((r, i) => (
            <div key={i} style={{
              fontSize: 12, color: '#8899aa', padding: '6px 0',
              borderBottom: i < optionsSignal.macroRisks.length - 1 ? '1px solid #1a1008' : 'none',
              display: 'flex', gap: 6, lineHeight: 1.5,
            }}>
              <span style={{ color: '#ff8844', flexShrink: 0 }}>⊕</span>{r}
            </div>
          ))}
          {optionsSignal.globalMarketRisk && (
            <div style={{ fontSize: 12, color: '#8899aa', padding: '6px 0', display: 'flex', gap: 6 }}>
              <span style={{ color: '#ff8844', flexShrink: 0 }}>🌍</span>{optionsSignal.globalMarketRisk}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#333', textAlign: 'center' }}>
        ⚠ NOT FINANCIAL ADVICE. OPTIONS INVOLVE SIGNIFICANT RISK.
      </div>
    </ModalShell>
  );
}