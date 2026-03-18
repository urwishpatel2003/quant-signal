const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

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
      last:      q.last,
      bid:       q.bid,
      ask:       q.ask,
      volume:    q.volume,
      change:    q.change,
      changePct: q.change_percentage,
      high:      q.high,
      low:       q.low,
      open:      q.open,
      prevClose: q.prevclose,
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

export async function fetchTradierChain(ticker, expiration, spot, ta = null) {
  try {
    const data    = await (await fetch(`${BASE}/tradier/chain/${ticker}?expiration=${expiration}`)).json();
    const options = data?.options?.option || [];
    const calls   = options.filter(o => o.option_type === 'call');
    const puts    = options.filter(o => o.option_type === 'put');
    const ref     = spot || 0;
    const range   = ref > 200 ? 20 : 15;

    const byATM      = arr => arr.sort((a, b) => Math.abs(a.strike - ref) - Math.abs(b.strike - ref));
    const atmCalls   = byATM(calls.filter(c => Math.abs(c.strike - ref) <= range));
    const atmPuts    = byATM(puts.filter(p => Math.abs(p.strike - ref) <= range));
    const finalCalls = atmCalls.length >= 3 ? atmCalls : byATM(calls);
    const finalPuts  = atmPuts.length  >= 3 ? atmPuts  : byATM(puts);

    // ── OI totals ──────────────────────────────────────────────────────────────
    const totalCallOI    = calls.reduce((s, c) => s + (c.open_interest || 0), 0);
    const totalPutOI     = puts.reduce( (s, p) => s + (p.open_interest || 0), 0);
    const totalCallVol   = calls.reduce((s, c) => s + (c.volume || 0), 0);
    const totalPutVol    = puts.reduce( (s, p) => s + (p.volume || 0), 0);

    // ── Average IVs ────────────────────────────────────────────────────────────
    const avgCallIVRaw = atmCalls.length
      ? atmCalls.reduce((s, c) => s + (c.greeks?.mid_iv || 0), 0) / atmCalls.length : 0;
    const avgPutIVRaw  = atmPuts.length
      ? atmPuts.reduce( (s, p) => s + (p.greeks?.mid_iv || 0), 0) / atmPuts.length  : 0;

    // ── IV Skew — put IV minus call IV ────────────────────────────────────────
    const ivSkewRaw  = avgPutIVRaw - avgCallIVRaw;
    const ivSkewPct  = (ivSkewRaw * 100).toFixed(1);
    const ivSkewLabel = ivSkewRaw > 0.05 ? 'PUT_SKEW'    // puts more expensive — crash fear
                      : ivSkewRaw < -0.05 ? 'CALL_SKEW'  // calls more expensive — melt-up fear
                      : 'NEUTRAL_SKEW';

    // ── IV Percentile (rough — using ATM options spread as proxy) ─────────────
    // Compute IV range across all ATM contracts
    const allATMIVs = [...atmCalls, ...atmPuts]
      .map(o => o.greeks?.mid_iv || 0)
      .filter(iv => iv > 0);
    const ivMin  = allATMIVs.length ? Math.min(...allATMIVs) : 0;
    const ivMax  = allATMIVs.length ? Math.max(...allATMIVs) : 1;
    const ivMid  = avgCallIVRaw;
    const ivPercentile = ivMax > ivMin
      ? Math.round(((ivMid - ivMin) / (ivMax - ivMin)) * 100)
      : 50;
    const ivPctLabel = ivPercentile >= 80 ? 'EXPENSIVE — prefer selling options or spreads'
                     : ivPercentile <= 20 ? 'CHEAP — good environment for buying options'
                     : 'FAIR VALUE';

    // ── Unusual volume detection ───────────────────────────────────────────────
    // Flag contracts where volume > 2x open interest (unusual activity)
    const unusualCalls = finalCalls
      .filter(c => c.volume > 0 && c.open_interest > 0 && c.volume > c.open_interest * 1.5)
      .map(c => `$${c.strike}C vol${c.volume}/OI${c.open_interest}`);
    const unusualPuts  = finalPuts
      .filter(p => p.volume > 0 && p.open_interest > 0 && p.volume > p.open_interest * 1.5)
      .map(p => `$${p.strike}P vol${p.volume}/OI${p.open_interest}`);

    // ── Vol/OI ratio overall ──────────────────────────────────────────────────
    const callVolOIRatio = totalCallOI > 0 ? (totalCallVol / totalCallOI).toFixed(2) : '0';
    const putVolOIRatio  = totalPutOI  > 0 ? (totalPutVol  / totalPutOI).toFixed(2)  : '0';

    // ── Map contract ──────────────────────────────────────────────────────────
    const map = c => {
      const bid    = parseFloat(c.bid  || 0);
      const ask    = parseFloat(c.ask  || 0);
      const mid    = parseFloat(((bid + ask) / 2).toFixed(2));
      const spread = ask > 0 ? ((ask - bid) / ask * 100).toFixed(1) : '0';
      const volOI  = c.open_interest > 0
        ? (c.volume / c.open_interest).toFixed(2) : '0';
      const unusualVolume = c.volume > 0 && c.open_interest > 0 && c.volume > c.open_interest * 1.5;

      return {
        strike:        c.strike,
        bid,
        ask,
        last:          parseFloat(c.last || 0),
        mid,
        spreadPct:     spread,           // bid-ask spread as % of ask
        wideSpread:    parseFloat(spread) > 15, // flag illiquid contracts
        iv:            ((c.greeks?.mid_iv || 0) * 100).toFixed(1),
        delta:         c.greeks?.delta?.toFixed(3),
        gamma:         c.greeks?.gamma?.toFixed(4),
        theta:         c.greeks?.theta?.toFixed(3),
        vega:          c.greeks?.vega?.toFixed(3),
        oi:            c.open_interest || 0,
        volume:        c.volume || 0,
        volOIRatio:    volOI,            // volume/OI ratio
        unusualVolume,                   // flag for smart money detection
        inTheMoney:    c.in_the_money,
        symbol:        c.symbol,
      };
    };

    // ── SMA distance % ────────────────────────────────────────────────────────
    // How extended is price from key moving averages
    const smaDistances = {};
    if (ta && ref > 0) {
      if (ta.sma20)  smaDistances.sma20Dist  = (((ref - ta.sma20)  / ta.sma20)  * 100).toFixed(1);
      if (ta.sma50)  smaDistances.sma50Dist  = (((ref - ta.sma50)  / ta.sma50)  * 100).toFixed(1);
      if (ta.sma200) smaDistances.sma200Dist = (((ref - ta.sma200) / ta.sma200) * 100).toFixed(1);
    }

    // ── Gamma concentration — highest gamma strike ─────────────────────────────
    const allContracts   = [...finalCalls, ...finalPuts];
    const highGammaStrike = allContracts.length
      ? allContracts.reduce((best, c) =>
          (c.greeks?.gamma || 0) > (best.greeks?.gamma || 0) ? c : best
        ).strike
      : null;

    return {
      spot:           ref,
      totalCallOI,
      totalPutOI,
      totalCallVol,
      totalPutVol,
      putCallRatio:   totalPutOI / (totalCallOI || 1),
      putCallVolRatio: totalPutVol / (totalCallVol || 1),
      avgCallIV:      (avgCallIVRaw * 100).toFixed(1),
      avgPutIV:       (avgPutIVRaw  * 100).toFixed(1),
      ivSkewPct,
      ivSkewLabel,
      ivPercentile,
      ivPctLabel,
      callVolOIRatio,
      putVolOIRatio,
      unusualCalls,
      unusualPuts,
      highGammaStrike,
      ...smaDistances,
      topCalls: finalCalls.slice(0, 8).map(map),
      topPuts:  finalPuts.slice(0,  8).map(map),
    };
  } catch { return null; }
}