// src/components/ScannerModals.jsx
import { SC, MC, GC } from '../utils/constants';
import { TIMEFRAMES } from '../utils/indicators';
import ModalShell from './ModalShell';
import MiniChart  from './MiniChart';

// ── Modal 1: Ticker / Price / Decision ──────────────────────────────────────
export function TickerModal({ scan, onClose }) {
  const livePrice = scan.quote?.last || scan.ohlcv?.current;
  const pct = scan.ohlcv?.current && scan.ohlcv?.prev && scan.ohlcv.prev !== 0
    ? ((scan.ohlcv.current - scan.ohlcv.prev) / scan.ohlcv.prev * 100)
    : null;
  const sigColor = SC[scan.analysis.signal];

  return (
    <ModalShell onClose={onClose} title={scan.ticker} subtitle={TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()}>
      {/* Big price display */}
      <div style={{
        background: '#0f0f1a', border: `1px solid ${sigColor}33`,
        borderRadius: 6, padding: '32px 24px', marginBottom: 16, textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 56, lineHeight: 1, color: '#fff', letterSpacing: '0.05em',
        }}>
          {scan.ticker}
        </div>
        <div style={{ fontSize: 11, color: '#6677aa', letterSpacing: '0.2em', marginTop: 4, marginBottom: 24 }}>
          {TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()} · {TIMEFRAMES[scan.timeframe]?.sublabel?.toUpperCase()}
        </div>

        <div style={{ fontSize: 48, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
          ${livePrice?.toFixed(2)}
        </div>
        <div style={{
          fontSize: 20, fontWeight: 700, marginTop: 8,
          color: pct !== null && pct >= 0 ? '#00ff88' : '#ff4444',
        }}>
          {pct !== null ? `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%` : '—'}
        </div>

        <div style={{ margin: '32px auto 0', maxWidth: 300 }}>
          <MiniChart data={scan.ohlcv} />
        </div>
      </div>

      {/* Signal badge */}
      <div style={{
        background: sigColor + '11',
        border: `1px solid ${sigColor}44`,
        borderRadius: 6, padding: '28px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: '#b0c0dd', letterSpacing: '0.2em', marginBottom: 8 }}>
          AI SIGNAL
        </div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 64, lineHeight: 1, color: sigColor, letterSpacing: '0.05em',
        }}>
          {scan.analysis.signal}
        </div>
        <div style={{ fontSize: 14, color: '#b0c0dd', marginTop: 12, fontWeight: 600 }}>
          CONFIDENCE
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, color: sigColor, marginTop: 4 }}>
          {scan.analysis.confidence}%
        </div>

        {/* Confidence bar */}
        <div style={{
          background: '#1a1a2e', borderRadius: 2, height: 6,
          marginTop: 12, overflow: 'hidden', maxWidth: 300, margin: '12px auto 0',
        }}>
          <div style={{
            height: '100%', width: `${scan.analysis.confidence}%`,
            background: sigColor, borderRadius: 2, transition: 'width 0.6s ease',
          }} />
        </div>

        {/* Key levels */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 32, marginTop: 24, flexWrap: 'wrap',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#b0c0dd', letterSpacing: '0.15em', marginBottom: 4 }}>TARGET</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#00ff88' }}>
              ${scan.analysis.priceTarget?.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#b0c0dd', letterSpacing: '0.15em', marginBottom: 4 }}>ENTRY</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
              ${livePrice?.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#b0c0dd', letterSpacing: '0.15em', marginBottom: 4 }}>STOP</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#ff4444' }}>
              ${scan.analysis.stopLoss?.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Modal 2: Signal Overview + Bull/Bear Factors ─────────────────────────────
export function SignalModal({ scan, onClose }) {
  const sigColor = SC[scan.analysis.signal];

  return (
    <ModalShell onClose={onClose} title="SIGNAL OVERVIEW" subtitle={`${scan.ticker} · ${TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()}`}>

      {/* Overview grid */}
      <div className="card" style={{ marginBottom: 16, borderColor: sigColor + '33' }}>
        <div style={{ fontSize: 11, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
          MARKET CONTEXT
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[
            ['RISK LEVEL', scan.analysis.riskLevel, scan.analysis.riskLevel === 'LOW' ? '#00ff88' : scan.analysis.riskLevel === 'HIGH' ? '#ff4444' : '#ffaa00'],
            ['MACRO',      scan.analysis.macroImpact,         MC[scan.analysis.macroImpact]],
            ['GLOBAL',     scan.analysis.globalMarketTrend,   GC[scan.analysis.globalMarketTrend]],
            ['GEO RISK',   scan.analysis.geopoliticalRisk,    scan.analysis.geopoliticalRisk === 'LOW' ? '#00ff88' : scan.analysis.geopoliticalRisk === 'HIGH' ? '#ff4444' : '#ffaa00'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ background: '#070710', padding: '12px 10px', textAlign: 'center', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 6, letterSpacing: '0.1em', fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Thesis */}
        {scan.analysis.thesis && (
          <div style={{
            fontSize: 13, color: '#d0d8f0', lineHeight: 1.8,
            borderLeft: `3px solid ${sigColor}55`, paddingLeft: 14,
            fontStyle: 'italic',
          }}>
            {scan.analysis.thesis}
          </div>
        )}
      </div>

      {/* Bull / Bear side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card" style={{ borderColor: '#00ff8822' }}>
          <div style={{ fontSize: 11, color: '#00ff88', fontWeight: 700, marginBottom: 12, letterSpacing: '0.1em' }}>
            ▲ BULL FACTORS
          </div>
          {scan.analysis.bullFactors?.map((f, i) => (
            <div key={i} style={{
              fontSize: 12, color: '#d0d8f0', padding: '8px 0',
              borderBottom: i < scan.analysis.bullFactors.length - 1 ? '1px solid #0f1a14' : 'none',
              display: 'flex', gap: 8, lineHeight: 1.5,
            }}>
              <span style={{ color: '#00ff88', flexShrink: 0, marginTop: 2 }}>▲</span>{f}
            </div>
          ))}
        </div>
        <div className="card" style={{ borderColor: '#ff444422' }}>
          <div style={{ fontSize: 11, color: '#ff4444', fontWeight: 700, marginBottom: 12, letterSpacing: '0.1em' }}>
            ▼ BEAR FACTORS
          </div>
          {scan.analysis.bearFactors?.map((f, i) => (
            <div key={i} style={{
              fontSize: 12, color: '#d0d8f0', padding: '8px 0',
              borderBottom: i < scan.analysis.bearFactors.length - 1 ? '1px solid #1a0f0f' : 'none',
              display: 'flex', gap: 8, lineHeight: 1.5,
            }}>
              <span style={{ color: '#ff4444', flexShrink: 0, marginTop: 2 }}>▼</span>{f}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

// ── Modal 3: News ─────────────────────────────────────────────────────────────
export function NewsModal({ scan, onClose }) {
  if (!scan.news?.length) return null;

  return (
    <ModalShell onClose={onClose} title="RECENT NEWS" subtitle={scan.ticker}>
      <div className="card">
        {scan.news.slice(0, 10).map((n, i) => (
          <div key={i} style={{
            padding: '14px 0',
            borderBottom: i < Math.min(scan.news.length, 10) - 1 ? '1px solid #1a1a26' : 'none',
          }}>
            <a
              href={n.url} target="_blank" rel="noopener noreferrer"
              style={{ color: '#c8d8f0', fontSize: 14, lineHeight: 1.5, display: 'block', textDecoration: 'none', marginBottom: 6 }}
              onMouseEnter={e => { if (n.url) e.currentTarget.style.color = '#ffaa00'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#c8d8f0'; }}
            >
              {n.title}
            </a>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: '#7788aa', fontSize: 11 }}>{n.publisher}</span>
              <span style={{ color: '#3a3a5e', fontSize: 11 }}>·</span>
              <span style={{ color: '#7788aa', fontSize: 11 }}>
                {new Date(n.time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {n.url && (
                <a href={n.url} target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft: 'auto', fontSize: 10, color: '#ffaa0077', textDecoration: 'none', letterSpacing: '0.1em' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ffaa00'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#ffaa0077'; }}
                >
                  READ →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}