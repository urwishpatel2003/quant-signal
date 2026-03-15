require('dotenv').config();
const zlib = require('zlib');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const https   = require('https');

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10mb' }));

// ─── YAHOO HEADERS ────────────────────────────────────────────────────────────

const YAHOO_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://finance.yahoo.com',
  'Origin':          'https://finance.yahoo.com',
};

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
          catch { resolve({ error: 'Parse error', raw: data }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── yahooFetch helper (with gzip + full headers) ─────────────────────────────

function yahooFetch(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'query2.finance.yahoo.com', path, method: 'GET', headers: YAHOO_HEADERS },
      response => {
        const encoding = response.headers['content-encoding'];
        let stream = response;
        if      (encoding === 'gzip')    stream = response.pipe(zlib.createGunzip());
        else if (encoding === 'br')      stream = response.pipe(zlib.createBrotliDecompress());
        else if (encoding === 'deflate') stream = response.pipe(zlib.createInflate());

        let data = '';
        stream.on('data', c => (data += c));
        stream.on('end', () => {
          console.log(`[Yahoo] ${path.slice(0, 60)} → ${response.statusCode} enc=${encoding || 'none'} len=${data.length}`);
          resolve({ statusCode: response.statusCode, body: data });
        });
        stream.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── yahooChart helper ────────────────────────────────────────────────────────

async function yahooChart(sym) {
  try {
    const { body } = await yahooFetch(`/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1mo`);
    const json      = JSON.parse(body);
    const result    = json?.chart?.result?.[0];
    const allCloses = result?.indicators?.quote?.[0]?.close || [];
    const closes    = allCloses.filter(c => c !== null && c !== undefined);
    const current   = closes[closes.length - 1];
    const prev      = closes[closes.length - 2];
    const meta      = result?.meta || {};
    return {
      symbol: sym, name: meta.shortName || sym,
      current, prev,
      change:    current && prev ? current - prev : null,
      changePct: current && prev ? ((current - prev) / prev) * 100 : null,
      currency:  meta.currency || 'USD'
    };
  } catch { return { symbol: sym, current: null }; }
}

// ─── Yahoo Finance proxy ──────────────────────────────────────────────────────

app.get('/yahoo/*', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const path = req.url.replace('/yahoo', '');
  try {
    const { statusCode, body } = await yahooFetch(path);
    if (!body || body.length < 10) {
      console.log(`[Yahoo Proxy] Empty response for ${path}`);
      return res.status(500).json({ error: 'Empty response from Yahoo' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.status(statusCode).send(body);
  } catch (e) {
    console.log(`[Yahoo Proxy] Error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ─── Tradier ──────────────────────────────────────────────────────────────────

app.get('/tradier/expirations/:ticker', async (req, res) => {
  try {
    const data = await httpsGet(
      'api.tradier.com',
      `/v1/markets/options/expirations?symbol=${req.params.ticker}&includeAllRoots=true&strikes=false`,
      { Authorization: `Bearer ${process.env.TRADIER_TOKEN}` }
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/tradier/chain/:ticker', async (req, res) => {
  try {
    const data = await httpsGet(
      'api.tradier.com',
      `/v1/markets/options/chains?symbol=${req.params.ticker}&expiration=${req.query.expiration}&greeks=true`,
      { Authorization: `Bearer ${process.env.TRADIER_TOKEN}` }
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/tradier/quote/:ticker', async (req, res) => {
  try {
    const data = await httpsGet(
      'api.tradier.com',
      `/v1/markets/quotes?symbols=${req.params.ticker}&greeks=false`,
      { Authorization: `Bearer ${process.env.TRADIER_TOKEN}` }
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Bonds ────────────────────────────────────────────────────────────────────

app.get('/bonds', async (req, res) => {
  try {
    const results = await Promise.all(['^TNX', '^IRX', '^TYX', 'TLT', 'IEF'].map(yahooChart));
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── International Markets ────────────────────────────────────────────────────

app.get('/international', async (req, res) => {
  try {
    const results = await Promise.all([
      '^N225', '^HSI', '000001.SS', '^BSESN',
      '^GDAXI', '^FTSE', '^FCHI', '^STOXX50E',
      '^VIX', 'DX-Y.NYB', 'GC=F', 'CL=F'
    ].map(yahooChart));
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Economic Calendar ────────────────────────────────────────────────────────

app.get('/calendar', async (req, res) => {
  const queries = [
    { q: 'Federal Reserve interest rates Fed',  category: 'FEDERAL RESERVE' },
    { q: 'CPI inflation consumer prices',        category: 'INFLATION'       },
    { q: 'jobs report nonfarm payroll labor',    category: 'JOBS REPORT'     },
    { q: 'GDP economic growth recession',        category: 'GDP GROWTH'      },
    { q: 'earnings season stocks results',       category: 'EARNINGS'        },
    { q: 'ECB European Central Bank rates',      category: 'ECB POLICY'      },
    { q: 'Bank of Japan yen monetary',           category: 'JAPAN BOJ'       },
    { q: 'China economy trade tariffs',          category: 'CHINA ECONOMY'   },
  ];
  try {
    const results = await Promise.all(
      queries.map(({ q, category }) =>
        yahooFetch(`/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=5&lang=en&region=US`)
          .then(({ body }) => {
            try {
              const news = JSON.parse(body)?.news || [];
              return news.map(n => ({
                title: n.title, publisher: n.publisher,
                time: n.providerPublishTime, category, url: n.link
              }));
            } catch { return []; }
          })
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
        'content-length':    Buffer.byteLength(body)
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
});// ─── Yahoo Debug ──────────────────────────────────────────────────────────────
app.get('/debug-yahoo', async (req, res) => {
  try {
    const { statusCode, body } = await yahooFetch('/v8/finance/chart/AAPL?interval=1d&range=1mo');
    res.json({ statusCode, length: body.length, preview: body.slice(0, 500) });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ─── Disable all caching ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// ─── Yahoo Debug ──────────────────────────────────────────────────────────────
app.get('/debug-yahoo', async (req, res) => {
  const req2 = https.request(
    {
      hostname: 'query2.finance.yahoo.com',
      path: '/v8/finance/chart/AAPL?interval=1d&range=1mo',
      method: 'GET',
      headers: YAHOO_HEADERS
    },
    response => {
      let raw = Buffer.alloc(0);
      response.on('data', chunk => { raw = Buffer.concat([raw, chunk]); });
      response.on('end', () => {
        res.json({
          statusCode: response.statusCode,
          headers: response.headers,
          bodyLength: raw.length,
          bodyPreview: raw.slice(0, 200).toString('utf8'),
        });
      });
    }
  );
  req2.on('error', e => res.json({ error: e.message, stack: e.stack }));
  req2.end();
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3001, '0.0.0.0', () =>
  console.log(`✅  Quant Signal backend running on port ${process.env.PORT || 3001}`));