export default function EarningsWarning({ ticker, calendar, selectedExpiry }) {
  if (!calendar || !selectedExpiry) return null;

  const earningsKeywords = ['earnings', 'results', 'quarterly', 'eps', 'revenue report'];
  const tickerUpper = ticker?.toUpperCase();

  const earningsEvents = calendar.filter(e =>
    earningsKeywords.some(k => e.title?.toLowerCase().includes(k)) ||
    e.title?.toUpperCase().includes(tickerUpper)
  );

  if (earningsEvents.length === 0) return null;

  const expiryDate = new Date(selectedExpiry);
  const today = new Date();
  const daysToExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

  return (
    <div style={{
      background: '#1a0800', border: '1px solid #ff440044', borderLeft: '3px solid #ff4400',
      padding: '10px 14px', marginBottom: 12, borderRadius: 4
    }}>
      <div style={{ fontSize: 11, color: '#ff6622', fontWeight: 700, marginBottom: 4 }}>
        ⚠ EARNINGS RISK WINDOW
      </div>
      <div style={{ fontSize: 11, color: '#aa6644', lineHeight: 1.6 }}>
        Earnings events detected near your <span style={{ color: '#ffaa00' }}>{selectedExpiry}</span> expiry
        ({daysToExpiry} days). Options premiums may be elevated due to IV crush risk.
        Consider buying <strong style={{ color: '#ff8844' }}>after</strong> earnings or using a spread to reduce premium cost.
      </div>
      <div style={{ marginTop: 8 }}>
        {earningsEvents.slice(0, 2).map((e, i) => (
          <div key={i} style={{ fontSize: 10, color: '#664433', padding: '2px 0' }}>→ {e.title}</div>
        ))}
      </div>
    </div>
  );
}