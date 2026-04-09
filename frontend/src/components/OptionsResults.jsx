// src/components/OptionsResults.jsx
import { useState } from 'react';
import { SC } from '../utils/constants';
import MiniChart     from './MiniChart';
import PLSimulator   from './PLSimulator';
import TradeChecklist from './TradeChecklist';
import EarningsWarning from './EarningsWarning';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n, d = 2) => n != null ? parseFloat(n).toFixed(d) : '—';
const fmtP = (n) => n != null ? `$${fmt(n)}` : '—';

function classifyStrike(delta, type) {
  const d = Math.abs(parseFloat(delta) || 0);
  if (type === 'CALL') {
    if (d >= 0.60) return 'ITM';
    if (d >= 0.40) return 'ATM';
    return 'OTM';
  } else {
    if (d >= 0.60) return 'ITM';
    if (d >= 0.40) return 'ATM';
    return 'OTM';
  }
}

const MONEYNESS_COLOR = { ITM: '#4488ff', ATM: '#ffaa00', OTM: '#00ff88' };
const MONEYNESS_DESC  = {
  ITM: 'In the Money — lower leverage, higher cost, more delta',
  ATM: 'At the Money — balanced leverage and cost',
  OTM: 'Out of the Money — higher leverage, lower cost, needs bigger move',
};

// ── Strike Row ────────────────────────────────────────────────────────────────
function StrikeRow({ contract, type, recommended, onSimulate, simAdded, canSim }) {
  const moneyness = classifyStrike(contract.delta, type);
  const mColor    = MONEYNESS_COLOR[moneyness];
  const isRec     = recommended;
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{
      background:   isRec ? (type === 'CALL' ? '#00ff8808' : '#ff444408') : '#0c0c18',
      border:       `1px solid ${isRec ? (type === 'CALL' ? '#00ff8844' : '#ff444444') : '#1a1a2e'}`,
      borderLeft:   `3px solid ${mColor}`,
      borderRadius: 6, padding: '14px 16px',
      position:     'relative',
    }}>
      {/* Recommended badge */}
      {isRec && (
        <div style={{
          position: 'absolute', top: -1, right: 12,
          background: type === 'CALL' ? '#00ff88' : '#ff4444',
          color: '#08080f', fontSize: 'var(--fs-xs)', fontWeight: 700,
          padding: '2px 8px', borderRadius: '0 0 4px 4px', letterSpacing: '.08em',
        }}>★ RECOMMENDED</div>
      )}

      {/* Row 1: Strike + moneyness + premium + sim button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#fff', lineHeight: 1 }}>
            ${contract.strike}
          </div>
          <div style={{
            fontSize: 'var(--fs-xs)', fontWeight: 700, color: mColor,
            background: mColor + '18', border: `1px solid ${mColor}44`,
            padding: '2px 7px', borderRadius: 3, letterSpacing: '.06em',
          }}>{moneyness}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#556677' }}>{MONEYNESS_DESC[moneyness].split(' — ')[0]}</div>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#556677', marginBottom: 1 }}>PREMIUM</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#c8d8f0', lineHeight: 1 }}>${fmt(contract.mid)}</div>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#445566' }}>${fmt(contract.bid)} / ${fmt(contract.ask)}</div>
        </div>
      </div>

      {/* Row 2: Greeks + Volume/OI + Cost — 3 even columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: onSimulate ? 10 : 0 }}>
        {/* Greeks */}
        <div style={{ background: '#08080f', borderRadius: 4, padding: '8px 10px' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#556677', marginBottom: 5, letterSpacing: '.06em' }}>GREEKS</div>
          {[
            ['Δ', fmt(contract.delta, 3), '#c8d8f0'],
            ['θ', fmt(contract.theta, 3), '#ff4444'],
            ['IV', `${contract.iv}%`, '#ffaa00'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: '#556677' }}>{l}</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: c, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Volume / OI / Spread */}
        <div style={{ background: '#08080f', borderRadius: 4, padding: '8px 10px' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#556677', marginBottom: 5, letterSpacing: '.06em' }}>FLOW</div>
          {[
            ['Vol', `${contract.volume?.toLocaleString()}${contract.unusualVolume ? ' 🔥' : ''}`, '#c8d8f0'],
            ['OI',  contract.oi?.toLocaleString(), '#c8d8f0'],
            ['Sprd', `${contract.spreadPct}%${contract.wideSpread ? ' ⚠' : ''}`, contract.wideSpread ? '#ff4444' : '#00ff88'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: '#556677' }}>{l}</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: c, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* 1 Contract cost */}
        <div style={{ background: '#08080f', borderRadius: 4, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#556677', marginBottom: 5, letterSpacing: '.06em' }}>1 CONTRACT</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ffaa00', lineHeight: 1, marginBottom: 3 }}>
            ${fmt(contract.mid * 100, 0)}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#445566' }}>100 × ${fmt(contract.mid)}</div>
        </div>
      </div>

      {/* Simulate button — full width on mobile */}
      {onSimulate && (
        <button
          onClick={() => !simAdded && canSim && onSimulate()}
          disabled={simAdded || !canSim}
          style={{
            width: '100%', padding: '9px', borderRadius: 4,
            background: simAdded ? '#00ff8811' : type === 'CALL' ? '#00ff8811' : '#ff444411',
            border: `1px solid ${simAdded ? '#00ff8844' : type === 'CALL' ? '#00ff8844' : '#ff444444'}`,
            color: simAdded ? '#00ff88' : type === 'CALL' ? '#00ff88' : '#ff4444',
            cursor: simAdded || !canSim ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700,
            opacity: !canSim && !simAdded ? 0.5 : 1, letterSpacing: '.06em',
          }}
        >{simAdded ? '✓ ADDED TO SIMULATOR' : '📊 SIMULATE THIS CONTRACT'}</button>
      )}

      {/* Thesis if recommended */}
      {isRec && contract.thesis && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: '1px solid #1a1a2e',
          fontSize: 'var(--fs-sm)', color: '#99aacc', lineHeight: 1.7, fontStyle: 'italic',
        }}>
          {contract.thesis}
        </div>
      )}
    </div>
  );
}

// ── Sim Modal ─────────────────────────────────────────────────────────────────
function OptionsSimModal({ ticker, side, contract, livePrice, availableBalance, onConfirm, onClose }) {
  const [contracts, setContracts] = useState('1');
  const n       = parseInt(contracts) || 1;
  const premium = contract?.mid || 0;
  const total   = premium * 100 * n;
  const canAfford = availableBalance == null || total <= availableBalance;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0f0f1a', border: '1px solid #2a2a40', borderRadius: 8,
        padding: 28, width: '100%', maxWidth: 420,
      }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: side === 'CALL' ? '#00ff88' : '#ff4444', marginBottom: 4 }}>
          SIMULATE {side}
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', color: '#8899bb', marginBottom: 20 }}>
          {ticker} ${contract?.strike} {side} @ ${fmt(premium)}/contract
        </div>
        {availableBalance != null && (
          <div style={{ fontSize: 'var(--fs-sm)', color: '#8899bb', marginBottom: 12 }}>
            Available: <span style={{ color: '#ffaa00', fontWeight: 700 }}>${availableBalance?.toLocaleString()}</span>
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 'var(--fs-sm)', color: '#8899bb', display: 'block', marginBottom: 6 }}>CONTRACTS</label>
          <input
            type="number" min="1" max="100" value={contracts}
            onChange={e => setContracts(e.target.value)}
            className="input" style={{ width: 100 }}
          />
        </div>
        <div style={{ background: '#070710', padding: '12px 14px', borderRadius: 4, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: '#8899bb' }}>Total cost</span>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: canAfford ? '#ffaa00' : '#ff4444' }}>
              ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: '#8899bb' }}>Max loss</span>
            <span style={{ fontSize: 'var(--fs-sm)', color: '#ff4444' }}>${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          {!canAfford && (
            <div style={{ fontSize: 'var(--fs-sm)', color: '#ff4444', marginTop: 8 }}>⚠ Insufficient balance</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="btn-sm" style={{ flex: 1 }}>CANCEL</button>
          <button
            disabled={!canAfford || n < 1}
            onClick={() => onConfirm({ ticker, side, contract, contracts: n, premium, totalCost: total, expiry: contract?.expiry, livePrice, position_type: 'OPTION', option_type: side, strike: contract?.strike })}
            style={{
              flex: 2, padding: '10px', borderRadius: 4,
              background: side === 'CALL' ? '#00ff8818' : '#ff444418',
              border: `1px solid ${side === 'CALL' ? '#00ff8866' : '#ff444466'}`,
              color: side === 'CALL' ? '#00ff88' : '#ff4444',
              cursor: canAfford && n >= 1 ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', fontSize: 'var(--fs-body)', fontWeight: 700, letterSpacing: '.08em',
              opacity: canAfford && n >= 1 ? 1 : 0.5,
            }}
          >OPEN POSITION →</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function OptionsResults({
  ticker, livePrice, changePct, ohlcv,
  priceSignal, optionsSignal, chain,
  ta, macro, selectedExpiry, termStructure,
  onBack, onAddToSim, getSimBalance,
}) {
  const [showSimModal,  setShowSimModal]  = useState(null);
  const [simBalance,    setSimBalance]    = useState(null);
  const [simAdded,      setSimAdded]      = useState({});
  const [showChecklist, setShowChecklist] = useState(false);
  const [showPL,        setShowPL]        = useState(false);

  const recommendation = optionsSignal.recommendation || 'CALL';
  const isNeutral      = recommendation === 'NEUTRAL';
  const recColor       = recommendation === 'CALL' ? '#00ff88' : recommendation === 'PUT' ? '#ff4444' : '#ffaa00';
  const ivColor        = optionsSignal.ivRank === 'LOW' ? '#00ff88' : optionsSignal.ivRank === 'HIGH' ? '#ff4444' : '#ffaa00';

  // Pick which side to show — single direction based on recommendation
  const activeSide     = isNeutral ? null : recommendation;
  const rawContracts   = activeSide === 'CALL'
    ? (chain?.topCalls || [])
    : activeSide === 'PUT'
    ? (chain?.topPuts  || [])
    : [];

  // Build ATM/ITM/OTM trio — pick one of each moneyness
  const findByMoneyness = (contracts, target) =>
    contracts.find(c => classifyStrike(c.delta, activeSide) === target);

  const atmContract = findByMoneyness(rawContracts, 'ATM');
  const itmContract = findByMoneyness(rawContracts, 'ITM');
  const otmContract = findByMoneyness(rawContracts, 'OTM');

  // Recommended = the bestCall/bestPut from AI, matched by strike
  const aiRec = activeSide === 'CALL' ? optionsSignal.bestCall : optionsSignal.bestPut;
  const recommendedStrike = aiRec?.strike;

  // Build display list: ITM, ATM, OTM — deduplicated, with AI rec merged
  const displayContracts = [];
  const seen = new Set();
  [itmContract, atmContract, otmContract].forEach(c => {
    if (c && !seen.has(c.strike)) {
      seen.add(c.strike);
      displayContracts.push(c);
    }
  });
  // If AI recommended strike not in the trio, add it
  if (aiRec && !seen.has(recommendedStrike)) {
    const found = rawContracts.find(c => c.strike === recommendedStrike);
    if (found) { seen.add(recommendedStrike); displayContracts.unshift(found); }
  }

  const openSim = async (contract) => {
    if (getSimBalance) setSimBalance(await getSimBalance('US').catch(() => null));
    setShowSimModal(contract.strike);
  };

  const canSim = (confidence) => (confidence || 0) >= 60;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Sim Modal ── */}
      {showSimModal != null && (() => {
        const c = rawContracts.find(x => x.strike === showSimModal);
        return c ? (
          <OptionsSimModal
            ticker={ticker} side={activeSide} contract={c}
            livePrice={livePrice} availableBalance={simBalance}
            onConfirm={async (pos) => {
              await onAddToSim(pos);
              setSimAdded(prev => ({ ...prev, [showSimModal]: true }));
              setShowSimModal(null);
            }}
            onClose={() => setShowSimModal(null)}
          />
        ) : null;
      })()}

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid #2a2a40', color: '#c8d8f0',
          cursor: 'pointer', borderRadius: 4, padding: '8px 14px',
          fontSize: 'var(--fs-sm)', fontFamily: 'inherit', letterSpacing: '0.1em',
        }}>← BACK</button>
        <div style={{ fontSize: 'var(--fs-xs)', color: '#556677' }}>
          Expiry: <span style={{ color: '#ffaa00' }}>{selectedExpiry}</span>
        </div>
      </div>

      {/* ── Direction card — single, prominent ── */}
      <div style={{
        background: recColor + '0a', border: `1px solid ${recColor}33`,
        borderTop: `3px solid ${recColor}`, borderRadius: 8,
        padding: '20px 24px',
      }}>
        {/* Price + chart row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#fff', lineHeight: 1 }}>{ticker}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>${livePrice?.toFixed(2)}</div>
            <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: changePct >= 0 ? '#00ff88' : '#ff4444' }}>
              {changePct != null ? `${changePct >= 0 ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%` : ''}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}><MiniChart data={ohlcv} /></div>
        </div>

        {/* Direction + stats row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(26px,6vw,42px)', color: recColor, lineHeight: 1 }}>
            {isNeutral ? 'STAY NEUTRAL' : `BUY ${recommendation}S`}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', color: recColor + '88', letterSpacing: '.1em' }}>CONFIDENCE</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: recColor, lineHeight: 1 }}>{optionsSignal.confidence}%</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', color: ivColor + '88', letterSpacing: '.1em' }}>IV ENV</div>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: ivColor }}>{optionsSignal.ivRank}</div>
            </div>
            {priceSignal && (
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#8899bb', letterSpacing: '.1em' }}>STOCK</div>
                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: SC[priceSignal.signal] }}>{priceSignal.signal} {priceSignal.confidence}%</div>
              </div>
            )}
          </div>
        </div>

        {/* Reasoning */}
        <div style={{ fontSize: 'var(--fs-sm)', color: '#c8d8f0', lineHeight: 1.75, marginBottom: 2 }}>
          {optionsSignal.reasoning}
        </div>

        {/* IV + sizing notes */}
        {(optionsSignal.ivComment || optionsSignal.positionSizing) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {optionsSignal.ivComment && (
              <div style={{ background: '#070710', padding: '10px 14px', borderRadius: 4, fontSize: 'var(--fs-sm)', color: '#99aacc', lineHeight: 1.6 }}>
                📊 {optionsSignal.ivComment}
              </div>
            )}
            {optionsSignal.positionSizing && (
              <div style={{ background: '#070710', padding: '10px 14px', borderRadius: 4, fontSize: 'var(--fs-sm)', color: '#99aacc', lineHeight: 1.6 }}>
                💰 {optionsSignal.positionSizing}
              </div>
            )}
          </div>
        )}
      </div>

      <EarningsWarning ticker={ticker} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />

      {/* ── Quant Context Bar (Max Pain + Term Structure + Expected Move) ── */}
      {(chain || termStructure) && (() => {
        const maxPain = chain ? (() => {
          const strikes = [...new Set([...(chain.topCalls||[]).map(c=>c.strike), ...(chain.topPuts||[]).map(p=>p.strike)])].sort((a,b)=>a-b);
          let minPain=Infinity, mpStrike=null;
          for (const es of strikes) {
            let pain=0;
            for (const c of (chain.topCalls||[])) if (es>c.strike) pain+=(es-c.strike)*(c.oi||0)*100;
            for (const p of (chain.topPuts||[]))  if (es<p.strike) pain+=(p.strike-es)*(p.oi||0)*100;
            if (pain<minPain){minPain=pain;mpStrike=es;}
          }
          return mpStrike;
        })() : null;
        const spot       = livePrice;
        const mpDist     = maxPain && spot ? ((maxPain - spot) / spot * 100).toFixed(1) : null;
        const atMaxPain  = mpDist && Math.abs(parseFloat(mpDist)) < 1;
        const annualVol  = chain?.avgCallIV ? parseFloat(chain.avgCallIV) / 100 : null;
        const dte        = selectedExpiry ? Math.max(1, Math.ceil((new Date(selectedExpiry) - new Date()) / (1000*60*60*24))) : 30;
        const expMove    = annualVol && spot ? (spot * annualVol * Math.sqrt(dte/252)).toFixed(2) : null;
        const ts         = termStructure;
        return (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
            {maxPain && (
              <div style={{ background:'#0f0f1a', border:`1px solid ${atMaxPain?'#ffaa0044':'#1a1a2e'}`, borderRadius:6, padding:'12px 14px' }}>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', letterSpacing:'.1em', marginBottom:4 }}>MAX PAIN</div>
                <div style={{ fontSize:18, fontWeight:700, color: atMaxPain ? '#ffaa00' : '#c8d8f0' }}>${maxPain}</div>
                <div style={{ fontSize:'var(--fs-xs)', color: atMaxPain ? '#ffaa00' : '#556677', marginTop:2 }}>
                  {mpDist > 0 ? '+' : ''}{mpDist}% from spot{atMaxPain ? ' ⚠ PINNING RISK' : ''}
                </div>
              </div>
            )}
            {expMove && (
              <div style={{ background:'#0f0f1a', border:'1px solid #1a1a2e', borderRadius:6, padding:'12px 14px' }}>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', letterSpacing:'.1em', marginBottom:4 }}>1σ EXPECTED MOVE</div>
                <div style={{ fontSize:18, fontWeight:700, color:'#4488ff' }}>±${expMove}</div>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginTop:2 }}>{dte}d · {chain?.avgCallIV}% IV</div>
              </div>
            )}
            {chain && (
              <div style={{ background:'#0f0f1a', border:'1px solid #1a1a2e', borderRadius:6, padding:'12px 14px' }}>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', letterSpacing:'.1em', marginBottom:4 }}>IV ENVIRONMENT</div>
                <div style={{ fontSize:18, fontWeight:700, color: chain.ivPercentile>=80?'#ff4444':chain.ivPercentile<=20?'#00ff88':'#ffaa00' }}>
                  {chain.ivPercentile}th %ile
                </div>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginTop:2 }}>
                  {chain.ivPercentile>=80 ? 'EXPENSIVE — prefer ITM' : chain.ivPercentile<=20 ? 'CHEAP — OTM ok' : 'FAIR VALUE'}
                </div>
              </div>
            )}
            {ts && (
              <div style={{ background:'#0f0f1a', border:`1px solid ${ts.structure==='BACKWARDATION'?'#ff444433':'#1a1a2e'}`, borderRadius:6, padding:'12px 14px' }}>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', letterSpacing:'.1em', marginBottom:4 }}>TERM STRUCTURE</div>
                <div style={{ fontSize:'var(--fs-body)', fontWeight:700, color: ts.structure==='BACKWARDATION'?'#ff4444':ts.structure==='CONTANGO'?'#00ff88':'#ffaa00' }}>
                  {ts.structure}
                </div>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginTop:2 }}>
                  {ts.near?.avgIV}% near · {ts.far?.avgIV}% far
                </div>
              </div>
            )}
            {chain && (
              <div style={{ background:'#0f0f1a', border:'1px solid #1a1a2e', borderRadius:6, padding:'12px 14px' }}>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', letterSpacing:'.1em', marginBottom:4 }}>IV SKEW</div>
                <div style={{ fontSize:'var(--fs-body)', fontWeight:700, color: chain.ivSkewLabel==='PUT_SKEW'?'#ff4444':chain.ivSkewLabel==='CALL_SKEW'?'#00ff88':'#ffaa00' }}>
                  {chain.ivSkewLabel?.replace('_',' ')}
                </div>
                <div style={{ fontSize:'var(--fs-xs)', color:'#556677', marginTop:2 }}>
                  Put IV: {chain.avgPutIV}% · Call IV: {chain.avgCallIV}%
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Strike selection — ITM / ATM / OTM ── */}
      {!isNeutral && displayContracts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#556677', letterSpacing: '.2em', marginBottom: 10 }}>
            {recommendation} CONTRACTS — {selectedExpiry}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayContracts.map(contract => (
              <StrikeRow
                key={contract.strike}
                contract={contract}
                type={recommendation}
                recommended={contract.strike === recommendedStrike}
                onSimulate={onAddToSim ? () => openSim(contract) : null}
                simAdded={simAdded[contract.strike]}
                canSim={canSim(optionsSignal.confidence)}
              />
            ))}
          </div>
        </div>
      )}

      {isNeutral && (
        <div style={{
          background: '#ffaa0008', border: '1px solid #ffaa0022', borderRadius: 6,
          padding: '20px 24px', fontSize: 'var(--fs-body)', color: '#99aacc', lineHeight: 1.8,
        }}>
          ⚠ Neutral signal — no directional options play recommended. Consider waiting for a clearer setup or using a non-directional strategy (iron condor, straddle).
        </div>
      )}

      {/* ── Risks & Catalysts ── */}
      {(optionsSignal.catalysts?.length > 0 || optionsSignal.keyRisks?.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {optionsSignal.catalysts?.length > 0 && (
            <div className="card">
              <div style={{ fontSize: 'var(--fs-sm)', color: '#ffaa0099', marginBottom: 10, fontWeight: 700, letterSpacing: '.08em' }}>⚡ CATALYSTS</div>
              {optionsSignal.catalysts.map((c, i) => (
                <div key={i} style={{ fontSize: 'var(--fs-sm)', color: '#c8d8f0', padding: '5px 0', borderBottom: i < optionsSignal.catalysts.length - 1 ? '1px solid #1a1a26' : 'none', display: 'flex', gap: 8, lineHeight: 1.5 }}>
                  <span style={{ color: '#ffaa00', flexShrink: 0 }}>→</span>{c}
                </div>
              ))}
            </div>
          )}
          {optionsSignal.keyRisks?.length > 0 && (
            <div className="card">
              <div style={{ fontSize: 'var(--fs-sm)', color: '#ff444499', marginBottom: 10, fontWeight: 700, letterSpacing: '.08em' }}>⚠ KEY RISKS</div>
              {optionsSignal.keyRisks.map((r, i) => (
                <div key={i} style={{ fontSize: 'var(--fs-sm)', color: '#c8d8f0', padding: '5px 0', borderBottom: i < optionsSignal.keyRisks.length - 1 ? '1px solid #1a0f0f' : 'none', display: 'flex', gap: 8, lineHeight: 1.5 }}>
                  <span style={{ color: '#ff4444', flexShrink: 0 }}>!</span>{r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Expandable tools ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setShowChecklist(v => !v)} className="btn-sm" style={{ color: showChecklist ? '#ffaa00' : '#b0c0dd', borderColor: showChecklist ? '#ffaa0044' : '#3a3a5e' }}>
          {showChecklist ? '▲' : '▼'} TRADE CHECKLIST
        </button>
        <button onClick={() => setShowPL(v => !v)} className="btn-sm" style={{ color: showPL ? '#00ff88' : '#b0c0dd', borderColor: showPL ? '#00ff8844' : '#3a3a5e' }}>
          {showPL ? '▲' : '▼'} P&L SIMULATOR
        </button>
      </div>
      {showChecklist && (
        <TradeChecklist ta={ta} priceSignal={priceSignal} optionsSignal={{ ...optionsSignal, recommendation: activeSide || 'CALL' }} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />
      )}
      {showPL && aiRec && (
        <PLSimulator optionsSignal={{ ...optionsSignal, ticker, recommendation: activeSide || 'CALL' }} livePrice={livePrice} />
      )}

      <div style={{ fontSize: 'var(--fs-xs)', color: '#334455', textAlign: 'center', paddingTop: 4 }}>
        ⚠ NOT FINANCIAL ADVICE. OPTIONS INVOLVE SIGNIFICANT RISK OF LOSS.
      </div>
    </div>
  );
}