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

// ─── yahooChart helper ────────────────────────────────────────────────────────

function yahooChart(sym) {
  return new Promise(resolve => {
    const req = https.request(
      {
        hostname: 'query1.finance.yahoo.com',
        path: `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1mo`,
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try {
            const json      = JSON.parse(data);
            const result    = json?.chart?.result?.[0];
            const allCloses = result?.indicators?.quote?.[0]?.close || [];
            const closes    = allCloses.filter(c => c !== null && c !== undefined);
            const current   = closes[closes.length - 1];
            const prev      = closes[closes.length - 2];
            const meta      = result?.meta || {};
            resolve({
              symbol: sym, name: meta.shortName || sym,
              current, prev,
              change:    current && prev ? current - prev : null,
              changePct: current && prev ? ((current - prev) / prev) * 100 : null,
              currency:  meta.currency || 'USD'
            });
          } catch { resolve({ symbol: sym, current: null }); }
        });
      }
    );
    req.on('error', () => resolve({ symbol: sym, current: null }));
    req.end();
  });
}

// ─── Yahoo Finance proxy ──────────────────────────────────────────────────────

app.get('/yahoo/*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); 
  const path = req.url.replace('/yahoo', '');
  const request = https.request(
    {
      hostname: 'query1.finance.yahoo.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://finance.yahoo.com',
        'Origin':          'https://finance.yahoo.com',
      }
    },
    response => {
      const encoding = response.headers['content-encoding'];
      let stream = response;

      if (encoding === 'gzip')    stream = response.pipe(zlib.createGunzip());
      else if (encoding === 'br') stream = response.pipe(zlib.createBrotliDecompress());
      else if (encoding === 'deflate') stream = response.pipe(zlib.createInflate());

      let data = '';
      stream.on('data', c => (data += c));
      stream.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
      });
      stream.on('error', e => res.status(500).json({ error: e.message }));
    }
  );
  request.on('error', e => res.status(500).json({ error: e.message }));
  request.end();
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
    { q: 'Federal Reserve interest rates Fed',    category: 'FEDERAL RESERVE'  },
    { q: 'CPI inflation consumer prices',          category: 'INFLATION'        },
    { q: 'jobs report nonfarm payroll labor',      category: 'JOBS REPORT'      },
    { q: 'GDP economic growth recession',          category: 'GDP GROWTH'       },
    { q: 'earnings season stocks results',         category: 'EARNINGS'         },
    { q: 'ECB European Central Bank rates',        category: 'ECB POLICY'       },
    { q: 'Bank of Japan yen monetary',             category: 'JAPAN BOJ'        },
    { q: 'China economy trade tariffs',            category: 'CHINA ECONOMY'    },
  ];
  try {
    const results = await Promise.all(
      queries.map(({ q, category }) => new Promise(resolve => {
        const request = https.request(
          {
            hostname: 'query1.finance.yahoo.com',
            path: `/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=5&lang=en&region=US`,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
          },
          response => {
            let data = '';
            response.on('data', c => (data += c));
            response.on('end', () => {
              try {
                const news = JSON.parse(data)?.news || [];
                resolve(news.map(n => ({
                  title:     n.title,
                  publisher: n.publisher,
                  time:      n.providerPublishTime,
                  category,
                  url:       n.link
                })));
              } catch { resolve([]); }
            });
          }
        );
        request.on('error', () => resolve([]));
        request.end();
      }))
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
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3001, '0.0.0.0', () =>
  console.log(`✅  Quant Signal backend running on port ${process.env.PORT || 3001}`)
);