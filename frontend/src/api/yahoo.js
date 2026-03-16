const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const proxy = path => `${BASE}/yahoo${path}`;

export async function fetchPrice(ticker, range = '3mo', interval = '1d') {
  try {
    const res    = await fetch(proxy(`/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`));
    const data   = await res.json();
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

export async function fetchFundamentals(ticker) {
  try {
    const res  = await fetch(proxy(`/v10/finance/quoteSummary/${ticker}?modules=financialData,defaultKeyStatistics,summaryDetail`));
    const data = await res.json();
    const r    = data?.quoteSummary?.result?.[0];
    if (!r) return null;
    return {
      pe:                      r.summaryDetail?.trailingPE?.raw,
      eps:                     r.defaultKeyStatistics?.trailingEps?.raw,
      beta:                    r.summaryDetail?.beta?.raw,
      fiftyTwoWeekHigh:        r.summaryDetail?.fiftyTwoWeekHigh?.raw,
      fiftyTwoWeekLow:         r.summaryDetail?.fiftyTwoWeekLow?.raw,
      averageVolume:           r.summaryDetail?.averageVolume?.raw,
      roe:                     r.financialData?.returnOnEquity?.raw,
      debtToEquity:            r.financialData?.debtToEquity?.raw,
      revenueGrowth:           r.financialData?.revenueGrowth?.raw,
      grossMargins:            r.financialData?.grossMargins?.raw,
      targetMeanPrice:         r.financialData?.targetMeanPrice?.raw,
      recommendationKey:       r.financialData?.recommendationKey,
      numberOfAnalystOpinions: r.financialData?.numberOfAnalystOpinions?.raw,
    };
  } catch { return null; }
}

export async function fetchStockNews(ticker) {
  try {
    const res  = await fetch(proxy(`/v1/finance/search?q=${ticker}&newsCount=8`));
    const data = await res.json();
    return (data?.news || []).map(n => ({
      title:     n.title,
      publisher: n.publisher,
      time:      n.providerPublishTime,
      url:       n.link,
    }));
  } catch { return []; }
}