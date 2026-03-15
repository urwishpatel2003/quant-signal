require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const https   = require('https');
const app     = express();

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

const POLYGON_KEY  = process.env.POLYGON_API_KEY;
const TRADIER_TOKEN = process.env.TRADIER_TOKEN;

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

// ─── Polygon helpers ──────────────────────────────────────────────────────────

const polygonGet = path => httpsGet('api.polygon.io', `${path}${path.includes('?') ? '&' : '?'}apiKey=${POLYGON_KEY}`);

async function polygonChart(sym) {
  try {
    const end   = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const clean = sym.replace('^', '').replace('=F', '');

    // Map Yahoo-style symbols to Polygon tickers
    const symbolMap = {
      'TNX': 'I:TNX', 'IRX': 'I:IRX', 'TYX': 'I:TYX',
      'VIX': 'I:VIX', 'DX-Y.NYB': 'C:DXY',
      'GCF': 'C:XAUUSD', 'CLF': 'C:WTICOUSD',
      'N225': 'I:NKY', 'HSI': 'I:HSI',
      '000001.SS': 'I:SHCOMP', 'BSESN': 'I:SENSEX',
      'GDAXI': 'I:DAX', 'FTSE': 'I:UKX',
      'FCHI': 'I:CAC', 'STOXX50E': 'I:SX5E',
    };

    const ticker = symbolMap[clean] || sym;
    const data   = await polygonGet(`/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=35`);
    const bars   = data.results || [];
    if (!bars.length) return { symbol: sym, current: null };

    const current   = bars[bars.length - 1]?.c;
    const prev      = bars[bars.length - 2]?.c;
    const changePct = current && prev ? ((current - prev) / prev) * 100 : null;

    return {
      symbol: sym,
      current, prev,
      change:    current && prev ? current - prev : null,
      changePct,
      close:     bars.map(b => b.c),
      open:      bars.map(b => b.o),
      high:      bars.map(b => b.h),
      low:       bars.map(b => b.l),
      volume:    bars.map(b => b.v),
      timestamps: bars.map(b => b.t),
    };
  } catch (e) {
    console.log(`[Polygon] chart error for ${sym}: ${e.message}`);
    return { symbol: sym, current: null };
  }
}

// ─── Tradier helpers ──────────────────────────────────────────────────────────

const tradierGet = (path) => httpsGet('api.tradier.com', path, { Authorization: `Bearer ${TRADIER_TOKEN}` });

async function tradierHistory(sym, range = '3mo') {
  try {
    const end   = new Date().toISOString().split('T')[0];
    const daysMap = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365 };
    const days  = daysMap[range] || 90;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const data  = await tradierGet(`/v1/markets/history?symbol=${sym}&interval=daily&start=${start}&end=${end}`);
    const bars  = data?.history?.day || [];
    if (!bars.length) return null;

    const closes  = bars.map(b => b.close).filter(Boolean);
    const volumes = bars.map(b => b.volume).filter(Boolean);
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

// ─── Yahoo proxy (kept for fallback, now via Vercel) ─────────────────────────
// Removed — using Tradier + Polygon only

// ─── Stock history (Tradier) ──────────────────────────────────────────────────

app.get('/yahoo/v8/finance/chart/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const range    = req.query.range || '3mo';
  const interval = req.query.interval || '1d';
  try {
    const data = await tradierHistory(ticker, range);
    if (!data) return res.status(404).json({ error: 'No data found' });
    // Return in Yahoo-compatible format so frontend doesn't need changes
    res.json({
      chart: {
        result: [{
          meta: { symbol: ticker, currency: 'USD' },
          timestamp: data.timestamps,
          indicators: {
            quote: [{
              close:  data.close,
              open:   data.open,
              high:   data.high,
              low:    data.low,
              volume: data.volume,
            }]
          }
        }]
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Fundamentals (Polygon) ───────────────────────────────────────────────────

app.get('/yahoo/v10/finance/quoteSummary/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const [details, financials] = await Promise.all([
      polygonGet(`/v3/reference/tickers/${ticker}`),
      polygonGet(`/vX/reference/financials?ticker=${ticker}&limit=1&timeframe=annual`),
    ]);

    const d = details?.results || {};
    const f = financials?.results?.[0]?.financials || {};
    const income = f.income_statement || {};
    const balance = f.balance_sheet || {};

    // Return in Yahoo-compatible quoteSummary format
    res.json({
      quoteSummary: {
        result: [{
          summaryDetail: {
            trailingPE:  { raw: d.market_cap && d.weighted_shares_outstanding ? null : null },
            beta:        { raw: null },
          },
          defaultKeyStatistics: {
            trailingEps: { raw: null },
          },
          financialData: {
            targetMeanPrice:         { raw: null },
            recommendationKey:       d.description ? 'hold' : null,
            numberOfAnalystOpinions: { raw: null },
            returnOnEquity:          { raw: null },
            debtToEquity:            { raw: null },
            revenueGrowth:           { raw: null },
            grossMargins:            { raw: null },
          }
        }]
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Stock News (Polygon) ─────────────────────────────────────────────────────

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

// ─── Tradier ──────────────────────────────────────────────────────────────────

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

// ─── Bonds (Polygon) ─────────────────────────────────────────────────────────

app.get('/bonds', async (req, res) => {
  try {
    const symbols = [
      { poly: 'I:TNX',      yahoo: '^TNX' },
      { poly: 'I:IRX',      yahoo: '^IRX' },
      { poly: 'I:TYX',      yahoo: '^TYX' },
      { poly: 'TLT',        yahoo: 'TLT'  },
      { poly: 'IEF',        yahoo: 'IEF'  },
    ];
    const results = await Promise.all(symbols.map(async ({ poly, yahoo }) => {
      const end   = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      try {
        const data  = await polygonGet(`/v2/aggs/ticker/${poly}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=5`);
        const bars  = data.results || [];
        const current = bars[bars.length - 1]?.c;
        const prev    = bars[bars.length - 2]?.c;
        return {
          symbol:    yahoo,
          current,
          prev,
          change:    current && prev ? current - prev : null,
          changePct: current && prev ? ((current - prev) / prev) * 100 : null,
        };
      } catch { return { symbol: yahoo, current: null }; }
    }));
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── International Markets (Polygon) ─────────────────────────────────────────

app.get('/international', async (req, res) => {
  try {
    const symbols = [
      { poly: 'I:NKY',      yahoo: '^N225'      },
      { poly: 'I:HSI',      yahoo: '^HSI'        },
      { poly: 'I:SHCOMP',   yahoo: '000001.SS'   },
      { poly: 'I:SENSEX',   yahoo: '^BSESN'      },
      { poly: 'I:DAX',      yahoo: '^GDAXI'      },
      { poly: 'I:UKX',      yahoo: '^FTSE'       },
      { poly: 'I:CAC',      yahoo: '^FCHI'       },
      { poly: 'I:SX5E',     yahoo: '^STOXX50E'   },
      { poly: 'I:VIX',      yahoo: '^VIX'        },
      { poly: 'C:DXY',      yahoo: 'DX-Y.NYB'   },
      { poly: 'C:XAUUSD',   yahoo: 'GC=F'        },
      { poly: 'C:WTICOUSD', yahoo: 'CL=F'        },
    ];
    const end   = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const results = await Promise.all(symbols.map(async ({ poly, yahoo }) => {
      try {
        const data  = await polygonGet(`/v2/aggs/ticker/${encodeURIComponent(poly)}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=5`);
        const bars  = data.results || [];
        const current = bars[bars.length - 1]?.c;
        const prev    = bars[bars.length - 2]?.c;
        return {
          symbol:    yahoo,
          current,
          prev,
          change:    current && prev ? current - prev : null,
          changePct: current && prev ? ((current - prev) / prev) * 100 : null,
        };
      } catch { return { symbol: yahoo, current: null }; }
    }));
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Economic Calendar (Polygon news) ────────────────────────────────────────

app.get('/calendar', async (req, res) => {
  const topics = [
    { ticker: 'SPY',  category: 'FEDERAL RESERVE'  },
    { ticker: 'TLT',  category: 'BONDS/RATES'       },
    { ticker: 'GLD',  category: 'COMMODITIES'       },
    { ticker: 'QQQ',  category: 'TECH/EARNINGS'     },
    { ticker: 'DIA',  category: 'MACRO/ECONOMY'     },
    { ticker: 'USO',  category: 'OIL/ENERGY'        },
    { ticker: 'EEM',  category: 'EMERGING MARKETS'  },
    { ticker: 'FXI',  category: 'CHINA ECONOMY'     },
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

// ─── Claude API Proxy ─────────────────────────────────────────────────────────

app.post('/api/analyze', (req, res) => {
  const body = JSON.stringify(req.body || {});
  const request = https.request(
    {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
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