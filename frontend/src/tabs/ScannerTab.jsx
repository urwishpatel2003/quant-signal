import { useState } from 'react';
import { SC, MC, GC } from '../utils/constants';
import { useScan } from '../hooks/useScan';
import { TIMEFRAMES } from '../utils/indicators';
import MiniChart      from '../components/MiniChart';
import SignalCard     from '../components/SignalCard';
import BondPanel      from '../components/BondPanel';
import TechnicalPanel from '../components/TechnicalPanel';

const TF_KEYS = ['short', 'swing', 'position', 'longterm'];

export default function ScannerTab({ macro, onOpenOptions, onAddToWatchlist }) {
  const [inputVal, setInputVal] = useState('AAPL');
  const scan = useScan(macro);

  const livePrice = scan.quote?.last || scan.ohlcv?.current;
  const pct = scan.ohlcv?.current && scan.ohlcv?.prev && scan.ohlcv.prev !== 0
    ? ((scan.ohlcv.current - scan.ohlcv.prev) / scan.ohlcv.prev * 100)
    : null;

  return (
    <div>
      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 12 }}>$</span>
            <input value={inputVal} onChange={e => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && !scan.loading && scan.runScan(inputVal)}
              placeholder="TICKER" className="input"
              style={{ padding: '10px 12px 10px 26px', fontSize: 14, fontWeight: 600 }} />
          </div>
          <button className="btn" disabled={scan.loading} onClick={() => scan.runScan(inputVal)}
            style={{ whiteSpace: 'nowrap' }}>
            {scan.loading ? 'SCANNING...' : 'RUN SCAN'}
          </button>
        </div>
        {scan.ticker && !scan.loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            {/* <button className="btn-sm" onClick={() => onAddToWatchlist(scan.ticker, scan.analysis, livePrice)}>+ WATCHLIST</button> */}
            <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044' }} onClick={() => onOpenOptions(scan.ticker)}>⚡ OPTIONS</button>
          </div>
        )}
        {scan.loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%',
              border: '2px solid #ffaa0033', borderTop: '2px solid #ffaa00',
              animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 10, color: '#ffaa0066' }}>ANALYZING...</span>
          </div>
        )}
        {scan.error && <div style={{ fontSize: 11, color: '#ff4444', width: '100%' }}>{scan.error}</div>}
      </div>

      {/* ── Timeframe selector ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#444', marginBottom: 8 }}>TIMEFRAME:</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {TF_KEYS.map(key => {
            const tf = TIMEFRAMES[key];
            const active = scan.timeframe === key;
            return (
              <button key={key} className="btn-sm"
                disabled={scan.loading}
                onClick={() => scan.setTimeframe(key)}
                style={{
                  color:       active ? '#ffaa00' : '#556',
                  borderColor: active ? '#ffaa00' : '#2a2a3e',
                  background:  active ? '#ffaa0011' : '#1a1a2e',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '8px 12px', lineHeight: 1.3,
                }}>
                <span style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{tf.label}</span>
                <span style={{ fontSize: 9, color: active ? '#ffaa0088' : '#334' }}>{tf.sublabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Price bar ── */}
      {scan.ohlcv && (
        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: '#0f0f18', border: '1px solid #1e1e2e', padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24 }}>{scan.ticker}</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>${livePrice?.toFixed(2)}</div>
          <div style={{ fontSize: 13, color: pct !== null && pct >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
            {pct !== null ? `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%` : '—'}
          </div>
          <span style={{ fontSize: 9, background: '#ffaa0011', border: '1px solid #ffaa0033',
            color: '#ffaa00', padding: '2px 8px', borderRadius: 2 }}>
            {TIMEFRAMES[scan.timeframe]?.label?.toUpperCase()}
          </span>
          {scan.ta?.rsiSignal && (
            <span style={{ fontSize: 10, color: scan.ta.rsi14 > 70 ? '#ff4444' : scan.ta.rsi14 < 30 ? '#00ff88' : '#ffaa00' }}>
              RSI: {scan.ta.rsi14} [{scan.ta.rsiSignal}]
            </span>
          )}
          {scan.ta?.trendSignal && (
            <span style={{ fontSize: 10, color: scan.ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444' }}>
              {scan.ta.trendSignal === 'BULLISH' ? '▲' : '▼'} {scan.ta.trendSignal}
            </span>
          )}
          {scan.ta?.sma200 && (
            <span style={{ fontSize: 10, color: livePrice > scan.ta.sma200 ? '#00ff88' : '#ff4444' }}>
              SMA200: ${scan.ta.sma200}
            </span>
          )}
          {scan.analysis?.macroImpact       && <span style={{ fontSize: 10, color: MC[scan.analysis.macroImpact]       }}>MACRO: {scan.analysis.macroImpact}</span>}
          {scan.analysis?.globalMarketTrend && <span style={{ fontSize: 10, color: GC[scan.analysis.globalMarketTrend] }}>GLOBAL: {scan.analysis.globalMarketTrend}</span>}
          <div style={{ marginLeft: 'auto' }}><MiniChart data={scan.ohlcv} /></div>
          {scan.analysis && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: SC[scan.analysis.signal] }}>{scan.analysis.signal}</div>
              <div style={{ fontSize: 10, color: '#555' }}>{scan.analysis.confidence}%</div>
            </div>
          )}
        </div>
      )}

      {/* ── AI Recommendation ── */}
      {scan.analysis && (
        <div className="fade-in" style={{ marginBottom: 20 }}>
          <SignalCard analysis={scan.analysis} news={scan.news} />
        </div>
      )}

      {/* ── Details grid ── */}
      {scan.analysis && (
        <div className="scanner-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {scan.fundamentals && (
              <div className="card fade-in">
                <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>FUNDAMENTALS</div>
                {[
                  ['P/E',          scan.fundamentals.pe?.toFixed(1)],
                  ['EPS',          scan.fundamentals.eps ? `$${scan.fundamentals.eps.toFixed(2)}` : null],
                  ['Beta',         scan.fundamentals.beta?.toFixed(2)],
                  ['ROE',          scan.fundamentals.roe ? `${(scan.fundamentals.roe * 100).toFixed(1)}%` : null],
                  ['Gross Margin', scan.fundamentals.grossMargins ? `${(scan.fundamentals.grossMargins * 100).toFixed(1)}%` : null],
                  ['Rev Growth',   scan.fundamentals.revenueGrowth ? `${(scan.fundamentals.revenueGrowth * 100).toFixed(1)}%` : null],
                  ['D/E',          scan.fundamentals.debtToEquity?.toFixed(2)],
                  ['Target',       scan.fundamentals.targetMeanPrice ? `$${scan.fundamentals.targetMeanPrice.toFixed(2)}` : null],
                ].filter(([, v]) => v != null).map(([k, v]) => (
                  <div className="kv" key={k}>
                    <span className="kv-key">{k}</span>
                    <span style={{ color: '#c8c8d0', fontWeight: 500, fontSize: 11 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {scan.ta && <TechnicalPanel ta={scan.ta} />}
            <BondPanel bonds={macro?.bonds} />
            {scan.options && (
              <div className="card fade-in">
                <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>OPTIONS FLOW <span style={{ color: '#00ff8844', fontSize: 9 }}>⚡ LIVE</span></div>
                <div className="kv"><span className="kv-key">Put/Call</span><span style={{ color: scan.options.putCallRatio > 1 ? '#ff4444' : '#00ff88', fontWeight: 500, fontSize: 11 }}>{scan.options.putCallRatio?.toFixed(2)}</span></div>
                <div className="kv"><span className="kv-key">Call IV</span><span style={{ color: '#ffaa00', fontWeight: 500, fontSize: 11 }}>{scan.options.avgCallIV}%</span></div>
                <div className="kv"><span className="kv-key">Put IV</span><span style={{ color: '#ffaa00', fontWeight: 500, fontSize: 11 }}>{scan.options.avgPutIV}%</span></div>
                <div style={{ marginTop: 10 }}>
                  <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044', width: '100%' }}
                    onClick={() => onOpenOptions(scan.ticker)}>⚡ OPTIONS PLAYS →</button>
                </div>
              </div>
            )}
          </div>
          <div />
        </div>
      )}
    </div>
  );
}