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
    req.on('error', reject);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const q = (req.query.q || '').toUpperCase().trim();
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}