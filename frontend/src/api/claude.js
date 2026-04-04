const BASE = import.meta.env.VITE_API_BASE;

async function callAnalyze(endpoint, payload) {
  const res  = await fetch(`${BASE}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), mode: 'cors', credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function runCombinedAnalysis(ticker, price, ohlcv, fundamentals, chain, news, bonds, macroNews, intlMarkets, calendar, ta, expiry, timeframeKey = 'swing', quote = null, market = 'US') {
  return callAnalyze('/api/analyze/combined', {
    ticker, price, ohlcv, fundamentals, chain, news,
    bonds, macroNews, intlMarkets, calendar, ta, expiry,
    timeframeKey, quote, market,
  });
}

export async function runPriceAnalysis(ticker, price, ohlcv, fundamentals, options, news, bonds, macroNews, intlMarkets, calendar, ta, timeframeKey = 'swing', market = 'US', financials = null, enhanced = null) {
  return callAnalyze('/api/analyze/price', {
    ticker, price, ohlcv, fundamentals, options, news,
    bonds, macroNews, intlMarkets, calendar, ta, timeframeKey, market,
    financials, enhanced,
  });
}

export async function runOptionsAnalysis(ticker, price, expiry, chain, fundamentals, news, priceSignal, bonds, macroNews, intlMarkets, calendar, ta, quote = null) {
  return callAnalyze('/api/analyze/options', {
    ticker, price, expiry, chain, fundamentals, news,
    priceSignal, bonds, macroNews, intlMarkets, calendar, ta, quote,
  });
}

export function buildMacroContext() { return ''; }