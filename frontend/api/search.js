import https from 'https';

const POLYGON_KEY = process.env.POLYGON_API_KEY;

function polygonGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${path}${path.includes('?') ? '&' : '?'}apiKey=${POLYGON_KEY}`;
    const req = https.request(
      { hostname: 'api.polygon.io', path: url, method: 'GET', headers: { Accept: 'application/json' } },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ results: [] }); }
        });
      }
    );
    req.on('error', () => resolve({ results: [] }));
    req.end();
  });
}

// Simple in-memory cache — persists for duration of serverless instance
const cache = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const q = (req.query.q || '').toUpperCase().trim();
  if (q.length < 1) return res.json([]);

  // Return cached result if available
  if (cache.has(q)) return res.json(cache.get(q));

  try {
    const nextChar = String.fromCharCode(q.charCodeAt(q.length - 1) + 1);
    const tickerLt = q.slice(0, -1) + nextChar;

    // Sequential — not parallel — to avoid rate limit
    const byPrefix = await polygonGet(
      `/v3/reference/tickers?ticker.gte=${encodeURIComponent(q)}&ticker.lt=${encodeURIComponent(tickerLt)}&active=true&market=stocks&limit=8&sort=ticker&order=asc`
    );

    const seen    = new Set();
    const results = [];

    const prefixResults = (byPrefix.results || [])
      .sort((a, b) => {
        const aCS = a.type === 'CS' ? 0 : 1;
        const bCS = b.type === 'CS' ? 0 : 1;
        if (aCS !== bCS) return aCS - bCS;
        return a.ticker.length - b.ticker.length;
      });

    for (const t of prefixResults) {
      if (!seen.has(t.ticker)) {
        seen.add(t.ticker);
        results.push({ ticker: t.ticker, name: t.name, type: t.type });
      }
    }

    // Only do name search if prefix gives fewer than 4 results
    if (results.length < 4) {
      const byName = await polygonGet(
        `/v3/reference/tickers?search=${encodeURIComponent(q)}&active=true&market=stocks&limit=8&sort=ticker&order=asc`
      );

      const nameResults = (byName.results || [])
        .filter(t => !seen.has(t.ticker))
        .filter(t => t.ticker.startsWith(q) || t.name.toUpperCase().includes(q))
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
    }

    const final = results.slice(0, 8);
    // Cache for 5 minutes
    if (final.length > 0) {
      cache.set(q, final);
      setTimeout(() => cache.delete(q), 5 * 60 * 1000);
    }

    res.json(final);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}