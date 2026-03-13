import { useState } from 'react';
import { SC, MC, GC } from '../utils/constants';
import { useScan } from '../hooks/useScan';
import MiniChart      from '../components/MiniChart';
import SignalCard      from '../components/SignalCard';
import BondPanel       from '../components/BondPanel';
import TechnicalPanel  from '../components/TechnicalPanel';

export default function ScannerTab({ macro, onOpenOptions, onAddToWatchlist }) {
  const [inputVal, setInputVal] = useState('AAPL');
  const scan = useScan(macro);

  const livePrice = scan.quote?.last || scan.ohlcv?.current;
  const pct = scan.ohlcv?.current && scan.ohlcv?.prev && scan.ohlcv.prev !== 0
  ? ((scan.ohlcv.current - scan.ohlcv.prev) / scan.ohlcv.prev * 100)
  : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 12 }}>$</span>
          <input value={inputVal} onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !scan.loading && scan.runScan(inputVal)}
            placeholder="TICKER" className="input"
            style={{ padding: '10px 12px 10px 26px', width: 120, fontSize: 14, fontWeight: 600 }} />
        </div>
        <button className="btn" disabled={scan.loading} onClick={() => scan.runScan(inputVal)}>
          {scan.loading ? 'SCANNING...' : 'RUN SCAN'}
        </button>
        {scan.ticker && !scan.loading && <>
          <button className="btn-sm" onClick={() => onAddToWatchlist(scan.ticker, scan.analysis, livePrice)}>+ WATCHLIST</button>
          <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044' }} onClick={() => onOpenOptions(scan.ticker)}>⚡ OPTIONS</button>
        </>}
        {scan.loading && <div className="pulse" style={{ fontSize: 10, color: '#ffaa00' }}>{scan.stage?.toUpperCase() || 'LOADING'}...</div>}
        {scan.error && <div style={{ fontSize: 11, color: '#ff4444' }}>{scan.error}</div>}
      </div>

      {scan.ohlcv && (
        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#0f0f18', border: '1px solid #1e1e2e', padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28 }}>{scan.ticker}</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>${livePrice?.toFixed(2)}</div>
        <div style={{ fontSize: 13, color: pct >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
                    {pct !== null ? `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%` : '—'}
        </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: scan.analysis ? '1fr 1fr' : '1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 8 }}>SYSTEM LOG</div>
            <div ref={scan.terminalRef} style={{ height: 100, overflowY: 'auto', fontSize: 11, lineHeight: 1.8 }}>
              {scan.logs.length === 0 && <div style={{ color: '#333' }}>&gt; Awaiting input...</div>}
              {scan.logs.map((l, i) => (
                <div key={i} style={{ color: l.includes('ERROR') ? '#ff4444' : l.includes('Signal:') ? '#00ff88' : l.includes('RSI') || l.includes('Trend') ? '#ffaa00' : l.includes('10Y') || l.includes('Macro') ? '#ffaa00' : '#446' }}>{l}</div>
              ))}
            </div>
          </div>

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
                <div className="kv" key={k}><span className="kv-key">{k}</span><span style={{ color: '#c8c8d0', fontWeight: 500, fontSize: 11 }}>{v}</span></div>
              ))}
            </div>
          )}

          {/* TA Panel */}
          {scan.ta && <TechnicalPanel ta={scan.ta} />}

          {macro?.bonds && <BondPanel bonds={macro.bonds} />}

          {scan.options && (
            <div className="card fade-in">
              <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 12 }}>OPTIONS FLOW <span style={{ color: '#00ff8844', fontSize: 9 }}>⚡ LIVE</span></div>
              <div className="kv"><span className="kv-key">Put/Call</span><span style={{ color: scan.options.putCallRatio > 1 ? '#ff4444' : '#00ff88', fontWeight: 500, fontSize: 11 }}>{scan.options.putCallRatio?.toFixed(2)}</span></div>
              <div className="kv"><span className="kv-key">Call IV</span><span style={{ color: '#ffaa00', fontWeight: 500, fontSize: 11 }}>{scan.options.avgCallIV}%</span></div>
              <div className="kv"><span className="kv-key">Put IV</span><span style={{ color: '#ffaa00', fontWeight: 500, fontSize: 11 }}>{scan.options.avgPutIV}%</span></div>
              <div style={{ marginTop: 10 }}>
                <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044', width: '100%' }} onClick={() => onOpenOptions(scan.ticker)}>⚡ OPTIONS PLAYS →</button>
              </div>
            </div>
          )}
        </div>

        {scan.analysis && <SignalCard analysis={scan.analysis} news={scan.news} />}
      </div>
    </div>
  );
}