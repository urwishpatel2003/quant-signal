const encode = url => url.replace('https://query1.finance.yahoo.com', '/yahoo');

export async function fetchPrice(ticker) {
  try {
    const res    = await fetch(encode(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`));
    const data   = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const q = result.indicators.quote[0];
    return {
      timestamps: result.timestamp,
      open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume,
      current: q.close[q.close.length - 1],
      prev:    q.close[q.close.length - 2],
    };
  } catch { return null; }
}

export async function fetchFundamentals(ticker) {
  try {
    const res  = await fetch(encode(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=financialData,defaultKeyStatistics,summaryDetail`));
    const data = await res.json();
    const r    = data?.quoteSummary?.result?.[0];
    if (!r) return null;
    return {
      pe:                r.summaryDetail?.trailingPE?.raw,
      eps:               r.defaultKeyStatistics?.trailingEps?.raw,
      roe:               r.financialData?.returnOnEquity?.raw,
      debtToEquity:      r.financialData?.debtToEquity?.raw,
      revenueGrowth:     r.financialData?.revenueGrowth?.raw,
      grossMargins:      r.financialData?.grossMargins?.raw,
      targetMeanPrice:   r.financialData?.targetMeanPrice?.raw,
      recommendationKey: r.financialData?.recommendationKey,
      beta:              r.summaryDetail?.beta?.raw,
    };
  } catch { return null; }
}

export async function fetchStockNews(ticker) {
  try {
    const res  = await fetch(encode(`https://query1.finance.yahoo.com/v1/finance/search?q=${ticker}&newsCount=8`));
    const data = await res.json();
    return (data?.news || []).map(n => ({ title: n.title, publisher: n.publisher, time: n.providerPublishTime }));
  } catch { return []; }
}
