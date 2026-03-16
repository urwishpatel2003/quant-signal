export default function TradeChecklist({ ta, priceSignal, optionsSignal, calendar, selectedExpiry }) {
  if (!ta || !priceSignal || !optionsSignal) return null;

  const rec     = optionsSignal.recommendation;
  const isCall  = rec === 'CALL';

  const earningsWarning = calendar?.some(e =>
    ['earnings', 'results', 'quarterly'].some(k => e.title?.toLowerCase().includes(k))
  );

  const checks = [
    {
      label: 'Trend aligned with trade',
      pass:  isCall ? ta.trendSignal === 'BULLISH' : ta.trendSignal === 'BEARISH',
      note:  `SMA20 ${ta.trendSignal === 'BULLISH' ? '>' : '<'} SMA50 — ${ta.trendSignal}`,
    },
    {
      label: 'RSI not in danger zone',
      pass:  isCall ? ta.rsi14 < 70 : ta.rsi14 > 30,
      note:  `RSI at ${ta.rsi14} — ${ta.rsiSignal}`,
    },
    {
      label: 'Price signal confirms direction',
      pass:  isCall ? priceSignal.signal === 'BUY' : priceSignal.signal === 'SELL',
      note:  `Signal: ${priceSignal.signal} at ${priceSignal.confidence}% confidence — needs ${isCall ? 'BUY' : 'SELL'} for GO`,
    },
    {
      label: 'Volume confirms move',
      pass:  ta.volumeSignal !== 'LOW',
      note:  `Volume ${ta.volumeRatio}x average — ${ta.volumeSignal}`,
    },
    {
      label: 'Macro environment supports trade',
      pass:  isCall
        ? priceSignal.macroImpact === 'BULLISH'
        : priceSignal.macroImpact === 'BEARISH',
      note:  `Macro: ${priceSignal.macroImpact} — needs ${isCall ? 'BULLISH' : 'BEARISH'} for GO`,
    },
    {
      label: isCall ? 'No earnings risk (IV crush)' : 'Earnings as catalyst (optional)',
      pass:  isCall ? !earningsWarning : true,
      note:  isCall
        ? (earningsWarning
            ? '⚠ Earnings before expiry — IV crush will kill call value after report'
            : 'No earnings detected — safe to hold through expiry')
        : (earningsWarning
            ? '✓ Earnings detected — could accelerate downside move for puts'
            : 'No earnings — put relies on technical/macro breakdown only'),
    },
    {
      label: 'IV environment is favorable',
      pass:  isCall
        ? (optionsSignal.ivRank === 'LOW' || optionsSignal.ivRank === 'MEDIUM')
        : (optionsSignal.ivRank === 'HIGH' || optionsSignal.ivRank === 'MEDIUM'),
      note:  isCall
        ? `IV is ${optionsSignal.ivRank} — low IV favors buying calls (cheaper premium)`
        : `IV is ${optionsSignal.ivRank} — high IV means puts are priced for a big move`,
    },
  ];

  const passCount  = checks.filter(c => c.pass).length;
  const score      = Math.round((passCount / checks.length) * 100);
  const scoreColor = score >= 70 ? '#00ff88' : score >= 50 ? '#ffaa00' : '#ff4444';
  const verdict    = score >= 70 ? 'GO' : score >= 50 ? 'CAUTION' : 'NO-GO';

  return (
    <div className="card" style={{ borderColor: scoreColor + '44' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em' }}>✅ TRADE CHECKLIST · {isCall ? 'CALL' : 'PUT'}</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor }}>{verdict}</div>
          <div style={{ fontSize: 10, color: '#555' }}>{passCount}/{checks.length} checks passed</div>
        </div>
      </div>

      <div className="bar-bg" style={{ marginBottom: 12 }}>
        <div className="bar-fill" style={{ width: `${score}%`, background: scoreColor }} />
      </div>

      {checks.map((c, i) => (
        <div key={i} style={{
          display: 'flex', gap: 10, padding: '7px 0',
          borderBottom: i < checks.length - 1 ? '1px solid #1a1a26' : 'none',
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 14, lineHeight: 1.2, flexShrink: 0 }}>{c.pass ? '✅' : '❌'}</span>
          <div>
            <div style={{ fontSize: 12, color: c.pass ? '#c8c8d0' : '#667', fontWeight: c.pass ? 500 : 400 }}>
              {c.label}
            </div>
            <div style={{ fontSize: 11, color: '#445', marginTop: 2 }}>{c.note}</div>
          </div>
        </div>
      ))}

      {/* Summary message */}
      <div style={{ marginTop: 12, padding: '10px', background: scoreColor + '11', borderLeft: `3px solid ${scoreColor}`, fontSize: 12, color: scoreColor }}>
        {verdict === 'GO'      && `✓ Strong setup for ${isCall ? 'CALL' : 'PUT'} — most signals aligned. Reasonable to enter.`}
        {verdict === 'CAUTION' && `⚠ Mixed signals for ${isCall ? 'CALL' : 'PUT'} — consider half size or wait for confirmation.`}
        {verdict === 'NO-GO'   && `✗ Too many signals against this ${isCall ? 'CALL' : 'PUT'} — skip or wait for better setup.`}
      </div>
    </div>
  );
}