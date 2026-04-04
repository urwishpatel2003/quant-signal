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

  const isCall     = side === 'CALL';
  const color      = isCall ? '#00ff88' : '#ff4444';
  const premium    = contract?.mid || contract?.estimatedPremium || 0;
  const strike     = contract?.strike || 0;
  const expiry     = contract?.expiry || '';
  const delta      = contract?.delta || '';
  const iv         = contract?.iv || '';
  const numContracts = parseInt(contracts) || 1;
  const totalCost  = premium * numContracts * 100;
  const balance    = availableBalance ?? 10000;
  const maxLoss    = totalCost; // long options: max loss = premium paid
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
        entryPrice:   premium,       // premium per share
        quantity:     numContracts,  // contracts
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
        <div style={{ fontSize: 12, color: '#556677', marginBottom: 20 }}>
          Virtual paper trade · Long {side.toLowerCase()} on {ticker}
        </div>

        {/* Contract details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'STRIKE',  value: `$${strike}`,   color: '#e8e8f0' },
            { label: 'EXPIRY',  value: expiry,          color: '#e8e8f0' },
            { label: 'PREMIUM', value: `$${premium.toFixed(2)}/sh`, color },
            { label: 'TYPE',    value: `${isCall ? '↑' : '↓'} ${side}`, color },
            { label: 'DELTA',   value: delta || '—',    color: '#7788aa' },
            { label: 'IV',      value: iv ? `${iv}%` : '—', color: '#ffaa00' },
          ].map(({ label, value, color: c }) => (
            <div key={label} style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: '#445', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Contracts input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#445', letterSpacing: '0.1em', marginBottom: 8 }}>
            NUMBER OF CONTRACTS
          </div>
          <input
            type="number" min="1" step="1" value={contracts}
            onChange={e => setContracts(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6,
              color: '#e8e8f0', fontSize: 18, fontWeight: 700, fontFamily: 'inherit',
              padding: '10px 14px', textAlign: 'right',
            }}
          />
          <div style={{ fontSize: 10, color: '#556677', marginTop: 4 }}>
            1 contract = 100 shares
          </div>
        </div>

        {/* Cost breakdown */}
        <div style={{ background: '#0a0a14', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
          {[
            { label: 'Premium per share', value: `$${premium.toFixed(2)}` },
            { label: `× ${numContracts} contracts × 100`, value: '' },
            { label: 'Total cost',        value: `$${totalCost.toFixed(2)}`, bold: true, color: exceedsBalance ? '#ff4444' : '#e8e8f0' },
            { label: 'Max loss',          value: `$${maxLoss.toFixed(2)}`,   bold: true, color: '#ff444488' },
            { label: 'Available balance', value: `$${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
          ].map(({ label, value, bold, color: c }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#556677' }}>{label}</span>
              {value && <span style={{ fontSize: bold ? 13 : 11, fontWeight: bold ? 700 : 400, color: c || '#7788aa' }}>{value}</span>}
            </div>
          ))}
        </div>

        {exceedsBalance && (
          <div style={{ fontSize: 11, color: '#ff4444', background: '#ff444411',
            border: '1px solid #ff444433', borderRadius: 5, padding: '6px 10px', marginBottom: 12 }}>
            ⚠ Exceeds balance — max {maxContracts} contract{maxContracts !== 1 ? 's' : ''}
            <button onClick={() => setContracts(String(maxContracts))} style={{
              marginLeft: 8, fontSize: 10, cursor: 'pointer', background: 'none',
              border: '1px solid #ff444466', color: '#ff4444', borderRadius: 3,
              padding: '1px 6px', fontFamily: 'inherit',
            }}>USE MAX</button>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: '#ff4444', background: '#ff444411',
            border: '1px solid #ff444433', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 6, cursor: 'pointer',
            background: 'none', border: '1px solid #2a2a3e', color: '#556677',
            fontFamily: 'inherit', fontSize: 13,
          }}>CANCEL</button>
          <button onClick={confirm} disabled={loading || exceedsBalance || numContracts < 1} style={{
            flex: 2, padding: '12px', borderRadius: 6, cursor: 'pointer',
            background: `${color}22`, border: `1px solid ${color}`,
            color, fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            letterSpacing: '0.08em', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'ADDING...' : `BUY ${numContracts} ${side} CONTRACT${numContracts > 1 ? 'S' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
  
}