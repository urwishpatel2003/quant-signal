// ShareCard.jsx
// Renders a shareable card for signal results or simulator P&L
// Used inline (for preview) and on the public /share/:id page

const BASE = import.meta.env.VITE_API_BASE;

// ── Signal Card ───────────────────────────────────────────────────────────────
export function SignalCard({ data, compact = false }) {
  const {
    ticker, signal, confidence, priceTarget, stopLoss,
    thesis, timeframe, price, market, companyName,
    bullFactors = [], riskLevel, macroImpact,
  } = data;

  const sigColor  = signal === 'BUY' ? '#00ff88' : signal === 'SELL' ? '#ff4444' : '#ffaa00';
  const currency  = market === 'INDIA' ? '₹' : '$';
  const tfLabel   = { short: '1–5 Days', swing: '1–4 Weeks', position: '1–3 Months', longterm: '6–12 Months' }[timeframe] || timeframe;
  const riskColor = riskLevel === 'LOW' ? '#00ff88' : riskLevel === 'HIGH' ? '#ff4444' : '#ffaa00';

  return (
    <div id="share-card" style={{
      background: 'linear-gradient(135deg, #07070e 0%, #0f0f1a 60%, #12121f 100%)',
      border: `1px solid ${sigColor}44`,
      borderRadius: compact ? 10 : 14,
      padding: '20px 20px',
      width: '100%', maxWidth: 520, boxSizing: 'border-box',
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      position: 'relative', overflow: 'hidden',
      boxShadow: `0 0 40px ${sigColor}15, 0 8px 32px rgba(0,0,0,0.6)`,
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', top: -60, right: -60,
        width: 200, height: 200, borderRadius: '50%',
        background: `radial-gradient(circle, ${sigColor}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: compact ? 10 : 11, color: '#8899bb', letterSpacing: '0.15em', marginBottom: 4 }}>
            QUAINT SIGNAL · AI ANALYSIS
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: compact ? 28 : 36, color: '#fff', lineHeight: 1, letterSpacing: '0.04em' }}>
            {ticker}
          </div>
          {companyName && (
            <div style={{ fontSize: compact ? 10 : 11, color: '#b8c8e0', marginTop: 3 }}>{companyName}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: compact ? 32 : 42,
            color: sigColor, lineHeight: 1,
            textShadow: `0 0 20px ${sigColor}66`,
          }}>
            {signal}
          </div>
          <div style={{
            fontSize: compact ? 12 : 14, fontWeight: 700, color: sigColor,
            background: `${sigColor}15`, border: `1px solid ${sigColor}33`,
            borderRadius: 4, padding: '2px 8px', marginTop: 4, display: 'inline-block',
          }}>
            {confidence}% CONFIDENCE
          </div>
        </div>
      </div>

      {/* Price row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'ENTRY',  value: `${currency}${parseFloat(price || 0).toFixed(2)}`, color: '#e8e8f0' },
          { label: 'TARGET', value: priceTarget ? `${currency}${parseFloat(priceTarget).toFixed(2)}` : '—', color: '#00ff88' },
          { label: 'STOP',   value: stopLoss    ? `${currency}${parseFloat(stopLoss).toFixed(2)}`    : '—', color: '#ff4444' },
          { label: 'R/R',    value: priceTarget && stopLoss && price
              ? `${((priceTarget - price) / (price - stopLoss)).toFixed(1)}:1` : '—',
            color: '#ffaa00' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            flex: 1, background: '#0a0a14', border: '1px solid #2a2a3e',
            borderRadius: 6, padding: compact ? '7px 8px' : '10px 12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#445', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: compact ? 12 : 14, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Thesis */}
      {thesis && (
        <div style={{
          background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 6,
          padding: compact ? '10px 12px' : '14px 16px', marginBottom: 14,
          fontSize: compact ? 11 : 12, color: '#c8d8f0', lineHeight: 1.6,
          fontFamily: 'system-ui, sans-serif',
        }}>
          "{thesis.slice(0, 160)}{thesis.length > 160 ? '...' : ''}"
        </div>
      )}

      {/* Tags row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { label: tfLabel,                  color: '#4488ff' },
          { label: riskLevel ? `${riskLevel} RISK` : null, color: riskColor },
          { label: macroImpact,              color: macroImpact === 'BULLISH' ? '#00ff88' : macroImpact === 'BEARISH' ? '#ff4444' : '#ffaa00' },
          { label: market === 'INDIA' ? '🇮🇳 NSE' : '🇺🇸 NYSE', color: '#b8c8e0' },
        ].filter(t => t.label).map(({ label, color }) => (
          <span key={label} style={{
            fontSize: 'var(--fs-md)', fontWeight: 700, letterSpacing: '0.1em',
            padding: '3px 8px', borderRadius: 3,
            background: `${color}15`, border: `1px solid ${color}33`, color,
          }}>{label}</span>
        ))}
      </div>

      {/* Bull factors */}
      {bullFactors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {bullFactors.slice(0, 2).map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ color: '#00ff8866', fontSize: 'var(--fs-lg)', flexShrink: 0 }}>▲</span>
              <span style={{ fontSize: 'var(--fs-body)', color: '#b8c8e0', fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 }}>{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: '1px solid #1a1a2e', paddingTop: 12, marginTop: 4,
      }}>
        <div style={{ fontSize: 'var(--fs-md)', color: '#2a2a3e', letterSpacing: '0.1em' }}>
          quaint-signal.tech · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'var(--fs-lg)', color: '#ff9a0055', letterSpacing: '0.1em' }}>
          QUAINT SIGNAL
        </div>
      </div>
    </div>
  );
}

// ── Simulator Card ────────────────────────────────────────────────────────────
export function SimulatorCard({ data, compact = false }) {
  const {
    market, totalReturn, totalReturnPct, winRate, wins, losses,
    totalTrades, bestTrade, worstTrade, highConfRate, highConfCount,
    startingBalance, currentEquity, topTrades = [],
  } = data;

  const isInr    = market === 'INDIA';
  const currency = isInr ? '₹' : '$';
  const isPos    = totalReturn >= 0;
  const retColor = isPos ? '#00ff88' : '#ff4444';

  const fmtAmt = (n) => {
    if (n == null) return '—';
    const abs = Math.abs(n);
    if (isInr) {
      if (abs >= 1e7) return `${currency}${(abs / 1e7).toFixed(2)}Cr`;
      if (abs >= 1e5) return `${currency}${(abs / 1e5).toFixed(2)}L`;
    } else {
      if (abs >= 1000) return `${currency}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    return `${currency}${abs.toFixed(2)}`;
  };

  return (
    <div id="share-card" style={{
      background: 'linear-gradient(135deg, #07070e 0%, #0f0f1a 60%, #12121f 100%)',
      border: `1px solid ${retColor}44`,
      borderRadius: compact ? 10 : 14,
      padding: '20px 20px',
      width: '100%', maxWidth: 520, boxSizing: 'border-box',
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      position: 'relative', overflow: 'hidden',
      boxShadow: `0 0 40px ${retColor}15, 0 8px 32px rgba(0,0,0,0.6)`,
    }}>
      {/* Glow */}
      <div style={{
        position: 'absolute', top: -60, right: -60,
        width: 220, height: 220, borderRadius: '50%',
        background: `radial-gradient(circle, ${retColor}15 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: compact ? 10 : 11, color: '#8899bb', letterSpacing: '0.15em', marginBottom: 6 }}>
          QUAINT SIGNAL · PAPER TRADING SIMULATOR
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: compact ? 18 : 22, color: '#b8c8e0', letterSpacing: '0.08em' }}>
              {fmtAmt(startingBalance)} → {fmtAmt(currentEquity)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: compact ? 40 : 52, lineHeight: 1,
              color: retColor, textShadow: `0 0 24px ${retColor}66`,
            }}>
              {isPos ? '+' : ''}{totalReturnPct?.toFixed(1)}%
            </div>
            <div style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: retColor }}>
              {isPos ? '+' : ''}{fmtAmt(totalReturn)} TOTAL RETURN
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#1a1a2e', margin: '16px 0' }} />

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'WIN RATE',    value: winRate != null ? `${winRate}%` : '—', color: winRate >= 50 ? '#00ff88' : '#ff4444' },
          { label: 'TOTAL TRADES', value: totalTrades || 0,   color: '#e8e8f0' },
          { label: 'WINS',        value: wins || 0,           color: '#00ff88' },
          { label: 'LOSSES',      value: losses || 0,         color: '#ff4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#0a0a14', border: '1px solid #2a2a3e',
            borderRadius: 6, padding: compact ? '8px' : '10px 12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#445', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: compact ? 16 : 20, fontWeight: 700, color, fontFamily: "'Bebas Neue', sans-serif" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* High confidence stat */}
      {highConfRate != null && (
        <div style={{
          background: '#ffaa0011', border: '1px solid #ffaa0033', borderRadius: 6,
          padding: compact ? '8px 12px' : '10px 14px', marginBottom: 14,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 'var(--fs-md)', color: '#ffaa0077', letterSpacing: '0.1em' }}>75%+ CONFIDENCE SIGNALS</div>
            <div style={{ fontSize: 'var(--fs-body)', color: '#b8c8e0', marginTop: 2 }}>{highConfCount} trades tracked</div>
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: compact ? 26 : 32, color: '#ffaa00' }}>
            {highConfRate}% WIN
          </div>
        </div>
      )}

      {/* Top trades */}
      {topTrades.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 'var(--fs-md)', color: '#445', letterSpacing: '0.1em', marginBottom: 8 }}>TOP TRADES</div>
          {topTrades.slice(0, 3).map((t, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '5px 0', borderBottom: i < 2 ? '1px solid #1a1a2e' : 'none',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'var(--fs-lg)', color: '#e8e8f0' }}>{t.ticker}</span>
                <span style={{ fontSize: 'var(--fs-md)', color: t.direction === 'LONG' ? '#00ff8866' : '#ff444466' }}>{t.direction}</span>
              </div>
              <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: t.realized_pct >= 0 ? '#00ff88' : '#ff4444' }}>
                {t.realized_pct >= 0 ? '+' : ''}{t.realized_pct?.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: '1px solid #1a1a2e', paddingTop: 12, marginTop: 4,
      }}>
        <div style={{ fontSize: 'var(--fs-md)', color: '#2a2a3e', letterSpacing: '0.1em' }}>
          quaint-signal.tech · {isInr ? '🇮🇳 NSE' : '🇺🇸 NYSE'} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'var(--fs-lg)', color: '#ff9a0055', letterSpacing: '0.1em' }}>
          QUAINT SIGNAL
        </div>
      </div>
    </div>
  );
}