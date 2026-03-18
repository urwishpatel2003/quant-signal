export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

export function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
}

export function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return parseFloat(ema.toFixed(2));
}

export function calcMACD(closes) {
  if (closes.length < 35) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (!ema12 || !ema26) return null;
  const macdLine = parseFloat((ema12 - ema26).toFixed(3));
  const macdHistory = [];
  for (let i = closes.length - 9; i <= closes.length - 1; i++) {
    const slice = closes.slice(0, i + 1);
    const e12   = calcEMA(slice, 12);
    const e26   = calcEMA(slice, 26);
    if (e12 && e26) macdHistory.push(e12 - e26);
  }
  const signalLine = macdHistory.length >= 9
    ? parseFloat(calcEMA(macdHistory, 9).toFixed(3)) : null;
  const histogram = signalLine != null
    ? parseFloat((macdLine - signalLine).toFixed(3)) : null;
  return {
    macdLine, signalLine, histogram,
    trend: macdLine > 0 ? 'BULLISH' : 'BEARISH',
    cross: signalLine != null
      ? (macdLine > signalLine ? 'BULLISH_CROSS' : 'BEARISH_CROSS') : null,
  };
}

export function calcBollingerBands(closes, period = 20, stdDev = 2) {
  if (closes.length < period) return null;
  const slice    = closes.slice(-period);
  const mean     = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
  const std      = Math.sqrt(variance);
  const upper    = parseFloat((mean + stdDev * std).toFixed(2));
  const lower    = parseFloat((mean - stdDev * std).toFixed(2));
  const middle   = parseFloat(mean.toFixed(2));
  const price    = closes[closes.length - 1];
  const bWidth   = parseFloat(((upper - lower) / middle * 100).toFixed(2));
  const bPct     = parseFloat(((price - lower) / (upper - lower)).toFixed(3));
  return {
    upper, middle, lower, bWidth, bPct,
    position: bPct > 0.8 ? 'NEAR_UPPER' : bPct < 0.2 ? 'NEAR_LOWER' : 'MIDDLE',
    squeeze:  bWidth < 5,
  };
}

export function calcAvgVolume(volumes, period = 20) {
  if (!volumes || volumes.length < period) return null;
  const slice = volumes.filter(Boolean).slice(-period);
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

// ─── ATR (Average True Range) ─────────────────────────────────────────────────
export function calcATR(ohlcv, period = 14) {
  const { high, low, close } = ohlcv;
  if (!high || !low || !close || close.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < close.length; i++) {
    const hl  = high[i]  - low[i];
    const hpc = Math.abs(high[i]  - close[i - 1]);
    const lpc = Math.abs(low[i]   - close[i - 1]);
    trueRanges.push(Math.max(hl, hpc, lpc));
  }

  // Wilder smoothing (same as RSI)
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  const price      = close[close.length - 1];
  const atrPct     = parseFloat((atr / price * 100).toFixed(2));
  const atr2       = parseFloat((atr * 2).toFixed(2));  // 2x ATR stop
  const atr1       = parseFloat(atr.toFixed(2));         // 1x ATR stop
  const volatility = atrPct > 4 ? 'HIGH' : atrPct > 2 ? 'MEDIUM' : 'LOW';

  return {
    atr:         parseFloat(atr.toFixed(2)),
    atrPct,
    atr1Stop:    parseFloat((price - atr1).toFixed(2)),   // long stop: price - 1ATR
    atr2Stop:    parseFloat((price - atr2).toFixed(2)),   // long stop: price - 2ATR
    atr1Target:  parseFloat((price + atr1).toFixed(2)),   // long target: price + 1ATR
    atr2Target:  parseFloat((price + atr2).toFixed(2)),   // long target: price + 2ATR
    shortStop:   parseFloat((price + atr1).toFixed(2)),   // short stop: price + 1ATR
    shortTarget: parseFloat((price - atr2).toFixed(2)),   // short target: price - 2ATR
    volatility,
  };
}

// ─── Stochastic RSI ───────────────────────────────────────────────────────────
export function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  if (closes.length < rsiPeriod + stochPeriod + smoothK + smoothD) return null;

  // Build RSI series
  const rsiSeries = [];
  for (let i = rsiPeriod; i <= closes.length; i++) {
    const val = calcRSI(closes.slice(0, i), rsiPeriod);
    if (val != null) rsiSeries.push(val);
  }

  if (rsiSeries.length < stochPeriod) return null;

  // Stochastic of RSI
  const rawK = [];
  for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
    const slice  = rsiSeries.slice(i - stochPeriod + 1, i + 1);
    const minRSI = Math.min(...slice);
    const maxRSI = Math.max(...slice);
    const range  = maxRSI - minRSI;
    rawK.push(range === 0 ? 50 : ((rsiSeries[i] - minRSI) / range) * 100);
  }

  if (rawK.length < smoothK) return null;

  // Smooth %K
  const smoothedK = [];
  for (let i = smoothK - 1; i < rawK.length; i++) {
    const avg = rawK.slice(i - smoothK + 1, i + 1).reduce((a, b) => a + b, 0) / smoothK;
    smoothedK.push(parseFloat(avg.toFixed(2)));
  }

  if (smoothedK.length < smoothD) return null;

  // %D = SMA of smoothed %K
  const dValues = [];
  for (let i = smoothD - 1; i < smoothedK.length; i++) {
    const avg = smoothedK.slice(i - smoothD + 1, i + 1).reduce((a, b) => a + b, 0) / smoothD;
    dValues.push(parseFloat(avg.toFixed(2)));
  }

  const k = smoothedK[smoothedK.length - 1];
  const d = dValues[dValues.length - 1];

  const signal =
    k > 80 && d > 80 ? 'OVERBOUGHT' :
    k < 20 && d < 20 ? 'OVERSOLD'   :
    k > d            ? 'BULLISH'    :
    k < d            ? 'BEARISH'    : 'NEUTRAL';

  const crossover =
    k > d && smoothedK[smoothedK.length - 2] <= dValues[dValues.length - 2]
      ? 'BULLISH_CROSS' :
    k < d && smoothedK[smoothedK.length - 2] >= dValues[dValues.length - 2]
      ? 'BEARISH_CROSS' : null;

  return { k, d, signal, crossover };
}

// ─── Support & Resistance levels ──────────────────────────────────────────────
export function calcSupportResistance(ohlcv, lookback = 20) {
  const { high, low, close } = ohlcv;
  if (!high || !low || !close || close.length < lookback) return null;

  const recentHigh  = high.slice(-lookback);
  const recentLow   = low.slice(-lookback);
  const price       = close[close.length - 1];

  // Pivot-based S/R — find local highs and lows
  const pivotHighs = [];
  const pivotLows  = [];
  const window     = 3; // bars each side

  for (let i = window; i < recentHigh.length - window; i++) {
    const slice = recentHigh.slice(i - window, i + window + 1);
    if (recentHigh[i] === Math.max(...slice)) pivotHighs.push(recentHigh[i]);
  }
  for (let i = window; i < recentLow.length - window; i++) {
    const slice = recentLow.slice(i - window, i + window + 1);
    if (recentLow[i] === Math.min(...slice)) pivotLows.push(recentLow[i]);
  }

  // Cluster nearby pivots (within 0.5%)
  const cluster = (levels) => {
    const sorted  = [...levels].sort((a, b) => a - b);
    const clusters = [];
    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - group[group.length - 1]) / group[group.length - 1] < 0.005) {
        group.push(sorted[i]);
      } else {
        clusters.push(parseFloat((group.reduce((a, b) => a + b, 0) / group.length).toFixed(2)));
        group = [sorted[i]];
      }
    }
    if (group.length) clusters.push(parseFloat((group.reduce((a, b) => a + b, 0) / group.length).toFixed(2)));
    return clusters;
  };

  const resistanceLevels = cluster(pivotHighs).filter(r => r > price).slice(0, 3);
  const supportLevels    = cluster(pivotLows).filter(s => s < price).reverse().slice(0, 3);

  // Period high/low as hard S/R
  const periodHigh = parseFloat(Math.max(...recentHigh).toFixed(2));
  const periodLow  = parseFloat(Math.min(...recentLow).toFixed(2));

  // Nearest support and resistance
  const nearestResistance = resistanceLevels.length
    ? Math.min(...resistanceLevels) : periodHigh;
  const nearestSupport    = supportLevels.length
    ? Math.max(...supportLevels) : periodLow;

  // Distance from price
  const distToResistance  = parseFloat(((nearestResistance - price) / price * 100).toFixed(2));
  const distToSupport     = parseFloat(((price - nearestSupport)    / price * 100).toFixed(2));

  // Risk/reward based on S/R
  const srRatio = distToSupport > 0
    ? parseFloat((distToResistance / distToSupport).toFixed(2)) : null;

  return {
    resistanceLevels,
    supportLevels,
    nearestResistance,
    nearestSupport,
    periodHigh,
    periodLow,
    distToResistance,  // % above current price
    distToSupport,     // % below current price
    srRatio,           // reward/risk — higher = better long setup
  };
}

// ─── Earnings date proximity ──────────────────────────────────────────────────
export function calcEarningsProximity(calendar, ticker, selectedExpiry = null) {
  if (!calendar?.length) return null;

  // Find earnings-related events for this ticker
  const earningsKeywords = ['earnings', 'eps', 'quarterly results', 'q1', 'q2', 'q3', 'q4', 'results'];
  const tickerEvents = calendar.filter(e => {
    const title = (e.title || '').toLowerCase();
    const hasTicker   = title.includes(ticker?.toLowerCase() || '');
    const hasEarnings = earningsKeywords.some(kw => title.includes(kw));
    return hasTicker || (hasEarnings && e.category === 'TECH/EARNINGS');
  });

  if (!tickerEvents.length) return null;

  const now          = Date.now();
  const upcoming     = tickerEvents
    .map(e => ({ ...e, date: e.time * 1000 }))
    .filter(e => e.date > now)
    .sort((a, b) => a.date - b.date);

  if (!upcoming.length) return null;

  const next         = upcoming[0];
  const daysToEarnings = Math.round((next.date - now) / (1000 * 60 * 60 * 24));

  // Check if earnings falls before expiry
  let earningsBeforeExpiry = false;
  if (selectedExpiry) {
    const expiryDate = new Date(selectedExpiry).getTime();
    earningsBeforeExpiry = next.date < expiryDate;
  }

  const risk =
    daysToEarnings <= 3  ? 'CRITICAL' :
    daysToEarnings <= 7  ? 'HIGH'     :
    daysToEarnings <= 14 ? 'MEDIUM'   : 'LOW';

  const advice =
    daysToEarnings <= 3  ? 'Earnings in <3 days — IV crush risk extreme after report. Avoid buying options.' :
    daysToEarnings <= 7  ? 'Earnings within 1 week — IV elevated, premium expensive. High risk for option buyers.' :
    daysToEarnings <= 14 ? 'Earnings within 2 weeks — factor IV expansion into premium cost.' :
                           'No imminent earnings risk.';

  return {
    daysToEarnings,
    earningsDate:        new Date(next.date).toISOString().split('T')[0],
    earningsTitle:       next.title,
    earningsBeforeExpiry,
    risk,
    advice,
  };
}

// ─── RSI contradiction checker ────────────────────────────────────────────────
export function checkRSIContradiction(rsi14, recommendation) {
  if (!rsi14 || !recommendation) return null;
  if (recommendation === 'CALL' && rsi14 > 70)
    return `⚠ RSI CONTRADICTION: RSI=${rsi14} OVERBOUGHT but recommending CALLs — mean reversion risk HIGH`;
  if (recommendation === 'PUT' && rsi14 < 30)
    return `⚠ RSI CONTRADICTION: RSI=${rsi14} OVERSOLD but recommending PUTs — bounce risk HIGH`;
  if (recommendation === 'CALL' && rsi14 > 65)
    return `CAUTION: RSI=${rsi14} approaching overbought for CALL entry`;
  if (recommendation === 'PUT' && rsi14 < 35)
    return `CAUTION: RSI=${rsi14} approaching oversold for PUT entry`;
  return null;
}

// ─── Delta-adjusted position sizing ──────────────────────────────────────────
export function calcDeltaAdjustedSize(delta, premium, budget = 1500) {
  if (!delta || !premium || premium <= 0) return null;
  const absDelta    = Math.abs(parseFloat(delta));
  const contracts   = Math.max(1, Math.floor(budget / (premium * 100)));
  const dollarDelta = contracts * 100 * absDelta;

  let sizeAdvice;
  if (absDelta >= 0.7)
    sizeAdvice = `High delta (${absDelta}) — deep ITM, 1-2 contracts for defined risk`;
  else if (absDelta >= 0.45)
    sizeAdvice = `ATM delta (${absDelta}) — ${contracts} contracts = $${dollarDelta.toFixed(0)} delta exposure`;
  else if (absDelta >= 0.25)
    sizeAdvice = `OTM delta (${absDelta}) — needs larger move, consider fewer contracts`;
  else
    sizeAdvice = `Far OTM delta (${absDelta}) — lottery ticket, limit to 1 contract`;

  return {
    contracts,
    absDelta,
    dollarDelta: parseFloat(dollarDelta.toFixed(0)),
    sizeAdvice,
  };
}

export const TIMEFRAMES = {
  short:    { label: 'Short Term',     sublabel: '1–5 days',    range: '1mo', interval: '1d',  smas: [20],      rsiPeriod: 14 },
  swing:    { label: 'Swing Trade',    sublabel: '1–4 weeks',   range: '3mo', interval: '1d',  smas: [20, 50],  rsiPeriod: 14 },
  position: { label: 'Position Trade', sublabel: '1–3 months',  range: '6mo', interval: '1d',  smas: [50, 200], rsiPeriod: 14 },
  longterm: { label: 'Long Term',      sublabel: '6–12 months', range: '1y',  interval: '1wk', smas: [50, 200], rsiPeriod: 14 },
};

export function calcIndicators(ohlcv, timeframeKey = 'swing') {
  if (!ohlcv?.close) return null;
  const tf      = TIMEFRAMES[timeframeKey] || TIMEFRAMES.swing;
  const closes  = ohlcv.close.filter(Boolean);
  const volumes = ohlcv.volume || [];

  const rsi14  = calcRSI(closes, tf.rsiPeriod);
  const sma20  = tf.smas.includes(20)  ? calcSMA(closes, 20)  : null;
  const sma50  = tf.smas.includes(50)  ? calcSMA(closes, 50)  : null;
  const sma200 = tf.smas.includes(200) ? calcSMA(closes, 200) : null;
  const macd   = calcMACD(closes);
  const bb     = calcBollingerBands(closes, 20, 2);
  const atr    = calcATR(ohlcv, 14);
  const stochRSI = calcStochRSI(closes, 14, 14, 3, 3);
  const sr     = calcSupportResistance(ohlcv, 30);
  const price  = closes[closes.length - 1];

  const avgVol = calcAvgVolume(volumes, 20);
  const curVol = volumes.filter(Boolean).slice(-1)[0] || 0;

  const rsiSignal = rsi14 > 70 ? 'OVERBOUGHT' : rsi14 < 30 ? 'OVERSOLD' : 'NEUTRAL';

  let trendSignal = 'UNKNOWN';
  if (timeframeKey === 'short') {
    trendSignal = sma20 ? (price > sma20 ? 'BULLISH' : 'BEARISH') : 'UNKNOWN';
  } else if (timeframeKey === 'swing') {
    trendSignal = sma20 && sma50 ? (sma20 > sma50 ? 'BULLISH' : 'BEARISH') : 'UNKNOWN';
  } else {
    trendSignal = sma50 && sma200 ? (sma50 > sma200 ? 'BULLISH' : 'BEARISH') : 'UNKNOWN';
  }

  const priceVsSma20  = sma20  ? ((price - sma20)  / sma20  * 100).toFixed(2) : null;
  const priceVsSma50  = sma50  ? ((price - sma50)  / sma50  * 100).toFixed(2) : null;
  const priceVsSma200 = sma200 ? ((price - sma200) / sma200 * 100).toFixed(2) : null;
  const volumeRatio   = avgVol ? parseFloat((curVol / avgVol).toFixed(2)) : null;
  const volumeSignal  = volumeRatio > 1.5 ? 'HIGH' : volumeRatio < 0.5 ? 'LOW' : 'NORMAL';

  return {
    timeframeKey,
    timeframeLabel: tf.label,
    rsi14, rsiSignal,
    sma20, sma50, sma200,
    trendSignal,
    priceVsSma20, priceVsSma50, priceVsSma200,
    macd, bb, atr, stochRSI, sr,
    currentVolume: curVol,
    avgVolume:     avgVol,
    volumeRatio,
    volumeSignal,
  };
}