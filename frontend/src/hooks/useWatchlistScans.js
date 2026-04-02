// src/hooks/useWatchlistScans.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { fetchPrice, fetchFundamentals, fetchStockNews } from '../api/yahoo';
import { fetchTradierQuote, fetchTradierChain, fetchTradierExpirations } from '../api/tradier';
import { calcIndicators } from '../utils/indicators';

const BASE = import.meta.env.VITE_API_BASE;

async function runWatchlistScan(ticker) {
  const [p, q] = await Promise.all([
    fetchPrice(ticker, '1y', '1d'),
    fetchTradierQuote(ticker),
  ]);
  if (!p) throw new Error('No price data');
  const ta        = calcIndicators(p, 'longterm');
  const livePrice = q?.last || p.current;
  const [f, n]    = await Promise.all([
    fetchFundamentals(ticker),
    fetchStockNews(ticker),
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

export function useWatchlistScans(tickers) {
  const { user }    = useUser();
  const [scans,     setScans]     = useState({}); // { [ticker]: { data, loading, error } }
  const scanningRef = useRef(new Set());

  const scanTicker = useCallback(async (ticker) => {
    if (scanningRef.current.has(ticker)) return;
    scanningRef.current.add(ticker);
    setScans(prev => ({ ...prev, [ticker]: { data: null, loading: true, error: '' } }));
    try {
      const data = await runWatchlistScan(ticker);
      setScans(prev => ({ ...prev, [ticker]: { data, loading: false, error: '' } }));
    } catch (e) {
      setScans(prev => ({ ...prev, [ticker]: { data: null, loading: false, error: e.message } }));
    }
    scanningRef.current.delete(ticker);
  }, []);

  // Run scans for all tickers with a small stagger to avoid hammering APIs
  useEffect(() => {
    if (!user || !tickers?.length) return;
    tickers.forEach((ticker, i) => {
      if (!scans[ticker]) {
        setTimeout(() => scanTicker(ticker), i * 800); // 800ms stagger between tickers
      }
    });
  }, [tickers?.join(','), user?.id]); // eslint-disable-line

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