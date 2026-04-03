import { useState, useRef } from 'react';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierExpirations, fetchTradierChain } from '../api/tradier';
import { runPriceAnalysis } from '../api/claude';
import { calcIndicators, TIMEFRAMES } from '../utils/indicators';

const BASE = import.meta.env.VITE_API_BASE;

async function fetchIndiaHistory(symbol, range = '3mo') {
  const res  = await fetch(`${BASE}/india/history/${symbol}?range=${range}`);
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const quote  = result.indicators?.quote?.[0] || {};
  const close  = quote.close || [];
  const closes = close.filter(c => c != null && !isNaN(c));
  if (!closes.length) return null;
  return {
    close:      quote.close,
    open:       quote.open,
    high:       quote.high,
    low:        quote.low,
    volume:     quote.volume,
    timestamps: result.timestamp,
    current:    closes[closes.length - 1],
    prev:       closes[closes.length - 2] ?? closes[closes.length - 1],
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

async function fetchQuarterlyFinancials(symbol, market) {
  try {
    const endpoint = market === 'INDIA'
      ? `${BASE}/financials/india/${symbol}`
      : `${BASE}/financials/us/${symbol}`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data;
  } catch { return null; }
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
  const [financials,   setFinancials]   = useState(null);
  const [options,      setOptions]      = useState(null);
  const [news,         setNews]         = useState([]);
  const [analysis,     setAnalysis]     = useState(null);
  const [ta,           setTa]           = useState(null);
  const [companyName,  setCompanyName]  = useState('');
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
      const f = isIndia ? await fetchIndiaFundamentals(t) : await fetchFundamentals(t);
      setFundamentals(f);
      if (f?.companyName) setCompanyName(f.companyName);

      setStage('financials');
      // Fetch quarterly financials, options, and news in parallel
      const [fin, optData, n] = await Promise.all([
        fetchQuarterlyFinancials(t, market),
        (async () => {
          if (isIndia) return null;
          const exps = await fetchTradierExpirations(t);
          if (!exps.length) return null;
          return fetchTradierChain(t, exps[0], livePrice);
        })(),
        isIndia ? fetchIndiaNews(t) : fetchStockNews(t),
      ]);

      setFinancials(fin);
      if (optData) setOptions(optData);
      setNews(n || []);

      setStage('claude');
      const a = await runPriceAnalysis(
        t, livePrice, p, f, optData, n,
        macro?.bonds, macro?.macroNews, macro?.intlMarkets, macro?.calendar,
        indicators, tf, market,
        fin   // quarterly financials → injected into AI thesis
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
    setCompanyName('');
    setFundamentals(null);
    setFinancials(null);
    setOptions(null);
    setNews([]);
    setAnalysis(null);
    setTa(null);
  };

  return {
    ticker, timeframe, setTimeframe,
    loading, stage, error,
    ohlcv, quote, fundamentals, financials, options, news, analysis, ta, companyName,
    terminalRef, runScan, reset,
  };
}