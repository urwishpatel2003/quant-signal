// Calculate RSI
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
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

// Calculate SMA
export function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
}

// Calculate average volume
export function calcAvgVolume(volumes, period = 20) {
  if (!volumes || volumes.length < period) return null;
  const slice = volumes.filter(Boolean).slice(-period);
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

// Build full TA summary object
export function calcIndicators(ohlcv) {
  if (!ohlcv?.close) return null;
  const closes  = ohlcv.close.filter(Boolean);
  const volumes = ohlcv.volume || [];

  const rsi14  = calcRSI(closes, 14);
  const sma20  = calcSMA(closes, 20);
  const sma50  = calcSMA(closes, 50);
  const price  = closes[closes.length - 1];
  const avgVol = calcAvgVolume(volumes, 20);
  const curVol = volumes.filter(Boolean).slice(-1)[0] || 0;

  const rsiSignal  = rsi14 > 70 ? 'OVERBOUGHT' : rsi14 < 30 ? 'OVERSOLD' : 'NEUTRAL';
  const trendSignal = sma20 && sma50
    ? (sma20 > sma50 ? 'BULLISH' : 'BEARISH')
    : 'UNKNOWN';
  const priceVsSma20 = sma20 ? ((price - sma20) / sma20 * 100).toFixed(2) : null;
  const priceVsSma50 = sma50 ? ((price - sma50) / sma50 * 100).toFixed(2) : null;
  const volumeRatio  = avgVol ? parseFloat((curVol / avgVol).toFixed(2)) : null;
  const volumeSignal = volumeRatio > 1.5 ? 'HIGH' : volumeRatio < 0.5 ? 'LOW' : 'NORMAL';

  return {
    rsi14, rsiSignal,
    sma20, sma50,
    trendSignal,
    priceVsSma20, priceVsSma50,
    currentVolume: curVol,
    avgVolume: avgVol,
    volumeRatio,
    volumeSignal,
  };
}