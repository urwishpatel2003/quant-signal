export default function TradeSetupCard({ optionsSignal, priceSignal, ticker, selectedExpiry }) {
  if (!optionsSignal || !priceSignal) return null;

  const isCall   = optionsSignal.recommendation === 'CALL';
  const contract = isCall ? optionsSignal.bestCall : optionsSignal.bestPut;
  if (!contract) return null;

  const typeColor  = isCall ? '#00ff88' : '#ff4444';
  const typeLabel  = isCall ? 'CALL' : 'PUT';

  return (
    <div className="card" style={{ borderColor: typeColor + '33' }}>
      <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 14 }}>
        📋 TRADE SETUP — PLAIN ENGLISH
      </div>

      {/* Step 1 — What to buy */}
      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#070710', borderLeft: `3px solid ${typeColor}` }}>
        <div style={{ fontSize: 9, color: '#445', marginBottom: 4, letterSpacing: '0.1em' }}>STEP 1 — WHAT TO BUY</div>
        <div style={{ fontSize: 13, color: '#c8c8d0', lineHeight: 1.7 }}>
          Buy <span style={{ color: typeColor, fontWeight: 700 }}>{ticker} ${contract.strike} {typeLabel}</span> expiring{' '}
          <span style={{ color: '#ffaa00' }}>{selectedExpiry}</span>
          {' '}at <span style={{ color: '#fff', fontWeight: 600 }}>${contract.mid?.toFixed(2)} per contract</span>
          {' '}({contract.maxContracts} contracts = <span style={{ color: '#ffaa00' }}>${contract.totalCost?.toFixed(0)} total</span>)
        </div>
      </div>

      {/* Step 2 — When to enter */}
      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#070710', borderLeft: '3px solid #ffaa00' }}>
        <div style={{ fontSize: 9, color: '#445', marginBottom: 4, letterSpacing: '0.1em' }}>STEP 2 — WHEN TO ENTER</div>
        <div style={{ fontSize: 13, color: '#c8c8d0', lineHeight: 1.7 }}>
          {contract.entryTiming || '—'}
        </div>
      </div>

      {/* Step 3 — When to exit */}
      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#070710', borderLeft: '3px solid #ff4444' }}>
        <div style={{ fontSize: 9, color: '#445', marginBottom: 4, letterSpacing: '0.1em' }}>STEP 3 — WHEN TO EXIT</div>
        <div style={{ fontSize: 13, color: '#c8c8d0', lineHeight: 1.7 }}>
          {contract.exitRule || '—'}
        </div>
      </div>

      {/* Step 4 — Target vs Max loss */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ padding: '10px 14px', background: '#070710', borderLeft: '3px solid #00ff88' }}>
          <div style={{ fontSize: 9, color: '#445', marginBottom: 4, letterSpacing: '0.1em' }}>🎯 TARGET RETURN</div>
          <div style={{ fontSize: 13, color: '#00ff88', fontWeight: 600 }}>{contract.targetReturn || '—'}</div>
        </div>
        <div style={{ padding: '10px 14px', background: '#070710', borderLeft: '3px solid #ff4444' }}>
          <div style={{ fontSize: 9, color: '#445', marginBottom: 4, letterSpacing: '0.1em' }}>🛑 MAX LOSS</div>
          <div style={{ fontSize: 13, color: '#ff4444', fontWeight: 600 }}>${contract.maxLoss?.toFixed(0) || '—'} (full premium paid)</div>
        </div>
      </div>

      {/* Why this trade */}
      {contract.thesis && (
        <div style={{ padding: '10px 14px', background: '#070710', borderLeft: '3px solid #ffaa0044' }}>
          <div style={{ fontSize: 9, color: '#445', marginBottom: 4, letterSpacing: '0.1em' }}>💡 WHY THIS TRADE</div>
          <div style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.6, fontStyle: 'italic' }}>{contract.thesis}</div>
        </div>
      )}
    </div>
  );
}