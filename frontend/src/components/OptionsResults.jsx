// src/components/OptionsResults.jsx
import { useState } from 'react';
import { SC, RC, MC, GC } from '../utils/constants';
import MiniChart      from './MiniChart';
import ContractCard   from './ContractCard';

const BASE = import.meta.env.VITE_API_BASE;
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
          <div style={{ fontSize: 'var(--fs-lg)', color: isOpen ? '#ffaa00' : '#b0c0dd', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 4 }}>
            {label}
          </div>
          {!isOpen && (
            <div style={{ fontSize: 'var(--fs-lg)', color: '#b8c8e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </div>
          )}
        </div>
        <div style={{ fontSize: 'var(--fs-lg)', color: isOpen ? '#ffaa00' : '#7788aa', marginLeft: 12, flexShrink: 0 }}>
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
  onBack, onAddToSim, getSimBalance,
}) {
  const [activeId,       setActiveId]       = useState('ai');
  const [selectedSide,   setSelectedSide]   = useState(null);
  const [showSimModal,   setShowSimModal]   = useState(null); // 'CALL' | 'PUT' | null
  const [simBalance,     setSimBalance]     = useState(null);
  const [simAdded,       setSimAdded]       = useState({ CALL: false, PUT: false });

  const openOptionSimModal = async (side) => {
    if (getSimBalance) {
      const bal = await getSimBalance('US');
      setSimBalance(bal);
    }
    setShowSimModal(side);
  };

  const recColor   = optionsSignal.recommendation === 'CALL' ? '#00ff88'
    : optionsSignal.recommendation === 'PUT' ? '#ff4444' : '#ffaa00';
  const ivColor    = optionsSignal.ivRank === 'LOW' ? '#00ff88'
    : optionsSignal.ivRank === 'HIGH' ? '#ff4444' : '#ffaa00';
  const activeSide   = selectedSide || optionsSignal.recommendation || 'CALL';
  const activeSignal = { ...optionsSignal, recommendation: activeSide };

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
            color: '#c8d8f0', cursor: 'pointer', borderRadius: 4,
            padding: '8px 14px', fontSize: 'var(--fs-md)', fontFamily: 'inherit',
            letterSpacing: '0.1em', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffaa0066'; e.currentTarget.style.color = '#ffaa00'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a40'; e.currentTarget.style.color = '#b0c0dd'; }}
        >← BACK TO OPTIONS</button>

        {onAddToSim && (
          <div style={{ display: 'flex', gap: 8 }}>
            {['CALL', 'PUT'].map(side => {
              const contract = side === 'CALL' ? optionsSignal.bestCall : optionsSignal.bestPut;
              const added    = simAdded[side];
              const canSim   = (optionsSignal.confidence || 0) >= 65 && contract?.mid;
              return contract ? (
                <button key={side} onClick={() => canSim && !added && openOptionSimModal(side)}
                  disabled={added || !canSim}
                  style={{
                    height: 34, padding: '0 12px', borderRadius: 5, cursor: canSim && !added ? 'pointer' : 'not-allowed',
                    border: `1px solid ${added ? '#00ff8844' : side === 'CALL' ? '#00ff8844' : '#ff444444'}`,
                    background: added ? '#00ff8811' : side === 'CALL' ? '#00ff8811' : '#ff444411',
                    color: added ? '#00ff88' : side === 'CALL' ? '#00ff88' : '#ff4444',
                    fontFamily: 'inherit', fontSize: 'var(--fs-lg)', fontWeight: 700,
                    letterSpacing: '0.08em', opacity: !canSim ? 0.5 : 1,
                  }}>
                  {added ? `✓ ${side}` : `📊 SIM ${side}`}
                </button>
              ) : null;
            })}
          </div>
        )}
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
          <div style={{ fontSize: 'var(--fs-body)', color: '#8899bb', letterSpacing: '0.1em', marginTop: 2 }}>
            {selectedExpiry}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#fff' }}>${livePrice?.toFixed(2)}</div>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: changePct !== null && changePct >= 0 ? '#00ff88' : '#ff4444' }}>
            {changePct !== null ? `${changePct >= 0 ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <MiniChart data={ohlcv} />
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
            <div style={{ fontSize: 'var(--fs-body)', color: '#c8d8f0', marginTop: 10 }}>CONFIDENCE</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: recColor }}>{optionsSignal.confidence}%</div>
            <div style={{ background: '#1a1a2e', borderRadius: 2, height: 5, margin: '10px auto 0', maxWidth: 260, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${optionsSignal.confidence}%`, background: recColor, borderRadius: 2 }} />
            </div>
          </div>

          {/* Reasoning */}
          <div style={{ fontSize: 'var(--fs-body)', color: '#d0d8f0', lineHeight: 1.8 }}>
            {optionsSignal.reasoning}
          </div>
          {optionsSignal.macroSetup && (
            <div style={{ fontSize: 'var(--fs-md)', color: '#ffaa0099', borderLeft: '2px solid #ffaa0033', paddingLeft: 12, fontStyle: 'italic' }}>
              📊 {optionsSignal.macroSetup}
            </div>
          )}
          {optionsSignal.calendarWarning && (
            <div style={{ fontSize: 'var(--fs-md)', color: '#ff884488', borderLeft: '2px solid #ff884433', paddingLeft: 12 }}>
              📅 {optionsSignal.calendarWarning}
            </div>
          )}

          {/* IV */}
          <div style={{ background: '#070710', padding: '12px 14px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ fontSize: 'var(--fs-md)', color: '#8899bb', marginBottom: 4 }}>IV ENVIRONMENT</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: ivColor }}>{optionsSignal.ivRank} IV</div>
            </div>
            <div style={{ fontSize: 'var(--fs-md)', color: '#99aacc', flex: 1, lineHeight: 1.6 }}>{optionsSignal.ivComment}</div>
          </div>

          {optionsSignal.positionSizing && (
            <div style={{ background: '#070710', padding: '12px 14px', fontSize: 'var(--fs-md)', color: '#99aacc', borderLeft: '3px solid #ffaa0044', borderRadius: 2 }}>
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
                <div style={{ fontSize: 'var(--fs-body)', color: '#8899bb', letterSpacing: '0.15em', marginBottom: 10 }}>UNDERLYING SIGNAL</div>
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
                      <div style={{ fontSize: 'var(--fs-xs)', color: '#8899bb', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: c }}>{v}</div>
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
                        <div style={{ fontSize: 'var(--fs-xs)', color: '#8899bb', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 'var(--fs-body)', color: '#99aacc', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                  {priceSignal.thesis}
                </div>
                {priceSignal.bondSignal && (
                  <div style={{ fontSize: 'var(--fs-body)', color: '#ffaa0077', marginTop: 6, borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>
                    📊 {priceSignal.bondSignal}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Catalysts / Risks / Macro */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div className="card">
              <div style={{ fontSize: 'var(--fs-body)', color: '#ffaa0066', marginBottom: 8, fontWeight: 700 }}>⚡ CATALYSTS</div>
              {optionsSignal.catalysts?.map((c, i) => (
                <div key={i} style={{ fontSize: 'var(--fs-md)', color: '#99aacc', padding: '5px 0', borderBottom: i < optionsSignal.catalysts.length - 1 ? '1px solid #1a1a26' : 'none', display: 'flex', gap: 6, lineHeight: 1.5 }}>
                  <span style={{ color: '#ffaa00', flexShrink: 0 }}>→</span>{c}
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{ fontSize: 'var(--fs-body)', color: '#ff444466', marginBottom: 8, fontWeight: 700 }}>⚠ KEY RISKS</div>
              {optionsSignal.keyRisks?.map((r, i) => (
                <div key={i} style={{ fontSize: 'var(--fs-md)', color: '#99aacc', padding: '5px 0', borderBottom: i < optionsSignal.keyRisks.length - 1 ? '1px solid #1a0f0f' : 'none', display: 'flex', gap: 6, lineHeight: 1.5 }}>
                  <span style={{ color: '#ff4444', flexShrink: 0 }}>!</span>{r}
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{ fontSize: 'var(--fs-body)', color: '#ff884466', marginBottom: 8, fontWeight: 700 }}>🌍 MACRO RISKS</div>
              {optionsSignal.macroRisks?.map((r, i) => (
                <div key={i} style={{ fontSize: 'var(--fs-md)', color: '#99aacc', padding: '5px 0', borderBottom: i < optionsSignal.macroRisks.length - 1 ? '1px solid #1a1008' : 'none', display: 'flex', gap: 6, lineHeight: 1.5 }}>
                  <span style={{ color: '#ff8844', flexShrink: 0 }}>⊕</span>{r}
                </div>
              ))}
              {optionsSignal.globalMarketRisk && (
                <div style={{ fontSize: 'var(--fs-md)', color: '#99aacc', padding: '5px 0', display: 'flex', gap: 6 }}>
                  <span style={{ color: '#ff8844', flexShrink: 0 }}>🌍</span>{optionsSignal.globalMarketRisk}
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 'var(--fs-lg)', color: '#333', textAlign: 'center' }}>
            ⚠ NOT FINANCIAL ADVICE. OPTIONS INVOLVE SIGNIFICANT RISK.
          </div>
        </div>
      </AccordionCard>

      {/* Options Sim Modal */}
      {showSimModal && (
        <OptionsSimModal
          ticker={ticker}
          side={showSimModal}
          contract={showSimModal === 'CALL' ? optionsSignal.bestCall : optionsSignal.bestPut}
          livePrice={livePrice}
          availableBalance={simBalance}
          onConfirm={async (pos) => {
            await onAddToSim(pos);
            setSimAdded(prev => ({ ...prev, [showSimModal]: true }));
            setShowSimModal(null);
          }}
          onClose={() => setShowSimModal(null)}
        />
      )}
    </div>
  );

}

// ── Options Sim Modal ─────────────────────────────────────────────────────────
function OptionsSimModal({ ticker, side, contract, livePrice, availableBalance, onConfirm, onClose }) {
  const [contracts, setContracts] = useState('1');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const isCall       = side === 'CALL';
  const color        = isCall ? '#00ff88' : '#ff4444';
  const premium      = contract?.mid || contract?.estimatedPremium || 0;
  const strike       = contract?.strike || 0;
  const expiry       = contract?.expiry || '';
  const delta        = contract?.delta || '';
  const iv           = contract?.iv || '';
  const numContracts = parseInt(contracts) || 1;
  const totalCost    = premium * numContracts * 100;
  const balance      = availableBalance ?? 10000;
  const exceedsBalance = totalCost > balance;
  const maxContracts = premium > 0 ? Math.floor(balance / (premium * 100)) : 0;

  const confirm = async () => {
    if (numContracts <= 0) { setError('Enter valid number of contracts'); return; }
    if (exceedsBalance) { setError(`Insufficient balance. Need $${totalCost.toFixed(2)}`); return; }
    setLoading(true); setError('');
    try {
      await onConfirm({
        ticker,
        market:       'US',
        direction:    'LONG',
        positionType: 'OPTION',
        optionType:   side,
        strike,
        expiry,
        contracts:    numContracts,
        entryPrice:   premium,
        quantity:     numContracts,
        notional:     totalCost,
        delta:        String(delta),
        iv:           String(iv),
        thesis:       contract?.thesis || '',
      });
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: '#0f0f1a', border: `1px solid ${color}44`,
        borderRadius: 10, padding: 24, width: '100%', maxWidth: 360,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color, marginBottom: 4 }}>
          SIMULATE {side} OPTION
        </div>
        <div style={{ fontSize: 'var(--fs-md)', color: '#8899bb', marginBottom: 20 }}>
          Virtual paper trade · Long {side.toLowerCase()} on {ticker}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'STRIKE',  value: `$${strike}`,              color: '#e8e8f0' },
            { label: 'EXPIRY',  value: expiry,                    color: '#e8e8f0' },
            { label: 'PREMIUM', value: `$${premium.toFixed(2)}/sh`, color },
            { label: 'TYPE',    value: `${isCall ? '↑' : '↓'} ${side}`, color },
            { label: 'DELTA',   value: delta || '—',              color: '#b8c8e0' },
            { label: 'IV',      value: iv ? `${iv}%` : '—',      color: '#ffaa00' },
          ].map(({ label, value, color: c }) => (
            <div key={label} style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 'var(--fs-md)', color: '#445', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: c }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 'var(--fs-body)', color: '#445', letterSpacing: '0.1em', marginBottom: 8 }}>NUMBER OF CONTRACTS</div>
          <input type="number" min="1" step="1" value={contracts}
            onChange={e => setContracts(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6,
              color: '#e8e8f0', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
              padding: '10px 14px', textAlign: 'right',
            }} />
          <div style={{ fontSize: 'var(--fs-body)', color: '#8899bb', marginTop: 4 }}>1 contract = 100 shares</div>
        </div>

        <div style={{ background: '#0a0a14', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
          {[
            { label: 'Premium per share',      value: `$${premium.toFixed(2)}` },
            { label: `× ${numContracts} contracts × 100`, value: '' },
            { label: 'Total cost',             value: `$${totalCost.toFixed(2)}`, bold: true, color: exceedsBalance ? '#ff4444' : '#e8e8f0' },
            { label: 'Max loss',               value: `$${totalCost.toFixed(2)}`, bold: true, color: '#ff444488' },
            { label: 'Available balance',      value: `$${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
          ].map(({ label, value, bold, color: c }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--fs-lg)', color: '#8899bb' }}>{label}</span>
              {value && <span style={{ fontSize: bold ? 13 : 11, fontWeight: bold ? 700 : 400, color: c || '#7788aa' }}>{value}</span>}
            </div>
          ))}
        </div>

        {exceedsBalance && (
          <div style={{ fontSize: 'var(--fs-lg)', color: '#ff4444', background: '#ff444411',
            border: '1px solid #ff444433', borderRadius: 5, padding: '6px 10px', marginBottom: 12 }}>
            ⚠ Exceeds balance — max {maxContracts} contract{maxContracts !== 1 ? 's' : ''}
            <button onClick={() => setContracts(String(maxContracts))} style={{
              marginLeft: 8, fontSize: 'var(--fs-body)', cursor: 'pointer', background: 'none',
              border: '1px solid #ff444466', color: '#ff4444', borderRadius: 3,
              padding: '1px 6px', fontFamily: 'inherit',
            }}>USE MAX</button>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 'var(--fs-md)', color: '#ff4444', background: '#ff444411',
            border: '1px solid #ff444433', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 6, cursor: 'pointer',
            background: 'none', border: '1px solid #2a2a3e', color: '#8899bb',
            fontFamily: 'inherit', fontSize: 'var(--fs-body)',
          }}>CANCEL</button>
          <button onClick={confirm} disabled={loading || exceedsBalance || numContracts < 1} style={{
            flex: 2, padding: '12px', borderRadius: 6, cursor: 'pointer',
            background: `${color}22`, border: `1px solid ${color}`,
            color, fontFamily: 'inherit', fontSize: 'var(--fs-body)', fontWeight: 700,
            letterSpacing: '0.08em', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'ADDING...' : `BUY ${numContracts} ${side} CONTRACT${numContracts > 1 ? 'S' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}