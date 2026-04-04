import { useState, useEffect } from 'react';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain, isMarketClosed } from '../api/tradier';
import { runCombinedAnalysis, runOptionsAnalysis } from '../api/claude';
import { calcIndicators } from '../utils/indicators';
import { useUsage } from '../hooks/useUsage';
import MiniChart      from '../components/MiniChart';
import UsageBadge     from '../components/UsageBadge';
import UpgradeModal   from '../components/UpgradeModal';
import OptionsResults from '../components/OptionsResults';

export default function OptionsTab({ macro, initialTicker }) {
  const [inputVal,       setInputVal]       = useState(initialTicker || '');
  const [ticker,         setTicker]         = useState('');
  const [companyName,    setCompanyName]    = useState('');
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
  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [priceLoaded,    setPriceLoaded]    = useState(false);
  const [expiryOpen,     setExpiryOpen]     = useState(true);
  const [showResults,    setShowResults]    = useState(false);

  const { usage, limits, plan, canOptions, trackOptions, refreshUsage } = useUsage();

  useEffect(() => {
    if (initialTicker) { setInputVal(initialTicker); fetchTickerPrice(initialTicker); }
  }, [initialTicker]);

  useEffect(() => {
    if (loading) setExpiryOpen(false);
  }, [loading]);

  useEffect(() => {
    if (!optionsSignal && !loading) setExpiryOpen(true);
  }, [optionsSignal, loading]);

  // Auto-navigate to results page when analysis completes
  useEffect(() => {
    if (optionsSignal && !loading && !reanalyzing) {
      setShowResults(true);
    }
  }, [optionsSignal, loading, reanalyzing]);



  const fetchTickerPrice = async t => {
    const sym = t.toUpperCase();
    setTicker(sym); setError(''); setPriceLoaded(false);
    setQuote(null); setOhlcv(null); setTa(null);
    setExpirations([]); setSelectedExpiry('');
    setOptionsSignal(null); setPriceSignal(null);
    setShowResults(false);
    setExpiryOpen(true);
    setCompanyName('');
    try {
      const [q, p, exps] = await Promise.all([
        fetchTradierQuote(sym),
        fetchPrice(sym),
        fetchTradierExpirations(sym),
      ]);
      if (!q && !p) throw new Error('Ticker not found');
      setQuote(q); setOhlcv(p);
      // Fetch company name from Polygon search
      try {
        const nr = await fetch(`${import.meta.env.VITE_API_BASE}/search?q=${encodeURIComponent(sym)}`);
        const nd = await nr.json();
        const match = (nd || []).find(s => s.ticker === sym);
        if (match?.name) setCompanyName(match.name);
      } catch { /* non-critical */ }
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
    setShowResults(false);
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
    setReanalyzing(true); setOptionsSignal(null); setShowResults(false);
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

  const livePrice = quote?.last || ohlcv?.current;
  const changePct = quote?.change_percentage ||
    (ohlcv?.current && ohlcv?.prev ? ((ohlcv.current - ohlcv.prev) / ohlcv.prev * 100) : null);

  const STAGES = ['chain', 'options-signal'];
  const stageLabels = {
    'chain':          'SCANNING OPTIONS FLOW...',
    'options-signal': 'GENERATING OPTIONS PLAYS...',
  };

  return (
    <div style={{ position: 'relative' }}>
      {showUpgrade && <UpgradeModal type="options" onClose={() => setShowUpgrade(false)} />}

      {/* ── Results page — full swap ── */}
      {showResults && optionsSignal && (
        <OptionsResults
          ticker={ticker}
          livePrice={livePrice}
          changePct={changePct}
          ohlcv={ohlcv}
          priceSignal={priceSignal}
          optionsSignal={optionsSignal}
          ta={ta}
          macro={macro}
          selectedExpiry={selectedExpiry}
          onBack={() => setShowResults(false)}
          onAddToSim={onAddToSim}
          getSimBalance={getSimBalance}
        />
      )}

      {/* ── Loading overlay — always visible ── */}
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
                  width: active ? 12 : 8, height: active ? 12 : 8,
                  borderRadius: '50%',
                  background: done ? '#00ff88' : active ? '#ffaa00' : '#2a2a3e',
                  transition: 'all 0.3s',
                  boxShadow: active ? '0 0 10px #ffaa00' : done ? '0 0 6px #00ff88' : 'none',
                }} />
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#7788aa' }}>
            {ticker && `${ticker} · `}This may take 10–20 seconds
          </div>
        </div>
      )}

      {/* ── Options controls — hidden when showing results ── */}
      {!showResults && (
        <>
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
          <UsageBadge used={usage.options} limit={limits.options} label="ANALYSES" plan={plan} />
        </div>
      </div>

      {/* ── Price Bar ── */}
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
            {companyName && (
              <div style={{ fontSize: 12, color: '#c8d8f0', fontWeight: 500, marginTop: 2,
                maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {companyName}
              </div>
            )}
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
          <div style={{ marginLeft: 'auto' }}>
            <MiniChart data={ohlcv} />
          </div>
        </div>
      )}

      {/* ── Expiry selector ── */}
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
                      cursor:        'pointer', padding: '7px 10px', borderRadius: 2,
                      display:       'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 2, transition: 'all 0.15s', fontFamily: 'inherit', minWidth: 70,
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
        </>
      )}
    </div>
  );
}