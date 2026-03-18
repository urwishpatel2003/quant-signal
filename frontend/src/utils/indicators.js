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
  const k   = 2 / (period + 1);
  let ema    = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return parseFloat(ema.toFixed(2));
}

export function calcMACD(closes) {
  if (closes.length < 35) return null;
  const ema12   = calcEMA(closes, 12);
  const ema26   = calcEMA(closes, 26);
  if (!ema12 || !ema26) return null;
  const macdLine = parseFloat((ema12 - ema26).toFixed(3));

  // Signal line = 9-period EMA of MACD values
  // Build recent MACD history for signal
  const macdHistory = [];
  for (let i = closes.length - 9; i <= closes.length - 1; i++) {
    const slice  = closes.slice(0, i + 1);
    const e12    = calcEMA(slice, 12);
    const e26    = calcEMA(slice, 26);
    if (e12 && e26) macdHistory.push(e12 - e26);
  }
  const signalLine = macdHistory.length >= 9
    ? parseFloat(calcEMA(macdHistory, 9).toFixed(3))
    : null;
  const histogram  = signalLine != null
    ? parseFloat((macdLine - signalLine).toFixed(3))
    : null;

  const trend = macdLine > 0 ? 'BULLISH' : 'BEARISH';
  const cross = signalLine != null
    ? (macdLine > signalLine ? 'BULLISH_CROSS' : 'BEARISH_CROSS')
    : null;

  return { macdLine, signalLine, histogram, trend, cross };
}

export function calcBollingerBands(closes, period = 20, stdDev = 2) {
  if (closes.length < period) return null;
  const slice  = closes.slice(-period);
  const mean   = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
  const std    = Math.sqrt(variance);
  const upper  = parseFloat((mean + stdDev * std).toFixed(2));
  const lower  = parseFloat((mean - stdDev * std).toFixed(2));
  const middle = parseFloat(mean.toFixed(2));
  const price  = closes[closes.length - 1];
  const bWidth = parseFloat(((upper - lower) / middle * 100).toFixed(2)); // bandwidth %
  const bPct   = parseFloat(((price - lower) / (upper - lower)).toFixed(3)); // 0=at lower, 1=at upper

  const position = bPct > 0.8 ? 'NEAR_UPPER' : bPct < 0.2 ? 'NEAR_LOWER' : 'MIDDLE';
  const squeeze  = bWidth < 5; // low volatility squeeze

  return { upper, middle, lower, bWidth, bPct, position, squeeze };
}

export function calcAvgVolume(volumes, period = 20) {
  if (!volumes || volumes.length < period) return null;
  const slice = volumes.filter(Boolean).slice(-period);
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

// ─── RSI contradiction checker ────────────────────────────────────────────────
export function checkRSIContradiction(rsi14, recommendation) {
  if (!rsi14 || !recommendation) return null;
  if (recommendation === 'CALL' && rsi14 > 70)
    return `⚠ RSI CONTRADICTION: RSI=${rsi14} is OVERBOUGHT but recommending CALLs — mean reversion risk HIGH`;
  if (recommendation === 'PUT' && rsi14 < 30)
    return `⚠ RSI CONTRADICTION: RSI=${rsi14} is OVERSOLD but recommending PUTs — bounce risk HIGH`;
  if (recommendation === 'CALL' && rsi14 > 65)
    return `CAUTION: RSI=${rsi14} approaching overbought territory for new CALL entry`;
  if (recommendation === 'PUT' && rsi14 < 35)
    return `CAUTION: RSI=${rsi14} approaching oversold territory for new PUT entry`;
  return null;
}

// ─── Delta-adjusted position sizing ──────────────────────────────────────────
export function calcDeltaAdjustedSize(delta, premium, budget = 1500) {
  if (!delta || !premium || premium <= 0) return null;
  const absDelta   = Math.abs(parseFloat(delta));
  const contracts  = Math.max(1, Math.floor(budget / (premium * 100)));

  // Dollar delta = contracts * 100 * delta * price (approx notional exposure)
  const dollarDelta = contracts * 100 * absDelta;

  // Suggest size based on delta — high delta = fewer contracts needed for same exposure
  let sizeAdvice;
  if (absDelta >= 0.7)
    sizeAdvice = `High delta (${absDelta}) — deep ITM, 1-2 contracts for defined risk`;
  else if (absDelta >= 0.45)
    sizeAdvice = `ATM delta (${absDelta}) — ${contracts} contracts gives $${dollarDelta.toFixed(0)} delta exposure`;
  else if (absDelta >= 0.25)
    sizeAdvice = `OTM delta (${absDelta}) — needs larger move to profit, consider fewer contracts`;
  else
    sizeAdvice = `Far OTM delta (${absDelta}) — lottery ticket, limit to 1 contract max`;

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
    macd,
    bb,
    currentVolume: curVol,
    avgVolume:     avgVol,
    volumeRatio,
    volumeSignal,
  };
}