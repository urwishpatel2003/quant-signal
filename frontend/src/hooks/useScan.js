import { useState, useRef } from 'react';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain } from '../api/tradier';
import { runPriceAnalysis } from '../api/claude';
import { calcIndicators, TIMEFRAMES } from '../utils/indicators';

export function useScan(macro) {
  const [ticker,       setTicker]       = useState('');
  const [timeframe,    setTimeframe]    = useState('swing');
  const [loading,      setLoading]      = useState(false);
  const [stage,        setStage]        = useState('');
  const [error,        setError]        = useState('');
  const [ohlcv,        setOhlcv]        = useState(null);
  const [quote,        setQuote]        = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [options,      setOptions]      = useState(null);
  const [news,         setNews]         = useState([]);
  const [analysis,     setAnalysis]     = useState(null);
  const [ta,           setTa]           = useState(null);
  const terminalRef = useRef(null);

  const runScan = async (sym, tf = timeframe) => {
    const t = sym.toUpperCase();
    const tfConfig = TIMEFRAMES[tf];
    setLoading(true); setError(''); setAnalysis(null);
    setTicker(t); setTimeframe(tf);
    try {
      setStage('price');
      const [p, q] = await Promise.all([
        fetchPrice(t, tfConfig.range, tfConfig.interval),
        fetchTradierQuote(t)
      ]);
      if (!p) throw new Error('Ticker not found');
      setOhlcv(p); setQuote(q);
      const indicators = calcIndicators(p, tf);
      setTa(indicators);
      const livePrice = q?.last || p.current;

      setStage('fundamentals');
      const f = await fetchFundamentals(t);
      setFundamentals(f);

      setStage('options');
      const exps = await fetchTradierExpirations(t);
      let optData = null;
      if (exps.length > 0) {
        optData = await fetchTradierChain(t, exps[0], livePrice);
        setOptions(optData);
      }

      setStage('news');
      const n = await fetchStockNews(t);
      setNews(n);

      setStage('claude');
      const a = await runPriceAnalysis(
        t, livePrice, p, f, optData, n,
        macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar,
        indicators, tf
      );
      setAnalysis(a);
      setStage('done');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setTicker('');
    setLoading(false);
    setStage('');
    setError('');
    setOhlcv(null);
    setQuote(null);
    setFundamentals(null);
    setOptions(null);
    setNews([]);
    setAnalysis(null);
    setTa(null);
  };

  return {
    ticker, timeframe, setTimeframe,
    loading, stage, error,
    ohlcv, quote, fundamentals, options, news, analysis, ta,
    terminalRef, runScan, reset,
  };
}