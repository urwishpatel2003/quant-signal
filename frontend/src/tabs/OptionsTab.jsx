import { useState, useRef, useEffect } from 'react';
import { SC, RC, MC, GC } from '../utils/constants';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain, isMarketClosed } from '../api/tradier';
import { runPriceAnalysis, runOptionsAnalysis } from '../api/claude';
import MiniChart      from '../components/MiniChart';
import ContractCard   from '../components/ContractCard';
import BondPanel      from '../components/BondPanel';
import ChainTable     from '../components/ChainTable';
import MacroNewsPanel from '../components/MacroNewsPanel';

export default function OptionsTab({ macro, initialTicker }) {
  const [inputVal,      setInputVal]      = useState(initialTicker || 'AAPL');
  const [ticker,        setTicker]        = useState('');
  const [loading,       setLoading]       = useState(false);
  const [reanalyzing,   setReanalyzing]   = useState(false);
  const [stage,         setStage]         = useState('');
  const [error,         setError]         = useState('');
  const [quote,         setQuote]         = useState(null);
  const [ohlcv,         setOhlcv]         = useState(null);
  const [expirations,   setExpirations]   = useState([]);
  const [selectedExpiry,setSelectedExpiry]= useState('');
  const [chain,         setChain]         = useState(null);
  const [fundamentals,  setFundamentals]  = useState(null);
  const [news,          setNews]          = useState([]);
  const [priceSignal,   setPriceSignal]   = useState(null);
  const [optionsSignal, setOptionsSignal] = useState(null);
  const [logs,          setLogs]          = useState([]);
  const termRef = useRef(null);

  const log = m => setLogs(p => [...p, `> ${m}`]);
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [logs]);
  useEffect(() => { if (initialTicker) { setInputVal(initialTicker); run(initialTicker); } }, [initialTicker]);

  const switchExpiry = async expiry => {
    if (!ticker || reanalyzing) return;
    setSelectedExpiry(expiry); setReanalyzing(true); setOptionsSignal(null);
    log(`Switching to ${expiry}...`);
    try {
      const livePrice = quote?.last || ohlcv?.current;
      const c = await fetchTradierChain(ticker, expiry, livePrice);
      setChain(c);
      log(`Re-running AI analysis...`);
      const os = await runOptionsAnalysis(ticker, livePrice, expiry, c, fundamentals, news, priceSignal, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar);
      setOptionsSignal(os);
      log(`${os.recommendation} | Call $${os.bestCall?.strike}@$${os.bestCall?.mid} | Put $${os.bestPut?.strike}@$${os.bestPut?.mid}`);
    } catch (e) { log(`Error: ${e.message}`); }
    finally { setReanalyzing(false); }
  };

  const run = async t => {
    setLoading(true); setError(''); setOptionsSignal(null); setPriceSignal(null); setChain(null); setLogs([]);
    const sym = t.toUpperCase(); setTicker(sym);
    try {
      log(`Scanning ${sym}...`); setStage('quote');
      const [q, p] = await Promise.all([fetchTradierQuote(sym), fetchPrice(sym)]);
      if (!q && !p) throw new Error('Ticker not found');
      setQuote(q); setOhlcv(p);
      const livePrice = q?.last || p?.current;
      log(`Price: $${livePrice?.toFixed(2)}`);

      setStage('expirations');
      const exps = await fetchTradierExpirations(sym);
      if (exps.length === 0) throw new Error('No valid expirations found');
      setExpirations(exps);
      const nextExpiry = exps[0]; log(`Expiry: ${nextExpiry}`);

      setStage('chain');
      const c = await fetchTradierChain(sym, nextExpiry, livePrice);
      setChain(c); setSelectedExpiry(nextExpiry);
      log(`ATM calls: ${c?.topCalls?.slice(0, 3).map(x => `$${x.strike}`).join(', ')}`);

      setStage('data');
      const [f, n] = await Promise.all([fetchFundamentals(sym), fetchStockNews(sym)]);
      setFundamentals(f); setNews(n);

      setStage('price-signal');
      if (macro?.bonds) log(`10Y=${macro.bonds.tnx?.current?.toFixed(2)}% | VIX=${macro.intlMarkets?.find(m => m.symbol === '^VIX')?.current?.toFixed(2)}`);
      log('Running global macro price analysis...');
      const ps = await runPriceAnalysis(sym, livePrice, p, f, c, n, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar);
      setPriceSignal(ps);
      log(`Signal: ${ps.signal} ${ps.confidence}% | Macro: ${ps.macroImpact}`);

      setStage('options-signal');
      log('Generating macro-aware options plays...');
      const os = await runOptionsAnalysis(sym, livePrice, nextExpiry, c, f, n, ps, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar);
      setOptionsSignal(os);
      log(`Rec: ${os.recommendation} | Call $${os.bestCall?.strike}@$${os.bestCall?.mid?.toFixed(2)} | Put $${os.bestPut?.strike}@$${os.bestPut?.mid?.toFixed(2)}`);
      setStage('done');
    } catch (e) { setError(e.message); log(`ERROR: ${e.message}`); }
    finally { setLoading(false); }
  };

  const livePrice = quote?.last || ohlcv?.current;
  const changePct = quote?.changePct || (ohlcv ? ((ohlcv.current - ohlcv.prev) / ohlcv.prev * 100) : null);
  const recColor  = optionsSignal?.recommendation === 'CALL' ? '#00ff88' : optionsSignal?.recommendation === 'PUT' ? '#ff4444' : '#ffaa00';
  const ivColor   = optionsSignal?.ivRank === 'LOW' ? '#00ff88' : optionsSignal?.ivRank === 'HIGH' ? '#ff4444' : '#ffaa00';

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 12 }}>$</span>
          <input value={inputVal} onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !loading && run(inputVal)}
            placeholder="TICKER" className="input"
            style={{ padding: '10px 12px 10px 26px', width: 120, fontSize: 14, fontWeight: 600 }} />
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

      {(quote || ohlcv) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#0f0f18', border: '1px solid #1e1e2e', padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28 }}>{ticker}</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>${livePrice?.toFixed(2)}</div>
          <div style={{ fontSize: 13, color: changePct >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>{changePct >= 0 ? '▲' : '▼'} {Math.abs(changePct)?.toFixed(2)}%</div>
          {priceSignal?.macroImpact       && <span style={{ fontSize: 10, color: MC[priceSignal.macroImpact]       }}>MACRO: {priceSignal.macroImpact}</span>}
          {priceSignal?.globalMarketTrend && <span style={{ fontSize: 10, color: GC[priceSignal.globalMarketTrend] }}>GLOBAL: {priceSignal.globalMarketTrend}</span>}
          {priceSignal?.geopoliticalRisk  && <span style={{ fontSize: 10, color: RC[priceSignal.geopoliticalRisk]  }}>GEO: {priceSignal.geopoliticalRisk}</span>}
          <div style={{ marginLeft: 'auto' }}><MiniChart data={ohlcv} /></div>
          {optionsSignal && !reanalyzing && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: recColor }}>LONG {optionsSignal.recommendation}S</div>
              <div style={{ fontSize: 10, color: '#555' }}>{optionsSignal.confidence}%</div>
            </div>
          )}
        </div>
      )}

      {expirations.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: '#444', marginRight: 4 }}>EXPIRY:</div>
          {expirations.slice(0, 10).map(exp => (
            <button key={exp} className="btn-sm"
              style={{ color: selectedExpiry === exp ? '#ffaa00' : '#556', borderColor: selectedExpiry === exp ? '#ffaa00' : '#2a2a3e', background: selectedExpiry === exp ? '#ffaa0011' : '#1a1a2e' }}
              onClick={() => switchExpiry(exp)} disabled={reanalyzing || loading}>
              {exp}
            </button>
          ))}
          {reanalyzing && <div className="pulse" style={{ fontSize: 10, color: '#ffaa00' }}>Re-analyzing...</div>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 8 }}>SCAN LOG</div>
            <div ref={termRef} style={{ height: 150, overflowY: 'auto', fontSize: 11, lineHeight: 1.8 }}>
              {logs.length === 0 && <div style={{ color: '#333' }}>&gt; Enter ticker above</div>}
              {logs.map((l, i) => (
                <div key={i} style={{ color: l.includes('ERROR') ? '#ff4444' : l.includes('Rec:') || l.includes('Signal:') ? '#00ff88' : l.includes('10Y') || l.includes('VIX') || l.includes('Macro') ? '#ffaa00' : '#446' }}>{l}</div>
              ))}
            </div>
          </div>
          <ChainTable chain={chain} selectedExpiry={selectedExpiry} livePrice={livePrice} />
          <BondPanel bonds={macro?.bonds} />
          <MacroNewsPanel macroNews={macro?.macroNews} calendar={macro?.calendar} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!optionsSignal && !loading && !reanalyzing && (
            <div className="card" style={{ textAlign: 'center', padding: 60, color: '#333' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Enter a ticker and click FIND OPTIONS PLAYS</div>
              <div style={{ fontSize: 11 }}>Includes bond market · geopolitical · Asia/Europe analysis</div>
            </div>
          )}
          {reanalyzing && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div className="pulse" style={{ fontSize: 12, color: '#ffaa00', marginBottom: 8 }}>RE-ANALYZING FOR {selectedExpiry}...</div>
            </div>
          )}
          {optionsSignal && !reanalyzing && (
            <>
              <div className="card fade-in" style={{ borderColor: recColor + '44' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 4 }}>AI OPTIONS RECOMMENDATION · {selectedExpiry}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 48, color: recColor, lineHeight: 1 }}>LONG {optionsSignal.recommendation}S</div>
                    <div style={{ fontSize: 11, color: '#8899aa', marginTop: 8, lineHeight: 1.6, maxWidth: 500 }}>{optionsSignal.reasoning}</div>
                    {optionsSignal.macroSetup      && <div style={{ fontSize: 11, color: '#ffaa0088', marginTop: 6, fontStyle: 'italic', borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>📊 {optionsSignal.macroSetup}</div>}
                    {optionsSignal.calendarWarning && <div style={{ fontSize: 11, color: '#ff884477', marginTop: 6, borderLeft: '2px solid #ff884433', paddingLeft: 8 }}>📅 {optionsSignal.calendarWarning}</div>}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 140 }}>
                    <div style={{ fontSize: 11, color: '#556' }}>CONFIDENCE</div>
                    <div style={{ fontSize: 28, fontWeight: 600 }}>{optionsSignal.confidence}%</div>
                    <div className="bar-bg"><div className="bar-fill" style={{ width: `${optionsSignal.confidence}%`, background: recColor }} /></div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: '#445' }}>IV ENVIRONMENT</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: ivColor }}>{optionsSignal.ivRank} IV</div>
                      <div style={{ fontSize: 10, color: '#667' }}>{optionsSignal.ivComment}</div>
                    </div>
                  </div>
                </div>
                {optionsSignal.positionSizing && (
                  <div style={{ background: '#070710', padding: 10, fontSize: 11, color: '#8899aa', borderLeft: '2px solid #ffaa0044' }}>💰 {optionsSignal.positionSizing}</div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <ContractCard data={optionsSignal.bestCall} type="CALL" />
                <ContractCard data={optionsSignal.bestPut}  type="PUT" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="card">
                  <div style={{ fontSize: 10, color: '#ffaa0066', marginBottom: 8 }}>⚡ CATALYSTS</div>
                  {optionsSignal.catalysts?.map((c, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#8899aa', padding: '4px 0', borderBottom: '1px solid #1a1a26', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ffaa00' }}>→</span>{c}
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div style={{ fontSize: 10, color: '#ff444466', marginBottom: 8 }}>⚠ KEY RISKS</div>
                  {optionsSignal.keyRisks?.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#8899aa', padding: '4px 0', borderBottom: '1px solid #1a0f0f', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ff4444' }}>!</span>{r}
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div style={{ fontSize: 10, color: '#ff884466', marginBottom: 8 }}>🌍 MACRO RISKS</div>
                  {optionsSignal.macroRisks?.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#8899aa', padding: '4px 0', borderBottom: '1px solid #1a1008', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ff8844' }}>⊕</span>{r}
                    </div>
                  ))}
                  {optionsSignal.globalMarketRisk && (
                    <div style={{ fontSize: 11, color: '#8899aa', padding: '4px 0', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ff8844' }}>🌐</span>{optionsSignal.globalMarketRisk}
                    </div>
                  )}
                </div>
              </div>

              {priceSignal && (
                <div className="card" style={{ borderColor: SC[priceSignal.signal] + '33' }}>
                  <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 10 }}>UNDERLYING SIGNAL + GLOBAL MACRO</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
                    {[
                      ['SIGNAL',     priceSignal.signal,             SC[priceSignal.signal]],
                      ['CONF',       `${priceSignal.confidence}%`,   '#fff'],
                      ['TARGET',     `$${priceSignal.priceTarget?.toFixed(2)}`, '#00ff88'],
                      ['STOP',       `$${priceSignal.stopLoss?.toFixed(2)}`,    '#ff4444'],
                      ['MACRO',      priceSignal.macroImpact,        MC[priceSignal.macroImpact]],
                      ['GEO RISK',   priceSignal.geopoliticalRisk,   RC[priceSignal.geopoliticalRisk]],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ background: '#070710', padding: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#445', marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#667', marginTop: 10, fontStyle: 'italic' }}>{priceSignal.thesis}</div>
                  {priceSignal.bondSignal && <div style={{ fontSize: 10, color: '#ffaa0077', marginTop: 6, borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>📊 {priceSignal.bondSignal}</div>}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#333', textAlign: 'center' }}>⚠ NOT FINANCIAL ADVICE. OPTIONS INVOLVE SIGNIFICANT RISK.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
