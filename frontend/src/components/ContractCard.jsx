export default function ContractCard({ data, type }) {
  if (!data) return null;
  const color    = type === 'CALL' ? '#00ff88' : '#ff4444';
  const colorDim = color + '33';

  return (
    <div className="card" style={{ borderColor: colorDim }}>
      <div style={{ fontSize: 10, color: color + '66', letterSpacing: '0.15em', marginBottom: 10 }}>
        {type === 'CALL' ? '🟢' : '🔴'} BEST {type} PLAY
      </div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color, marginBottom: 4 }}>
        ${data.strike} {type}
      </div>
      <div style={{ fontSize: 11, color: '#667', marginBottom: 12, display: 'flex', gap: 12 }}>
        <span>Exp: <span style={{ color: '#aaa' }}>{data.expiry}</span></span>
        {data.delta && <span>Δ <span style={{ color: '#aaa' }}>{data.delta}</span></span>}
        {data.iv    && <span>IV: <span style={{ color: '#ffaa00' }}>{data.iv}</span></span>}
      </div>

      <div style={{ background: '#070710', padding: 10, marginBottom: 10, border: `1px solid ${colorDim}` }}>
        <div style={{ fontSize: 9, color: '#445', marginBottom: 6 }}>LIVE CONTRACT PRICING</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          {[['BID', `$${data.bid?.toFixed(2)}`, '#ff6666'], ['MID', `$${data.mid?.toFixed(2)}`, color], ['ASK', `$${data.ask?.toFixed(2)}`, '#66ff88']].map(([l, v, c]) => (
            <div key={l}>
              <div style={{ fontSize: 9, color: '#445' }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {[
        ['PREMIUM/CONTRACT', `$${data.mid?.toFixed(2)} (mid)`],
        ['CONTRACTS',        `${data.maxContracts} × 100 shares`],
        ['TOTAL COST',       `$${data.totalCost?.toFixed(2)}`],
        ['TARGET RETURN',    data.targetReturn],
        ['MAX LOSS',         `$${data.maxLoss?.toFixed(2)}`],
        ['ENTRY',            data.entryTiming],
        ['EXIT RULE',        data.exitRule],
      ].map(([k, v]) => (
        <div className="kv" key={k}>
          <span className="kv-key">{k}</span>
          <span style={{ color: '#c8c8d0', fontSize: 11, fontWeight: 500, textAlign: 'right', maxWidth: '58%' }}>{v}</span>
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 11, color: '#8899aa', fontStyle: 'italic', lineHeight: 1.5 }}>{data.thesis}</div>
    </div>
  );
}
