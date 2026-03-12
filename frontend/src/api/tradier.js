const BASE = '';

export function isMarketClosed() {
  const now = new Date();
  if ([0, 6].includes(now.getUTCDay())) return true;
  const jan   = new Date(now.getFullYear(), 0, 1);
  const jul   = new Date(now.getFullYear(), 6, 1);
  const isDST = now.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  const et    = now.getUTCHours() + (isDST ? -4 : -5) + now.getUTCMinutes() / 60;
  return et < 9.5 || et >= 16;
}

export async function fetchTradierQuote(ticker) {
  try {
    const data = await (await fetch(`${BASE}/tradier/quote/${ticker}`)).json();
    const q    = data?.quotes?.quote;
    if (!q) return null;
    return {
      last: q.last, bid: q.bid, ask: q.ask, volume: q.volume,
      change: q.change, changePct: q.change_percentage,
      high: q.high, low: q.low, open: q.open, prevClose: q.prevclose,
    };
  } catch { return null; }
}

export async function fetchTradierExpirations(ticker) {
  try {
    const data  = await (await fetch(`${BASE}/tradier/expirations/${ticker}`)).json();
    const all   = data?.expirations?.date || [];
    const today = new Date().toISOString().split('T')[0];
    return isMarketClosed() ? all.filter(d => d > today) : all.filter(d => d >= today);
  } catch { return []; }
}

export async function fetchTradierChain(ticker, expiration, spot) {
  try {
    const data    = await (await fetch(`${BASE}/tradier/chain/${ticker}?expiration=${expiration}`)).json();
    const options = data?.options?.option || [];
    const calls   = options.filter(o => o.option_type === 'call');
    const puts    = options.filter(o => o.option_type === 'put');
    const ref     = spot || 0;
    const range   = ref > 200 ? 20 : 15;
    const byATM   = arr => arr.sort((a, b) => Math.abs(a.strike - ref) - Math.abs(b.strike - ref));

    const atmCalls   = byATM(calls.filter(c => Math.abs(c.strike - ref) <= range));
    const atmPuts    = byATM(puts.filter(p => Math.abs(p.strike - ref) <= range));
    const finalCalls = atmCalls.length >= 3 ? atmCalls : byATM(calls);
    const finalPuts  = atmPuts.length  >= 3 ? atmPuts  : byATM(puts);

    const totalCallOI = calls.reduce((s, c) => s + (c.open_interest || 0), 0);
    const totalPutOI  = puts.reduce( (s, p) => s + (p.open_interest || 0), 0);
    const avgCallIV   = atmCalls.length ? atmCalls.reduce((s, c) => s + (c.greeks?.mid_iv || 0), 0) / atmCalls.length : 0;
    const avgPutIV    = atmPuts.length  ? atmPuts.reduce( (s, p) => s + (p.greeks?.mid_iv || 0), 0) / atmPuts.length  : 0;

    const map = c => ({
      strike: c.strike,
      bid:  parseFloat(c.bid  || 0),
      ask:  parseFloat(c.ask  || 0),
      last: parseFloat(c.last || 0),
      mid:  parseFloat(((parseFloat(c.bid || 0) + parseFloat(c.ask || 0)) / 2).toFixed(2)),
      iv:      ((c.greeks?.mid_iv || 0) * 100).toFixed(1),
      delta:   c.greeks?.delta?.toFixed(3),
      gamma:   c.greeks?.gamma?.toFixed(4),
      theta:   c.greeks?.theta?.toFixed(3),
      vega:    c.greeks?.vega?.toFixed(3),
      oi:      c.open_interest || 0,
      volume:  c.volume || 0,
      inTheMoney: c.in_the_money,
      symbol:  c.symbol,
    });

    return {
      spot: ref, totalCallOI, totalPutOI,
      putCallRatio: totalPutOI / (totalCallOI || 1),
      avgCallIV: (avgCallIV * 100).toFixed(1),
      avgPutIV:  (avgPutIV  * 100).toFixed(1),
      topCalls: finalCalls.slice(0, 8).map(map),
      topPuts:  finalPuts.slice(0,  8).map(map),
    };
  } catch { return null; }
}
