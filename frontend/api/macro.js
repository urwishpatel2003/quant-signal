import https from 'https';
import zlib from 'zlib';

const YAHOO_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://finance.yahoo.com',
  'Origin':          'https://finance.yahoo.com',
};

function yahooFetch(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'query2.finance.yahoo.com', path, method: 'GET', headers: YAHOO_HEADERS },
      response => {
        const encoding = response.headers['content-encoding'];
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const raw = Buffer.concat(chunks);
          if (raw.length === 0) return resolve('{"error":"empty"}');
          if (encoding === 'gzip') {
            zlib.gunzip(raw, (err, d) => resolve(err ? raw.toString('utf8') : d.toString('utf8')));
          } else if (encoding === 'br') {
            zlib.brotliDecompress(raw, (err, d) => resolve(err ? raw.toString('utf8') : d.toString('utf8')));
          } else if (encoding === 'deflate') {
            zlib.inflate(raw, (err, d) => resolve(err ? raw.toString('utf8') : d.toString('utf8')));
          } else {
            resolve(raw.toString('utf8'));
          }
        });
        response.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function yahooChart(sym) {
  try {
    const body    = await yahooFetch(`/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`);
    const json    = JSON.parse(body);
    const result  = json?.chart?.result?.[0];
    const closes  = (result?.indicators?.quote?.[0]?.close || []).filter(Boolean);
    const current = closes[closes.length - 1];
    const prev    = closes[closes.length - 2];
    const meta    = result?.meta || {};
    return {
      symbol: sym, name: meta.shortName || sym,
      current, prev,
      change:    current && prev ? current - prev : null,
      changePct: current && prev ? ((current - prev) / prev) * 100 : null,
      currency:  meta.currency || 'USD',
      source:    'yahoo',
    };
  } catch { return { symbol: sym, current: null, source: 'yahoo' }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const type = req.query.type || 'bonds';
  let symbols = [];

  if (type === 'bonds') {
    symbols = ['^TNX', '^IRX', '^TYX', 'TLT', 'IEF'];
  } else if (type === 'international') {
    symbols = ['^N225', '^HSI', '000001.SS', '^BSESN', '^GDAXI', '^FTSE', '^FCHI', '^STOXX50E', '^VIX', 'DX-Y.NYB', 'GC=F', 'CL=F'];
  }

  try {
    const results = await Promise.all(symbols.map(yahooChart));
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}