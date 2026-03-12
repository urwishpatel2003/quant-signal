export default function TechnicalPanel({ ta }) {
  if (!ta) return null;

  const rsiColor  = ta.rsi14 > 70 ? '#ff4444' : ta.rsi14 < 30 ? '#00ff88' : '#ffaa00';
  const trendColor = ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444';
  const volColor   = ta.volumeSignal === 'HIGH' ? '#ffaa00' : ta.volumeSignal === 'LOW' ? '#445' : '#c8c8d0';

  const RsiBar = () => {
    const pct = ta.rsi14 || 50;
    return (
      <div style={{ position: 'relative', height: 6, background: '#1a1a26', borderRadius: 3, marginTop: 4 }}>
        <div style={{ position: 'absolute', left: '0%', width: '30%', height: '100%', background: '#00ff8822', borderRadius: '3px 0 0 3px' }} />
        <div style={{ position: 'absolute', left: '70%', width: '30%', height: '100%', background: '#ff444422', borderRadius: '0 3px 3px 0' }} />
        <div style={{ position: 'absolute', left: `${pct}%`, top: -2, width: 3, height: 10, background: rsiColor, borderRadius: 2, transform: 'translateX(-50%)' }} />
      </div>
    );
  };

  return (
    <div className="card">
      <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 12 }}>📐 TECHNICAL ANALYSIS</div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: 10, color: '#556' }}>RSI (14)</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: rsiColor }}>{ta.rsi14} — {ta.rsiSignal}</span>
        </div>
        <RsiBar />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: 9, color: '#00ff8844' }}>OVERSOLD 30</span>
          <span style={{ fontSize: 9, color: '#ff444444' }}>70 OVERBOUGHT</span>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#556', marginBottom: 6 }}>MOVING AVERAGES</div>
        {[
          ['SMA 20', ta.sma20, ta.priceVsSma20],
          ['SMA 50', ta.sma50, ta.priceVsSma50],
        ].map(([label, val, pct]) => val && (
          <div key={label} className="kv">
            <span className="kv-key">{label}</span>
            <span style={{ textAlign: 'right' }}>
              <span style={{ color: '#c8c8d0', fontSize: 11 }}>${val}</span>
              <span style={{ color: parseFloat(pct) >= 0 ? '#00ff88' : '#ff4444', fontSize: 10, marginLeft: 6 }}>
                {parseFloat(pct) >= 0 ? '▲' : '▼'}{Math.abs(pct)}%
              </span>
            </span>
          </div>
        ))}
        <div className="kv">
          <span className="kv-key">TREND</span>
          <span style={{ color: trendColor, fontSize: 11, fontWeight: 600 }}>
            {ta.trendSignal === 'BULLISH' ? '▲ SMA20 > SMA50' : '▼ SMA20 < SMA50'}
          </span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: '#556', marginBottom: 6 }}>VOLUME</div>
        <div className="kv">
          <span className="kv-key">TODAY</span>
          <span style={{ color: volColor, fontSize: 11 }}>{ta.currentVolume?.toLocaleString()}</span>
        </div>
        <div className="kv">
          <span className="kv-key">20D AVG</span>
          <span style={{ color: '#667', fontSize: 11 }}>{ta.avgVolume?.toLocaleString()}</span>
        </div>
        <div className="kv">
          <span className="kv-key">RATIO</span>
          <span style={{ color: volColor, fontSize: 11, fontWeight: 600 }}>
            {ta.volumeRatio}x — {ta.volumeSignal}
          </span>
        </div>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${Math.min((ta.volumeRatio || 1) * 50, 100)}%`, background: volColor }} />
        </div>
      </div>
    </div>
  );
}