import { useState, useEffect } from 'react';
import { SC, RC, MC, GC } from '../utils/constants';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain, isMarketClosed } from '../api/tradier';
import { runCombinedAnalysis, runOptionsAnalysis } from '../api/claude';
import { calcIndicators } from '../utils/indicators';
import { useUsage } from '../hooks/useUsage';
import MiniChart      from '../components/MiniChart';
import ContractCard   from '../components/ContractCard';
import BondPanel      from '../components/BondPanel';
import TechnicalPanel from '../components/TechnicalPanel';
import TradeSetupCard  from '../components/TradeSetupCard';
import RiskRewardBar   from '../components/RiskRewardBar';
import PLSimulator     from '../components/PLSimulator';
import TradeChecklist  from '../components/TradeChecklist';
import EarningsWarning from '../components/EarningsWarning';
import UsageBadge      from '../components/UsageBadge';
import UpgradeModal    from '../components/UpgradeModal';

export default function OptionsTab({ macro, initialTicker }) {
  const [inputVal,       setInputVal]       = useState(initialTicker || '');
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
  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [priceLoaded,    setPriceLoaded]    = useState(false);
  const [expiryOpen,     setExpiryOpen]     = useState(true);

  const { usage, limits, canOptions, trackOptions, refreshUsage } = useUsage();

  useEffect(() => {
    if (initialTicker) { setInputVal(initialTicker); fetchTickerPrice(initialTicker); }
  }, [initialTicker]);

  // Auto-collapse expiry when analysis runs
  useEffect(() => {
    if (loading) setExpiryOpen(false);
  }, [loading]);

  // Auto-expand expiry when reset
  useEffect(() => {
    if (!optionsSignal && !loading) setExpiryOpen(true);
  }, [optionsSignal, loading]);

  const fetchTickerPrice = async t => {
    const sym = t.toUpperCase();
    setTicker(sym); setError(''); setPriceLoaded(false);
    setQuote(null); setOhlcv(null); setTa(null);
    setExpirations([]); setSelectedExpiry('');
    setOptionsSignal(null); setPriceSignal(null);
    setExpiryOpen(true);
    try {
      const [q, p, exps] = await Promise.all([
        fetchTradierQuote(sym),
        fetchPrice(sym),
        fetchTradierExpirations(sym),
      ]);
      if (!q && !p) throw new Error('Ticker not found');
      setQuote(q); setOhlcv(p);
      setTa(calcIndicators(p));
      setExpirations(exps);
      if (exps.length > 0) setSelectedExpiry(exps[0]);
      setPriceLoaded(true);
    } catch (e) { setError(e.message); }
  };

  const handleTickerSubmit = () => {
    if (!inputVal.trim()) return;
    fetchTickerPrice(inputVal);
  };

  const run = async () => {
    if (!ticker || !selectedExpiry) return;
    await refreshUsage();
    if (!canOptions()) { setShowUpgrade(true); return; }
    trackOptions();
    setLoading(true); setError(''); setOptionsSignal(null); setPriceSignal(null);
    setSelectedSide(null);
    try {
      const livePrice = quote?.last || ohlcv?.current;

      setStage('chain');
      const [c, f, n] = await Promise.all([
        fetchTradierChain(ticker, selectedExpiry, livePrice),
        fetchFundamentals(ticker),
        fetchStockNews(ticker),
      ]);
      setFundamentals(f); setNews(n);

      setStage('options-signal');
      const { priceSignal: ps, optionsSignal: os } = await runCombinedAnalysis(
        ticker, livePrice, ohlcv, f, c, n,
        macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar,
        ta, selectedExpiry, 'swing', quote
      );
      setPriceSignal(ps);
      setOptionsSignal(os);
      setStage('done');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const switchExpiry = async expiry => {
    if (!ticker || reanalyzing) return;
    setSelectedExpiry(expiry);
    if (!optionsSignal) return;
    setReanalyzing(true); setOptionsSignal(null);
    try {
      const livePrice = quote?.last || ohlcv?.current;
      const c  = await fetchTradierChain(ticker, expiry, livePrice);
      const os = await runOptionsAnalysis(
        ticker, livePrice, expiry, c, fundamentals, news, priceSignal,
        macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar, ta, quote
      );
      setOptionsSignal(os);
    } catch (e) { console.error(e); }
    finally { setReanalyzing(false); }
  };

  const livePrice    = quote?.last || ohlcv?.current;
  const changePct    = quote?.change_percentage ||
    (ohlcv?.current && ohlcv?.prev ? ((ohlcv.current - ohlcv.prev) / ohlcv.prev * 100) : null);
  const recColor     = optionsSignal?.recommendation === 'CALL' ? '#00ff88' : optionsSignal?.recommendation === 'PUT' ? '#ff4444' : '#ffaa00';
  const ivColor      = optionsSignal?.ivRank === 'LOW' ? '#00ff88' : optionsSignal?.ivRank === 'HIGH' ? '#ff4444' : '#ffaa00';
  const activeSide   = selectedSide || optionsSignal?.recommendation || 'CALL';
  const activeSignal = { ...optionsSignal, recommendation: activeSide };

  const STAGES = ['chain', 'options-signal'];
  const stageLabels = {
    'chain':          'SCANNING OPTIONS FLOW...',
    'options-signal': 'GENERATING OPTIONS PLAYS...',
  };

  return (
    <div style={{ position: 'relative' }}>
      {showUpgrade && <UpgradeModal type="options" onClose={() => setShowUpgrade(false)} />}

      {/* ── Full screen loading overlay ── */}
      {(loading || reanalyzing) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(7, 7, 14, 0.88)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%',
            border: '3px solid #ffaa0022', borderTop: '3px solid #ffaa00',
            animation: 'spin 0.8s linear infinite' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24,
              color: '#ffaa00', letterSpacing: '0.15em', marginBottom: 8 }}>
              {reanalyzing ? 'RE-ANALYZING' : 'ANALYZING'}
            </div>
            <div style={{ fontSize: 12, color: '#ffaa0066', letterSpacing: '0.2em' }}>
              {reanalyzing ? `EXPIRY: ${selectedExpiry}` : (stageLabels[stage] || 'LOADING...')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {STAGES.map((s, i) => {
              const currentIdx = STAGES.indexOf(stage);
              const done   = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={s} style={{
                  width:        active ? 12 : 8,
                  height:       active ? 12 : 8,
                  borderRadius: '50%',
                  background:   done ? '#00ff88' : active ? '#ffaa00' : '#2a2a3e',
                  transition:   'all 0.3s',
                  boxShadow:    active ? '0 0 10px #ffaa00' : done ? '0 0 6px #00ff88' : 'none',
                }} />
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#7788aa' }}>
            {ticker && `${ticker} · `}This may take 10–20 seconds
          </div>
        </div>
      )}

      {/* ── Ticker input ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 12 }}>$</span>
            <input value={inputVal}
              onChange={e => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleTickerSubmit()}
              placeholder="ENTER TICKER..."
              className="input"
              style={{ padding: '10px 12px 10px 26px', fontSize: 14, fontWeight: 600 }} />
          </div>
          <button className="btn-sm"
            onClick={handleTickerSubmit}
            style={{ whiteSpace: 'nowrap', color: '#ffaa00', borderColor: '#ffaa0044', padding: '10px 16px' }}>
            LOAD
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: isMarketClosed() ? '#ff444488' : '#00ff8888' }}>
              {isMarketClosed() ? '🔴 MKT CLOSED' : '🟢 MKT OPEN'}
            </div>
            {error && <div style={{ fontSize: 11, color: '#ff4444' }}>{error}</div>}
          </div>
          <UsageBadge used={usage.options} limit={limits.options} label="ANALYSES" />
        </div>
      </div>

      {/* ── Clean Price Bar — ticker, price, change, chart only ── */}
      {priceLoaded && (quote || ohlcv) && (
        <div className="fade-in" style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          background: '#0f0f18', border: '1px solid #1e1e2e',
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, lineHeight: 1, color: '#fff' }}>
              {ticker}
            </div>
            <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.1em', marginTop: 2 }}>
              {isMarketClosed() ? 'MARKET CLOSED' : 'LIVE'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#fff' }}>${livePrice?.toFixed(2)}</div>
            <div style={{ fontSize: 12, fontWeight: 600,
              color: changePct !== null && changePct >= 0 ? '#00ff88' : '#ff4444' }}>
              {changePct !== null ? `${changePct >= 0 ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%` : '—'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <MiniChart data={ohlcv} />
            {optionsSignal && !reanalyzing && (
              <div style={{
                textAlign: 'center',
                background: recColor + '11',
                border: `1px solid ${recColor}44`,
                padding: '8px 16px', borderRadius: 2, minWidth: 90,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: recColor, lineHeight: 1 }}>
                  {optionsSignal.recommendation === 'NEUTRAL' ? 'NEUTRAL' : `LONG ${optionsSignal.recommendation}S`}
                </div>
                <div style={{ fontSize: 10, color: '#99aacc', marginTop: 2 }}>{optionsSignal.confidence}%</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Expiry selector — collapsible ── */}
      {priceLoaded && expirations.length > 0 && (
        <div className="card fade-in" style={{
          marginBottom: 16,
          borderColor: expiryOpen && !optionsSignal ? '#ffaa0044' : '#1e1e2e',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: expiryOpen ? 12 : 0,
          }}>
            <div>
              <div style={{ fontSize: 10, color: expiryOpen && !optionsSignal ? '#ffaa00' : '#8899bb', letterSpacing: '0.15em' }}>
                EXPIRY DATE
              </div>
              {!expiryOpen && (
                <div style={{ fontSize: 12, color: '#ffaa00', fontWeight: 600, marginTop: 2 }}>
                  {selectedExpiry} · {Math.round((new Date(selectedExpiry) - new Date()) / (1000 * 60 * 60 * 24))}d
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {expiryOpen && !optionsSignal && (
                <span style={{ fontSize: 9, color: '#ffaa0066', background: '#ffaa0011',
                  border: '1px solid #ffaa0033', padding: '2px 8px', borderRadius: 2 }}>
                  SELECT BEFORE SCANNING
                </span>
              )}
              <button onClick={() => setExpiryOpen(o => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: '#8899bb', fontSize: 12, padding: '2px 6px', fontFamily: 'inherit' }}>
                {expiryOpen ? '▲' : '▼'}
              </button>
            </div>
          </div>

          {expiryOpen && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {expirations.slice(0, 10).map(exp => {
                const isSelected = selectedExpiry === exp;
                const daysOut    = Math.round((new Date(exp) - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <button key={exp}
                    onClick={() => switchExpiry(exp)}
                    disabled={reanalyzing || loading}
                    style={{
                      background:    isSelected ? '#ffaa0011' : '#0a0a14',
                      border:        `1px solid ${isSelected ? '#ffaa00' : '#2a2a3e'}`,
                      color:         isSelected ? '#ffaa00' : '#99aacc',
                      cursor:        'pointer',
                      padding:       '7px 10px',
                      borderRadius:  2,
                      display:       'flex',
                      flexDirection: 'column',
                      alignItems:    'center',
                      gap:           2,
                      transition:    'all 0.15s',
                      fontFamily:    'inherit',
                      minWidth:      70,
                    }}>
                    <span style={{ fontSize: 11, fontWeight: isSelected ? 600 : 400 }}>{exp}</span>
                    <span style={{ fontSize: 9, color: isSelected ? '#ffaa0088' : '#7788aa' }}>{daysOut}d</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Find Options Plays button ── */}
      {priceLoaded && !optionsSignal && !loading && (
        <button className="btn" onClick={run}
          disabled={!selectedExpiry || loading}
          style={{ width: '100%', fontSize: 15, padding: '14px', marginBottom: 16,
            opacity: selectedExpiry ? 1 : 0.4 }}>
          ⚡ FIND OPTIONS PLAYS — {ticker}{selectedExpiry && ` · ${selectedExpiry}`}
        </button>
      )}

      {/* ── Empty state ── */}
      {!priceLoaded && !error && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#333' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 14, color: '#99aacc', marginBottom: 8 }}>
            Enter a ticker above to get started
          </div>
          <div style={{ fontSize: 11, color: '#7788aa', lineHeight: 1.8 }}>
            Step 1: Enter ticker &amp; press LOAD<br />
            Step 2: Select expiry date<br />
            Step 3: Click FIND OPTIONS PLAYS
          </div>
        </div>
      )}

      {/* ── Results ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {optionsSignal && !reanalyzing && (
          <>
            <EarningsWarning ticker={ticker} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />

            {/* AI Recommendation */}
            <div className="card fade-in" style={{ borderColor: recColor + '44' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.2em', marginBottom: 4 }}>
                    AI OPTIONS RECOMMENDATION · {selectedExpiry}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(32px, 5vw, 48px)', color: recColor, lineHeight: 1 }}>
                    {optionsSignal.recommendation === 'NEUTRAL' ? 'STAY NEUTRAL' : `LONG ${optionsSignal.recommendation}S`}
                  </div>
                  <div style={{ fontSize: 12, color: '#8899aa', marginTop: 8, lineHeight: 1.6 }}>
                    {optionsSignal.reasoning}
                  </div>
                  {optionsSignal.macroSetup      && <div style={{ fontSize: 11, color: '#ffaa0088', marginTop: 6, fontStyle: 'italic', borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>📊 {optionsSignal.macroSetup}</div>}
                  {optionsSignal.calendarWarning && <div style={{ fontSize: 11, color: '#ff884477', marginTop: 6, borderLeft: '2px solid #ff884433', paddingLeft: 8 }}>📅 {optionsSignal.calendarWarning}</div>}
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: '#99aacc' }}>CONFIDENCE</div>
                  <div style={{ fontSize: 28, fontWeight: 600 }}>{optionsSignal.confidence}%</div>
                  <div className="bar-bg"><div className="bar-fill" style={{ width: `${optionsSignal.confidence}%`, background: recColor }} /></div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: '#8899bb' }}>IV ENVIRONMENT</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ivColor }}>{optionsSignal.ivRank} IV</div>
                    <div style={{ fontSize: 11, color: '#aabbcc' }}>{optionsSignal.ivComment}</div>
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

            <TradeChecklist ta={ta} priceSignal={priceSignal} optionsSignal={activeSignal} calendar={macro?.calendar} selectedExpiry={selectedExpiry} />
            <PLSimulator optionsSignal={{ ...activeSignal, ticker }} livePrice={livePrice} />
            <TradeSetupCard optionsSignal={activeSignal} priceSignal={priceSignal} ticker={ticker} selectedExpiry={selectedExpiry} />
            <RiskRewardBar optionsSignal={activeSignal} />

            {/* Technical + Underlying */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {ta && <TechnicalPanel ta={ta} />}
              {priceSignal && (
                <div className="card" style={{ borderColor: SC[priceSignal.signal] + '33' }}>
                  <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.15em', marginBottom: 10 }}>UNDERLYING SIGNAL</div>
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
                        <div style={{ fontSize: 8, color: '#8899bb', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {ta && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                      {[
                        ['RSI 14', ta.rsi14,            ta.rsi14 > 70 ? '#ff4444' : ta.rsi14 < 30 ? '#00ff88' : '#ffaa00'],
                        ['TREND',  ta.trendSignal,       ta.trendSignal === 'BULLISH' ? '#00ff88' : '#ff4444'],
                        ['VOLUME', `${ta.volumeRatio}x`, ta.volumeSignal === 'HIGH' ? '#ffaa00' : '#c8c8d0'],
                        ['GLOBAL', priceSignal.globalMarketTrend, GC[priceSignal.globalMarketTrend]],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ background: '#070710', padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ fontSize: 8, color: '#8899bb', marginBottom: 2 }}>{l}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: '#aabbcc', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                    {priceSignal.thesis}
                  </div>
                  {priceSignal.bondSignal && (
                    <div style={{ fontSize: 10, color: '#ffaa0077', marginTop: 6, borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>
                      📊 {priceSignal.bondSignal}
                    </div>
                  )}
                </div>
              )}
            </div>

            <BondPanel bonds={macro?.bonds} />

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

            <div style={{ fontSize: 11, color: '#333', textAlign: 'center' }}>
              ⚠ NOT FINANCIAL ADVICE. OPTIONS INVOLVE SIGNIFICANT RISK.
            </div>
          </>
        )}
      </div>
    </div>
  );
}