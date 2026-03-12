// ETFs and indices that never have earnings
const ETF_EXCLUSIONS = new Set([
  'SPY','QQQ','IWM','DIA','VXX','UVXY','SQQQ','TQQQ','SPXU','SPXL',
  'TLT','IEF','SHY','GLD','SLV','GDX','GDXJ','USO','UNG','XLE','XLF',
  'XLK','XLV','XLI','XLU','XLP','XLB','XLRE','XLY','XLC','VIX','DXY',
  'EEM','EFA','VTI','VOO','VEA','VWO','ARKK','ARKG','ARKW','ARKF',
]);

// Must contain these specific earnings-related phrases — not just any "results"
const EARNINGS_PHRASES = [
  'earnings report', 'earnings release', 'earnings per share',
  'quarterly earnings', 'quarterly results', 'q1 earnings', 'q2 earnings',
  'q3 earnings', 'q4 earnings', 'fiscal earnings', 'eps report',
  'profit report', 'annual results', 'full year results',
];

export default function EarningsWarning({ ticker, calendar, selectedExpiry }) {
  if (!calendar || !selectedExpiry || !ticker) return null;

  // Never show for ETFs or indices
  if (ETF_EXCLUSIONS.has(ticker?.toUpperCase())) return null;

  const tickerUpper = ticker.toUpperCase();

  const earningsEvents = calendar.filter(e => {
    const title = e.title?.toLowerCase() || '';
    // Must match a specific earnings phrase AND mention the ticker,
    // OR be a very specific earnings headline
    const hasEarningsPhrase = EARNINGS_PHRASES.some(p => title.includes(p));
    const mentionsTicker    = e.title?.toUpperCase().includes(tickerUpper);
    return hasEarningsPhrase && mentionsTicker;
  });

  if (earningsEvents.length === 0) return null;

  const expiryDate    = new Date(selectedExpiry);
  const today         = new Date();
  const daysToExpiry  = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

  return (
    <div style={{
      background: '#1a0800', border: '1px solid #ff440044', borderLeft: '3px solid #ff4400',
      padding: '10px 14px', marginBottom: 12, borderRadius: 4
    }}>
      <div style={{ fontSize: 11, color: '#ff6622', fontWeight: 700, marginBottom: 4 }}>
        ⚠ EARNINGS RISK WINDOW — {tickerUpper}
      </div>
      <div style={{ fontSize: 11, color: '#aa6644', lineHeight: 1.6 }}>
        Earnings detected near your <span style={{ color: '#ffaa00' }}>{selectedExpiry}</span> expiry
        ({daysToExpiry} days). IV crush after the report can kill option value even if price moves your way.
        Consider buying <strong style={{ color: '#ff8844' }}>after</strong> earnings or using a spread.
      </div>
      <div style={{ marginTop: 8 }}>
        {earningsEvents.slice(0, 2).map((e, i) => (
          <div key={i} style={{ fontSize: 10, color: '#664433', padding: '2px 0' }}>→ {e.title}</div>
        ))}
      </div>
    </div>
  );
}