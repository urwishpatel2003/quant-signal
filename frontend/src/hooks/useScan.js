import { useState, useRef, useEffect } from 'react';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain } from '../api/tradier';
import { runPriceAnalysis } from '../api/claude';
import { calcIndicators } from '../utils/indicators';

export function useScan(macro) {
  const [ticker,       setTicker]       = useState('');
  const [loading,      setLoading]      = useState(false);
  const [stage,        setStage]        = useState('');
  const [error,        setError]        = useState('');
  const [ohlcv,        setOhlcv]        = useState(null);
  const [quote,        setQuote]        = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [options,      setOptions]      = useState(null);
  const [news,         setNews]         = useState([]);
  const [analysis,     setAnalysis]     = useState(null);
  const [logs,         setLogs]         = useState([]);
  const terminalRef = useRef(null);
  const [ta, setTa] = useState(null);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  const log = msg => setLogs(prev => [...prev, `> ${msg}`]);

  const runScan = async sym => {
    const t = sym.toUpperCase();
    setLoading(true); setError(''); setAnalysis(null); setLogs([]);
    setTicker(t);
    try {
      log(`Scanning ${t}...`); setStage('price');
      const [p, q] = await Promise.all([fetchPrice(t), fetchTradierQuote(t)]);
      if (!p) throw new Error('Ticker not found');
      setOhlcv(p); setQuote(q);
      const indicators = calcIndicators(p);
      setTa(indicators);
      log(`RSI: ${indicators?.rsi14} [${indicators?.rsiSignal}] | Trend: ${indicators?.trendSignal} | Vol: ${indicators?.volumeSignal}`);
      const livePrice = q?.last || p.current;
      log(`Price: $${livePrice?.toFixed(2)}`);

      setStage('fundamentals');
      const f = await fetchFundamentals(t); setFundamentals(f);

      setStage('options');
      const exps = await fetchTradierExpirations(t);
      let optData = null;
      if (exps.length > 0) {
        optData = await fetchTradierChain(t, exps[0], livePrice);
        setOptions(optData);
        log(`Options: P/C=${optData?.putCallRatio?.toFixed(2)} | IV=${optData?.avgCallIV}%`);
      }

      setStage('news');
      const n = await fetchStockNews(t); setNews(n);

      if (macro?.bonds) log(`10Y=${macro.bonds.tnx?.current?.toFixed(2)}% | Curve=${macro.bonds.yieldCurve}% ${macro.bonds.inverted ? '⚠INVERTED' : ''}`);

      setStage('claude'); log('Running global macro analysis...');
      const a = await runPriceAnalysis(t, livePrice, p, f, optData, n, macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar, indicators);
      setAnalysis(a);
      log(`Signal: ${a.signal} ${a.confidence}% | Macro: ${a.macroImpact} | Geo: ${a.geopoliticalRisk} | Global: ${a.globalMarketTrend}`);
      setStage('done');
    } catch (e) { setError(e.message); log(`ERROR: ${e.message}`); }
    finally { setLoading(false); }
  };

  return { ticker, loading, stage, error, ohlcv, quote, fundamentals, options, news, analysis, logs, terminalRef, runScan, ta };
}
