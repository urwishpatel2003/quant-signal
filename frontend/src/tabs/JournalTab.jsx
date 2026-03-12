import { useState } from 'react';

export default function PLSimulator({ optionsSignal, livePrice }) {
  const [movePct, setMovePct] = useState(0);
  if (!optionsSignal || !livePrice) return null;

  const isCall   = optionsSignal.recommendation === 'CALL';
  const contract = isCall ? optionsSignal.bestCall : optionsSignal.bestPut;
  if (!contract) return null;

  const strike    = parseFloat(contract.strike);
  const premium   = contract.estimatedPremium || contract.mid || 0;
  const contracts = contract.maxContracts || 1;
  const totalCost = premium * 100 * contracts;

  const newPrice     = livePrice * (1 + movePct / 100);
  const intrinsic    = isCall
    ? Math.max(0, newPrice - strike)
    : Math.max(0, strike - newPrice);
  const estValue     = Math.max(0, intrinsic * 0.7 + premium * 0.3 * (1 - Math.abs(movePct) / 20));
  const plPerShare   = estValue - premium;
  const totalPL      = plPerShare * 100 * contracts;
  const plPct        = ((totalPL / totalCost) * 100).toFixed(0);
  const plColor      = totalPL >= 0 ? '#00ff88' : '#ff4444';

  const breakeven = isCall
    ? (strike + premium).toFixed(2)
    : (strike - premium).toFixed(2);

  return (
    <div className="card">
      <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 12 }}>
        🎮 P&L SIMULATOR
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#667' }}>
            If {optionsSignal.ticker || 'stock'} moves <span style={{ color: movePct >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>{movePct >= 0 ? '+' : ''}{movePct}%</span>
          </span>
          <span style={{ fontSize: 11, color: '#556' }}>
            ${livePrice?.toFixed(2)} → <span style={{ color: '#ffaa00' }}>${newPrice?.toFixed(2)}</span>
          </span>
        </div>

        <input type="range" min="-20" max="20" step="0.5" value={movePct}
          onChange={e => setMovePct(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: '#ffaa00', cursor: 'pointer' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#334', marginTop: 2 }}>
          <span>-20%</span><span>0</span><span>+20%</span>
        </div>
      </div>

      <div style={{
        background: '#0a0a15', border: `1px solid ${plColor}33`,
        padding: '12px 16px', borderRadius: 4, textAlign: 'center', marginBottom: 12
      }}>
        <div style={{ fontSize: 10, color: '#445', marginBottom: 4 }}>ESTIMATED P&L</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: plColor }}>
          {totalPL >= 0 ? '+' : ''}${totalPL?.toFixed(0)}
        </div>
        <div style={{ fontSize: 12, color: plColor, opacity: 0.7 }}>
          {plPct >= 0 ? '+' : ''}{plPct}% on ${totalCost?.toFixed(0)} invested
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 10, color: '#445' }}>
        <div style={{ background: '#070710', padding: 8, textAlign: 'center' }}>
          <div style={{ marginBottom: 2 }}>BREAK-EVEN</div>
          <div style={{ color: '#ffaa00', fontSize: 12, fontWeight: 600 }}>${breakeven}</div>
        </div>
        <div style={{ background: '#070710', padding: 8, textAlign: 'center' }}>
          <div style={{ marginBottom: 2 }}>EST. CONTRACT VALUE</div>
          <div style={{ color: '#c8c8d0', fontSize: 12, fontWeight: 600 }}>${estValue?.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ fontSize: 9, color: '#334', marginTop: 10, textAlign: 'center' }}>
        ⚠ Simulation uses simplified Black-Scholes approximation. Actual P&L depends on IV, theta decay, and time to expiry.
      </div>
    </div>
  );
}