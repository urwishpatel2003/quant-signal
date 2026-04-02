// India market API — Dhan via backend proxy
const BASE = import.meta.env.VITE_API_BASE;

export async function fetchIndiaQuote(symbol) {
  try {
    const res  = await fetch(`${BASE}/india/quote/${symbol}`);
    const data = await res.json();
    if (data.error) return null;
    return data;
  } catch { return null; }
}

export async function fetchIndiaHistory(symbol, range = '3mo') {
  try {
    const res  = await fetch(`${BASE}/india/history/${symbol}?range=${range}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const q      = result.indicators.quote[0];
    const closes = (q.close || []).filter(c => c !== null && c !== undefined);
    return {
      timestamps: result.timestamp,
      open:    q.open,
      high:    q.high,
      low:     q.low,
      close:   q.close,
      volume:  q.volume,
      current: closes[closes.length - 1],
      prev:    closes[closes.length - 2],
    };
  } catch { return null; }
}

export async function fetchIndiaMovers() {
  try {
    const res  = await fetch(`${BASE}/india/movers`);
    return await res.json();
  } catch { return { gainers: [], losers: [], volume: [] }; }
}

export async function searchIndiaStocks(q) {
  try {
    const res  = await fetch(`${BASE}/india/search?q=${encodeURIComponent(q)}`);
    return await res.json();
  } catch { return []; }
}