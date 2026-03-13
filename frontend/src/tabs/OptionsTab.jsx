import { useState, useEffect } from 'react';
import { SC, RC, MC, GC } from '../utils/constants';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain, isMarketClosed } from '../api/tradier';
import { runPriceAnalysis, runOptionsAnalysis } from '../api/claude';
import { calcIndicators } from '../utils/indicators';
import MiniChart      from '../components/MiniChart';
import ContractCard   from '../components/ContractCard';
import BondPanel      from '../components/BondPanel';
import TechnicalPanel from '../components/TechnicalPanel';
import TradeSetupCard  from '../components/TradeSetupCard';
import RiskRewardBar   from '../components/RiskRewardBar';
import PLSimulator     from '../components/PLSimulator';
import TradeChecklist  from '../components/TradeChecklist';
import EarningsWarning from '../components/EarningsWarning';

export default function OptionsTab({ macro, initialTicker }) {
  const [inputVal,       setInputVal]       = useState(initialTicker || 'AAPL');
  const [ticker,         setTicker]         = useState('');
  const [loading,        setLoading]        = useState(false);
  const [reanalyzing,    setReanalyzing]    = useState(false);
  const [stage,          setStage]          = useState('');
  const [error,          setError]          = useState('');
  const [quote,          setQuote]          = useState(null);
  const [ohlcv,          setOhlcv]          = useState(null);
  const [ta,             setTa]             = useState(null);
  const [expirations,    setExpirations]    = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [fundamentals,   setFundamentals]   = useState(null);
  const [news,           setNews]           = useState([]);
  const [priceSignal,    setPriceSignal]    = useState(null);
  const [optionsSignal,  setOptionsSignal]  = useState(null);
  const [selectedSide,   setSelectedSide]   = useState(null);

  useEffect(() => { if (initialTicker) { setInputVal(initialTicker); run(initialTicker); } }, [initialTicker]);

  const switchExpiry = async expiry => {
    if (!ticker || reanalyzing) return;
    setSelectedExpiry(expiry); setReanalyzing(true); setOptionsSignal(null);
    try {
      const livePrice = quote?.last || ohlcv?.current;
      const c  = await fetchTradierChain(ticker, expiry, livePrice);
      const os = await runOptionsAnalysis(ticker, livePrice, expiry, c, fundamentals, news, priceSignal, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar, ta);
      setOptionsSignal(os);
    } catch (e) { console.error(e); }
    finally { setReanalyzing(false); }
  };

  const run = async t => {
    setLoading(true); setError(''); setOptionsSignal(null); setPriceSignal(null);
    setTa(null); setSelectedSide(null);
    const sym = t.toUpperCase(); setTicker(sym);
    try {
      setStage('quote');
      const [q, p] = await Promise.all([fetchTradierQuote(sym), fetchPrice(sym)]);
      if (!q && !p) throw new Error('Ticker not found');
      setQuote(q); setOhlcv(p);
      const livePrice = q?.last || p?.current;
      const indicators = calcIndicators(p);
      setTa(indicators);

      setStage('expirations');
      const exps = await fetchTradierExpirations(sym);
      if (exps.length === 0) throw new Error('No valid expirations found');
      setExpirations(exps);
      const nextExpiry = exps[0];

      setStage('chain');
      const c = await fetchTradierChain(sym, nextExpiry, livePrice);
      setSelectedExpiry(nextExpiry);

      setStage('data');
      const [f, n] = await Promise.all([fetchFundamentals(sym), fetchStockNews(sym)]);
      setFundamentals(f); setNews(n);

      setStage('price-signal');
      const ps = await runPriceAnalysis(sym, livePrice, p, f, c, n, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar, indicators);
      setPriceSignal(ps);

      setStage('options-signal');
      const os = await runOptionsAnalysis(sym, livePrice, nextExpiry, c, f, n, ps, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar, indicators);
      setOptionsSignal(os);
      setStage('done');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const livePrice    = quote?.last || ohlcv?.current;
  const changePct    = quote?.changePct || (ohlcv?.current && ohlcv?.prev ? ((ohlcv.current - ohlcv.prev) / ohlcv.prev * 100) : null);
  const recColor     = optionsSignal?.recommendation === 'CALL' ? '#00ff88' : optionsSignal?.recommendation === 'PUT' ? '#ff4444' : '#ffaa00';
  const ivColor      = optionsSignal?.ivRank === 'LOW' ? '#00ff88' : optionsSignal?.ivRank === 'HIGH' ? '#ff4444' : '#ffaa00';
  const activeSide   = selectedSide || optionsSignal?.recommendation || 'CALL';
  const activeSignal = { ...optionsSignal, recommendation: activeSide };

  return (
    <div>
      {/* ── Top bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 12 }}>$</span>
          <input value={inputVal} onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !loading && run(inputVal)}
            placeholder="TICKER" className="input"
            style={{ padding: '10px 12px 10px 26px', width: 110, fontSize: 14, fontWeight: 600 }} />
        </div>
        <button className="btn" disabled={loading} onClick={() => run(inputVal)}>
          {loading ? 'ANALYZING...' : 'FIND OPTIONS PLAYS'}
        </button>
        <div style={{ fontSize: 10, color: isMarketClosed() ? '#ff444488' : '#00ff8888' }}>
          {isMarketClosed() ? '🔴 MKT CLOSED' : '🟢 MKT OPEN'}
        </div>
        {macro?.bonds && <div style={{ fontSize: 10, color: '#ffaa0066' }}>10Y: {macro.bonds.tnx?.current?.toFixed(2)}%{macro.bonds.inverted ? ' ⚠' : ''}</div>}
        {(loading || reanalyzing) && <div className="pulse" style={{ fontSize: 10, color: '#ffaa00' }}>{reanalyzing ? `RE-ANALYZING ${selectedExpiry}...` : stage?.toUpperCase() || 'LOADING'}...</div>}
        {error && <div style={{ fontSize: 11, color: '#ff4444' }}>{error}</div>}
      </div>

      {/* ── Price bar ── */}
      {(quote || ohlcv) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: '#0f0f18', border: '1px solid #1e1e2e', padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24 }}>{ticker}</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>${livePrice?.toFixed(2)}</div>
          {changePct !== null && (
            <div style={{ fontSize: 13, color: changePct >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
              {changePct >= 0 ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
            </div>
          )}
          {ta?.rsi14 && <span style={{ fontSize: 10, color: ta.rsi14 > 70 ? '#ff4444' : ta.rsi14 < 30 ? '#00ff88' : '#ffaa00' }}>RSI: {ta.rsi14} [{ta.rsiSignal}]</span>}
          {ta?.trendSignal && <span style={{ fontSize: 10, color: ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444' }}>{ta.trendSignal === 'BULLISH' ? '▲' : '▼'} {ta.trendSignal}</span>}
          {priceSignal?.macroImpact       && <span style={{ fontSize: 10, color: MC[priceSignal.macroImpact]       }}>MACRO: {priceSignal.macroImpact}</span>}
          {priceSignal?.globalMarketTrend && <span style={{ fontSize: 10, color: GC[priceSignal.globalMarketTrend] }}>GLOBAL: {priceSignal.globalMarketTrend}</span>}
          {priceSignal?.geopoliticalRisk  && <span style={{ fontSize: 10, color: RC[priceSignal.geopoliticalRisk]  }}>GEO: {priceSignal.geopoliticalRisk}</span>}
          <div style={{ marginLeft: 'auto' }}><MiniChart data={ohlcv} /></div>
          {optionsSignal && !reanalyzing && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: recColor }}>LONG {optionsSignal.recommendation}S</div>
              <div style={{ fontSize: 10, color: '#555' }}>{optionsSignal.confidence}%</div>
            </div>
          )}
        </div>
      )}

      {/* ── Expiry selector ── */}
      {expirations.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: '#444', marginRight: 4 }}>EXPIRY:</div>
          {expirations.slice(0, 8).map(exp => (
            <button key={exp} className="btn-sm"
              style={{ color: selectedExpiry === exp ? '#ffaa00' : '#556', borderColor: selectedExpiry === exp ? '#ffaa00' : '#2a2a3e', background: selectedExpiry === exp ? '#ffaa0011' : '#1a1a2e' }}
              onClick={() => switchExpiry(exp)} disabled={reanalyzing || loading}>
              {exp}
            </button>
          ))}
          {reanalyzing && <div className="pulse" style={{ fontSize: 10, color: '#ffaa00' }}>Re-analyzing...</div>}
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="options-layout">

        {/* ── Left sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ta && <TechnicalPanel ta={ta} />}

          {priceSignal && (
            <div className="card" style={{ borderColor: SC[priceSignal.signal] + '33' }}>
              <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.15em', marginBottom: 10 }}>UNDERLYING SIGNAL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['SIGNAL',   priceSignal.signal,                        SC[priceSignal.signal]],
                  ['CONF',     `${priceSignal.confidence}%`,              '#fff'],
                  ['TARGET',   `$${priceSignal.priceTarget?.toFixed(2)}`, '#00ff88'],
                  ['STOP',     `$${priceSignal.stopLoss?.toFixed(2)}`,    '#ff4444'],
                  ['MACRO',    priceSignal.macroImpact,                   MC[priceSignal.macroImpact]],
                  ['GEO RISK', priceSignal.geopoliticalRisk,              RC[priceSignal.geopoliticalRisk]],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ background: '#070710', padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: '#445', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              {ta && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                  {[
                    ['RSI 14',  ta.rsi14,            ta.rsi14 > 70 ? '#ff4444' : ta.rsi14 < 30 ? '#00ff88' : '#ffaa00'],
                    ['TREND',   ta.trendSignal,       ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444'],
                    ['VOLUME',  `${ta.volumeRatio}x`, ta.volumeSignal === 'HIGH' ? '#ffaa00' : '#c8c8d0'],
                    ['GLOBAL',  priceSignal.globalMarketTrend, GC[priceSignal.globalMarketTrend]],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ background: '#070710', padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 8, color: '#445', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#667', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>{priceSignal.thesis}</div>
              {priceSignal.bondSignal && (
                <div style={{ fontSize: 10, color: '#ffaa0077', marginTop: 6, borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>
                  📊 {priceSignal.bondSignal}
                </div>
              )}
            </div>
          )}

          <BondPanel bonds={macro?.bonds} />
        </div>

        {/* ── Right main ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {!optionsSignal && !loading && !reanalyzing && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: '#333' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Enter a ticker and click FIND OPTIONS PLAYS</div>
              <div style={{ fontSize: 11 }}>Includes RSI · SMA · Volume · Bond market · Global macro analysis</div>
            </div>
          )}

          {reanalyzing && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div className="pulse" style={{ fontSize: 12, color: '#ffaa00' }}>RE-ANALYZING FOR {selectedExpiry}...</div>
            </div>
          )}

          {optionsSignal && !reanalyzing && (
            <>
              <EarningsWarning ticker={ticker} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />

              {/* AI recommendation header */}
              <div className="card fade-in" style={{ borderColor: recColor + '44' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 4 }}>AI OPTIONS RECOMMENDATION · {selectedExpiry}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(32px, 5vw, 48px)', color: recColor, lineHeight: 1 }}>LONG {optionsSignal.recommendation}S</div>
                    <div style={{ fontSize: 12, color: '#8899aa', marginTop: 8, lineHeight: 1.6 }}>{optionsSignal.reasoning}</div>
                    {optionsSignal.macroSetup      && <div style={{ fontSize: 11, color: '#ffaa0088', marginTop: 6, fontStyle: 'italic', borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>📊 {optionsSignal.macroSetup}</div>}
                    {optionsSignal.calendarWarning && <div style={{ fontSize: 11, color: '#ff884477', marginTop: 6, borderLeft: '2px solid #ff884433', paddingLeft: 8 }}>📅 {optionsSignal.calendarWarning}</div>}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 120 }}>
                    <div style={{ fontSize: 11, color: '#556' }}>CONFIDENCE</div>
                    <div style={{ fontSize: 28, fontWeight: 600 }}>{optionsSignal.confidence}%</div>
                    <div className="bar-bg"><div className="bar-fill" style={{ width: `${optionsSignal.confidence}%`, background: recColor }} /></div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: '#445' }}>IV ENVIRONMENT</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: ivColor }}>{optionsSignal.ivRank} IV</div>
                      <div style={{ fontSize: 11, color: '#667' }}>{optionsSignal.ivComment}</div>
                    </div>
                  </div>
                </div>
                {optionsSignal.positionSizing && (
                  <div style={{ background: '#070710', padding: 10, fontSize: 12, color: '#8899aa', borderLeft: '2px solid #ffaa0044' }}>
                    💰 {optionsSignal.positionSizing}
                  </div>
                )}
              </div>

              {/* Contract cards */}
              <div className="options-contracts">
                <ContractCard data={optionsSignal.bestCall} type="CALL" selected={activeSide === 'CALL'} onClick={() => setSelectedSide('CALL')} />
                <ContractCard data={optionsSignal.bestPut}  type="PUT"  selected={activeSide === 'PUT'}  onClick={() => setSelectedSide('PUT')}  />
              </div>

              <TradeSetupCard optionsSignal={activeSignal} priceSignal={priceSignal} ticker={ticker} selectedExpiry={selectedExpiry} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <RiskRewardBar optionsSignal={activeSignal} />
                <PLSimulator optionsSignal={{ ...activeSignal, ticker }} livePrice={livePrice} />
              </div>

              <TradeChecklist ta={ta} priceSignal={priceSignal} optionsSignal={activeSignal} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />

              {/* Catalysts / Risks / Macro */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div className="card">
                  <div style={{ fontSize: 10, color: '#ffaa0066', marginBottom: 8 }}>⚡ CATALYSTS</div>
                  {optionsSignal.catalysts?.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #1a1a26', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ffaa00' }}>→</span>{c}
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div style={{ fontSize: 10, color: '#ff444466', marginBottom: 8 }}>⚠ KEY RISKS</div>
                  {optionsSignal.keyRisks?.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #1a0f0f', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ff4444' }}>!</span>{r}
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div style={{ fontSize: 10, color: '#ff884466', marginBottom: 8 }}>🌍 MACRO RISKS</div>
                  {optionsSignal.macroRisks?.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #1a1008', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ff8844' }}>⊕</span>{r}
                    </div>
                  ))}
                  {optionsSignal.globalMarketRisk && (
                    <div style={{ fontSize: 12, color: '#8899aa', padding: '5px 0', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ff8844' }}>🌍</span>{optionsSignal.globalMarketRisk}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#333', textAlign: 'center' }}>⚠ NOT FINANCIAL ADVICE. OPTIONS INVOLVE SIGNIFICANT RISK.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}