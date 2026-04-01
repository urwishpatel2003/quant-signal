// src/components/StockModal.jsx
import { SC, MC, GC, RC } from '../utils/constants';
import { TIMEFRAMES } from '../utils/indicators';
import ModalShell   from './ModalShell';
import MiniChart    from './MiniChart';
import TechnicalPanel from './TechnicalPanel';
import BondPanel    from './BondPanel';

export default function StockModal({ scan, macro, onClose, onOpenOptions }) {
  if (!scan.analysis) return null;

  const livePrice = scan.quote?.last || scan.ohlcv?.current;
  const pct = scan.ohlcv?.current && scan.ohlcv?.prev && scan.ohlcv.prev !== 0
    ? ((scan.ohlcv.current - scan.ohlcv.prev) / scan.ohlcv.prev * 100)
    : null;
  const sigColor = SC[scan.analysis.signal];

  return (
    <ModalShell
      onClose={onClose}
      title={scan.ticker}
      subtitle={`${TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()} · AI SCAN RESULTS`}
    >
      {/* Price Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: '#0f0f1a', border: '1px solid #2a2a40',
        padding: '14px 16px', marginBottom: 16, borderRadius: 4,
      }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, lineHeight: 1, color: '#fff' }}>
            {scan.ticker}
          </div>
          <div style={{ fontSize: 10, color: '#6677aa', letterSpacing: '0.15em', marginTop: 2 }}>
            {TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>${livePrice?.toFixed(2)}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: pct !== null && pct >= 0 ? '#00ff88' : '#ff4444' }}>
            {pct !== null ? `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <MiniChart data={scan.ohlcv} />
          <div style={{
            textAlign: 'center',
            background: sigColor + '11',
            border: `1px solid ${sigColor}44`,
            padding: '10px 18px', borderRadius: 2, minWidth: 90,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: sigColor, lineHeight: 1 }}>
              {scan.analysis.signal}
            </div>
            <div style={{ fontSize: 11, color: '#b0c0dd', marginTop: 2, fontWeight: 600 }}>
              {scan.analysis.confidence}%
            </div>
          </div>
        </div>
      </div>

      {/* Signal Overview */}
      <div className="card fade-in" style={{ marginBottom: 16, borderColor: sigColor + '33' }}>
        <div style={{ fontSize: 11, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
          SIGNAL OVERVIEW
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 12 }}>
          {[
            ['TARGET',   `$${scan.analysis.priceTarget?.toFixed(2)}`,  '#00ff88'],
            ['STOP',     `$${scan.analysis.stopLoss?.toFixed(2)}`,      '#ff4444'],
            ['RISK',     scan.analysis.riskLevel,                        scan.analysis.riskLevel === 'LOW' ? '#00ff88' : scan.analysis.riskLevel === 'HIGH' ? '#ff4444' : '#ffaa00'],
            ['MACRO',    scan.analysis.macroImpact,                      MC[scan.analysis.macroImpact]],
            ['GLOBAL',   scan.analysis.globalMarketTrend,                GC[scan.analysis.globalMarketTrend]],
            ['GEO RISK', scan.analysis.geopoliticalRisk,                 scan.analysis.geopoliticalRisk === 'LOW' ? '#00ff88' : scan.analysis.geopoliticalRisk === 'HIGH' ? '#ff4444' : '#ffaa00'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ background: '#070710', padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 4, letterSpacing: '0.1em', fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {scan.analysis.thesis && (
          <div style={{ fontSize: 12, color: '#d0d8f0', lineHeight: 1.7,
            borderLeft: `2px solid ${sigColor}44`, paddingLeft: 12 }}>
            {scan.analysis.thesis}
          </div>
        )}
      </div>

      {/* Bull / Bear */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 11, color: '#00ff88', fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em' }}>BULL FACTORS</div>
          {scan.analysis.bullFactors?.map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: '#d0d8f0', padding: '5px 0', borderBottom: '1px solid #0f1a14', display: 'flex', gap: 6 }}>
              <span style={{ color: '#00ff88', flexShrink: 0 }}>▲</span>{f}
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontSize: 11, color: '#ff4444', fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em' }}>BEAR FACTORS</div>
          {scan.analysis.bearFactors?.map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: '#d0d8f0', padding: '5px 0', borderBottom: '1px solid #1a0f0f', display: 'flex', gap: 6 }}>
              <span style={{ color: '#ff4444', flexShrink: 0 }}>▼</span>{f}
            </div>
          ))}
        </div>
      </div>

      {/* News */}
      {scan.news?.length > 0 && (
        <div className="card fade-in" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#b0c0dd', fontWeight: 700, marginBottom: 12, letterSpacing: '0.1em' }}>RECENT NEWS</div>
          {scan.news.slice(0, 5).map((n, i) => (
            <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #1a1a26', fontSize: 12 }}>
              <a href={n.url} target="_blank" rel="noopener noreferrer"
                style={{ color: '#c8d8f0', lineHeight: 1.4, marginBottom: 2, display: 'block', textDecoration: 'none' }}
                onMouseEnter={e => { if (n.url) e.currentTarget.style.color = '#ffaa00'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#c8d8f0'; }}>
                {n.title}
              </a>
              <div style={{ color: '#7788aa', fontSize: 11 }}>
                {n.publisher} · {new Date(n.time * 1000).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Right column cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Fundamentals */}
        {scan.fundamentals && (
          <div className="card fade-in">
            <div style={{ fontSize: 11, color: '#b0c0dd', fontWeight: 700, letterSpacing: '0.2em', marginBottom: 12 }}>FUNDAMENTALS</div>
            {[
              ['P/E',          scan.fundamentals.pe?.toFixed(1)],
              ['EPS',          scan.fundamentals.eps ? `$${scan.fundamentals.eps.toFixed(2)}` : null],
              ['Beta',         scan.fundamentals.beta?.toFixed(2)],
              ['52W High',     scan.fundamentals.fiftyTwoWeekHigh ? `$${scan.fundamentals.fiftyTwoWeekHigh.toFixed(2)}` : null],
              ['52W Low',      scan.fundamentals.fiftyTwoWeekLow  ? `$${scan.fundamentals.fiftyTwoWeekLow.toFixed(2)}`  : null],
              ['ROE',          scan.fundamentals.roe ? `${(scan.fundamentals.roe * 100).toFixed(1)}%` : null],
              ['Gross Margin', scan.fundamentals.grossMargins ? `${(scan.fundamentals.grossMargins * 100).toFixed(1)}%` : null],
              ['Rev Growth',   scan.fundamentals.revenueGrowth ? `${(scan.fundamentals.revenueGrowth * 100).toFixed(1)}%` : null],
              ['D/E',          scan.fundamentals.debtToEquity?.toFixed(2)],
              ['Target',       scan.fundamentals.targetMeanPrice ? `$${scan.fundamentals.targetMeanPrice.toFixed(2)}` : null],
            ].filter(([, v]) => v != null).map(([k, v]) => (
              <div className="kv" key={k}>
                <span className="kv-key">{k}</span>
                <span style={{ color: '#e8e8f0', fontWeight: 600, fontSize: 12 }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* TA */}
        {scan.ta && <TechnicalPanel ta={scan.ta} />}

        {/* Options Flow */}
        {scan.options && (
          <div className="card fade-in">
            <div style={{ fontSize: 11, color: '#b0c0dd', fontWeight: 700, letterSpacing: '0.2em', marginBottom: 12 }}>
              OPTIONS FLOW <span style={{ color: '#00ff8866', fontSize: 10 }}>⚡ LIVE</span>
            </div>
            <div className="kv">
              <span className="kv-key">Put/Call</span>
              <span style={{ color: scan.options.putCallRatio > 1 ? '#ff4444' : '#00ff88', fontWeight: 700, fontSize: 12 }}>
                {scan.options.putCallRatio?.toFixed(2)}
              </span>
            </div>
            <div className="kv">
              <span className="kv-key">Call IV</span>
              <span style={{ color: '#ffaa00', fontWeight: 700, fontSize: 12 }}>{scan.options.avgCallIV}%</span>
            </div>
            <div className="kv">
              <span className="kv-key">Put IV</span>
              <span style={{ color: '#ffaa00', fontWeight: 700, fontSize: 12 }}>{scan.options.avgPutIV}%</span>
            </div>
          </div>
        )}
      </div>

      <BondPanel bonds={macro?.bonds} />

      {/* Options CTA */}
      <div style={{ marginTop: 20 }}>
        <button
          className="btn"
          style={{ width: '100%', fontSize: 14, padding: '14px' }}
          onClick={() => { onClose(); onOpenOptions(scan.ticker); }}
        >
          ⚡ OPEN OPTIONS ANALYSIS → {scan.ticker}
        </button>
      </div>
    </ModalShell>
  );
}