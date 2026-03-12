require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ─── SET YOUR KEYS HERE ───────────────────────────────────────────────────────
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
process.env.TRADIER_TOKEN     = process.env.TRADIER_TOKEN;
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app = express();

app.use(cors());
app.options('*', cors());
app.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function yahooChart(sym) {
  return new Promise(resolve => {
    const req = https.request(
      {
        hostname: 'query1.finance.yahoo.com',
        path: `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try {
            const json   = JSON.parse(data);
            const result = json?.chart?.result?.[0];
            const closes = result?.indicators?.quote?.[0]?.close || [];
            const current = closes[closes.length - 1];
            const prev    = closes[closes.length - 2];
            const meta    = result?.meta || {};
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
  const path = req.url.replace('/yahoo', '');
  const request = https.request(
    { hostname: 'query1.finance.yahoo.com', path, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
    response => {
      let data = '';
      response.on('data', c => (data += c));
      response.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.send(data); });
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
    'Fed FOMC meeting interest rate decision',
    'CPI inflation report release date',
    'nonfarm payroll jobs report',
    'GDP report economic growth',
    'earnings season results',
    'ECB European Central Bank meeting',
    'Bank of Japan BOJ meeting',
    'China PMI economic data'
  ];
  try {
    const results = await Promise.all(
      queries.map(q => new Promise(resolve => {
        const request = https.request(
          {
            hostname: 'query1.finance.yahoo.com',
            path: `/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=2`,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
          },
          response => {
            let data = '';
            response.on('data', c => (data += c));
            response.on('end', () => {
              try {
                resolve((JSON.parse(data)?.news || []).map(n => ({
                  title: n.title, publisher: n.publisher,
                  time: n.providerPublishTime, category: q
                })));
              } catch { resolve([]); }
            });
          }
        );
        request.on('error', () => resolve([]));
        request.end();
      }))
    );
    res.json(results.flat().sort((a, b) => b.time - a.time).slice(0, 20));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Claude API Proxy ─────────────────────────────────────────────────────────

app.post('/api/analyze', (req, res) => {
  const body = JSON.stringify(req.body);
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

app.listen(process.env.PORT || 3001, () =>
  console.log('✅  Quant Signal backend running on http://localhost:3001')
);
