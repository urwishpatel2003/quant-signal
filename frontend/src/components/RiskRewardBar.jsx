export default function RiskRewardBar({ optionsSignal }) {
  if (!optionsSignal) return null;

  const isCall   = optionsSignal.recommendation === 'CALL';
  const contract = isCall ? optionsSignal.bestCall : optionsSignal.bestPut;
  if (!contract) return null;

  const premium    = contract.estimatedPremium || contract.mid || 0;
  const contracts  = contract.maxContracts || 1;
  const totalCost  = premium * 100 * contracts;
  const targetText = contract.targetReturn || '';

  // Parse target profit from string like "Sell at $3.78 per contract — total profit $1323"
  const profitMatch = targetText.match(/total profit \$?([\d,]+)/i);
  const targetProfit = profitMatch ? parseFloat(profitMatch[1].replace(',', '')) : totalCost;

  const maxLoss    = totalCost;
  const total      = targetProfit + maxLoss;
  const rewardPct  = Math.round((targetProfit / total) * 100);
  const riskPct    = 100 - rewardPct;
  const ratio      = (targetProfit / maxLoss).toFixed(1);

  const typeColor  = isCall ? '#00ff88' : '#ff4444';

  return (
    <div className="card">
      <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 14 }}>
        ⚖ RISK / REWARD
      </div>

      {/* Visual bar */}
      <div style={{ display: 'flex', height: 28, borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          width: `${riskPct}%`, background: '#ff444433',
          border: '1px solid #ff444466', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 10, color: '#ff4444', fontWeight: 600
        }}>
          RISK {riskPct}%
        </div>
        <div style={{
          width: `${rewardPct}%`, background: typeColor + '22',
          border: `1px solid ${typeColor}66`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 10, color: typeColor, fontWeight: 600
        }}>
          REWARD {rewardPct}%
        </div>
      </div>

      {/* Ratio */}
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 10, color: '#445' }}>RISK/REWARD RATIO  </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: parseFloat(ratio) >= 1.5 ? '#00ff88' : parseFloat(ratio) >= 1 ? '#ffaa00' : '#ff4444' }}>
          1 : {ratio}
        </span>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: '#070710', padding: 10, textAlign: 'center', borderLeft: '3px solid #ff444466' }}>
          <div style={{ fontSize: 9, color: '#445', marginBottom: 3 }}>MAX LOSS</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#ff4444' }}>-${maxLoss?.toFixed(0)}</div>
          <div style={{ fontSize: 9, color: '#334', marginTop: 2 }}>100% of premium</div>
        </div>
        <div style={{ background: '#070710', padding: 10, textAlign: 'center', borderLeft: `3px solid ${typeColor}66` }}>
          <div style={{ fontSize: 9, color: '#445', marginBottom: 3 }}>TARGET PROFIT</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: typeColor }}>+${targetProfit?.toFixed(0)}</div>
          <div style={{ fontSize: 9, color: '#334', marginTop: 2 }}>100% gain on premium</div>
        </div>
      </div>

      <div style={{ marginTop: 10, padding: '8px 12px', background: '#070710', fontSize: 11, color: '#667', textAlign: 'center' }}>
        Risking <span style={{ color: '#ff4444' }}>${maxLoss?.toFixed(0)}</span> to make{' '}
        <span style={{ color: typeColor }}>${targetProfit?.toFixed(0)}</span> —{' '}
        {parseFloat(ratio) >= 1.5
          ? <span style={{ color: '#00ff88' }}>favorable setup</span>
          : parseFloat(ratio) >= 1
          ? <span style={{ color: '#ffaa00' }}>acceptable setup</span>
          : <span style={{ color: '#ff4444' }}>poor risk/reward</span>}
      </div>
    </div>
  );
}