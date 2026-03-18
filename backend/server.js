require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express   = require('express');
const https     = require('https');
const rateLimit = require('express-rate-limit');
const app       = express();

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Surrogate-Control', 'no-store');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10mb' }));

const POLYGON_KEY   = process.env.POLYGON_API_KEY;
const TRADIER_TOKEN = process.env.TRADIER_TOKEN;

// ─── Rate limiting ────────────────────────────────────────────────────────────

const claudeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { error: 'Too many AI requests. Please wait before scanning again.' },
  standardHeaders: true, legacyHeaders: false,
});

const dataLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 60,
  message: { error: 'Too many data requests. Please slow down.' },
  standardHeaders: true, legacyHeaders: false,
});

app.use('/api/analyze', claudeLimiter);
app.use('/yahoo',       dataLimiter);
app.use('/tradier',     dataLimiter);

// ─── Usage tracking ───────────────────────────────────────────────────────────

const usageStore = new Map();

function getUsageKey(userId) {
  const today = new Date().toISOString().split('T')[0];
  return `${userId}_${today}`;
}

app.get('/usage/:userId', (req, res) => {
  const key   = getUsageKey(req.params.userId);
  const usage = usageStore.get(key) || { scans: 0, options: 0 };
  res.json(usage);
});

app.post('/usage/:userId/track', (req, res) => {
  const key   = getUsageKey(req.params.userId);
  const usage = usageStore.get(key) || { scans: 0, options: 0 };
  const { type } = req.body;
  if (type === 'scan')    usage.scans++;
  if (type === 'options') usage.options++;
  usageStore.set(key, usage);
  res.json(usage);
});

// ─── httpsGet helper ──────────────────────────────────────────────────────────

function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers: { Accept: 'application/json', ...headers } },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ error: 'Parse error', raw: data.slice(0, 200) }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

const polygonGet = path =>
  httpsGet('api.polygon.io', `${path}${path.includes('?') ? '&' : '?'}apiKey=${POLYGON_KEY}`);

const tradierGet = path =>
  httpsGet('api.tradier.com', path, { Authorization: `Bearer ${TRADIER_TOKEN}` });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Tradier history ──────────────────────────────────────────────────────────

async function tradierHistory(sym, range = '3mo') {
  try {
    const daysMap = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365 };
    const days  = daysMap[range] || 90;
    const end   = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const data  = await tradierGet(`/v1/markets/history?symbol=${sym}&interval=daily&start=${start}&end=${end}`);
    const bars  = data?.history?.day || [];
    if (!bars.length) return null;
    const closes = bars.map(b => b.close).filter(Boolean);
    return {
      close:      bars.map(b => b.close),
      open:       bars.map(b => b.open),
      high:       bars.map(b => b.high),
      low:        bars.map(b => b.low),
      volume:     bars.map(b => b.volume),
      timestamps: bars.map(b => new Date(b.date).getTime()),
      current:    closes[closes.length - 1],
      prev:       closes[closes.length - 2],
    };
  } catch (e) {
    console.log(`[Tradier] history error for ${sym}: ${e.message}`);
    return null;
  }
}

// ─── Polygon aggs ─────────────────────────────────────────────────────────────

async function polygonAggs(ticker, days = 10) {
  try {
    const end   = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const data  = await polygonGet(
      `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=10`
    );
    const bars    = data.results || [];
    if (!bars.length) return null;
    const current = bars[bars.length - 1]?.c;
    const prev    = bars[bars.length - 2]?.c;
    return {
      current, prev,
      change:    current && prev ? current - prev : null,
      changePct: current && prev ? ((current - prev) / prev) * 100 : null,
      bars,
    };
  } catch (e) {
    console.log(`[Polygon] aggs error for ${ticker}: ${e.message}`);
    return null;
  }
}

async function polygonBatch(symbols, days = 10) {
  const results = [];
  for (const { poly, yahoo } of symbols) {
    const d = await polygonAggs(poly, days);
    results.push({
      symbol:    yahoo,
      current:   d?.current   ?? null,
      prev:      d?.prev      ?? null,
      change:    d?.change    ?? null,
      changePct: d?.changePct ?? null,
    });
    await sleep(50);
  }
  return results;
}

// ─── Stock history ────────────────────────────────────────────────────────────

app.get('/yahoo/v8/finance/chart/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const range = req.query.range || '3mo';
  try {
    const data = await tradierHistory(ticker, range);
    if (!data) return res.status(404).json({ error: 'No data found' });
    res.json({
      chart: {
        result: [{
          meta: { symbol: ticker, currency: 'USD' },
          timestamp: data.timestamps,
          indicators: { quote: [{ close: data.close, open: data.open, high: data.high, low: data.low, volume: data.volume }] }
        }]
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Fundamentals ─────────────────────────────────────────────────────────────

app.get('/yahoo/v10/finance/quoteSummary/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const [details, financials, quoteData] = await Promise.all([
      polygonGet(`/v3/reference/tickers/${ticker}`),
      polygonGet(`/vX/reference/financials?ticker=${ticker}&limit=1&timeframe=annual`),
      tradierGet(`/v1/markets/quotes?symbols=${ticker}&greeks=false`),
    ]);

    const d       = details?.results    || {};
    const f       = financials?.results?.[0]?.financials || {};
    const income  = f.income_statement  || {};
    const balance = f.balance_sheet     || {};
    const q       = quoteData?.quotes?.quote || {};

    const revenue     = income.revenues?.value;
    const netIncome   = income.net_income_loss?.value;
    const totalEquity = balance.equity?.value;
    const totalDebt   = balance.liabilities?.value;
    const eps         = income.basic_earnings_per_share?.value;
    const grossProfit = income.gross_profit?.value;

    res.json({
      quoteSummary: {
        result: [{
          summaryDetail: {
            trailingPE:       { raw: q.pe_ratio     || null },
            beta:             { raw: q.beta         || null },
            fiftyTwoWeekHigh: { raw: q.week_52_high || null },
            fiftyTwoWeekLow:  { raw: q.week_52_low  || null },
            averageVolume:    { raw: q.average_volume || null },
          },
          defaultKeyStatistics: {
            trailingEps: { raw: eps || null },
          },
          financialData: {
            targetMeanPrice:         { raw: null },
            recommendationKey:       'hold',
            numberOfAnalystOpinions: { raw: null },
            returnOnEquity:          { raw: totalEquity && netIncome ? netIncome / totalEquity : null },
            debtToEquity:            { raw: totalEquity && totalDebt ? totalDebt / totalEquity : null },
            revenueGrowth:           { raw: null },
            grossMargins:            { raw: revenue && grossProfit ? grossProfit / revenue : null },
          }
        }]
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Stock news ───────────────────────────────────────────────────────────────

app.get('/yahoo/v1/finance/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    const data = await polygonGet(`/v2/reference/news?ticker=${q}&limit=8&order=desc&sort=published_utc`);
    const news = (data.results || []).map(n => ({
      title:               n.title,
      publisher:           n.publisher?.name || '',
      providerPublishTime: Math.floor(new Date(n.published_utc).getTime() / 1000),
      link:                n.article_url,
    }));
    res.json({ news });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Ticker search ────────────────────────────────────────────────────────────

app.get('/search', async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 1) return res.json([]);
  try {
    const [byTicker, byName] = await Promise.all([
      polygonGet(`/v3/reference/tickers?ticker=${encodeURIComponent(q)}&active=true&market=stocks&limit=5&sort=ticker&order=asc`),
      polygonGet(`/v3/reference/tickers?search=${encodeURIComponent(q)}&active=true&market=stocks&limit=10&sort=ticker&order=asc`),
    ]);

    const seen    = new Set();
    const results = [];

    for (const t of (byTicker.results || [])) {
      if (!seen.has(t.ticker)) {
        seen.add(t.ticker);
        results.push({ ticker: t.ticker, name: t.name, type: t.type });
      }
    }

    const nameResults = (byName.results || [])
      .filter(t => !seen.has(t.ticker))
      .sort((a, b) => {
        const aStarts = a.ticker.startsWith(q) ? 0 : 1;
        const bStarts = b.ticker.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        const aCS = a.type === 'CS' ? 0 : 1;
        const bCS = b.type === 'CS' ? 0 : 1;
        if (aCS !== bCS) return aCS - bCS;
        return a.ticker.length - b.ticker.length;
      });

    for (const t of nameResults) {
      if (!seen.has(t.ticker)) {
        seen.add(t.ticker);
        results.push({ ticker: t.ticker, name: t.name, type: t.type });
      }
    }

    res.json(results.slice(0, 8));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Top Gainers, Losers & Volume Leaders — Tradier bulk quotes ───────────────

app.get('/movers', async (req, res) => {
  try {
    const TICKERS = [
  // Mega cap tech
  'AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','GOOG','AMD','NFLX',
  // Semiconductors
  'INTC','MU','AVGO','QCOM','ARM','AMAT','LRCX','KLAC','MRVL','SMCI',
  // AI / Cloud
  'PLTR','CRM','SNOW','DDOG','NET','MDB','AI','BBAI','SOUN','RXRX',
  // Fintech / Crypto exchanges
  'COIN','SQ','PYPL','SOFI','HOOD','NU','AFRM','UPST','LC','MSTR',
  // Bitcoin miners & crypto infrastructure
  'MARA','RIOT','CLSK','CIFR','BTBT','HUT','CORZ','CRWV','CRCL','SMLR',
  // Quantum computing
  'RGTI','IONQ','QUBT','QBTS','ARQQ',
  // EV / Clean Energy
  'RIVN','LCID','NIO','XPEV','LI','CHPT','BLNK','OKLO','SMR','CEG',
  // Biotech / Healthcare
  'MRNA','BNTX','NVAX','CRSP','BEAM','EDIT','NTLA','SANA','BLUE','HIMS',
  // Nuclear / Energy
  'CCJ','UEC','DNN','UUUU','LEU','NNE','BWXT','GEV','VST','RKLB',
  // Defense / Space
  'LMT','RTX','NOC','GD','BA','ASTS','LUNR','PL','SPCE','ACHR',
  // Consumer / Retail
  'DIS','SPOT','UBER','LYFT','ABNB','DASH','SNAP','PINS','RDDT','RBLX',
  // Banks / Finance
  'JPM','BAC','GS','MS','WFC','C','BX','KKR','APO','ARES',
  // Big pharma
  'PFE','LLY','ABBV','BMY','GILD','REGN','VRTX','AMGN','JNJ','MRK',
  // Emerging tech
  'NBIS','GRAB','SE','DKNG','PENN','SHOP','MELI','JOBY','ACMR','KULR',
  // Commodities / Materials
  'XOM','CVX','OXY','SLB','FCX','NEM','GOLD','AG','MP','VALE',
  // ETFs
  'SPY','QQQ','IWM','ARKK','SOXL','TQQQ','SQQQ','GLD','USO','TLT',
];

    const data = await tradierGet(`/v1/markets/quotes?symbols=${TICKERS.join(',')}&greeks=false`);
    const raw  = data?.quotes?.quote || [];
    const list = (Array.isArray(raw) ? raw : [raw])
      .filter(q => q.last && q.change_percentage != null)
      .map(q => ({
        ticker:    q.symbol,
        price:     parseFloat(q.last              || 0),
        change:    parseFloat(q.change            || 0),
        changePct: parseFloat(q.change_percentage || 0),
        volume:    parseInt(q.volume              || 0),
        avgVolume: parseInt(q.average_volume      || 0),
      }));

    const sorted   = [...list].sort((a, b) => b.changePct - a.changePct);
    const gainers  = sorted.filter(s => s.changePct > 0).slice(0, 10);
    const losers   = [...list].sort((a, b) => a.changePct - b.changePct).filter(s => s.changePct < 0).slice(0, 10);

    // Volume leaders — sort by volume, filter out low-price noise
    const volume   = [...list]
      .filter(s => s.price >= 5 && s.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map(s => ({
        ...s,
        // Volume vs average — how unusual is today's volume
        volVsAvg: s.avgVolume > 0
          ? parseFloat((s.volume / s.avgVolume).toFixed(1))
          : null,
      }));

    res.json({ gainers, losers, volume });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Tradier routes ───────────────────────────────────────────────────────────

app.get('/tradier/expirations/:ticker', async (req, res) => {
  try {
    const data = await tradierGet(`/v1/markets/options/expirations?symbol=${req.params.ticker}&includeAllRoots=true&strikes=false`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/tradier/chain/:ticker', async (req, res) => {
  try {
    const data = await tradierGet(`/v1/markets/options/chains?symbol=${req.params.ticker}&expiration=${req.query.expiration}&greeks=true`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/tradier/quote/:ticker', async (req, res) => {
  try {
    const data = await tradierGet(`/v1/markets/quotes?symbols=${req.params.ticker}&greeks=false`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Bonds ────────────────────────────────────────────────────────────────────

app.get('/bonds', async (req, res) => {
  try {
    const symbols = [
      { poly: 'IEF', yahoo: '^TNX' },
      { poly: 'SHY', yahoo: '^IRX' },
      { poly: 'TLT', yahoo: '^TYX' },
      { poly: 'TLT', yahoo: 'TLT'  },
      { poly: 'IEF', yahoo: 'IEF'  },
    ];
    const results = await polygonBatch(symbols, 10);
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── International ────────────────────────────────────────────────────────────

app.get('/international', async (req, res) => {
  try {
    const symbols = [
      { poly: 'EWJ',  yahoo: '^N225'     },
      { poly: 'EWH',  yahoo: '^HSI'      },
      { poly: 'FXI',  yahoo: '000001.SS' },
      { poly: 'INDA', yahoo: '^BSESN'    },
      { poly: 'EWG',  yahoo: '^GDAXI'    },
      { poly: 'EWU',  yahoo: '^FTSE'     },
      { poly: 'EWQ',  yahoo: '^FCHI'     },
      { poly: 'FEZ',  yahoo: '^STOXX50E' },
      { poly: 'VIXY', yahoo: '^VIX'      },
      { poly: 'UUP',  yahoo: 'DX-Y.NYB'  },
      { poly: 'GLD',  yahoo: 'GC=F'      },
      { poly: 'USO',  yahoo: 'CL=F'      },
    ];
    const results = await polygonBatch(symbols, 10);
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

app.get('/calendar', async (req, res) => {
  const topics = [
    { ticker: 'SPY', category: 'FEDERAL RESERVE' },
    { ticker: 'TLT', category: 'BONDS/RATES'      },
    { ticker: 'GLD', category: 'COMMODITIES'      },
    { ticker: 'QQQ', category: 'TECH/EARNINGS'    },
    { ticker: 'DIA', category: 'MACRO/ECONOMY'    },
    { ticker: 'USO', category: 'OIL/ENERGY'       },
    { ticker: 'EEM', category: 'EMERGING MARKETS' },
    { ticker: 'FXI', category: 'CHINA ECONOMY'    },
  ];
  try {
    const results = await Promise.all(
      topics.map(({ ticker, category }) =>
        polygonGet(`/v2/reference/news?ticker=${ticker}&limit=3&order=desc&sort=published_utc`)
          .then(data => (data.results || []).map(n => ({
            title:     n.title,
            publisher: n.publisher?.name || '',
            time:      Math.floor(new Date(n.published_utc).getTime() / 1000),
            category,
            url:       n.article_url,
          })))
          .catch(() => [])
      )
    );
    const flat   = results.flat().sort((a, b) => b.time - a.time);
    const seen   = new Set();
    const unique = flat.filter(item => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    });
    res.json(unique.slice(0, 24));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Claude API proxy ─────────────────────────────────────────────────────────

app.post('/api/analyze', (req, res) => {
  const body = JSON.stringify(req.body || {});
  const request = https.request(
    {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
        'content-length':    Buffer.byteLength(body),
      }
    },
    response => {
      let data = '';
      response.on('data', c => (data += c));
      response.on('end', () => {
        try { res.json(JSON.parse(data)); }
        catch { res.status(500).json({ error: 'Parse error', raw: data }); }
      });
    }
  );
  request.on('error', e => res.status(500).json({ error: e.message }));
  request.write(body);
  request.end();
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3001, '0.0.0.0', () =>
  console.log(`✅  QuAInt Signal backend running on port ${process.env.PORT || 3001}`));