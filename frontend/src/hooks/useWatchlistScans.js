// src/hooks/useWatchlistScans.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote } from '../api/tradier';
import { calcIndicators } from '../utils/indicators';

const BASE = import.meta.env.VITE_API_BASE;

// ── India data fetchers ───────────────────────────────────────────────────────
async function fetchIndiaHistory(symbol, range = '1y') {
  const res  = await fetch(`${BASE}/india/history/${symbol}?range=${range}`);
  if (!res.ok) return null;
  const data   = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const quote  = result.indicators?.quote?.[0] || {};
  const closes = (quote.close || []).filter(c => c != null && !isNaN(c));
  if (!closes.length) return null;
  return {
    close: quote.close, open: quote.open, high: quote.high,
    low: quote.low, volume: quote.volume,
    timestamps: result.timestamp,
    current: closes[closes.length - 1],
    prev:    closes[closes.length - 2] ?? closes[closes.length - 1],
  };
}

async function fetchIndiaQuote(symbol) {
  const res = await fetch(`${BASE}/india/quote/${symbol}`);
  if (!res.ok) return null;
  const q = await res.json();
  return q ? { last: q.price, open: q.open, change: q.change, change_percentage: q.changePct } : null;
}

async function fetchIndiaFundamentals(symbol) {
  const res = await fetch(`${BASE}/india/fundamentals/${symbol}`);
  if (!res.ok) return null;
  return await res.json();
}

async function fetchIndiaNews(symbol) {
  try {
    const res = await fetch(`${BASE}/india/news/${symbol}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// ── Scan a single ticker ──────────────────────────────────────────────────────
async function runWatchlistScan(ticker, market = 'US') {
  const isIndia = market === 'INDIA';

  let p, q;
  if (isIndia) {
    [p, q] = await Promise.all([
      fetchIndiaHistory(ticker, '1y'),
      fetchIndiaQuote(ticker),
    ]);
  } else {
    [p, q] = await Promise.all([
      fetchPrice(ticker, '1y', '1d'),
      fetchTradierQuote(ticker),
    ]);
  }

  if (!p) throw new Error('No price data');
  const ta        = calcIndicators(p, 'longterm');
  const livePrice = q?.last || p.current;

  const [f, n] = await Promise.all([
    isIndia ? fetchIndiaFundamentals(ticker) : fetchFundamentals(ticker),
    isIndia ? fetchIndiaNews(ticker)         : fetchStockNews(ticker),
  ]);

  const res = await fetch(`${BASE}/api/analyze/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticker, price: livePrice, ohlcv: p,
      fundamentals: f, news: n, ta,
    }),
  });
  const analysis = await res.json();
  if (analysis.error) throw new Error(analysis.error);

  return { analysis, ta, news: n, fundamentals: f, ohlcv: p, quote: q };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useWatchlistScans(tickers, market = 'US') {
  const { user }    = useUser();
  const [scans,     setScans]     = useState({});
  const scanningRef = useRef(new Set());

  const scanTicker = useCallback(async (ticker) => {
    if (scanningRef.current.has(ticker)) return;
    scanningRef.current.add(ticker);
    setScans(prev => ({ ...prev, [ticker]: { data: null, loading: true, error: '' } }));
    try {
      const data = await runWatchlistScan(ticker, market);
      setScans(prev => ({ ...prev, [ticker]: { data, loading: false, error: '' } }));
    } catch (e) {
      setScans(prev => ({ ...prev, [ticker]: { data: null, loading: false, error: e.message } }));
    }
    scanningRef.current.delete(ticker);
  }, [market]);

  // Reset and re-scan when market or tickers change
  useEffect(() => {
    if (!user || !tickers?.length) return;
    // Clear stale scans for tickers no longer in list
    setScans(prev => {
      const next = {};
      tickers.forEach(t => { if (prev[t]) next[t] = prev[t]; });
      return next;
    });
    tickers.forEach((ticker, i) => {
      setTimeout(() => scanTicker(ticker), i * 800);
    });
  }, [tickers?.join(','), user?.id, market]); // eslint-disable-line

  const refreshAll = useCallback(() => {
    if (!tickers?.length) return;
    setScans({});
    scanningRef.current.clear();
    tickers.forEach((ticker, i) => {
      setTimeout(() => scanTicker(ticker), i * 800);
    });
  }, [tickers?.join(','), scanTicker]); // eslint-disable-line

  return { scans, refreshAll };
}