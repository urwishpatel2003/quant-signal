import { useState, useRef } from 'react';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain } from '../api/tradier';
import { runPriceAnalysis } from '../api/claude';
import { calcIndicators, TIMEFRAMES } from '../utils/indicators';

const BASE = import.meta.env.VITE_API_BASE;

async function fetchIndiaHistory(symbol, range = '3mo') {
  const res  = await fetch(`${BASE}/india/history/${symbol}?range=${range}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const quote  = result.indicators?.quote?.[0] || {};
  const closes = (quote.close || []).filter(c => c != null);
  if (!closes.length) return null;
  return {
    close: quote.close, open: quote.open, high: quote.high,
    low: quote.low, volume: quote.volume,
    timestamps: result.timestamp,
    current: closes[closes.length - 1],
    prev:    closes[closes.length - 2],
  };
}

async function fetchIndiaQuote(symbol) {
  const res = await fetch(`${BASE}/india/quote/${symbol}`);
  if (!res.ok) return null;
  return await res.json();
}

async function fetchIndiaFundamentals(symbol) {
  try {
    const res = await fetch(`${BASE}/india/fundamentals/${symbol}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchIndiaNews(symbol) {
  try {
    const res = await fetch(`${BASE}/india/news/${symbol}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

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

  const runScan = async (sym, tf = timeframe, market = 'US') => {
    const t        = sym.toUpperCase();
    const tfConfig = TIMEFRAMES[tf];
    const isIndia  = market === 'INDIA';

    setLoading(true); setError(''); setAnalysis(null);
    setTicker(t); setTimeframe(tf);

    try {
      setStage('price');

      let p, q;
      if (isIndia) {
        [p, q] = await Promise.all([
          fetchIndiaHistory(t, tfConfig.range),
          fetchIndiaQuote(t),
        ]);
        if (!p) throw new Error(`${t} not found on NSE. Check the ticker symbol.`);
        q = q ? { last: q.price, open: q.open, change: q.change, change_percentage: q.changePct } : null;
      } else {
        [p, q] = await Promise.all([
          fetchPrice(t, tfConfig.range, tfConfig.interval),
          fetchTradierQuote(t),
        ]);
        if (!p) throw new Error('Ticker not found');
      }

      setOhlcv(p); setQuote(q);
      const indicators = calcIndicators(p, tf);
      setTa(indicators);
      const livePrice = q?.last || p.current;

      setStage('fundamentals');
      // Use India-specific fundamentals for NSE stocks (Yahoo .NS)
      const f = isIndia ? await fetchIndiaFundamentals(t) : await fetchFundamentals(t);
      setFundamentals(f);

      setStage('options');
      let optData = null;
      if (!isIndia) {
        const exps = await fetchTradierExpirations(t);
        if (exps.length > 0) {
          optData = await fetchTradierChain(t, exps[0], livePrice);
          setOptions(optData);
        }
      }

      setStage('news');
      const n = isIndia ? await fetchIndiaNews(t) : await fetchStockNews(t);
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