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

export function calcAvgVolume(volumes, period = 20) {
  if (!volumes || volumes.length < period) return null;
  const slice = volumes.filter(Boolean).slice(-period);
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

export const TIMEFRAMES = {
  short:    { label: 'Short Term',    sublabel: '1–5 days',    range: '1mo',  interval: '1d', smas: [20],     rsiPeriod: 14 },
  swing:    { label: 'Swing Trade',   sublabel: '1–4 weeks',   range: '3mo',  interval: '1d', smas: [20, 50], rsiPeriod: 14 },
  position: { label: 'Position Trade',sublabel: '1–3 months',  range: '6mo',  interval: '1d', smas: [50, 200],rsiPeriod: 14 },
  longterm: { label: 'Long Term',     sublabel: '6–12 months', range: '1y',   interval: '1wk',smas: [50, 200],rsiPeriod: 14 },
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
  const price  = closes[closes.length - 1];
  const avgVol = calcAvgVolume(volumes, 20);
  const curVol = volumes.filter(Boolean).slice(-1)[0] || 0;

  const rsiSignal = rsi14 > 70 ? 'OVERBOUGHT' : rsi14 < 30 ? 'OVERSOLD' : 'NEUTRAL';

  // Trend signal depends on timeframe
  let trendSignal = 'UNKNOWN';
  if (timeframeKey === 'short') {
    trendSignal = sma20 ? (price > sma20 ? 'BULLISH' : 'BEARISH') : 'UNKNOWN';
  } else if (timeframeKey === 'swing') {
    trendSignal = sma20 && sma50 ? (sma20 > sma50 ? 'BULLISH' : 'BEARISH') : 'UNKNOWN';
  } else {
    // position / longterm
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
    currentVolume: curVol,
    avgVolume: avgVol,
    volumeRatio,
    volumeSignal,
  };
}