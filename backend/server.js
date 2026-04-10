require('dotenv').conf

// ─── Persistent Cache (Supabase) ─────────────────────────────────────────────
// Survives server restarts and redeployments
// Falls back to in-memory cache if Supabase unavailable

async function persistCacheGet(key) {
  try {
    const { data, error } = await supabase
      .from('server_cache')
      .select('value, cached_at')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return null;
    return { value: data.value, ts: new Date(data.cached_at).getTime() };
  } catch { return null; }
}

async function persistCacheSet(key, value) {
  try {
    await supabase.from('server_cache').upsert({
      key,
      value,
      cached_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (e) { console.warn('[cache] persist failed:', e.message); }
}

// On startup, hydrate in-memory caches from Supabase
async function hydrateFromPersistentCache() {
  try {
    const keys = ['us_movers', 'india_movers', 'india_macro', 'market_regime'];
    const results = await Promise.allSettled(keys.map(k => persistCacheGet(k)));
    const ONE_DAY = 24 * 60 * 60 * 1000;

    results.forEach((r, i) => {
      if (r.status !== 'fulfilled' || !r.value) return;
      const { value, ts } = r.value;
      const age = Date.now() - ts;
      if (age > ONE_DAY) return; // skip if older than 1 day

      const key = keys[i];
      if (key === 'us_movers'    && !usMoversCache.data)    { usMoversCache.data    = value; usMoversCache.ts    = ts; console.log('[cache] hydrated us_movers from DB'); }
      if (key === 'india_movers' && !indiaMoversCache.data) { indiaMoversCache.data = value; indiaMoversCache.ts = ts; console.log('[cache] hydrated india_movers from DB'); }
      if (key === 'india_macro'  && !indiaMacroCache.data)  { indiaMacroCache.data  = value; indiaMacroCache.ts  = ts; console.log('[cache] hydrated india_macro from DB'); }
      if (key === 'market_regime') { regimeCache.data = value; regimeCache.ts = ts; console.log('[cache] hydrated market_regime from DB'); }
    });
  } catch (e) { console.warn('[cache] hydration failed:', e.message); }
}

// ─── Shared caches (declared early — used throughout) ────────────────────────
const nseQuoteCache    = new Map();
const nseHistoryCache  = new Map();
const nseBhavCache     = new Map();
const indiaMoversCache = { data: null, ts: 0 };
const usMoversCache    = { data: null, ts: 0 };
const INDIA_MOVERS_TTL = 5 * 60 * 1000;          // 5 minutes
const US_MOVERS_TTL    = 90 * 1000;               // 90 seconds during market hours
const NSE_QUOTE_TTL    = 5 * 60 * 1000;           // 5 minutes
const NSE_HISTORY_TTL  = 4 * 60 * 60 * 1000;      // 4 hours

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};
const YAHOO_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express      = require('express');
const https        = require('https');
const rateLimit    = require('express-rate-limit');
const Stripe       = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
app.set('trust proxy', 1);
const stripe   = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));


// ─── Market Status ───────────────────────────────────────────────────────────
function isMarketClosed() {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etNow.getDay();
  const hours = etNow.getHours();
  const minutes = etNow.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  // Weekend
  if (day === 0 || day === 6) return true;
  // Before 9:30 AM or after 4:00 PM ET
  if (timeInMinutes < 570 || timeInMinutes >= 960) return true;
  return false;
}

function getMarketStatus() {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etNow.getDay();
  const hours = etNow.getHours();
  const minutes = etNow.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  if (day === 0 || day === 6) return { open: false, reason: 'Weekend' };
  if (timeInMinutes < 570) return { open: false, reason: 'Pre-market', opensIn: `${Math.floor((570 - timeInMinutes)/60)}h ${(570 - timeInMinutes)%60}m` };
  if (timeInMinutes >= 960) return { open: false, reason: 'After-hours' };
  return { open: true, reason: 'Regular hours' };
}

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Surrogate-Control', 'no-store');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const POLYGON_KEY   = process.env.POLYGON_API_KEY;
const TRADIER_TOKEN = process.env.TRADIER_TOKEN;
const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN;

const claudeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 100,
  message: { error: 'Too many AI requests.' },
  standardHeaders: true, legacyHeaders: false,
});
const dataLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 200,
  message: { error: 'Too many data requests.' },
  standardHeaders: true, legacyHeaders: false,
});

app.use('/api/analyze', claudeLimiter);
app.use('/yahoo',       dataLimiter);
app.use('/tradier',     dataLimiter);

async function getOrCreateUser(userId, email = null) {
  const { data, error } = await supabase
    .from('users').select('*').eq('id', userId).single();
  if (error && error.code === 'PGRST116') {
    const { data: newUser, error: insertError } = await supabase
      .from('users').insert({ id: userId, email, plan: 'free' }).select().single();
    if (insertError) throw insertError;
    return newUser;
  }
  if (error) throw error;
  return data;
}

async function getUsage(userId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('usage').select('scans, options')
    .eq('user_id', userId).eq('date', today).single();
  if (error && error.code === 'PGRST116') return { scans: 0, options: 0 };
  if (error) throw error;
  return data;
}

async function trackUsage(userId, type) {
  const today = new Date().toISOString().split('T')[0];
  const col   = type === 'scan' ? 'scans' : 'options';
  const current = await getUsage(userId);
  const updated = {
    user_id: userId, date: today,
    scans:   col === 'scans'   ? (current.scans   || 0) + 1 : (current.scans   || 0),
    options: col === 'options' ? (current.options || 0) + 1 : (current.options || 0),
  };
  const { error } = await supabase
    .from('usage').upsert(updated, { onConflict: 'user_id,date' });
  if (error) { console.error('[trackUsage] upsert error:', error.message); throw error; }
  return { scans: updated.scans, options: updated.options };
}

app.get('/usage/:userId', async (req, res) => {
  try {
    const user  = await getOrCreateUser(req.params.userId);
    const usage = await getUsage(req.params.userId);
    res.json({ ...usage, plan: user.plan });
  } catch (e) {
    console.error('[usage GET]', e.message);
    res.json({ scans: 0, options: 0, plan: 'free' });
  }
});

app.post('/usage/:userId/track', async (req, res) => {
  try {
    const user     = await getOrCreateUser(req.params.userId);
    const { type } = req.body;
    const updated  = await trackUsage(req.params.userId, type);
    res.json({ ...updated, plan: user.plan });
  } catch (e) {
    console.error('[usage POST]', e.message);
    res.json({ scans: 0, options: 0, plan: 'free' });
  }
});

app.post('/stripe/checkout', async (req, res) => {
  const { userId, email, market = 'US' } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    await getOrCreateUser(userId, email);
    const { data: user } = await supabase
      .from('users').select('stripe_customer_id, plan').eq('id', userId).single();
    if (user?.plan === 'pro') return res.json({ alreadyPro: true });
    let customerId = user?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { clerk_user_id: userId } });
      customerId = customer.id;
      await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', userId);
    }
    // Use INR price for India users, USD for everyone else
    const priceId = market === 'INDIA'
      ? process.env.STRIPE_PRICE_ID_INR   // ₹249/mo
      : process.env.STRIPE_PRICE_ID;       // $5/mo
    if (!priceId) {
      console.error('[stripe checkout] Missing price ID for market:', market);
      return res.status(500).json({ error: 'Pricing not configured for this market' });
    }
    const session = await stripe.checkout.sessions.create({
      customer:   customerId, mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || 'https://quaint-signal.tech'}/?upgraded=true`,
      cancel_url:  `${process.env.FRONTEND_URL  || 'https://quaint-signal.tech'}/?cancelled=true`,
      metadata:    { clerk_user_id: userId, market },
      subscription_data:        { trial_period_days: 30 },
      payment_method_collection: 'if_required', // no card needed during free trial
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[stripe checkout]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/stripe/portal', async (req, res) => {
  const { userId } = req.body;
  try {
    const { data: user } = await supabase
      .from('users').select('stripe_customer_id').eq('id', userId).single();
    if (!user?.stripe_customer_id)
      return res.status(400).json({ error: 'No subscription found' });
    const session = await stripe.billingPortal.sessions.create({
      customer:   user.stripe_customer_id,
      return_url: process.env.FRONTEND_URL || 'https://quaint-signal.tech',
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[stripe portal]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId  = session.metadata?.clerk_user_id;
        if (userId) await supabase.from('users').update({ plan: 'pro', stripe_subscription_id: session.subscription }).eq('id', userId);
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused': {
        const sub = event.data.object;
        const { data: user } = await supabase.from('users').select('id').eq('stripe_customer_id', sub.customer).single();
        if (user) await supabase.from('users').update({ plan: 'free' }).eq('id', user.id);
        break;
      }
      case 'customer.subscription.updated': {
        const sub    = event.data.object;
        const active = sub.status === 'active' || sub.status === 'trialing';
        const { data: user } = await supabase.from('users').select('id').eq('stripe_customer_id', sub.customer).single();
        if (user) await supabase.from('users').update({ plan: active ? 'pro' : 'free' }).eq('id', user.id);
        break;
      }
    }
  } catch (e) { console.error('[webhook] handler error:', e.message); }
  res.json({ received: true });
});

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
const finnhubGet = path =>
  httpsGet('finnhub.io', `/api/v1${path}&token=${FINNHUB_TOKEN}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
      close: bars.map(b => b.close), open: bars.map(b => b.open),
      high:  bars.map(b => b.high),  low:  bars.map(b => b.low),
      volume: bars.map(b => b.volume),
      timestamps: bars.map(b => new Date(b.date).getTime()),
      current: closes[closes.length - 1], prev: closes[closes.length - 2],
    };
  } catch (e) { return null; }
}

async function polygonAggs(ticker, days = 10) {
  try {
    const end   = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const data  = await polygonGet(
      `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=10`
    );
    const bars = data.results || [];
    if (!bars.length) return null;
    const current = bars[bars.length - 1]?.c;
    const prev    = bars[bars.length - 2]?.c;
    return { current, prev,
      change:    current && prev ? current - prev : null,
      changePct: current && prev ? ((current - prev) / prev) * 100 : null,
    };
  } catch (e) { return null; }
}

async function polygonBatch(symbols, days = 10) {
  const results = [];
  for (const { poly, yahoo } of symbols) {
    const d = await polygonAggs(poly, days);
    results.push({ symbol: yahoo, current: d?.current ?? null, prev: d?.prev ?? null,
      change: d?.change ?? null, changePct: d?.changePct ?? null });
    await sleep(50);
  }
  return results;
}

app.get('/yahoo/v8/finance/chart/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const range = req.query.range || '3mo';
  try {
    const data = await tradierHistory(ticker, range);
    if (!data) return res.status(404).json({ error: 'No data found' });
    res.json({ chart: { result: [{ meta: { symbol: ticker, currency: 'USD' },
      timestamp: data.timestamps,
      indicators: { quote: [{ close: data.close, open: data.open, high: data.high, low: data.low, volume: data.volume }] }
    }] } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/yahoo/v10/finance/quoteSummary/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const [refData, financials, quoteData] = await Promise.all([
      polygonGet(`/v3/reference/tickers/${ticker}`),
      polygonGet(`/vX/reference/financials?ticker=${ticker}&limit=1&timeframe=annual`),
      tradierGet(`/v1/markets/quotes?symbols=${ticker}&greeks=false`),
    ]);
    const f       = financials?.results?.[0]?.financials || {};
    const income  = f.income_statement  || {};
    const balance = f.balance_sheet     || {};
    const q       = quoteData?.quotes?.quote || {};
    const revenue = income.revenues?.value, netIncome = income.net_income_loss?.value;
    const totalEquity = balance.equity?.value, totalDebt = balance.liabilities?.value;
    const eps = income.basic_earnings_per_share?.value, grossProfit = income.gross_profit?.value;
    const companyName = refData?.results?.[0]?.name || q.description || '';
    res.json({ quoteSummary: { result: [{ companyName, summaryDetail: {
      trailingPE: { raw: q.pe_ratio || null }, beta: { raw: q.beta || null },
      fiftyTwoWeekHigh: { raw: q.week_52_high || null }, fiftyTwoWeekLow: { raw: q.week_52_low || null },
      averageVolume: { raw: q.average_volume || null },
    }, defaultKeyStatistics: { trailingEps: { raw: eps || null } },
    financialData: {
      targetMeanPrice: { raw: null }, recommendationKey: 'hold', numberOfAnalystOpinions: { raw: null },
      returnOnEquity: { raw: totalEquity && netIncome ? netIncome / totalEquity : null },
      debtToEquity:   { raw: totalEquity && totalDebt ? totalDebt / totalEquity : null },
      revenueGrowth:  { raw: null },
      grossMargins:   { raw: revenue && grossProfit ? grossProfit / revenue : null },
    } }] } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/yahoo/v1/finance/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json({ news: [] });
  try {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to   = new Date().toISOString().split('T')[0];
    const data = await finnhubGet(`/company-news?symbol=${encodeURIComponent(q)}&from=${from}&to=${to}`);
    if (!Array.isArray(data) || data.length === 0) {
      const general  = await finnhubGet(`/news?category=general`);
      const fallback = Array.isArray(general) ? general : [];
      return res.json({ news: fallback.slice(0, 8).map(n => ({ title: n.headline, publisher: n.source || '', providerPublishTime: n.datetime, link: n.url })) });
    }
    res.json({ news: data.slice(0, 8).map(n => ({ title: n.headline, publisher: n.source || '', providerPublishTime: n.datetime, link: n.url })) });
  } catch (e) {
    console.error('[news]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/search', async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 1) return res.json([]);
  try {
    const [byTicker, byName] = await Promise.all([
      polygonGet(`/v3/reference/tickers?ticker=${encodeURIComponent(q)}&active=true&market=stocks&limit=5&sort=ticker&order=asc`),
      polygonGet(`/v3/reference/tickers?search=${encodeURIComponent(q)}&active=true&market=stocks&limit=10&sort=ticker&order=asc`),
    ]);
    const seen = new Set(), results = [];
    for (const t of (byTicker.results || []))
      if (!seen.has(t.ticker)) { seen.add(t.ticker); results.push({ ticker: t.ticker, name: t.name, type: t.type }); }
    const nameResults = (byName.results || []).filter(t => !seen.has(t.ticker))
      .sort((a, b) => {
        const aS = a.ticker.startsWith(q) ? 0 : 1, bS = b.ticker.startsWith(q) ? 0 : 1;
        if (aS !== bS) return aS - bS;
        const aC = a.type === 'CS' ? 0 : 1, bC = b.type === 'CS' ? 0 : 1;
        if (aC !== bC) return aC - bC;
        return a.ticker.length - b.ticker.length;
      });
    for (const t of nameResults)
      if (!seen.has(t.ticker)) { seen.add(t.ticker); results.push({ ticker: t.ticker, name: t.name, type: t.type }); }
    res.json(results.slice(0, 8));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/movers', async (req, res) => {
  // Invalidate cache when market opens
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const marketOpenToday = new Date(nowET);
  marketOpenToday.setHours(9, 30, 0, 0);
  if (usMoversCache.ts && usMoversCache.ts < marketOpenToday.getTime() && nowET >= marketOpenToday) {
    usMoversCache.ts = 0;
  }
  const marketOpen = !isMarketClosed();
  const ttl = marketOpen ? US_MOVERS_TTL : 10 * 60 * 1000;
  if (usMoversCache.data && Date.now() - usMoversCache.ts < ttl) {
    return res.json({ ...usMoversCache.data, marketStatus: getMarketStatus(), cached: true });
  }
  try {
    const TICKERS = [
      'AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','GOOG','AMD','NFLX',
      'INTC','MU','AVGO','QCOM','ARM','AMAT','LRCX','KLAC','MRVL','SMCI',
      'PLTR','CRM','SNOW','DDOG','NET','MDB','AI','BBAI','SOUN','RXRX',
      'COIN','SQ','PYPL','SOFI','HOOD','NU','AFRM','UPST','LC','MSTR',
      'MARA','RIOT','CLSK','CIFR','BTBT','HUT','CORZ','CRWV','SMLR','CRCL',
      'RGTI','IONQ','QUBT','QBTS','ARQQ',
      'RIVN','LCID','NIO','XPEV','LI','CHPT','BLNK','OKLO','SMR','CEG',
      'MRNA','BNTX','NVAX','CRSP','BEAM','EDIT','NTLA','SANA','BLUE','HIMS',
      'CCJ','UEC','DNN','UUUU','LEU','NNE','BWXT','GEV','VST','RKLB',
      'LMT','RTX','NOC','GD','BA','ASTS','LUNR','PL','SPCE','ACHR',
      'DIS','SPOT','UBER','LYFT','ABNB','DASH','SNAP','PINS','RDDT','RBLX',
      'JPM','BAC','GS','MS','WFC','C','BX','KKR','APO','ARES',
      'PFE','LLY','ABBV','BMY','GILD','REGN','VRTX','AMGN','JNJ','MRK',
      'NBIS','GRAB','SE','DKNG','PENN','SHOP','MELI','JOBY','ACMR','KULR',
      'XOM','CVX','OXY','SLB','FCX','NEM','GOLD','AG','MP','VALE',
      'SPY','QQQ','IWM','ARKK','SOXL','TQQQ','SQQQ','GLD','USO','TLT',
    ];
    const data = await tradierGet(`/v1/markets/quotes?symbols=${TICKERS.join(',')}&greeks=false`);
    const raw  = data?.quotes?.quote || [];
    const list = (Array.isArray(raw) ? raw : [raw])
      .filter(q => q.last && q.change_percentage != null)
      .map(q => ({
        ticker: q.symbol, price: parseFloat(q.last || 0),
        change: parseFloat(q.change || 0), changePct: parseFloat(q.change_percentage || 0),
        volume: parseInt(q.volume || 0), avgVolume: parseInt(q.average_volume || 0), type: 'stock',
      }));
    const sorted  = [...list].sort((a, b) => b.changePct - a.changePct);
    const gainers = sorted.filter(s => s.changePct > 0).slice(0, 10);
    const losers  = [...list].sort((a, b) => a.changePct - b.changePct).filter(s => s.changePct < 0).slice(0, 10);
    const volume  = [...list].filter(s => s.price >= 5 && s.volume > 0)
      .sort((a, b) => b.volume - a.volume).slice(0, 10)
      .map(s => ({ ...s, volVsAvg: s.avgVolume > 0 ? parseFloat((s.volume / s.avgVolume).toFixed(1)) : null }));
    const payload = { gainers, losers, volume };
    usMoversCache.data = payload;
    usMoversCache.ts   = Date.now();
    persistCacheSet('us_movers', payload).catch(() => {});
    res.json({ ...payload, marketStatus: getMarketStatus() });
  } catch (e) {
    if (usMoversCache.data) return res.json({ ...usMoversCache.data, stale: true });
    res.status(500).json({ error: e.message });
  }
});

// ─── Sharekhan API Integration ───────────────────────────────────────────────
// Provides real-time NSE prices via Sharekhan broker API
// More reliable than Yahoo Finance scraping for Indian stocks
// Docs: https://github.com/Sharekhan-API/shareconnectpython

const SHAREKHAN_API_KEY    = process.env.SHAREKHAN_API_KEY    || '';
const SHAREKHAN_SECRET_KEY = process.env.SHAREKHAN_SECRET_KEY || '';
const SHAREKHAN_BASE       = 'api.sharekhan.com';

// Token stored in memory — refreshed via /sharekhan/auth endpoint
let sharekhanToken = process.env.SHAREKHAN_ACCESS_TOKEN || '';
let sharekhanTokenExpiry = 0;

// NSE exchange code mapping
// NC = NSE Cash (equities), BC = BSE Cash
const SHAREKHAN_EXCHANGE = 'NC';

async function sharekhanGet(path, params = {}) {
  if (!sharekhanToken) return null;
  try {
    const query  = new URLSearchParams({ ...params, apikey: SHAREKHAN_API_KEY }).toString();
    const data   = await httpsGet(SHAREKHAN_BASE, `${path}?${query}`, {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${sharekhanToken}`,
      'Accept':        'application/json',
    });
    return data;
  } catch (e) {
    console.warn('[sharekhan]', path, e.message);
    return null;
  }
}

async function sharekhanPost(path, body = {}) {
  if (!SHAREKHAN_API_KEY) return null;
  try {
    return new Promise((resolve, reject) => {
      const payload   = JSON.stringify({ ...body, apikey: SHAREKHAN_API_KEY });
      const options   = {
        hostname: SHAREKHAN_BASE,
        path,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization':  sharekhanToken ? `Bearer ${sharekhanToken}` : '',
        },
      };
      const req = require('https').request(options, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  } catch (e) {
    console.warn('[sharekhan POST]', path, e.message);
    return null;
  }
}

// Convert NSE symbol to Sharekhan scripcode
// Sharekhan uses numeric scripcodes — need to look them up
const sharekhanScripcodeCache = new Map();
async function getScripcode(symbol) {
  if (sharekhanScripcodeCache.has(symbol)) return sharekhanScripcodeCache.get(symbol);
  try {
    // Search by symbol name
    const data = await sharekhanGet('/rest/v2/scripmaster/search', { exchange: SHAREKHAN_EXCHANGE, scripname: symbol });
    const scrip = data?.data?.find(s => s.trading_symbol === symbol || s.scripname === symbol);
    if (scrip?.scripcode) {
      sharekhanScripcodeCache.set(symbol, scrip.scripcode);
      return scrip.scripcode;
    }
  } catch (e) { console.warn('[sharekhan] scripcode lookup:', e.message); }
  return null;
}

// GET live quote from Sharekhan
async function getSharekhanQuote(symbol) {
  if (!sharekhanToken || !SHAREKHAN_API_KEY) return null;
  try {
    const scripcode = await getScripcode(symbol);
    if (!scripcode) return null;
    const data = await sharekhanGet('/rest/v2/quotes', {
      exchange: SHAREKHAN_EXCHANGE,
      scripcode,
    });
    const q = data?.data?.[0];
    if (!q) return null;
    return {
      price:     parseFloat(q.ltp || q.last_price || 0),
      open:      parseFloat(q.open || 0),
      high:      parseFloat(q.high || 0),
      low:       parseFloat(q.low  || 0),
      close:     parseFloat(q.close || q.prev_close || 0),
      volume:    parseInt(q.volume || q.traded_quantity || 0),
      change:    parseFloat(q.change || 0),
      changePct: parseFloat(q.percent_change || 0),
      symbol,
      source:    'sharekhan',
    };
  } catch (e) {
    console.warn('[sharekhan quote]', symbol, e.message);
    return null;
  }
}

// GET historical OHLCV from Sharekhan
async function getSharekhanHistory(symbol, range = '3mo') {
  if (!sharekhanToken || !SHAREKHAN_API_KEY) return null;
  try {
    const scripcode = await getScripcode(symbol);
    if (!scripcode) return null;

    const rangeMap = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730 };
    const days     = rangeMap[range] || 90;
    const toDate   = new Date();
    const fromDate = new Date(Date.now() - days * 864e5);
    const fmt      = d => d.toISOString().split('T')[0];

    const data = await sharekhanGet('/rest/v2/history', {
      exchange:  SHAREKHAN_EXCHANGE,
      scripcode,
      startdate: fmt(fromDate),
      enddate:   fmt(toDate),
      interval:  '1d',
    });

    const bars = data?.data || [];
    if (!bars.length) return null;

    const closes = bars.map(b => parseFloat(b.close)).filter(Boolean);
    return {
      close:      bars.map(b => parseFloat(b.close)),
      open:       bars.map(b => parseFloat(b.open)),
      high:       bars.map(b => parseFloat(b.high)),
      low:        bars.map(b => parseFloat(b.low)),
      volume:     bars.map(b => parseInt(b.volume || 0)),
      timestamps: bars.map(b => new Date(b.date || b.datetime).getTime()),
      current:    closes[closes.length - 1],
      prev:       closes[closes.length - 2] ?? closes[closes.length - 1],
      source:     'sharekhan',
    };
  } catch (e) {
    console.warn('[sharekhan history]', symbol, e.message);
    return null;
  }
}

// ── Auth endpoints ─────────────────────────────────────────────────────────────

// GET /sharekhan/login-url — returns the URL user opens to authenticate
app.get('/sharekhan/login-url', (req, res) => {
  if (!SHAREKHAN_API_KEY) return res.status(503).json({ error: 'SHAREKHAN_API_KEY not set in Railway env vars' });
  // Sharekhan OAuth login URL
  const loginUrl = `https://api.sharekhan.com/rest/login/v1/token?api_key=${SHAREKHAN_API_KEY}&state=quaint_signal`;
  res.json({ loginUrl, message: 'Open this URL in browser, login, copy the request_token from redirect URL' });
});

// POST /sharekhan/auth — exchange request token for access token
app.post('/sharekhan/auth', async (req, res) => {
  const { requestToken } = req.body;
  if (!requestToken) return res.status(400).json({ error: 'requestToken required' });
  if (!SHAREKHAN_API_KEY || !SHAREKHAN_SECRET_KEY) return res.status(503).json({ error: 'SHAREKHAN_API_KEY and SHAREKHAN_SECRET_KEY required in Railway env vars' });
  try {
    const crypto   = require('crypto');
    // Sharekhan token generation: SHA256(api_key + request_token + secret_key)
    const checksum = crypto.createHash('sha256')
      .update(SHAREKHAN_API_KEY + requestToken + SHAREKHAN_SECRET_KEY)
      .digest('hex');

    const data = await sharekhanPost('/rest/login/v1/token', {
      request_token: requestToken,
      checksum,
    });

    if (data?.data?.token) {
      sharekhanToken = data.data.token;
      sharekhanTokenExpiry = Date.now() + 24*60*60*1000; // tokens valid ~24h
      console.log('[sharekhan] authenticated successfully');
      res.json({ success: true, message: 'Sharekhan authenticated. Token valid for ~24 hours.' });
    } else {
      res.status(401).json({ error: 'Auth failed', detail: data });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /sharekhan/status — check if authenticated
app.get('/sharekhan/status', (req, res) => {
  res.json({
    configured: !!(SHAREKHAN_API_KEY && SHAREKHAN_SECRET_KEY),
    authenticated: !!sharekhanToken,
    tokenExpiry: sharekhanTokenExpiry ? new Date(sharekhanTokenExpiry).toISOString() : null,
  });
});

// ── Yahoo Finance NSE Quote (with retry + multiple hosts) ────────────────────
async function yahooNSEQuote(symbol, retries = 2) {
  const ySymbol = `${symbol}.NS`;
  const paths = [
    `/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5d&includePrePost=false`,
    `/v10/finance/quoteSummary/${encodeURIComponent(ySymbol)}?modules=price`,
  ];
  // Rotate through hosts and paths
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const host of YAHOO_HOSTS) {
      for (const path of paths) {
        try {
          const data = await httpsGet(host, path, YAHOO_HEADERS);
          // v8 chart format
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice) {
            const price     = meta.regularMarketPrice;
            const prevClose = meta.previousClose || meta.chartPreviousClose;
            const change    = price && prevClose ? price - prevClose : null;
            const changePct = change && prevClose ? (change / prevClose) * 100 : null;
            return {
              price, prevClose,
              change:    change    ? parseFloat(change.toFixed(2))    : null,
              changePct: changePct ? parseFloat(changePct.toFixed(2)) : null,
              volume: meta.regularMarketVolume || 0,
              open: meta.regularMarketOpen    || null,
              high: meta.regularMarketDayHigh || null,
              low:  meta.regularMarketDayLow  || null,
              source: 'yahoo',
            };
          }
          // v10 quoteSummary format
          const p = data?.quoteSummary?.result?.[0]?.price;
          if (p?.regularMarketPrice?.raw) {
            return {
              price:     p.regularMarketPrice.raw,
              prevClose: p.regularMarketPreviousClose?.raw || null,
              change:    p.regularMarketChange?.raw    ? parseFloat(p.regularMarketChange.raw.toFixed(2))    : null,
              changePct: p.regularMarketChangePercent?.raw ? parseFloat((p.regularMarketChangePercent.raw * 100).toFixed(2)) : null,
              volume:    p.regularMarketVolume?.raw    || 0,
              open:      p.regularMarketOpen?.raw      || null,
              high:      p.regularMarketDayHigh?.raw   || null,
              low:       p.regularMarketDayLow?.raw    || null,
              source: 'yahoo_v10',
            };
          }
        } catch { continue; }
      }
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  return null;
}

// ── NSE Bhav Copy fallback — official NSE EOD data, completely free ───────────
// Published daily at ~6PM IST, no IP blocks, no auth needed
async function getNSEBhavPrice(symbol) {
  const today     = new Date();
  const cacheKey  = `bhav:${symbol}:${today.toISOString().split('T')[0]}`;
  if (nseBhavCache.has(cacheKey)) return nseBhavCache.get(cacheKey);
  try {
    // NSE bhav copy CSV URL
    const dd  = String(today.getDate()).padStart(2, '0');
    const mm  = String(today.getMonth() + 1).padStart(2, '0');
    const yy  = today.getFullYear();
    const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][today.getMonth()];
    const url = `/content/historical/EQUITIES/${yy}/${MON}/cm${dd}${MON}${yy}bhav.csv.zip`;
    // Try yesterday if today's isn't out yet (before 6PM IST)
    const data = await httpsGet('nseindia.com', url, {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*',
      'Referer': 'https://nseindia.com',
    });
    if (!data) return null;
    // Parse CSV — format: SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,...
    const lines = data.toString().split('\n');
    const row   = lines.find(l => l.startsWith(symbol + ',EQ,'));
    if (!row) return null;
    const cols = row.split(',');
    const result = {
      price:     parseFloat(cols[5]) || parseFloat(cols[6]), // CLOSE or LAST
      open:      parseFloat(cols[2]),
      high:      parseFloat(cols[3]),
      low:       parseFloat(cols[4]),
      prevClose: parseFloat(cols[7]),
      volume:    parseInt(cols[8]) || 0,
      change:    null, changePct: null,
      source:    'nse_bhav',
    };
    if (result.price && result.prevClose) {
      result.change    = parseFloat((result.price - result.prevClose).toFixed(2));
      result.changePct = parseFloat(((result.change / result.prevClose) * 100).toFixed(2));
    }
    nseBhavCache.set(cacheKey, result);
    return result;
  } catch { return null; }
}

async function getNSEQuote(symbol) {
  const cached = nseQuoteCache.get(symbol);

  // Return fresh cache immediately
  if (cached && Date.now() - cached.ts < NSE_QUOTE_TTL) return cached.data;

  // If stale cache exists, return it immediately AND refresh in background
  // This prevents blocking the UI while fetching
  if (cached && Date.now() - cached.ts < NSE_QUOTE_TTL * 6) {
    refreshNSEQuote(symbol).catch(() => {}); // background refresh
    return cached.data; // return stale immediately
  }

  return await refreshNSEQuote(symbol);
}

async function refreshNSEQuote(symbol) {
  const cached = nseQuoteCache.get(symbol);
  let result   = null;

  // 1. Sharekhan (if configured)
  if (sharekhanToken && SHAREKHAN_API_KEY) {
    result = await getSharekhanQuote(symbol).catch(() => null);
  }

  // 2. stock-nse-india (direct NSE, no IP blocks)
  if (!result && nseIndia) {
    try {
      const details = await nseIndia.getEquityDetails(symbol);
      const p       = details?.priceInfo;
      if (p?.lastPrice) {
        result = {
          price:      p.lastPrice,
          prevClose:  p.previousClose || p.close,
          change:     p.change  ? parseFloat(p.change.toFixed(2))  : null,
          changePct:  p.pChange ? parseFloat(p.pChange.toFixed(2)) : null,
          volume:     details?.preOpenMarket?.totalTradedVolume || details?.securityInfo?.tradedVolume || 0,
          open:       p.open                   || null,
          high:       p.intraDayHighLow?.max   || null,
          low:        p.intraDayHighLow?.min   || null,
          weekHigh52: p.weekHighLow?.max        || null,
          weekLow52:  p.weekHighLow?.min        || null,
          source:    'nse_india',
        };
      }
    } catch (e) { console.warn(`[NSE] stock-nse-india failed ${symbol}:`, e.message); }
  }

  // 3. Yahoo Finance (with retry across 2 hosts and 2 API versions)
  if (!result) {
    result = await yahooNSEQuote(symbol, 2).catch(() => null);
    if (result) console.log(`[NSE] Yahoo fallback used for ${symbol}`);
  }

  // 4. NSE Bhav Copy (EOD, always available after 6PM IST)
  if (!result) {
    result = await getNSEBhavPrice(symbol).catch(() => null);
    if (result) console.log(`[NSE] Bhav copy fallback for ${symbol}`);
  }

  if (result) {
    nseQuoteCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  }

  // 5. Last resort: return stale cache even if very old
  if (cached) {
    console.warn(`[NSE] all sources failed for ${symbol}, returning stale cache`);
    return cached.data;
  }

  console.error(`[NSE] no data available for ${symbol}`);
  return null;
}


app.get('/debug/quote/:ticker', async (req, res) => {
  try {
    const data = await tradierGet(`/v1/markets/quotes?symbols=${req.params.ticker}&greeks=false`);
    const q = data?.quotes?.quote || {};
    res.json({
      symbol:          q.symbol,
      last:            q.last,
      bid:             q.bid,
      ask:             q.ask,
      change:          q.change,
      change_percentage: q.change_percentage,
      volume:          q.volume,
      trade_date:      q.trade_date,
      last_volume:     q.last_volume,
      prevclose:       q.prevclose,
      open:            q.open,
      high:            q.high,
      low:             q.low,
      timestamp:       new Date().toISOString(),
      cache_ts:        usMoversCache.ts ? new Date(usMoversCache.ts).toISOString() : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

// ── Term structure endpoint — fetch near + far expiry IV for backwardation/contango ──
app.get('/tradier/term-structure/:ticker', async (req, res) => {
  try {
    const { near, far } = req.query; // two expiry dates
    if (!near || !far) return res.status(400).json({ error: 'near and far required' });
    const [nearData, farData] = await Promise.all([
      tradierGet(`/v1/markets/options/chains?symbol=${req.params.ticker}&expiration=${near}&greeks=true`),
      tradierGet(`/v1/markets/options/chains?symbol=${req.params.ticker}&expiration=${far}&greeks=true`),
    ]);
    const avgIV = (opts) => {
      const atm = (opts?.options?.option || []).filter(o => o.greeks?.mid_iv > 0);
      return atm.length ? atm.reduce((s, o) => s + o.greeks.mid_iv, 0) / atm.length * 100 : null;
    };
    const nearIV = avgIV(nearData);
    const farIV  = avgIV(farData);
    const structure = nearIV && farIV
      ? nearIV > farIV * 1.05 ? 'BACKWARDATION'  // near > far = event risk / fear
      : nearIV < farIV * 0.95 ? 'CONTANGO'       // normal term structure
      : 'FLAT'
      : 'UNKNOWN';
    res.json({
      near: { expiry: near, avgIV: nearIV?.toFixed(1) },
      far:  { expiry: far,  avgIV: farIV?.toFixed(1)  },
      structure,
      interpretation: structure === 'BACKWARDATION'
        ? 'Near-term event risk elevated — IV crush risk after expiry. Consider longer-dated options.'
        : structure === 'CONTANGO'
        ? 'Normal term structure — near options cheaper. Short-term plays have good risk/reward.'
        : 'Flat term structure — no strong term signal.',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/tradier/quote/:ticker', async (req, res) => {
  try {
    const data = await tradierGet(`/v1/markets/quotes?symbols=${req.params.ticker}&greeks=false`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/bonds', async (req, res) => {
  try {
    const symbols = [
      { poly: 'IEF', yahoo: '^TNX' }, { poly: 'SHY', yahoo: '^IRX' },
      { poly: 'TLT', yahoo: '^TYX' }, { poly: 'TLT', yahoo: 'TLT'  },
      { poly: 'IEF', yahoo: 'IEF'  },
    ];
    res.json(await polygonBatch(symbols, 10));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/international', async (req, res) => {
  try {
    const symbols = [
      { poly: 'EWJ',  yahoo: '^N225'     }, { poly: 'EWH',  yahoo: '^HSI'      },
      { poly: 'FXI',  yahoo: '000001.SS' }, { poly: 'INDA', yahoo: '^BSESN'    },
      { poly: 'EWG',  yahoo: '^GDAXI'    }, { poly: 'EWU',  yahoo: '^FTSE'     },
      { poly: 'EWQ',  yahoo: '^FCHI'     }, { poly: 'FEZ',  yahoo: '^STOXX50E' },
      { poly: 'VIXY', yahoo: '^VIX'      }, { poly: 'UUP',  yahoo: 'DX-Y.NYB'  },
      { poly: 'GLD',  yahoo: 'GC=F'      }, { poly: 'USO',  yahoo: 'CL=F'      },
    ];
    res.json(await polygonBatch(symbols, 10));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/calendar', async (req, res) => {
  const topics = [
    { ticker: 'SPY', category: 'FEDERAL RESERVE' }, { ticker: 'TLT', category: 'BONDS/RATES'   },
    { ticker: 'GLD', category: 'COMMODITIES'     }, { ticker: 'QQQ', category: 'TECH/EARNINGS' },
    { ticker: 'DIA', category: 'MACRO/ECONOMY'   }, { ticker: 'USO', category: 'OIL/ENERGY'    },
    { ticker: 'EEM', category: 'EMERGING MARKETS'}, { ticker: 'FXI', category: 'CHINA ECONOMY' },
  ];
  try {
    const results = await Promise.all(topics.map(({ ticker, category }) =>
      polygonGet(`/v2/reference/news?ticker=${ticker}&limit=3&order=desc&sort=published_utc`)
        .then(data => (data.results || []).map(n => ({
          title: n.title, publisher: n.publisher?.name || '',
          time: Math.floor(new Date(n.published_utc).getTime() / 1000), category, url: n.article_url,
        }))).catch(() => [])
    ));
    const flat = results.flat().sort((a, b) => b.time - a.time);
    const seen = new Set();
    res.json(flat.filter(item => { if (seen.has(item.title)) return false; seen.add(item.title); return true; }).slice(0, 24));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function checkRSIContradiction(rsi14, recommendation) {
  if (!rsi14 || !recommendation) return null;
  if (recommendation === 'CALL' && rsi14 > 70) return `⚠ RSI CONTRADICTION: RSI=${rsi14} OVERBOUGHT but recommending CALLs — mean reversion risk HIGH`;
  if (recommendation === 'PUT'  && rsi14 < 30) return `⚠ RSI CONTRADICTION: RSI=${rsi14} OVERSOLD but recommending PUTs — bounce risk HIGH`;
  if (recommendation === 'CALL' && rsi14 > 65) return `CAUTION: RSI=${rsi14} approaching overbought for CALL entry`;
  if (recommendation === 'PUT'  && rsi14 < 35) return `CAUTION: RSI=${rsi14} approaching oversold for PUT entry`;
  return null;
}

function calcDeltaAdjustedSize(delta, premium, budget = 1500) {
  if (!delta || !premium || premium <= 0) return null;
  const absDelta    = Math.abs(parseFloat(delta));
  const contracts   = Math.max(1, Math.floor(budget / (premium * 100)));
  const dollarDelta = contracts * 100 * absDelta;
  let sizeAdvice;
  if      (absDelta >= 0.7)  sizeAdvice = `High delta (${absDelta}) — deep ITM, 1-2 contracts for defined risk`;
  else if (absDelta >= 0.45) sizeAdvice = `ATM delta (${absDelta}) — ${contracts} contracts = $${dollarDelta.toFixed(0)} delta exposure`;
  else if (absDelta >= 0.25) sizeAdvice = `OTM delta (${absDelta}) — needs larger move, consider fewer contracts`;
  else                       sizeAdvice = `Far OTM delta (${absDelta}) — lottery ticket, limit to 1 contract`;
  return { contracts, absDelta, dollarDelta: parseFloat(dollarDelta.toFixed(0)), sizeAdvice };
}

function calcEarningsProximity(calendar, ticker, selectedExpiry = null) {
  if (!calendar?.length) return null;
  const earningsKeywords = ['earnings','eps','quarterly results','q1','q2','q3','q4','results'];
  const tickerEvents = calendar.filter(e => {
    const title = (e.title || '').toLowerCase();
    return title.includes(ticker?.toLowerCase() || '') ||
      (earningsKeywords.some(kw => title.includes(kw)) && e.category === 'TECH/EARNINGS');
  });
  if (!tickerEvents.length) return null;
  const now      = Date.now();
  const upcoming = tickerEvents.map(e => ({ ...e, date: e.time * 1000 }))
    .filter(e => e.date > now).sort((a, b) => a.date - b.date);
  if (!upcoming.length) return null;
  const next           = upcoming[0];
  const daysToEarnings = Math.round((next.date - now) / (1000 * 60 * 60 * 24));
  const earningsBeforeExpiry = selectedExpiry ? next.date < new Date(selectedExpiry).getTime() : false;
  const risk   = daysToEarnings <= 3 ? 'CRITICAL' : daysToEarnings <= 7 ? 'HIGH' : daysToEarnings <= 14 ? 'MEDIUM' : 'LOW';
  const advice = daysToEarnings <= 3 ? 'Earnings <3 days away — IV crush risk extreme. Avoid buying options.'
    : daysToEarnings <= 7  ? 'Earnings within 1 week — IV elevated, premium expensive.'
    : daysToEarnings <= 14 ? 'Earnings within 2 weeks — factor IV expansion into cost.'
    : 'No imminent earnings risk.';
  return { daysToEarnings, earningsDate: new Date(next.date).toISOString().split('T')[0], earningsBeforeExpiry, risk, advice };
}
function categorizeNews(headlines) {
  return (headlines || []).map(n => {
    const t = n.title?.toLowerCase() || '';
    if (t.includes('upgrade') || t.includes('outperform') || t.includes('buy rating') || t.includes('overweight') || t.includes('initiated')) return `[UPGRADE] ${n.title}`;
    if (t.includes('downgrade') || t.includes('underperform') || t.includes('sell rating') || t.includes('underweight') || t.includes('cuts to')) return `[DOWNGRADE] ${n.title}`;
    if (t.includes('price target') || t.includes('raises target') || t.includes('lowers target') || t.includes('pt raised') || t.includes('pt cut')) return `[ANALYST TARGET] ${n.title}`;
    if (t.includes('13f') || t.includes('insider') || t.includes('stake') || t.includes('buffett') || t.includes('bought shares') || t.includes('sold shares')) return `[INSIDER/FUND] ${n.title}`;
    if (t.includes('earnings') || t.includes('eps') || t.includes('revenue') || t.includes('beat') || t.includes('miss') || t.includes('guidance')) return `[EARNINGS] ${n.title}`;
    if (t.includes('fda') || t.includes('approval') || t.includes('lawsuit') || t.includes('sec') || t.includes('merger') || t.includes('acquisition')) return `[REGULATORY/EVENT] ${n.title}`;
    if (t.includes('short seller') || t.includes('hindenburg') || t.includes('citron')) return `[SHORT ATTACK] ${n.title}`;
    return `[NEWS] ${n.title}`;
  });
}

function buildMacroContext(bonds, macroNews, intlMarkets, calendar) {
  let ctx = '\n=== MACRO ===\n';
  if (bonds) ctx += `BONDS: 10Y=${bonds.tnx?.current?.toFixed(2)}% | 2Y=${bonds.irx?.current?.toFixed(2)}% | Curve=${bonds.yieldCurve}% ${bonds.inverted ? '⚠ INVERTED' : ''} | TLT=$${bonds.tlt?.current?.toFixed(2)}\n`;
  if (intlMarkets?.length) {
    const find = sym => intlMarkets.find(m => m.symbol === sym);
    const pct  = m => m?.changePct != null ? `${m.changePct > 0 ? '+' : ''}${m.changePct.toFixed(2)}%` : 'N/A';
    const vix = find('^VIX'), dxy = find('DX-Y.NYB'), gold = find('GC=F'), oil = find('CL=F');
    ctx += `ASIA: N225=${pct(find('^N225'))} | HSI=${pct(find('^HSI'))} | Sensex=${pct(find('^BSESN'))}\n`;
    ctx += `EUROPE: DAX=${pct(find('^GDAXI'))} | FTSE=${pct(find('^FTSE'))} | CAC=${pct(find('^FCHI'))}\n`;
    ctx += `SIGNALS: VIX=${vix?.current?.toFixed(2)} ${vix?.current > 25 ? '⚠ HIGH' : vix?.current > 20 ? 'ELEVATED' : 'CALM'} | DXY=${dxy?.current?.toFixed(2)} | Gold=$${gold?.current?.toFixed(2)} | Oil=$${oil?.current?.toFixed(2)}\n`;
  }
  if (calendar?.length) ctx += `CALENDAR: ${calendar.slice(0, 4).map(e => e.title).join(' | ')}\n`;
  if (macroNews?.length) ctx += `GEO NEWS: ${macroNews.slice(0, 4).map(n => n.title).join(' | ')}\n`;
  return ctx;
}

function buildIntradayContext(ohlcv, quote) {
  const current   = quote?.last || ohlcv?.current;
  const open      = quote?.open || null;
  const prevClose = ohlcv?.prev || quote?.prevClose || null;
  let ctx = '\n=== INTRADAY MOVE ===\n';
  if (current && prevClose) {
    const dayChangePct = ((current - prevClose) / prevClose * 100);
    const abs = Math.abs(dayChangePct).toFixed(2);
    ctx += `TODAY: ${dayChangePct > 0 ? 'UP' : 'DOWN'} ${abs}% | prev $${prevClose.toFixed(2)} → $${current.toFixed(2)}\n`;
    if      (dayChangePct <= -1.5)  ctx += `⚠ DOWN ${abs}% TODAY\n`;
    else if (dayChangePct <= -0.75) ctx += `NOTE: Down ${abs}% today\n`;
    else if (dayChangePct >= 1.5)   ctx += `⚠ UP ${abs}% TODAY\n`;
    else if (dayChangePct >= 0.75)  ctx += `NOTE: Up ${abs}% today\n`;
  }
  if (current && open) ctx += `FROM OPEN: ${((current - open) / open * 100).toFixed(2)}%\n`;
  if (ohlcv?.close?.length >= 5) {
    const closes   = ohlcv.close.slice(-5);
    const momentum = ((closes[4] - closes[0]) / closes[0] * 100).toFixed(2);
    ctx += `5-SESSION: ${parseFloat(momentum) > 0 ? 'UP' : 'DOWN'} ${Math.abs(momentum)}%\n`;
    let downDays = 0, upDays = 0;
    for (let i = closes.length - 1; i > 0; i--) { if (closes[i] < closes[i-1]) downDays++; else break; }
    for (let i = closes.length - 1; i > 0; i--) { if (closes[i] > closes[i-1]) upDays++;   else break; }
    if (downDays >= 4) ctx += `⚠ ${downDays} CONSECUTIVE DOWN SESSIONS\n`;
    if (upDays   >= 4) ctx += `⚠ ${upDays} CONSECUTIVE UP SESSIONS\n`;
  }
  return ctx;
}

function buildTAContext(ta, ticker = '', calendar = null, selectedExpiry = null) {
  if (!ta) return '';
  let ctx = '\n=== TECHNICAL ANALYSIS ===\n';
  if (ta.macd) {
    ctx += `MACD: Line=${ta.macd.macdLine} | Signal=${ta.macd.signalLine} | Hist=${ta.macd.histogram} | ${ta.macd.trend} | ${ta.macd.cross}\n`;
    if (ta.macd.cross === 'BULLISH_CROSS') ctx += `✅ MACD BULLISH CROSS\n`;
    if (ta.macd.cross === 'BEARISH_CROSS') ctx += `🔴 MACD BEARISH CROSS\n`;
  }
  if (ta.bb) {
    ctx += `BB: Upper=$${ta.bb.upper} | Mid=$${ta.bb.middle} | Lower=$${ta.bb.lower} | Width=${ta.bb.bWidth}% | %B=${ta.bb.bPct} | ${ta.bb.position}\n`;
    if (ta.bb.squeeze)                   ctx += `🔥 BB SQUEEZE\n`;
    if (ta.bb.position === 'NEAR_UPPER') ctx += `NOTE: Price near BB upper band\n`;
    if (ta.bb.position === 'NEAR_LOWER') ctx += `NOTE: Price near BB lower band\n`;
  }
  if (ta.atr) {
    ctx += `ATR(14): ${ta.atr.atr} (${ta.atr.atrPct}% of price) | Volatility=${ta.atr.volatility}\n`;
    ctx += `ATR STOPS: Long=$${ta.atr.atr1Stop} (1x) / $${ta.atr.atr2Stop} (2x) | Short=$${ta.atr.shortStop}\n`;
    ctx += `ATR TARGETS: 1x=$${ta.atr.atr1Target} | 2x=$${ta.atr.atr2Target}\n`;
    if (ta.atr.volatility === 'HIGH') ctx += `⚠ HIGH ATR\n`;
    if (ta.atr.volatility === 'LOW')  ctx += `ℹ LOW ATR\n`;
  }
  if (ta.stochRSI) {
    ctx += `STOCH RSI: K=${ta.stochRSI.k} | D=${ta.stochRSI.d} | ${ta.stochRSI.signal}${ta.stochRSI.crossover ? ` | ${ta.stochRSI.crossover}` : ''}\n`;
    if (ta.stochRSI.signal === 'OVERBOUGHT') ctx += `⚠ STOCH RSI EXTREME OVERBOUGHT\n`;
    if (ta.stochRSI.signal === 'OVERSOLD')   ctx += `✅ STOCH RSI EXTREME OVERSOLD\n`;
    if (ta.stochRSI.crossover === 'BULLISH_CROSS') ctx += `✅ STOCH RSI BULLISH CROSS\n`;
    if (ta.stochRSI.crossover === 'BEARISH_CROSS') ctx += `🔴 STOCH RSI BEARISH CROSS\n`;
  }
  if (ta.sr) {
    ctx += `SUPPORT: ${ta.sr.supportLevels.map(s => `$${s}`).join(', ') || 'none'} | Nearest=$${ta.sr.nearestSupport} (${ta.sr.distToSupport}% below)\n`;
    ctx += `RESISTANCE: ${ta.sr.resistanceLevels.map(r => `$${r}`).join(', ') || 'none'} | Nearest=$${ta.sr.nearestResistance} (${ta.sr.distToResistance}% above)\n`;
    ctx += `S/R Ratio=${ta.sr.srRatio} | Period High=$${ta.sr.periodHigh} | Period Low=$${ta.sr.periodLow}\n`;
    if (ta.sr.distToResistance < 5) ctx += `NOTE: Within 5% of resistance\n`;
    if (ta.sr.distToSupport    < 5) ctx += `NOTE: Within 5% of support\n`;
    if (ta.sr.srRatio && ta.sr.srRatio > 2) ctx += `✅ GOOD LONG SETUP\n`;
  }
  if (ta.priceVsSma20 != null)
    ctx += `SMA DIST: vs SMA20=${ta.priceVsSma20}% | vs SMA50=${ta.priceVsSma50 ?? 'N/A'}% | vs SMA200=${ta.priceVsSma200 ?? 'N/A'}%\n`;
  if (ta.priceVsSma200 && Math.abs(parseFloat(ta.priceVsSma200)) > 15)
    ctx += `⚠ Price ${ta.priceVsSma200}% from SMA200 — very extended\n`;
  if (ticker && calendar) {
    const ep = calcEarningsProximity(calendar, ticker, selectedExpiry);
    if (ep) {
      ctx += `\nEARNINGS: ${ep.daysToEarnings}d away (${ep.earningsDate})${ep.earningsBeforeExpiry ? ' ⚠ BEFORE EXPIRY' : ''} | Risk=${ep.risk}\n`;
      ctx += `EARNINGS ADVICE: ${ep.advice}\n`;
    }
  }
  return ctx;
}

// ── Max pain calculation ─────────────────────────────────────────────────────
// Max pain = strike where total dollar value of expiring options is minimized
// Market makers are least exposed here — price gravitates toward this strike near expiry
function calcMaxPain(chain) {
  if (!chain?.topCalls?.length || !chain?.topPuts?.length) return null;
  const strikes = [...new Set([
    ...(chain.topCalls || []).map(c => c.strike),
    ...(chain.topPuts  || []).map(p => p.strike),
  ])].sort((a, b) => a - b);

  let minPain = Infinity, maxPainStrike = null;
  for (const expStrike of strikes) {
    let totalPain = 0;
    // Pain for call holders: calls ITM at expStrike lose value as price rises above their strike
    for (const c of (chain.topCalls || [])) {
      if (expStrike > c.strike) totalPain += (expStrike - c.strike) * (c.oi || 0) * 100;
    }
    // Pain for put holders: puts ITM at expStrike lose value as price falls below their strike
    for (const p of (chain.topPuts || [])) {
      if (expStrike < p.strike) totalPain += (p.strike - expStrike) * (p.oi || 0) * 100;
    }
    if (totalPain < minPain) { minPain = totalPain; maxPainStrike = expStrike; }
  }
  return maxPainStrike;
}

// ── Delta-adjusted expected return for each moneyness ─────────────────────────
// Paper §3.5 basis: given signal confidence and ATR, what probability does each
// moneyness level have of being profitable at expiry?
// Expected move = 1-standard-deviation move based on ATR × sqrt(DTE/252)
function calcExpectedReturn(chain, spot, ta, dte) {
  if (!spot || !chain) return null;
  const results = {};
  const annualVol = parseFloat(chain.avgCallIV) / 100 || 0.30;
  const dteFrac   = (dte || 30) / 252;
  const oneSigma  = spot * annualVol * Math.sqrt(dteFrac); // 1-std expected move

  // For each moneyness level, calculate probability of profit
  const classify = (delta) => {
    const d = Math.abs(parseFloat(delta) || 0);
    if (d >= 0.60) return 'ITM';
    if (d >= 0.40) return 'ATM';
    return 'OTM';
  };

  for (const type of ['CALL', 'PUT']) {
    const contracts = type === 'CALL' ? (chain.topCalls || []) : (chain.topPuts || []);
    for (const c of contracts) {
      const moneyness = classify(c.delta);
      if (results[`${type}_${moneyness}`]) continue; // already have one

      const strike      = parseFloat(c.strike);
      const premium     = parseFloat(c.mid) || 0;
      const breakeven   = type === 'CALL' ? strike + premium : strike - premium;
      const moveNeeded  = Math.abs(breakeven - spot);
      const sigmasNeeded = oneSigma > 0 ? moveNeeded / oneSigma : 999;

      // Approximate probability using delta as proxy (paper §3.5)
      // delta ≈ probability of expiring ITM (risk-neutral)
      const probITM = Math.abs(parseFloat(c.delta) || 0);
      // But we need to reach breakeven, not just ITM
      // Adjust: prob(breakeven) ≈ probITM × (1 - premium/oneSigma × 0.3)
      const probProfit = Math.max(0, Math.min(1, probITM * (1 - sigmasNeeded * 0.15)));

      results[`${type}_${moneyness}`] = {
        strike, premium, breakeven: parseFloat(breakeven.toFixed(2)),
        moveNeeded: parseFloat(moveNeeded.toFixed(2)),
        sigmasNeeded: parseFloat(sigmasNeeded.toFixed(2)),
        probProfit:   Math.round(probProfit * 100),
        probITM:      Math.round(probITM * 100),
      };
    }
  }
  return results;
}

function buildChainContext(chain, spot = null, ta = null, dte = 30) {
  if (!chain) return '';
  let ctx = '\n=== OPTIONS INTELLIGENCE ===\n';

  // IV environment (§3.5 — high IV = expensive options, prefer selling; low IV = buy)
  ctx += `IV SKEW: ${chain.ivSkewPct}% (${chain.ivSkewLabel}) — ${chain.ivSkewLabel === 'PUT_SKEW' ? 'crash fear present' : chain.ivSkewLabel === 'CALL_SKEW' ? 'melt-up fear/retail buying' : 'balanced sentiment'}\n`;
  ctx += `IV PERCENTILE: ${chain.ivPercentile}% — ${chain.ivPctLabel}\n`;
  ctx += `ATM Call IV: ${chain.avgCallIV}% | ATM Put IV: ${chain.avgPutIV}%\n`;

  // VOL/OI
  ctx += `VOL/OI: Calls=${chain.callVolOIRatio} | Puts=${chain.putVolOIRatio} | P/C Vol=${parseFloat(chain.putCallVolRatio)?.toFixed(2)} | P/C OI=${parseFloat(chain.putCallRatio)?.toFixed(2)}\n`;

  // Max pain (market maker neutral strike)
  const maxPain = calcMaxPain(chain);
  if (maxPain) {
    const painDist = spot ? ((maxPain - spot) / spot * 100).toFixed(1) : null;
    ctx += `MAX PAIN: $${maxPain}${painDist ? ` (${painDist > 0 ? '+' : ''}${painDist}% from spot)` : ''} — market makers least exposed here, price gravitates toward this near expiry\n`;
    if (spot && Math.abs(maxPain - spot) / spot < 0.01) ctx += `⚠ SPOT AT MAX PAIN — pinning risk high\n`;
  }

  // Expected move (1-sigma)
  if (chain.avgCallIV && spot) {
    const annualVol = parseFloat(chain.avgCallIV) / 100;
    const expectedMove = (spot * annualVol * Math.sqrt(dte / 252)).toFixed(2);
    ctx += `EXPECTED MOVE (1σ, ${dte}d): ±$${expectedMove} (${(parseFloat(chain.avgCallIV)).toFixed(1)}% IV)\n`;
  }

  // Delta-adjusted expected returns by moneyness (§3.5 implementation)
  if (spot && ta) {
    const er = calcExpectedReturn(chain, spot, ta, dte);
    if (er) {
      ctx += `\nEXPECTED RETURN BY MONEYNESS (paper §3.5 — delta-adjusted prob of profit):\n`;
      for (const [key, v] of Object.entries(er)) {
        ctx += `  ${key}: strike=$${v.strike} premium=$${v.premium} breakeven=$${v.breakeven} needs ${v.sigmasNeeded}σ move | ProbProfit≈${v.probProfit}% | DeltaProb≈${v.probITM}%\n`;
      }
    }
  }

  if (chain.unusualCalls?.length) ctx += `🔥 UNUSUAL CALL VOL: ${chain.unusualCalls.join(', ')}\n`;
  if (chain.unusualPuts?.length)  ctx += `🔥 UNUSUAL PUT VOL: ${chain.unusualPuts.join(', ')}\n`;
  if (chain.highGammaStrike) ctx += `GAMMA PIN: $${chain.highGammaStrike} — highest gamma concentration, acts as magnet\n`;
  const wideCalls = (chain.topCalls || []).filter(c => c.wideSpread).map(c => `$${c.strike}`);
  const widePuts  = (chain.topPuts  || []).filter(p => p.wideSpread).map(p => `$${p.strike}`);
  if (wideCalls.length) ctx += `⚠ WIDE SPREAD CALLS (avoid): ${wideCalls.join(', ')}\n`;
  if (widePuts.length)  ctx += `⚠ WIDE SPREAD PUTS (avoid): ${widePuts.join(', ')}\n`;
  return ctx;
}

function buildSizingContext(calls, puts, budget = 1500) {
  let ctx = '\n=== DELTA-ADJUSTED SIZING ===\n';
  const bestCall = calls[0], bestPut = puts[0];
  if (bestCall?.delta && bestCall?.mid) {
    const s = calcDeltaAdjustedSize(bestCall.delta, bestCall.mid, budget);
    if (s) ctx += `CALL $${bestCall.strike}: ${s.sizeAdvice} | $delta=${s.dollarDelta}\n`;
  }
  if (bestPut?.delta && bestPut?.mid) {
    const s = calcDeltaAdjustedSize(bestPut.delta, bestPut.mid, budget);
    if (s) ctx += `PUT $${bestPut.strike}: ${s.sizeAdvice} | $delta=${s.dollarDelta}\n`;
  }
  return ctx;
}

async function callClaudeRaw(body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const request = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01',
        'content-type': 'application/json', 'content-length': Buffer.byteLength(bodyStr),
      }
    }, response => {
      let data = '';
      response.on('data', c => (data += c));
      response.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error: ' + e.message)); }
      });
    });
    request.on('error', reject);
    request.write(bodyStr);
    request.end();
  });
}

async function callClaudeAPI(body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const request = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01',
        'content-type': 'application/json', 'content-length': Buffer.byteLength(bodyStr),
      }
    }, response => {
      let data = '';
      response.on('data', c => (data += c));
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { reject(new Error(parsed.error.message || 'Claude API error')); return; }
          const text   = parsed.content?.[0]?.text || '{}';
          const clean  = text.replace(/```json\n?|```/g, '').trim();
          try {
            resolve(JSON.parse(clean));
          } catch (parseErr) {
            console.error('[Claude parse error] raw text length:', text.length, 'stop_reason:', parsed.stop_reason);
            console.error('[Claude parse error] text sample:', text.slice(-200));
            reject(new Error('Response too long or malformed JSON. Try again.'));
          }
        } catch (e) {
          console.error('[Claude raw error]', data.slice(0, 300));
          reject(new Error('Claude response error: ' + e.message));
        }
      });
    });
    request.on('error', reject);
    request.write(bodyStr);
    request.end();
  });
}

app.post('/api/analyze/combined', async (req, res) => {
  try {
    const { ticker, price, ohlcv, fundamentals, chain, news, bonds, macroNews,
            intlMarkets, calendar, ta, expiry, timeframeKey = 'swing', quote } = req.body;
    const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
    const intradayCtx = buildIntradayContext(ohlcv, quote);
    const taCtx       = buildTAContext(ta, ticker, calendar, expiry);
    // DTE calculation for expected move and prob estimates
    const expiryDate  = new Date(expiry);
    const today       = new Date();
    const dte         = Math.max(1, Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)));
    const chainCtx    = buildChainContext(chain, price, ta, dte);
    const categorized = categorizeNews(news).slice(0, 8);
    const calls       = chain?.topCalls?.slice(0, 5) || [];
    const puts        = chain?.topPuts?.slice(0, 5)  || [];
    const sizingCtx   = buildSizingContext(calls, puts);
    const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
    const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
    const hasTarget    = categorized.some(n => n.startsWith('[ANALYST TARGET]'));
    const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));
    const hasShort     = categorized.some(n => n.startsWith('[SHORT ATTACK]'));
    const callMid       = calls[0]?.mid || 0;
    const putMid        = puts[0]?.mid  || 0;
    const callContracts = calcDeltaAdjustedSize(calls[0]?.delta, callMid)?.contracts || Math.max(1, Math.floor(1500 / (callMid * 100)));
    const putContracts  = calcDeltaAdjustedSize(puts[0]?.delta,  putMid)?.contracts  || Math.max(1, Math.floor(1500 / (putMid  * 100)));
    const callStop   = (callMid * 0.50).toFixed(2);
    const callTarget = (callMid * 2.00).toFixed(2);
    const putStop    = (putMid  * 0.50).toFixed(2);
    const putTarget  = (putMid  * 2.00).toFixed(2);
    const prevClose    = ohlcv?.prev || quote?.prevClose;
    const dayChangePct = price && prevClose ? ((price - prevClose) / prevClose * 100) : 0;
    const callContradiction = checkRSIContradiction(ta?.rsi14, 'CALL');
    const putContradiction  = checkRSIContradiction(ta?.rsi14, 'PUT');
    const ep = calcEarningsProximity(calendar, ticker, expiry);
    const tfMeta = {
      short: {
        label: 'Short Term (1-5 days)',
        focus: 'momentum, RSI, StochRSI, volume spikes, news catalysts, intraday price action.',
        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}] | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} (${ta?.atr?.volatility}) | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)`,
        targetRule: `Use 1x ATR ($${ta?.atr?.atr1Target}) as target, stop at $${ta?.atr?.atr1Stop}. Tight risk management.`,
        bullFactorFocus: 'momentum signals, volume confirmation, news catalyst, intraday breakout',
        bearFactorFocus: 'overbought readings, volume dry-up, negative news, resistance rejection',
      },
      swing: {
        label: 'Swing Trade (1-4 weeks)',
        focus: 'trend direction, SMA20/50 alignment, MACD cross, BB position, S/R levels, ATR stops.',
        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} (${ta?.macd?.trend}) | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | BB=${ta?.bb?.position} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal} | S=${ta?.sr?.nearestSupport} R=${ta?.sr?.nearestResistance}`,
        targetRule: `Target: resistance $${ta?.sr?.nearestResistance} or 2x ATR $${ta?.atr?.atr2Target}. Stop: $${ta?.atr?.atr1Stop} or support $${ta?.sr?.nearestSupport}.`,
        bullFactorFocus: 'trend alignment, MACD cross, BB breakout, S/R setup, volume',
        bearFactorFocus: 'trend breakdown, MACD bearish, resistance rejection, volume fade',
      },
      position: {
        label: 'Position Trade (1-3 months)',
        focus: 'SMA50/200 trend, fundamentals quality, macro tailwinds, sector rotation.',
        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | ATR=${ta?.atr?.atr} | vs SMA200=${ta?.priceVsSma200}%`,
        targetRule: `Target: analyst price $${fundamentals?.targetMeanPrice} or 2x ATR. Stop below SMA50 $${ta?.sma50} or 2x ATR $${ta?.atr?.atr2Stop}.`,
        bullFactorFocus: 'fundamental strength, golden cross, macro tailwind, sector leadership',
        bearFactorFocus: 'fundamental deterioration, death cross, macro headwind, sector rotation out',
      },
      longterm: {
        label: 'Long Term (6-12 months)',
        focus: 'business quality, earnings growth, valuation, macro cycle, analyst consensus.',
        indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | vs SMA200=${ta?.priceVsSma200}% | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey?.toUpperCase()} | P/E=${fundamentals?.pe}`,
        targetRule: `Target: analyst consensus $${fundamentals?.targetMeanPrice}. Stop at SMA200 $${ta?.sma200} or major support $${ta?.sr?.nearestSupport}.`,
        bullFactorFocus: 'earnings growth, undervaluation, macro tailwind, analyst upgrades, business moat',
        bearFactorFocus: 'slowing growth, overvaluation, macro headwind, analyst downgrades, competitive threats',
      },
    };
    const tf = tfMeta[timeframeKey] || tfMeta.swing;
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
      system: `You are a quantitative trading analyst and expert options trader specializing in ${tf.label} trades.
FOCUS: ${tf.focus}
TARGET/STOP RULE: ${tf.targetRule}
HARD RULES: 1.RSI>70+CALL=overbought 2.RSI<30+PUT=oversold 3.StochRSI>90+CALL=extreme overbought 4.StochRSI<10+PUT=extreme oversold 5.Earnings BEFORE expiry+CRITICAL/HIGH=consider NEUTRAL 6.Down>2%+PUT=assess 7.Up>2%+CALL=assess 8.Wide spread=avoid
NEUTRAL only when multiple HARD RULES fire. Do NOT default to NEUTRAL.
BULL/BEAR FACTORS focus: ${tf.bullFactorFocus} vs ${tf.bearFactorFocus}
THESIS RULE: 2-3 sentences — (1) what the company does and sector, (2) key fundamental driver for ${tf.label}, (3) technical setup. Never purely technical.
Return ONLY JSON with keys "price" and "options". No markdown.`,
      messages: [{ role: 'user', content: `Analyze ${ticker} @ $${price?.toFixed(2)} | ${tf.label} | Expiry: ${expiry}
Market: ${isMarketClosed() ? 'CLOSED' : 'OPEN'} | ${new Date().toLocaleDateString()}
${intradayCtx}${taCtx}${chainCtx}${sizingCtx}
${callContradiction ? `RSI WARNING: ${callContradiction}` : ''}${putContradiction ? `RSI WARNING: ${putContradiction}` : ''}
${ep ? `EARNINGS RISK: ${ep.daysToEarnings}d | Before expiry: ${ep.earningsBeforeExpiry} | ${ep.risk} | ${ep.advice}` : ''}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey}
OPTIONS FLOW: P/C OI=${chain?.putCallRatio?.toFixed(2)} | CallIV=${chain?.avgCallIV}% | PutIV=${chain?.avgPutIV}%
PRICE (5): ${JSON.stringify(ohlcv?.close?.slice(-5))}
${hasUpgrade?'🟢 UPGRADE':''}${hasDowngrade?'🔴 DOWNGRADE':''}${hasTarget?'📊 TARGET':''}${hasFund?'🏦 INSTITUTIONAL':''}${hasShort?'⚠ SHORT ATTACK':''}
NEWS: ${categorized.slice(0,6).join(' | ')}
${macroCtx}
CALLS: ${calls.map(c=>`$${c.strike}|m$${c.mid}|IV${c.iv}%|d${c.delta}|OI${c.oi}${c.unusualVolume?'🔥':''}${c.wideSpread?'⚠WIDE':''}`).join(' ')}
PUTS:  ${puts.map(p=>`$${p.strike}|m$${p.mid}|IV${p.iv}%|d${p.delta}|OI${p.oi}${p.unusualVolume?'🔥':''}${p.wideSpread?'⚠WIDE':''}`).join(' ')}
Return JSON: {"price":{"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"timeframe":"${tf.label}","thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":0,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"},"options":{"recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,"reasoning":"string","ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string","positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string","bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"Sell at $${callTarget}","maxLoss":0,"entryTiming":"string","exitRule":"Stop: $${callStop}. ATR: $${ta?.atr?.atr1Stop}","thesis":"string","delta":"string","iv":"string"},"bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"Sell at $${putTarget}","maxLoss":0,"entryTiming":"string","exitRule":"Stop: $${putStop}. ATR: $${ta?.atr?.shortStop}","thesis":"string","delta":"string","iv":"string"}}}` }]
    });
    res.json({ priceSignal: result.price, optionsSignal: result.options });
  } catch (e) {
    console.error('[analyze/combined]', e.message);
    res.status(500).json({ error: e.message });
  }
});


// ─── Market Regime Detection Engine ─────────────────────────────────────────
// Uses multiple independent signals across timeframes to classify market regime.
// Requires agreement across timeframes to avoid noise.

const regimeCache = { data: null, ts: 0 };
const REGIME_TTL  = 60 * 60 * 1000; // 1 hour cache

async function detectMarketRegime() {
  // Return cached regime if fresh
  if (regimeCache.data && Date.now() - regimeCache.ts < REGIME_TTL) {
    return regimeCache.data;
  }

  try {
    // Fetch SPY and VIX history — these are our regime anchors
    const [spyHist, vixHist, qqq, iwm, xlk, xle, xlf, xlv] = await Promise.allSettled([
      tradierGet('/v1/markets/history?symbol=SPY&interval=daily&start=2023-01-01'),
      tradierGet('/v1/markets/history?symbol=VIX&interval=daily&start=2023-01-01'),
      tradierGet('/v1/markets/history?symbol=QQQ&interval=daily&start=2024-01-01'),
      tradierGet('/v1/markets/history?symbol=IWM&interval=daily&start=2024-01-01'),
      tradierGet('/v1/markets/history?symbol=XLK&interval=daily&start=2024-01-01'),
      tradierGet('/v1/markets/history?symbol=XLE&interval=daily&start=2024-01-01'),
      tradierGet('/v1/markets/history?symbol=XLF&interval=daily&start=2024-01-01'),
      tradierGet('/v1/markets/history?symbol=XLV&interval=daily&start=2024-01-01'),
    ]);

    const spyBars = spyHist.value?.history?.day || [];
    const vixBars = vixHist.value?.history?.day || [];

    if (spyBars.length < 50) {
      return { regime: 'UNKNOWN', confidence: 0, signals: {} };
    }

    const spyCloses = spyBars.map(b => b.close);
    const vixCloses = vixBars.map(b => b.close).filter(Boolean);
    const spyCur    = spyCloses[spyCloses.length - 1];

    // ── Signal 1: MACRO TREND (200-day SMA) ──────────────────────────────────
    // Most reliable long-term regime indicator
    const sma200 = spyCloses.length >= 200
      ? spyCloses.slice(-200).reduce((s,v) => s+v, 0) / 200 : null;
    const sma50  = spyCloses.length >= 50
      ? spyCloses.slice(-50).reduce((s,v) => s+v, 0)  / 50  : null;
    const sma20  = spyCloses.length >= 20
      ? spyCloses.slice(-20).reduce((s,v) => s+v, 0)  / 20  : null;

    // SMA200 slope (is the trend accelerating or decelerating?)
    const sma200_30dAgo = spyCloses.length >= 230
      ? spyCloses.slice(-230, -30).reduce((s,v) => s+v, 0) / 200 : null;
    const sma200Slope = sma200 && sma200_30dAgo
      ? ((sma200 - sma200_30dAgo) / sma200_30dAgo * 100) : 0;

    let macroSignal = 0; // -2 to +2
    if (sma200) {
      macroSignal += spyCur > sma200 ? 1 : -1;           // above/below 200
      macroSignal += sma200Slope > 0.5 ? 1 : sma200Slope < -0.5 ? -1 : 0; // slope
    }
    if (sma50 && sma200) {
      macroSignal += sma50 > sma200 ? 0.5 : -0.5;        // golden/death cross
    }

    // ── Signal 2: VOLATILITY REGIME (VIX) ────────────────────────────────────
    // VIX is the single best fear indicator
    const vixCur = vixCloses.length ? vixCloses[vixCloses.length - 1] : null;
    const vix20d = vixCloses.length >= 20
      ? vixCloses.slice(-20).reduce((s,v) => s+v, 0) / 20 : null;
    const vixTrend = vixCur && vix20d ? vixCur - vix20d : 0; // rising = fear increasing

    let vixSignal = 0; // -2 to +2
    if (vixCur) {
      // VIX levels: <15=low fear(bull), 15-20=normal, 20-25=elevated, 25-30=high, >30=panic
      vixSignal += vixCur < 15 ? 2 : vixCur < 20 ? 1 : vixCur < 25 ? 0 : vixCur < 30 ? -1 : -2;
      // VIX trend matters too — rising VIX even at low levels = warning
      vixSignal += vixTrend > 3 ? -0.5 : vixTrend < -3 ? 0.5 : 0;
    }

    // ── Signal 3: MOMENTUM REGIME (short-term breadth proxy) ─────────────────
    // SPY 10-day vs 30-day momentum — are buyers accelerating?
    const ret10d = spyCloses.length >= 10
      ? (spyCur - spyCloses[spyCloses.length-11]) / spyCloses[spyCloses.length-11] * 100 : 0;
    const ret30d = spyCloses.length >= 30
      ? (spyCur - spyCloses[spyCloses.length-31]) / spyCloses[spyCloses.length-31] * 100 : 0;
    const ret90d = spyCloses.length >= 90
      ? (spyCur - spyCloses[spyCloses.length-91]) / spyCloses[spyCloses.length-91] * 100 : 0;

    let momentumSignal = 0; // -2 to +2
    momentumSignal += ret10d > 2 ? 1 : ret10d < -2 ? -1 : 0;
    momentumSignal += ret30d > 5 ? 1 : ret30d < -5 ? -1 : 0;
    momentumSignal += ret90d > 10 ? 0.5 : ret90d < -10 ? -0.5 : 0;

    // ── Signal 4: BREADTH (Large vs Small cap) ────────────────────────────────
    // QQQ vs IWM — when small caps lead, risk appetite is high (bull)
    // When QQQ leads but IWM lags, it's a narrow rally (warning)
    let breadthSignal = 0;
    const qqqBars = qqq.value?.history?.day || [];
    const iwmBars = iwm.value?.history?.day || [];
    if (qqqBars.length >= 20 && iwmBars.length >= 20) {
      const qqqRet20 = (qqqBars.slice(-1)[0]?.close - qqqBars.slice(-21)[0]?.close) / qqqBars.slice(-21)[0]?.close * 100;
      const iwmRet20 = (iwmBars.slice(-1)[0]?.close - iwmBars.slice(-21)[0]?.close) / iwmBars.slice(-21)[0]?.close * 100;
      // Both rallying = healthy bull
      if (qqqRet20 > 2 && iwmRet20 > 2)  breadthSignal =  1.5;
      // Only QQQ rallying = narrow, warning
      else if (qqqRet20 > 2 && iwmRet20 < 0) breadthSignal = 0;
      // Both falling = bear
      else if (qqqRet20 < -2 && iwmRet20 < -2) breadthSignal = -1.5;
      // Small caps leading = risk-on
      else if (iwmRet20 > qqqRet20 + 2) breadthSignal = 1;
    }

    // ── Signal 5: SECTOR ROTATION ─────────────────────────────────────────────
    // Defensive sectors leading (XLV health, XLU utilities) = risk-off
    // Growth/cyclical leading (XLK tech, XLE energy, XLF financials) = risk-on
    let sectorSignal = 0;
    const getSectorRet = (bars) => {
      const b = bars.value?.history?.day || [];
      if (b.length < 20) return null;
      return (b.slice(-1)[0]?.close - b.slice(-21)[0]?.close) / b.slice(-21)[0]?.close * 100;
    };
    const xlkRet = getSectorRet(xlk);
    const xleRet = getSectorRet(xle);
    const xlfRet = getSectorRet(xlf);
    const xlvRet = getSectorRet(xlv);

    // Growth sectors outperforming = risk-on
    const growthAvg   = [xlkRet, xleRet, xlfRet].filter(r => r != null).reduce((s,v,_,a) => s+v/a.length, 0);
    const defensiveAvg = [xlvRet].filter(r => r != null).reduce((s,v,_,a) => s+v/a.length, 0);
    sectorSignal = growthAvg > defensiveAvg + 2 ? 1 : growthAvg < defensiveAvg - 2 ? -1 : 0;

    // ── COMBINE ALL SIGNALS ───────────────────────────────────────────────────
    const signals = {
      macro:     { score: macroSignal,   weight: 0.35, label: macroSignal > 0.5 ? 'BULL' : macroSignal < -0.5 ? 'BEAR' : 'NEUTRAL' },
      vix:       { score: vixSignal,     weight: 0.25, label: vixSignal > 0.5 ? 'LOW_FEAR' : vixSignal < -0.5 ? 'HIGH_FEAR' : 'ELEVATED' },
      momentum:  { score: momentumSignal,weight: 0.20, label: momentumSignal > 0.5 ? 'STRONG' : momentumSignal < -0.5 ? 'WEAK' : 'NEUTRAL' },
      breadth:   { score: breadthSignal, weight: 0.12, label: breadthSignal > 0.5 ? 'BROAD' : breadthSignal < -0.5 ? 'NARROW' : 'NEUTRAL' },
      sector:    { score: sectorSignal,  weight: 0.08, label: sectorSignal > 0 ? 'RISK_ON' : sectorSignal < 0 ? 'RISK_OFF' : 'NEUTRAL' },
    };

    // Weighted composite score
    const compositeScore = Object.values(signals).reduce((s, sig) => s + sig.score * sig.weight, 0);

    // Count how many signals agree
    const bullSignals  = Object.values(signals).filter(s => s.score > 0.3).length;
    const bearSignals  = Object.values(signals).filter(s => s.score < -0.3).length;
    const agreement    = Math.max(bullSignals, bearSignals);
    const confidence   = Math.round((agreement / Object.keys(signals).length) * 100);

    // Regime classification
    let regime, description;
    if (compositeScore > 0.8 && confidence >= 60) {
      regime = 'STRONG_BULL'; description = 'Strong uptrend, low fear, broad participation';
    } else if (compositeScore > 0.3) {
      regime = 'BULL'; description = 'Uptrend with moderate confidence';
    } else if (compositeScore > -0.3) {
      regime = 'NEUTRAL'; description = 'Transitional/uncertain — mixed signals';
    } else if (compositeScore > -0.8) {
      regime = 'BEAR'; description = 'Downtrend with moderate confidence';
    } else {
      regime = 'STRONG_BEAR'; description = 'Strong downtrend, elevated fear';
    }

    const result = {
      regime, description, compositeScore: parseFloat(compositeScore.toFixed(3)),
      confidence, bullSignals, bearSignals,
      signals: Object.fromEntries(Object.entries(signals).map(([k,v]) => [k, { score: parseFloat(v.score.toFixed(2)), label: v.label }])),
      data: {
        spy: spyCur, sma50, sma200, sma200Slope: parseFloat(sma200Slope.toFixed(2)),
        vix: vixCur, vixTrend: parseFloat(vixTrend.toFixed(2)),
        ret10d: parseFloat(ret10d.toFixed(2)), ret30d: parseFloat(ret30d.toFixed(2)), ret90d: parseFloat(ret90d.toFixed(2)),
      },
      updatedAt: new Date().toISOString(),
    };

    regimeCache.data = result;
    regimeCache.ts   = Date.now();
    persistCacheSet('market_regime', result).catch(() => {});
    console.log(`[regime] ${regime} (${confidence}% confidence, score=${compositeScore.toFixed(2)})`);
    return result;
  } catch (e) {
    console.error('[regime]', e.message);
    return { regime: 'UNKNOWN', confidence: 0, signals: {}, error: e.message };
  }
}

// GET /regime — expose regime for frontend display
app.get('/regime', async (req, res) => {
  try {
    const regime = await detectMarketRegime();
    res.json(regime);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── QuAInt Signal Engine — Deterministic ───────────────────────────────────
function computeSignal({ ohlcv, ta, fundamentals, financials, enhanced, options, market, timeframeKey, news = [], optimizedWeights = null, regime = null, bonds = null, earningsDate = null }) {
  const isIndia = market === 'INDIA';
  const scores  = {};
  const debug   = {};
  const flags   = []; // high-impact flags that override or boost score

  const tfConfig = {
    short:    { regimeWeight: 0.3, newsDecay: 1.0, days: 5   },
    swing:    { regimeWeight: 0.5, newsDecay: 0.7, days: 20  },
    position: { regimeWeight: 0.7, newsDecay: 0.4, days: 60  },
    longterm: { regimeWeight: 0.9, newsDecay: 0.1, days: 252 },
  };
  const tf = tfConfig[timeframeKey] || tfConfig.swing;

  // ── 1. MOMENTUM — timeframe-scaled + risk-adjusted (Paper §3.1, eq.269) ──────
  // Paper finding: risk-adjusted momentum (Sharpe-like) outperforms raw momentum
  // Ri_risk_adj = mean(returns) / std(returns) over formation period
  const closes = ohlcv?.close?.filter(c => c != null) || [];
  const cur    = closes[closes.length - 1];
  const lbMap  = { short:[5,10], swing:[10,20], position:[20,60], longterm:[60,120] };
  const [lb1, lb2] = lbMap[timeframeKey] || [20,60];
  const p1 = closes.length > lb1 ? closes[closes.length-lb1-1] : null;
  const p2 = closes.length > lb2 ? closes[closes.length-lb2-1] : null;
  let mScore = 0;
  if (p1 && cur) { const r=(cur-p1)/p1*100; mScore+=r>5?1:r>2?.6:r>0?.2:r>-2?-.2:r>-5?-.6:-1; debug.ret_short=r.toFixed(1)+'%'; }
  if (p2 && cur) { const r=(cur-p2)/p2*100; mScore+=r>10?.5:r>3?.3:r>-3?0:r>-10?-.3:-.5; debug.ret_long=r.toFixed(1)+'%'; }

  // Risk-adjusted momentum: penalize volatile momentum (mean/std over window)
  const window = Math.min(closes.length, lb2 || 20);
  if (window >= 5) {
    const slice   = closes.slice(-window);
    const rets    = slice.slice(1).map((c, i) => (c - slice[i]) / slice[i] * 100);
    const meanRet = rets.reduce((s, r) => s + r, 0) / rets.length;
    const stdRet  = Math.sqrt(rets.reduce((s, r) => s + (r - meanRet) ** 2, 0) / rets.length);
    const riskAdjMom = stdRet > 0 ? meanRet / stdRet : 0; // Sharpe-like
    // Blend raw and risk-adjusted momentum (60/40)
    mScore = mScore * 0.6 + (riskAdjMom > 0.3 ? 0.4 : riskAdjMom > 0.1 ? 0.2 : riskAdjMom < -0.3 ? -0.4 : riskAdjMom < -0.1 ? -0.2 : 0) * 0.4;
    debug.riskAdjMom = riskAdjMom.toFixed(2);
  }
  scores.momentum = Math.max(-1, Math.min(1, mScore));

  // ── 2. TREND — 3-MA cascade filter (Paper §3.13, eq.324) ────────────────────
  // Paper: require MA(short) > MA(medium) > MA(long) for confirmed uptrend
  // Reduces false signals vs two-MA crossover alone
  const sma20=ta?.sma20, sma50=ta?.sma50, sma200=ta?.sma200;
  let tScore=0;
  if (cur&&sma20)  tScore+=cur>sma20  ?.4:-.4;
  if (cur&&sma50)  tScore+=cur>sma50  ?.3:-.3;
  if (cur&&sma200) tScore+=cur>sma200 ?.3:-.3;
  if (sma20&&sma50&&sma20>sma50) tScore+=.2; // golden cross
  if (sma50&&sma200&&sma50>sma200) tScore+=.1; // bull structure
  // 3-MA full cascade confirmation (paper §3.13): all 3 aligned = strong signal
  const fullBullCascade = cur && sma20 && sma50 && sma200 && cur>sma20 && sma20>sma50 && sma50>sma200;
  const fullBearCascade = cur && sma20 && sma50 && sma200 && cur<sma20 && sma20<sma50 && sma50<sma200;
  if (fullBullCascade) { tScore += 0.3; flags.push({ type: 'FULL_BULL_CASCADE', note: 'Price>SMA20>SMA50>SMA200 — confirmed uptrend', boost: 0 }); }
  if (fullBearCascade) { tScore -= 0.3; flags.push({ type: 'FULL_BEAR_CASCADE', note: 'Price<SMA20<SMA50<SMA200 — confirmed downtrend', boost: 0 }); }
  scores.trend = Math.max(-1, Math.min(1, tScore));
  debug.trend = ta?.trendSignal;
  debug.cascade = fullBullCascade ? 'BULL' : fullBearCascade ? 'BEAR' : 'NONE';

  // ── 3. RSI — regime-aware ─────────────────────────────────────────────────────
  const rsi = parseFloat(ta?.rsi14);
  const inBearRegime  = (regime?.regime==='BEAR'||regime?.regime==='STRONG_BEAR') || (sma200&&cur&&cur<sma200*.97);
  const inStrongBull  = (regime?.regime==='STRONG_BULL') || (sma50&&sma200&&sma50>sma200&&cur>sma50);
  let rsiScore = 0;
  if (!isNaN(rsi)) {
    if (inBearRegime)  rsiScore=rsi<30?-.3:rsi<40?-.1:rsi<55?.1:rsi<70?.4:.2;
    else if (inStrongBull) rsiScore=rsi<35?.8:rsi<50?.4:rsi<70?.1:rsi<80?-.1:-.4;
    else rsiScore=rsi<25?1:rsi<35?.7:rsi<45?.3:rsi<55?0:rsi<65?-.1:rsi<75?-.4:-.7;
    debug.rsi = rsi;
  }
  scores.rsi = rsiScore;

  // ── 4. STOCH RSI — momentum confirmation ──────────────────────────────────────
  const stochK = parseFloat(ta?.stochRSI?.k);
  const stochCross = ta?.stochRSI?.crossover;
  let stochScore = 0;
  if (!isNaN(stochK)) {
    stochScore = stochK < 10 ? 0.8 : stochK < 20 ? 0.5 : stochK < 40 ? 0.2
               : stochK > 90 ? -0.8 : stochK > 80 ? -0.5 : stochK > 60 ? -0.2 : 0;
    if (stochCross === 'BULLISH_CROSS') stochScore = Math.min(1, stochScore + 0.4);
    if (stochCross === 'BEARISH_CROSS') stochScore = Math.max(-1, stochScore - 0.4);
    debug.stochRSI = stochK + (stochCross ? ` ${stochCross}` : '');
  }
  scores.stochRsi = stochScore;

  // ── 5. MACD ────────────────────────────────────────────────────────────────────
  const mc=ta?.macd?.cross, mt=ta?.macd?.trend;
  scores.macd = mc==='BULLISH_CROSS'?.8:mc==='BEARISH_CROSS'?-.8:mt==='BULLISH'?.3:mt==='BEARISH'?-.3:0;
  debug.macd = mc || mt;

  // ── 6. BOLLINGER BANDS — squeeze + position ────────────────────────────────────
  const bbPos    = ta?.bb?.position;
  const bbWidth  = parseFloat(ta?.bb?.bWidth);
  const bbPct    = parseFloat(ta?.bb?.bPct);   // %B: 0=lower, 1=upper, 0.5=mid
  const bbSqueeze = ta?.bb?.squeeze;
  let bbScore = 0;
  if (!isNaN(bbPct)) {
    // %B position: below lower=oversold, above upper=overbought
    if (bbPct < 0)    bbScore =  0.8;  // below lower band = very oversold
    else if (bbPct < 0.2) bbScore = 0.4;
    else if (bbPct < 0.4) bbScore = 0.1;
    else if (bbPct > 1)   bbScore = -0.8; // above upper band = very overbought
    else if (bbPct > 0.8) bbScore = -0.4;
    else if (bbPct > 0.6) bbScore = -0.1;
    // In strong trends, adjust: overbought in uptrend = momentum, not reversal
    if (inStrongBull && bbScore < 0) bbScore *= 0.4;
    if (inBearRegime && bbScore > 0) bbScore *= 0.4;
    debug.bbPct = bbPct?.toFixed(2);
  }
  // BB Squeeze: low volatility = compression before breakout
  // Direction unknown so boost whichever way momentum leans
  if (bbSqueeze && !isNaN(bbWidth) && bbWidth < 5) {
    flags.push({ type: 'BB_SQUEEZE', note: 'Volatility compression — breakout imminent', boost: scores.momentum > 0 ? 0.2 : -0.2 });
    debug.bbSqueeze = true;
  }
  scores.bollinger = Math.max(-1, Math.min(1, bbScore));

  // ── 7. ATR VOLATILITY REGIME + LOW-VOL ANOMALY (Paper §3.4) ─────────────────
  // Paper finding: LOW volatility stocks OUTPERFORM high volatility stocks
  // (counter-intuitive — lower risk = higher long-term return)
  // Implemented as: low ATR% = mild positive signal; very high ATR% = mild negative
  const atrVol = ta?.atr?.volatility;
  const atrPct = parseFloat(ta?.atr?.atrPct);
  let atrScore = 0;
  if (atrVol) {
    // Momentum/regime interaction
    if (atrVol === 'HIGH' && scores.momentum > 0.3)  atrScore =  0.2;
    if (atrVol === 'HIGH' && scores.momentum < -0.3) atrScore = -0.2;
    if (atrVol === 'LOW'  && Math.abs(scores.rsi) > 0.4) atrScore = scores.rsi * 0.3;
    debug.atrVol = atrVol;
  }
  // Low-volatility anomaly (paper §3.4): score based on ATR% of price
  if (!isNaN(atrPct)) {
    // Low vol (ATR < 1% of price) = outperforms historically → small positive
    // Very high vol (ATR > 4% of price) = underperforms historically → small negative
    const lowVolBonus = atrPct < 1.0 ? 0.2 : atrPct < 2.0 ? 0.1 : atrPct > 4.0 ? -0.2 : atrPct > 3.0 ? -0.1 : 0;
    atrScore += lowVolBonus;
    debug.atrPct = atrPct.toFixed(2) + '%';
    debug.lowVolBonus = lowVolBonus;
  }
  scores.atr = Math.max(-0.5, Math.min(0.5, atrScore));

  // ── 8. SUPPORT / RESISTANCE PROXIMITY ─────────────────────────────────────────
  const distToSupport    = parseFloat(ta?.sr?.distToSupport);    // % below support
  const distToResistance = parseFloat(ta?.sr?.distToResistance); // % above resistance
  let srScore = 0;
  if (!isNaN(distToSupport) && !isNaN(distToResistance)) {
    // Near support = potential bounce. Near resistance = potential rejection.
    if (distToSupport < 1)     srScore =  0.5;  // within 1% of support = strong BUY signal
    else if (distToSupport < 3) srScore =  0.2;
    if (distToResistance < 1)  srScore -= 0.5;  // at resistance = sell pressure
    else if (distToResistance < 3) srScore -= 0.2;
    debug.distToSupport    = distToSupport?.toFixed(1) + '%';
    debug.distToResistance = distToResistance?.toFixed(1) + '%';
  }
  scores.supportResistance = Math.max(-1, Math.min(1, srScore));

  // ── 9. VOLUME ACCELERATION + IBS (Paper §4.4, eq.370) ────────────────────────
  // IBS = (Close - Low) / (High - Low): measures where price closes in daily range
  // Paper: IBS near 0 = cheap (bullish), IBS near 1 = rich (bearish)
  const vols = ohlcv?.volume?.filter(v => v != null) || [];
  let volAccelScore = 0;
  if (vols.length >= 20) {
    const vol5d  = vols.slice(-5).reduce((s,v)=>s+v,0)  / 5;
    const vol20d = vols.slice(-20).reduce((s,v)=>s+v,0) / 20;
    const volAccel = vol5d / vol20d;
    const priceUp  = closes.length >= 2 ? closes[closes.length-1] > closes[closes.length-6] : null;
    if (volAccel > 1.5 && priceUp === true)  volAccelScore =  0.7;
    else if (volAccel > 1.5 && priceUp === false) volAccelScore = -0.7;
    else if (volAccel > 1.2 && priceUp === true)  volAccelScore =  0.3;
    else if (volAccel > 1.2 && priceUp === false) volAccelScore = -0.3;
    else if (volAccel < 0.7) volAccelScore = -0.2;
    debug.volAccel = volAccel?.toFixed(2) + 'x';
  }
  // Internal Bar Strength — average last 5 days
  const highs = ohlcv?.high?.filter(h => h != null) || [];
  const lows  = ohlcv?.low?.filter(l => l != null)  || [];
  if (highs.length >= 5 && lows.length >= 5 && closes.length >= 5) {
    let ibsSum = 0, ibsCount = 0;
    for (let i = Math.max(0, highs.length-5); i < highs.length; i++) {
      const range = highs[i] - lows[i];
      if (range > 0) { ibsSum += (closes[i] - lows[i]) / range; ibsCount++; }
    }
    if (ibsCount > 0) {
      const avgIBS = ibsSum / ibsCount;
      // IBS < 0.3 = consistently closing near lows = bearish short-term (paper: mean reversion BUY)
      // IBS > 0.7 = closing near highs = bullish (paper: mean reversion SELL)
      // But in trending markets flip the signal: IBS > 0.7 in uptrend = momentum
      const ibsScore = inStrongBull
        ? (avgIBS > 0.7 ? 0.3 : avgIBS < 0.3 ? -0.3 : 0)  // trend-following in bull
        : (avgIBS < 0.3 ? 0.4 : avgIBS > 0.7 ? -0.4 : 0);  // mean-reversion normally
      volAccelScore = (volAccelScore + ibsScore) / 2; // blend
      debug.avgIBS = avgIBS.toFixed(2);
    }
  }
  scores.volumeAccel = volAccelScore;

  // ── 10. IV RANK (US only) ──────────────────────────────────────────────────────
  // High IVR = options expensive, market pricing big move
  // Low IVR  = options cheap, complacency
  let ivrScore = 0;
  if (!isIndia && options?.avgCallIV && options?.avgPutIV) {
    const avgIV = (parseFloat(options.avgCallIV) + parseFloat(options.avgPutIV)) / 2;
    // High IV with put skew = market pricing downside risk
    const putCallRatio = parseFloat(options.putCallRatio) || 1;
    if (avgIV > 60) {
      ivrScore = putCallRatio > 1.2 ? -0.5 : -0.2; // high IV + put heavy = fear
    } else if (avgIV > 40) {
      ivrScore = putCallRatio > 1.3 ? -0.3 : 0;
    } else if (avgIV < 20) {
      ivrScore = 0.1; // low IV = complacency, slight bullish
    }
    // IV skew: put IV much higher than call IV = traders buying downside protection
    const putIV = parseFloat(options.avgPutIV), callIV = parseFloat(options.avgCallIV);
    if (putIV && callIV && putIV > callIV * 1.3) ivrScore -= 0.2; // strong put skew = bearish
    debug.avgIV = avgIV?.toFixed(1); debug.pcRatio = putCallRatio?.toFixed(2);
  }
  scores.ivRank = ivrScore;

  // ── 11. SECTOR RELATIVE STRENGTH ──────────────────────────────────────────────
  // Is this stock outperforming its sector? Requires sector data in enhanced
  let sectorScore = 0;
  if (enhanced?.sectorReturn != null && p2 && cur) {
    const stockRet  = (cur - p2) / p2 * 100;
    const sectorRet = enhanced.sectorReturn; // % return of sector ETF over same period
    const relStrength = stockRet - sectorRet;
    sectorScore = relStrength > 5 ? 0.6 : relStrength > 2 ? 0.3 : relStrength > -2 ? 0 : relStrength > -5 ? -0.3 : -0.6;
    debug.relStrength = relStrength?.toFixed(1) + '% vs sector';
  }
  scores.sectorRelStrength = sectorScore;

  // ── 12. REVENUE GROWTH — timeframe-scaled ─────────────────────────────────────
  const revYoY   = financials?.yoy?.revenueYoY ?? (fundamentals?.revenueGrowth!=null ? fundamentals.revenueGrowth*100 : null);
  const q        = financials?.quarters;
  const revQoQ   = (q?.length>=2&&q[0]?.revenue&&q[1]?.revenue) ? ((q[0].revenue-q[1].revenue)/Math.abs(q[1].revenue)*100) : null;
  const revInput = (timeframeKey==='short'||timeframeKey==='swing') ? (revQoQ??revYoY) : revYoY;
  const revTh    = (timeframeKey==='short'||timeframeKey==='swing') ? [15,5,-5,-15] : [25,10,-10,-25];
  scores.revenue = revInput==null ? 0 : revInput>revTh[0]?(timeframeKey==='longterm'?1:.8) : revInput>revTh[1]?(timeframeKey==='longterm'?.6:.4) : revInput>revTh[2] ? 0 : revInput>revTh[3]?-.4:-.8;
  debug.revYoY = revYoY?.toFixed(1)+'%'; debug.revQoQ = revQoQ?.toFixed(1)+'%';

  // ── 13. EARNINGS QUALITY — with debt trend ────────────────────────────────────
  const niYoY=financials?.yoy?.netIncomeYoY, epsYoY=financials?.yoy?.epsYoY, roe=fundamentals?.roe;
  let qScore=0, qCount=0;
  if (niYoY !=null){qScore+=niYoY >20?.5:niYoY >0?.2:niYoY >-20?-.2:-.5; qCount++;}
  if (epsYoY!=null){qScore+=epsYoY>20?.3:epsYoY>0?.1:-.2; qCount++;}
  if (roe   !=null){qScore+=roe>.2?.3:roe>.1?.1:roe>0?0:-.3; qCount++;}

  // Debt trend — rising debt while revenue flat/declining = quality deterioration
  if (q?.length >= 3) {
    const debt0 = q[0]?.totalDebt, debt2 = q[2]?.totalDebt;
    if (debt0 && debt2 && debt2 > 0) {
      const debtGrowth = (debt0 - debt2) / debt2 * 100;
      if (debtGrowth > 20 && (revQoQ ?? 0) < 5) { qScore -= 0.4; flags.push({ type: 'DEBT_RISING', note: `Debt +${debtGrowth.toFixed(0)}% while revenue flat` }); }
      else if (debtGrowth < -10) qScore += 0.2; // paying down debt = positive
      debug.debtTrend = debtGrowth?.toFixed(1) + '%';
    }
    // Operating leverage: revenue growth → NI growth amplified = high operating leverage (good in growth)
    if (revYoY != null && niYoY != null && revYoY > 5 && niYoY > revYoY * 1.5) {
      qScore += 0.2; debug.opLeverage = 'HIGH';
    }
  }

  // EPS beat/miss streak with surprise magnitude
  const epsHist = financials?.epsHistory || [];
  const beats   = epsHist.slice(0,4).filter(e=>e.beat===true).length;
  const misses  = epsHist.slice(0,4).filter(e=>e.beat===false).length;
  if (epsHist.length>=2) {
    qScore += beats>=3?.4:beats>=2?.2:misses>=3?-.4:misses>=2?-.2:0; qCount++;
    // Average surprise magnitude
    const surprises = epsHist.slice(0,4).filter(e=>e.surprisePct!=null).map(e=>e.surprisePct);
    if (surprises.length) { const avgSurprise = surprises.reduce((s,v)=>s+v,0)/surprises.length; qScore += avgSurprise>10?.2:avgSurprise<-10?-.2:0; debug.avgEpsSurprise = avgSurprise?.toFixed(1)+'%'; }
    debug.epsBeat = beats+'B/'+misses+'M';
  }
  scores.quality = qCount>0 ? Math.max(-1, Math.min(1, qScore/Math.max(qCount*.5,1))) : 0;

  // ── 14. ANALYST CONSENSUS ─────────────────────────────────────────────────────
  const rec=fundamentals?.recommendationKey?.toLowerCase(), tp=fundamentals?.targetMeanPrice;
  let aScore=rec==='strong_buy'?1:rec==='buy'?.6:rec==='hold'?0:rec==='underperform'?-.6:rec==='sell'?-1:0;
  if (tp&&cur){const up=(tp-cur)/cur; aScore+=up>.25?.4:up>.1?.2:up>-.1?0:up>-.25?-.2:-.4; debug.upside=(up*100).toFixed(1)+'%';}
  const analysts = fundamentals?.numberOfAnalystOpinions || 0;
  if (analysts < 3) aScore *= 0.5; // very few analysts = low conviction
  scores.analyst = Math.max(-1, Math.min(1, aScore));

  // ── 15. MACRO — bonds, regime, institutional, FII/DII ─────────────────────────
  let macroScore=0;
  const hi52=fundamentals?.fiftyTwoWeekHigh, lo52=fundamentals?.fiftyTwoWeekLow;
  if (hi52&&lo52&&cur){
    const pos=(cur-lo52)/(hi52-lo52);
    macroScore+=pos>.85?.3:pos>.6?.1:pos<.2?-.3:-.1;
    debug['52wPos']=(pos*100).toFixed(0)+'%';
    // Donchian channel breakout (paper §3.15): near 52W high = breakout momentum signal
    if (pos > 0.95) flags.push({ type: 'NEAR_52W_HIGH', note: 'Within 5% of 52W high — breakout momentum', boost: 0.1 });
    if (pos < 0.05) flags.push({ type: 'NEAR_52W_LOW',  note: 'Within 5% of 52W low — breakdown risk',     boost: -0.1 });
  }
  if (bonds?.tenYear!=null){const y=parseFloat(bonds.tenYear);if(!isNaN(y)){macroScore+=y>5?-.4:y>4.5?-.2:y<3?.3:0; debug.yield10y=y;}}
  if (regime){macroScore+=regime.compositeScore*.4*tf.regimeWeight; debug.regime=regime.regime; debug.regimeScore=regime.compositeScore;}
  if (isIndia) {
    if (enhanced?.fiiDii?.fiiNetBuy!=null){const f=enhanced.fiiDii.fiiNetBuy; macroScore+=f>500?.3:f>0?.1:f<-500?-.3:-.1;}
    if (enhanced?.shareholding?.promoter){const p=parseFloat(enhanced.shareholding.promoter); macroScore+=p>60?.2:p<25?-.2:0; if(enhanced.shareholding.promoterChange>1)macroScore+=.2; else if(enhanced.shareholding.promoterChange<-1)macroScore-=.2;}
    if (enhanced?.delivery?.deliveryPct){const d=parseFloat(enhanced.delivery.deliveryPct); macroScore+=d>60?.2:d<25?-.2:0;}
    // India circuit breaker proximity
    if (enhanced?.upperCircuit && hi52 && cur) {
      const distToUC = ((enhanced.upperCircuit - cur) / cur * 100);
      if (distToUC < 3) { macroScore += 0.3; flags.push({ type: 'NEAR_UPPER_CIRCUIT', note: `${distToUC.toFixed(1)}% from upper circuit` }); }
    }
    if (enhanced?.lowerCircuit && cur) {
      const distToLC = ((cur - enhanced.lowerCircuit) / cur * 100);
      if (distToLC < 3) { macroScore -= 0.4; flags.push({ type: 'NEAR_LOWER_CIRCUIT', note: `${distToLC.toFixed(1)}% from lower circuit` }); }
    }
  } else {
    if (enhanced?.shortInterest?.shortPct>20&&scores.momentum>0) macroScore+=.2;
    if (enhanced?.insiderSummary){const{buys,sells}=enhanced.insiderSummary; macroScore+=buys>sells+2?.3:sells>buys+2?-.3:0;}
    if (enhanced?.institutionalOwnership?.topHolders){const nb=enhanced.institutionalOwnership.topHolders.filter(h=>h.change>0).length; const ns=enhanced.institutionalOwnership.topHolders.filter(h=>h.change<0).length; macroScore+=nb>ns+1?.2:ns>nb+1?-.2:0;}
  }
  scores.macro = Math.max(-1, Math.min(1, macroScore));

  // ── 16. NEWS/CATALYST — severity + recency ────────────────────────────────────
  const catNews=(news||[]).map(n=>typeof n==='string'?n:'');
  let catalyst=0;
  if (catNews.some(n=>n.startsWith('[UPGRADE]')))      catalyst+=0.6*tf.newsDecay;
  if (catNews.some(n=>n.startsWith('[DOWNGRADE]')))    catalyst-=0.6*tf.newsDecay;
  if (catNews.some(n=>n.startsWith('[SHORT ATTACK]'))) catalyst-=0.8*tf.newsDecay;
  if (catNews.some(n=>n.startsWith('[INSIDER/FUND]'))) catalyst+=0.4*tf.newsDecay;
  if (catNews.some(n=>n.startsWith('[EARNINGS]'))&&epsHist.length>0) {
    const last=epsHist[0];
    if (last?.beat===true){const mag=last.surprisePct?Math.min(1,last.surprisePct/20):.3; catalyst+=(.5+mag*.5)*tf.newsDecay;}
    else if (last?.beat===false){const mag=last.surprisePct?Math.min(1,Math.abs(last.surprisePct)/20):.3; catalyst-=(.5+mag*.5)*tf.newsDecay;}
  }
  if (revYoY!=null&&revYoY<-10) catalyst-=.4;
  scores.catalyst = Math.max(-1, Math.min(1, catalyst));

  // ── 17. EARNINGS PROXIMITY GATE ───────────────────────────────────────────────
  // If earnings within 5 days: reduce confidence, flag as binary event risk
  // If earnings within 2 days: force HOLD regardless of signal (too binary)
  let earningsProximityPenalty = 0;
  if (earningsDate) {
    const daysToEarnings = Math.ceil((new Date(earningsDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysToEarnings >= 0 && daysToEarnings <= 2) {
      flags.push({ type: 'EARNINGS_IMMINENT', note: `Earnings in ${daysToEarnings} day(s) — binary event risk`, forceHold: true, daysToEarnings });
      earningsProximityPenalty = 1; // will force HOLD
      debug.earningsIn = daysToEarnings + 'd';
    } else if (daysToEarnings >= 0 && daysToEarnings <= 5) {
      flags.push({ type: 'EARNINGS_SOON', note: `Earnings in ${daysToEarnings} days — elevated risk`, confidenceCap: 60, daysToEarnings });
      earningsProximityPenalty = 0.5;
      debug.earningsIn = daysToEarnings + 'd';
    } else if (daysToEarnings >= 0 && daysToEarnings <= 14) {
      debug.earningsIn = daysToEarnings + 'd';
    }
  }

  // ── REGIME SCORE ADJUSTMENTS ──────────────────────────────────────────────────
  if (regime && regime.regime !== 'UNKNOWN') {
    const r=regime.regime, rw=tf.regimeWeight;
    const isBull=r==='BULL'||r==='STRONG_BULL', isBear=r==='BEAR'||r==='STRONG_BEAR';
    if (isBull) scores.momentum=Math.min(1,scores.momentum+.15*rw);
    if (isBear) scores.momentum=Math.max(-1,scores.momentum-.15*rw);
    if ((r==='STRONG_BULL')&&scores.rsi<0) scores.rsi=scores.rsi*(1-.5*rw);
    if ((r==='STRONG_BEAR'||r==='BEAR')&&scores.rsi>0) scores.rsi=scores.rsi*(1-.6*rw);
    if (isBull&&scores.trend>0) scores.trend=Math.min(1,scores.trend*(1+.2*rw));
    if (isBear&&scores.trend<0) scores.trend=Math.max(-1,scores.trend*(1+.2*rw));
  }

  // ── WEIGHTS — timeframe-scaled ────────────────────────────────────────────────
  const defaultWeights = {
    short:    { momentum:.20, trend:.15, rsi:.08, stochRsi:.06, macd:.09, bollinger:.05, atr:.03, supportResistance:.04, volumeAccel:.06, ivRank:.03, sectorRelStrength:.03, revenue:.04, quality:.03, analyst:.03, macro:.05, catalyst:.06 },
    swing:    { momentum:.14, trend:.10, rsi:.06, stochRsi:.04, macd:.07, bollinger:.05, atr:.02, supportResistance:.04, volumeAccel:.05, ivRank:.03, sectorRelStrength:.04, revenue:.10, quality:.07, analyst:.08, macro:.08, catalyst:.07 },
    position: { momentum:.10, trend:.07, rsi:.04, stochRsi:.02, macd:.04, bollinger:.03, atr:.02, supportResistance:.03, volumeAccel:.03, ivRank:.02, sectorRelStrength:.05, revenue:.17, quality:.12, analyst:.12, macro:.10, catalyst:.08 },
    longterm: { momentum:.06, trend:.03, rsi:.02, stochRsi:.01, macd:.02, bollinger:.02, atr:.01, supportResistance:.02, volumeAccel:.02, ivRank:.01, sectorRelStrength:.05, revenue:.22, quality:.17, analyst:.17, macro:.10, catalyst:.07 },
  };
  const weights = optimizedWeights || defaultWeights;
  const w = weights[timeframeKey] || weights.swing;

  // ── TOTAL SCORE ───────────────────────────────────────────────────────────────
  let total = 0;
  for (const [factor, weight] of Object.entries(w)) {
    total += (scores[factor] || 0) * weight;
  }

  // Apply flag bonuses/penalties
  for (const flag of flags) {
    if (flag.boost) total += flag.boost;
  }
  total = Math.max(-1, Math.min(1, total));

  // NEWS OVERRIDE — catastrophic news floors signal
  if (scores.catalyst < -.7) { total=Math.min(total,-.1); debug.newsOverride='CATASTROPHIC'; }
  if (scores.catalyst > .7)  { total=Math.max(total, .1); debug.newsOverride='MAJOR_CATALYST'; }

  // ── SIGNAL ────────────────────────────────────────────────────────────────────
  const bearReg = (regime?.regime==='BEAR'||regime?.regime==='STRONG_BEAR') || (sma200&&cur&&cur<sma200*.97);
  let signal, confidence;

  // Earnings imminent → force HOLD
  const forceHold = flags.some(f => f.forceHold);
  if (forceHold) {
    signal = 'HOLD'; confidence = 50;
    debug.forceHold = 'EARNINGS_IMMINENT';
  } else if (total > .15) {
    signal = 'BUY'; confidence = Math.round(52 + (total-.15)/.85*43);
    if (bearReg) confidence = Math.min(confidence, 62);
  } else if (total < -.15) {
    signal = 'SELL'; confidence = Math.round(52 + (Math.abs(total)-.15)/.85*43);
    if (bearReg) confidence = Math.min(95, confidence+5);
  } else {
    signal = 'HOLD'; confidence = Math.round(50 + (.15-Math.abs(total))/.15*10);
  }

  // Apply earnings confidence cap
  const earningsCap = flags.find(f => f.confidenceCap);
  if (earningsCap) confidence = Math.min(confidence, earningsCap.confidenceCap);

  // Regime confidence adjustments
  if (regime) {
    const r=regime.regime;
    if (r==='NEUTRAL') confidence=Math.min(confidence,65);
    if (r==='STRONG_BEAR'&&signal==='BUY') confidence=Math.min(confidence,58);
    if (r==='STRONG_BULL'&&signal==='SELL') confidence=Math.min(confidence,58);
    if ((r==='STRONG_BULL'&&signal==='BUY')||(r==='STRONG_BEAR'&&signal==='SELL')) confidence=Math.min(95,confidence+5);
  }

  confidence = Math.max(45, Math.min(95, confidence));
  debug.totalScore = total.toFixed(3);
  debug.scores     = scores;
  debug.flags      = flags.map(f => f.type);
  debug.timeframe  = timeframeKey;

  return { signal, confidence, totalScore: total, scores, flags, debug };
}


app.post('/api/analyze/price', async (req, res) => {
  try {
    const { ticker, price, ohlcv, fundamentals, options, news, bonds, macroNews, intlMarkets, calendar, ta, timeframeKey = 'swing', market = 'US', financials, enhanced } = req.body;
    const isIndia = market === 'INDIA';
    const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
    const taCtx       = buildTAContext(ta, ticker, calendar);

    // ── Enhanced signal data context ─────────────────────────────────────────
    let enhancedCtx = '';
    if (enhanced && !isIndia) {
      const { shortInterest, insiderSummary, institutionalOwnership, earningsQuality, metrics } = enhanced;

      if (shortInterest?.shortPct != null)
        enhancedCtx += `SHORT INTEREST: ${shortInterest.shortPct}% float | Days to cover: ${shortInterest.daysToCover ?? 'N/A'} | ${shortInterest.shortPct > 20 ? '⚠ HIGH SHORT — squeeze risk' : shortInterest.shortPct < 5 ? 'Low short' : 'Moderate short'}\n`;

      if (insiderSummary)
        enhancedCtx += `INSIDER ACTIVITY (90d): ${insiderSummary.buys} buys, ${insiderSummary.sells} sells | Net shares: ${insiderSummary.netShares > 0 ? '+' : ''}${insiderSummary.netShares?.toLocaleString()} | ${insiderSummary.buys > insiderSummary.sells ? '🟢 Net buying' : insiderSummary.sells > insiderSummary.buys ? '🔴 Net selling' : 'Neutral'}\n`;

      if (institutionalOwnership?.totalPct)
        enhancedCtx += `INSTITUTIONAL OWNERSHIP: ${institutionalOwnership.totalPct}% | Top: ${institutionalOwnership.topHolders?.slice(0,3).map(h => `${h.name} ${h.pct}% ${h.change > 0 ? '↑' : h.change < 0 ? '↓' : '→'}`).join(', ')}\n`;

      if (metrics?.fcfYield != null)
        enhancedCtx += `FCF YIELD: ${metrics.fcfYield?.toFixed(1)}% | ROIC: ${metrics.roic?.toFixed(1) ?? 'N/A'}% | Rev Growth 5Y: ${metrics.revenueGrowth5Y?.toFixed(1) ?? 'N/A'}% | EPS Growth 5Y: ${metrics.epsGrowth5Y?.toFixed(1) ?? 'N/A'}%\n`;

      if (earningsQuality?.length) {
        const q = earningsQuality[0];
        const fcfVsEarnings = q.fcf != null && q.netIncome != null
          ? q.fcf >= q.netIncome * 0.8 ? '✓ FCF confirms earnings' : '⚠ FCF below earnings — quality concern'
          : '';
        enhancedCtx += `EARNINGS QUALITY: FCF Margin=${q.fcfMargin ?? 'N/A'}% | Accruals=${q.accrualsRatio ?? 'N/A'}% | ${fcfVsEarnings}\n`;
      }
    }

    if (enhanced && isIndia) {
      const { shareholding, delivery, fiiDii } = enhanced;

      if (shareholding)
        enhancedCtx += `SHAREHOLDING: Promoter=${shareholding.promoter ?? 'N/A'}% ${shareholding.promoterChange != null ? `(${shareholding.promoterChange > 0 ? '+' : ''}${shareholding.promoterChange}% QoQ)` : ''} | FII=${shareholding.fii ?? 'N/A'}% | DII=${shareholding.dii ?? 'N/A'}% | ${shareholding.promoter > 50 ? '✓ High promoter confidence' : shareholding.promoter < 25 ? '⚠ Low promoter holding' : ''}\n`;

      if (delivery?.deliveryPct)
        enhancedCtx += `DELIVERY %: ${delivery.deliveryPct}% ${parseFloat(delivery.deliveryPct) > 60 ? '✓ High conviction buying' : parseFloat(delivery.deliveryPct) < 25 ? '⚠ Mostly speculative trading' : 'Moderate'}\n`;

      if (fiiDii?.fiiNetBuy != null)
        enhancedCtx += `FII/DII TODAY: FII Net ${fiiDii.fiiNetBuy > 0 ? '🟢 +' : '🔴 '}₹${Math.abs(fiiDii.fiiNetBuy).toLocaleString()}Cr | DII Net ${fiiDii.diiNetBuy > 0 ? '🟢 +' : '🔴 '}₹${Math.abs(fiiDii.diiNetBuy ?? 0).toLocaleString()}Cr\n`;
    }

    // ── Quarterly financials context ──────────────────────────────────────────
    let financialsCtx = '';
    if (financials?.quarters?.length) {
      const q = financials.quarters;
      const fmt = (n, isMoney = true) => {
        if (n == null) return 'N/A';
        if (isIndia) {
          if (Math.abs(n) >= 1e7) return `₹${(n/1e7).toFixed(1)}Cr`;
          if (Math.abs(n) >= 1e5) return `₹${(n/1e5).toFixed(1)}L`;
          return `₹${n.toFixed(0)}`;
        }
        if (Math.abs(n) >= 1e9) return `$${(n/1e9).toFixed(2)}B`;
        if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
        return isMoney ? `$${n.toFixed(0)}` : n.toFixed(2);
      };
      const latest = q[0];
      const prev   = q[1];
      const yoy    = financials.yoy || {};
      const revenueGrowthQoQ = prev?.revenue && latest?.revenue
        ? (((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100).toFixed(1)
        : null;

      financialsCtx = `QUARTERLY FINANCIALS (latest ${latest?.period || ''}):
Revenue: ${fmt(latest?.revenue)} ${revenueGrowthQoQ != null ? `(${revenueGrowthQoQ > 0 ? '+' : ''}${revenueGrowthQoQ}% QoQ)` : ''} | YoY: ${yoy.revenueYoY != null ? `${yoy.revenueYoY > 0 ? '+' : ''}${yoy.revenueYoY.toFixed(1)}%` : 'N/A'}
Net Income: ${fmt(latest?.netIncome)} | YoY: ${yoy.netIncomeYoY != null ? `${yoy.netIncomeYoY > 0 ? '+' : ''}${yoy.netIncomeYoY.toFixed(1)}%` : 'N/A'}
Net Margin: ${latest?.netMargin != null ? `${latest.netMargin.toFixed(1)}%` : 'N/A'} (prev: ${prev?.netMargin != null ? `${prev.netMargin.toFixed(1)}%` : 'N/A'})
EPS: ${latest?.epsDiluted != null ? fmt(latest.epsDiluted, false) : 'N/A'} | YoY: ${yoy.epsYoY != null ? `${yoy.epsYoY > 0 ? '+' : ''}${yoy.epsYoY.toFixed(1)}%` : 'N/A'}
${financials.epsHistory?.length ? `EPS BEAT/MISS: ${financials.epsHistory.slice(0,3).map(e => e.beat != null ? (e.beat ? '✓BEAT' : '✗MISS') + (e.surprisePct != null ? `(${e.surprisePct > 0 ? '+' : ''}${e.surprisePct}%)` : '') : '?').join(' | ')}` : ''}
Revenue trend: ${q.slice(0,4).map(r => fmt(r?.revenue)).join(' → ')}`;
    }
    const categorized = categorizeNews(news).slice(0, 8);
    const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
    const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
    const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));
    const hasShort     = categorized.some(n => n.startsWith('[SHORT ATTACK]'));
    const hasEarnings  = categorized.some(n => n.startsWith('[EARNINGS]'));

    // Timeframe-specific price history context
    const priceSlice = {
      short:    ohlcv?.close?.slice(-10),   // 10 days — intraday momentum
      swing:    ohlcv?.close?.slice(-20),   // 20 days — trend context
      position: ohlcv?.close?.slice(-30),   // 30 days — position context
      longterm: ohlcv?.close?.slice(-52),   // 52 weeks — long term view
    };
    const closes = priceSlice[timeframeKey] || ohlcv?.close?.slice(-10);

    // Intraday context for short term
    const prevClose = ohlcv?.prev;
    const dayChangePct = price && prevClose ? ((price - prevClose) / prevClose * 100).toFixed(2) : null;

    const tfMeta = {
      short: {
        label:      'Short Term (1-5 days)',
        focus:      'momentum, RSI, StochRSI, volume spikes, news catalysts, intraday price action.',
        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}] | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} (${ta?.atr?.volatility}) | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x avg)`,
        targetRule: `Use 1x ATR ($${ta?.atr?.atr1Target}) as target, 1x ATR stop ($${ta?.atr?.atr1Stop}). Tight risk management.`,
        bullFactorFocus: 'momentum signals, volume confirmation, news catalyst, intraday breakout',
        bearFactorFocus: 'overbought readings, volume dry-up, negative news, resistance levels',
      },
      swing: {
        label:      'Swing Trade (1-4 weeks)',
        focus:      'trend direction, SMA20/50 alignment, MACD cross, BB position, S/R levels, ATR-based stops.',
        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} (${ta?.macd?.trend}) | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | BB=${ta?.bb?.position} (${ta?.bb?.bWidth}% width) | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal} | S=${ta?.sr?.nearestSupport} R=${ta?.sr?.nearestResistance}`,
        targetRule: `Use nearest resistance ($${ta?.sr?.nearestResistance}) as target or 2x ATR ($${ta?.atr?.atr2Target}). Stop at 1x ATR ($${ta?.atr?.atr1Stop}) or nearest support ($${ta?.sr?.nearestSupport}).`,
        bullFactorFocus: 'trend alignment, MACD cross, BB breakout, S/R setup, volume',
        bearFactorFocus: 'trend breakdown, MACD bearish, BB squeeze failure, resistance rejection',
      },
      position: {
        label:      'Position Trade (1-3 months)',
        focus:      'SMA50/200 trend, fundamentals quality, macro tailwinds, sector rotation, ATR-based sizing.',
        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | ATR=${ta?.atr?.atr} (${ta?.atr?.volatility}) | vs SMA200=${ta?.priceVsSma200}%`,
        targetRule: `Use analyst target ($${fundamentals?.targetMeanPrice}) or 2x ATR for target. Stop below SMA50 ($${ta?.sma50}) or 2x ATR ($${ta?.atr?.atr2Stop}).`,
        bullFactorFocus: 'fundamental strength, SMA50/200 golden cross, macro tailwind, sector leadership',
        bearFactorFocus: 'fundamental deterioration, death cross, macro headwind, sector weakness',
      },
      longterm: {
        label:      'Long Term (6-12 months)',
        focus:      'business quality, earnings growth, valuation, macro cycle, analyst consensus, SMA200 trend.',
        indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | vs SMA200=${ta?.priceVsSma200}% | Analyst Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey?.toUpperCase()} | P/E=${fundamentals?.pe} | ROE=${fundamentals?.roe ? (fundamentals.roe*100).toFixed(1)+'%' : 'N/A'}`,
        targetRule: `Use analyst consensus target ($${fundamentals?.targetMeanPrice}) as primary target. Stop at SMA200 ($${ta?.sma200}) or major support ($${ta?.sr?.nearestSupport}).`,
        bullFactorFocus: 'earnings growth, strong fundamentals, undervaluation, macro tailwind, analyst upgrades',
        bearFactorFocus: 'slowing growth, overvaluation, macro headwind, analyst downgrades, competitive threats',
      },
    };
    const tf = tfMeta[timeframeKey] || tfMeta.swing;

    // ── Step 1: Compute signal deterministically ────────────────────────────────
    // Load optimized weights + market regime + earnings date + sector return
    const [optimizedWeights, regime, earningsInfo, sectorReturn] = await Promise.all([
      Promise.resolve(null), // backtest weights disabled — using defaultWeights
      market === 'US' ? Promise.race([detectMarketRegime().catch(() => null), new Promise(r => setTimeout(() => r(null), 2000))]) : Promise.resolve(null),
      // Earnings date from Finnhub (US only)
      (async () => {
        if (isIndia) return null;
        try {
          const today = new Date().toISOString().split('T')[0];
          const fut   = new Date(Date.now() + 30*864e5).toISOString().split('T')[0];
          const data  = await finnhubGet(`/calendar/earnings?from=${today}&to=${fut}&symbol=${ticker}`);
          const next  = data?.earningsCalendar?.[0];
          return next?.date || null;
        } catch { return null; }
      })(),
      // Sector relative strength — 20d stock return vs sector ETF
      (async () => {
        if (isIndia) return null;
        try {
          const sectorMap = { 'XLK':['AAPL','MSFT','NVDA','AMD','INTC','AVGO','QCOM','CRM','ORCL','ADBE','SMCI','MU','AMAT','LRCX'], 'XLF':['JPM','BAC','GS','MS','WFC','C','BX','KKR','V','MA','AXP','BLK'], 'XLV':['JNJ','UNH','PFE','MRK','ABBV','LLY','TMO','ABT','MDT','AMGN','GILD','REGN','VRTX'], 'XLE':['XOM','CVX','COP','SLB','EOG','OXY'], 'XLY':['AMZN','TSLA','HD','MCD','NKE','SBUX','LOW','TGT'], 'XLI':['CAT','DE','BA','HON','GE','MMM','UPS','FDX','RTX','LMT'], 'XLP':['PG','KO','PEP','WMT','COST','PM','MO'], 'XLRE':['AMT','PLD','CCI','EQIX'], 'XLU':['NEE','DUK','SO','D'], 'XLC':['META','GOOGL','GOOG','NFLX','DIS','CMCSA','T','VZ'] };
          let sectorETF = null;
          for (const [etf, tickers] of Object.entries(sectorMap)) { if (tickers.includes(ticker)) { sectorETF = etf; break; } }
          if (!sectorETF) return null;
          const q = await tradierGet(`/v1/markets/history?symbol=${sectorETF}&interval=daily&start=${new Date(Date.now()-30*864e5).toISOString().split('T')[0]}`);
          const bars = q?.history?.day || [];
          if (bars.length < 20) return null;
          const etfCur = bars[bars.length-1]?.close, etfPrev = bars[bars.length-21]?.close;
          return etfCur && etfPrev ? parseFloat(((etfCur-etfPrev)/etfPrev*100).toFixed(2)) : null;
        } catch { return null; }
      })(),
    ]);

    const enhancedWithSector = enhanced ? { ...enhanced, sectorReturn } : (sectorReturn != null ? { sectorReturn } : null);

    const computed = computeSignal({
      ohlcv, ta, fundamentals, financials, enhanced: enhancedWithSector,
      options, market, timeframeKey, news,
      optimizedWeights, regime, bonds, earningsDate: earningsInfo,
    });

    const { signal, confidence, totalScore, scores, flags, debug: sigDebug } = computed;
    if (earningsInfo) console.log(`[signal] ${ticker} next earnings: ${earningsInfo}`);
    if (sectorReturn != null) console.log(`[signal] ${ticker} sector return: ${sectorReturn}%`);
    const safeScore = isFinite(totalScore) ? totalScore : 0;
    console.log(`[signal] ${ticker} ${signal} ${confidence}% score=${safeScore.toFixed(3)}`);

    // ── Step 2: Claude writes thesis/context ONLY ────────────────────────────────
    const claudeResult = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000, temperature: 0.2,
      system: `You are a trading analyst writing the reasoning for a ${tf.label} ${signal} signal on ${ticker}.
The signal and confidence have already been computed by a quantitative model. Your job is ONLY to:
1. Write a concise 2-3 sentence thesis explaining WHY this ${signal} signal makes sense given the data
2. List 3 specific bull factors (even for SELL/HOLD, identify what bulls would argue)
3. List 3 specific bear factors
4. Assess risk level, macro impact, and other qualitative fields
DO NOT change the signal or confidence — they are fixed by the model.
MARKET: ${isIndia ? 'NSE India — RBI policy, FII flows, INR/USD, domestic consumption' : 'US equities — Fed policy, USD strength, sector dynamics'}
THESIS RULE: (1) what the company does and its sector position, (2) the key driver for ${tf.label}, (3) the technical/fundamental setup that supports ${signal}.
Return ONLY JSON with these fields (signal="${signal}", confidence=${confidence} are pre-set, do not change them):`,
      messages: [{ role: 'user', content: `${ticker} @ ${isIndia ? '₹' : '$'}${price?.toFixed(2)} | ${tf.label} | SIGNAL: ${signal} ${confidence}%
QUANT SCORES: momentum=${scores.momentum?.toFixed(2)} trend=${scores.trend?.toFixed(2)} rsi=${scores.rsi?.toFixed(2)} macd=${scores.macd?.toFixed(2)} revenue=${scores.revenue?.toFixed(2)} quality=${scores.quality?.toFixed(2)} analyst=${scores.analyst?.toFixed(2)} macro=${scores.macro?.toFixed(2)}
TOTAL SCORE: ${safeScore.toFixed(3)} (range -1 to +1)
KEY INDICATORS: ${tf.indicators}
${taCtx}
FUNDAMENTALS: P/E=${fundamentals?.pe ?? 'N/A'} | EPS=${isIndia ? '₹' : '$'}${fundamentals?.eps != null ? fundamentals.eps.toFixed(2) : 'N/A'} | Beta=${fundamentals?.beta ?? 'N/A'} | 52W High=${fundamentals?.fiftyTwoWeekHigh ?? 'N/A'} | 52W Low=${fundamentals?.fiftyTwoWeekLow ?? 'N/A'} | Target=${fundamentals?.targetMeanPrice ?? 'N/A'} | Rec=${fundamentals?.recommendationKey ?? 'N/A'} | ROE=${fundamentals?.roe != null ? (fundamentals.roe*100).toFixed(1)+'%' : 'N/A'} | GrossMargin=${fundamentals?.grossMargins != null ? (fundamentals.grossMargins*100).toFixed(1)+'%' : 'N/A'}
${financialsCtx ? financialsCtx : ''}
${enhancedCtx ? enhancedCtx : ''}
${(!isIndia && timeframeKey !== 'longterm') ? `OPTIONS: P/C=${options?.putCallRatio?.toFixed(2)} | CallIV=${options?.avgCallIV}% | PutIV=${options?.avgPutIV}%` : ''}
${hasUpgrade?'🟢 ANALYST UPGRADE':''}${hasDowngrade?'🔴 ANALYST DOWNGRADE':''}${hasFund?'🏦 INSTITUTIONAL ACTIVITY':''}${hasShort?'⚠ SHORT ATTACK':''}${hasEarnings?'📊 EARNINGS NEWS':''}
NEWS: ${categorized.slice(0,6).join(' | ')}
${macroCtx}
Return JSON: {"signal":"${signal}","confidence":${confidence},"priceTarget":number,"stopLoss":number,"timeframe":"${tf.label}","thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":0,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"}` }]
    });

    // Merge: computed signal/confidence override Claude's (in case Claude tries to change them)
    const result = {
      ...claudeResult,
      signal,
      confidence,
      _quant: { totalScore: safeScore, scores },
    };
    res.json(result);
  } catch (e) {
    console.error('[analyze/price]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze/options', async (req, res) => {
  try {
    const { ticker, price, expiry, chain, fundamentals, news, priceSignal, bonds, macroNews, intlMarkets, calendar, ta, quote } = req.body;
    const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
    const intradayCtx = buildIntradayContext(null, quote);
    const taCtx       = buildTAContext(ta, ticker, calendar, expiry);
    // DTE calculation for expected move and prob estimates
    const expiryDate  = new Date(expiry);
    const today       = new Date();
    const dte         = Math.max(1, Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)));
    const chainCtx    = buildChainContext(chain, price, ta, dte);
    const categorized = categorizeNews(news).slice(0, 8);
    const calls       = chain?.topCalls?.slice(0, 5) || [];
    const puts        = chain?.topPuts?.slice(0, 5)  || [];
    const sizingCtx   = buildSizingContext(calls, puts);
    const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
    const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
    const hasTarget    = categorized.some(n => n.startsWith('[ANALYST TARGET]'));
    const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));
    const hasShort     = categorized.some(n => n.startsWith('[SHORT ATTACK]'));
    const callMid       = calls[0]?.mid || 0;
    const putMid        = puts[0]?.mid  || 0;
    const callContracts = calcDeltaAdjustedSize(calls[0]?.delta, callMid)?.contracts || Math.max(1, Math.floor(1500 / (callMid * 100)));
    const putContracts  = calcDeltaAdjustedSize(puts[0]?.delta,  putMid)?.contracts  || Math.max(1, Math.floor(1500 / (putMid  * 100)));
    const callStop   = (callMid * 0.50).toFixed(2);
    const callTarget = (callMid * 2.00).toFixed(2);
    const putStop    = (putMid  * 0.50).toFixed(2);
    const putTarget  = (putMid  * 2.00).toFixed(2);
    const callContradiction = checkRSIContradiction(ta?.rsi14, 'CALL');
    const putContradiction  = checkRSIContradiction(ta?.rsi14, 'PUT');
    const ep = calcEarningsProximity(calendar, ticker, expiry);
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
      system: `You are an expert quantitative options trader using academic strategies.

STRATEGY BASIS (151 Trading Strategies, Kakushadze & Serur SSRN-3247865):
§3.5 IV MOMENTUM: Rising call IV → bullish options signal. Rising put IV → bearish. Use IV skew and percentile.
§3.4 LOW VOL ANOMALY: Low historical vol stocks = better risk-adjusted returns. Prefer buying options when ATR is low.
MAX PAIN: Price gravitates toward max pain strike near expiry. Factor into strike selection.
EXPECTED RETURN: Use delta-adjusted probability of profit to rank ITM/ATM/OTM. Higher probProfit = safer play.
TERM STRUCTURE: Backwardation = near-term risk elevated. Contango = normal, near options fair value.

HARD RULES:
1. RSI>70 + CALL = overbought, reduce confidence or avoid
2. RSI<30 + PUT = oversold, reduce confidence or avoid
3. Earnings BEFORE expiry + HIGH risk = IV crush warning
4. Wide spread (>15%) = avoid that strike
5. ProbProfit < 25% = OTM only if high conviction
6. MAX PAIN within 1% of recommended strike = pinning risk, note it
7. Do NOT default to NEUTRAL — take a position.

STRIKE SELECTION LOGIC:
- HIGH confidence (>75%): ATM is optimal (best delta/cost ratio)
- MEDIUM confidence (55-75%): ATM or slight OTM  
- LOW confidence (<55%): ITM only (buy delta, not hope)
- IV EXPENSIVE (>80th percentile): prefer ITM (less time value at risk)
- IV CHEAP (<20th percentile): OTM acceptable (cheap lottery)

Return ONLY JSON.`,
      messages: [{ role: 'user', content: `OPTIONS: ${ticker} @ $${price?.toFixed(2)} | Expiry: ${expiry} | ${isMarketClosed()?'CLOSED':'OPEN'}
${intradayCtx}${taCtx}${chainCtx}${sizingCtx}
${callContradiction?`RSI WARNING: ${callContradiction}`:''}${putContradiction?`RSI WARNING: ${putContradiction}`:''}
${ep?`EARNINGS: ${ep.daysToEarnings}d | Before expiry: ${ep.earningsBeforeExpiry} | ${ep.risk} | ${ep.advice}`:''}
Price Signal: ${priceSignal?.signal} ${priceSignal?.confidence}% | Macro: ${priceSignal?.macroImpact}
FUNDAMENTALS: Rec=${fundamentals?.recommendationKey?.toUpperCase()} | Target=$${fundamentals?.targetMeanPrice}
${hasUpgrade?'🟢':''}${hasDowngrade?'🔴':''}${hasTarget?'📊':''}${hasFund?'🏦':''}${hasShort?'⚠':''}
NEWS: ${categorized.slice(0,6).join(' | ')}
CALLS: ${calls.map(c=>`$${c.strike}|m$${c.mid}|IV${c.iv}%|d${c.delta}|OI${c.oi}${c.unusualVolume?'🔥':''}${c.wideSpread?'⚠':''}`).join(' ')}
PUTS:  ${puts.map(p=>`$${p.strike}|m$${p.mid}|IV${p.iv}%|d${p.delta}|OI${p.oi}${p.unusualVolume?'🔥':''}${p.wideSpread?'⚠':''}`).join(' ')}
${macroCtx}
Return JSON: {"recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,"reasoning":"string","ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string","positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string","bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Stop $${callStop}. ATR $${ta?.atr?.atr1Stop}","thesis":"string","delta":"string","iv":"string"},"bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Stop $${putStop}. ATR $${ta?.atr?.shortStop}","thesis":"string","delta":"string","iv":"string"}}` }]
    });
    res.json(result);
  } catch (e) {
    console.error('[analyze/options]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze/watchlist', async (req, res) => {
  try {
    const { ticker, price, ohlcv, fundamentals, news, ta, market = 'US' } = req.body;
    const isIndiaWL = market === 'INDIA';
    const categorized = categorizeNews(news).slice(0, 5);
    const taCtx       = buildTAContext(ta, ticker);
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 800, temperature: 0,
      system: `You are a long-term equity analyst. Timeframe: Long Term (6-12 months).
MARKET: ${isIndiaWL ? 'NSE India — consider RBI monetary policy, FII/DII flows, INR strength, domestic consumption growth, GST, Budget, SEBI regulations.' : 'US equities — consider Fed policy, USD strength, global macro.'}
FOCUS: business quality, earnings growth trajectory, valuation vs peers, macro cycle positioning, analyst consensus, SMA200 trend.
TARGET RULE: Use analyst consensus price target as primary. Stop at SMA200 or major structural support.
BULL FACTORS focus: earnings growth, competitive moat, undervaluation, macro tailwind, institutional accumulation, analyst upgrades.
BEAR FACTORS focus: slowing revenue/earnings, overvaluation, macro headwinds, competitive disruption, insider selling, analyst downgrades.
THESIS RULE: 2-3 sentences — (1) what the ${isIndiaWL ? 'NSE-listed Indian company' : 'company'} does and its industry position, (2) why fundamentals support or oppose the long-term view, (3) macro/technical setup. Never purely technical.
Return ONLY JSON: {"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH"}`,
      messages: [{ role: 'user', content: `${ticker} @ $${price?.toFixed(2)} | LONG TERM (6-12 months)
PRICE TREND (20 closes): ${JSON.stringify(ohlcv?.close?.slice(-20))}
KEY SIGNALS: RSI=${ta?.rsi14} [${ta?.rsiSignal}] | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | vs SMA200=${ta?.priceVsSma200}% | MACD=${ta?.macd?.cross}
${taCtx}
FUNDAMENTALS: P/E=${fundamentals?.pe} | EPS=$${fundamentals?.eps?.toFixed?.(2)} | Beta=${fundamentals?.beta} | 52W High=$${fundamentals?.fiftyTwoWeekHigh} | 52W Low=$${fundamentals?.fiftyTwoWeekLow} | Analyst Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey?.toUpperCase()} | ROE=${fundamentals?.roe ? (fundamentals.roe*100).toFixed(1)+'%' : 'N/A'} | GrossMargin=${fundamentals?.grossMargins ? (fundamentals.grossMargins*100).toFixed(1)+'%' : 'N/A'} | DebtToEquity=${fundamentals?.debtToEquity?.toFixed?.(2)}
NEWS: ${categorized.slice(0,5).join(' | ')}
Return JSON only.` }]
    });
    res.json(result);
  } catch (e) {
    console.error('[analyze/watchlist]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze', (req, res) => {
  const body = JSON.stringify(req.body || {});
  const request = https.request({
    hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
  }, response => {
    let data = '';
    response.on('data', c => (data += c));
    response.on('end', () => { try { res.json(JSON.parse(data)); } catch { res.status(500).json({ error: 'Parse error' }); } });
  });
  request.on('error', e => res.status(500).json({ error: e.message }));
  request.write(body);
  request.end();
});

// ─── Blog routes ──────────────────────────────────────────────────────────────

app.get('/blog', async (req, res) => {
  try {
    const { data, error } = await supabase.from('blog_posts').select('id,slug,title,excerpt,category,tags,created_at').eq('published',true).order('created_at',{ascending:false});
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/blog/admin/all', async (req, res) => {
  try {
    const { data, error } = await supabase.from('blog_posts').select('id,slug,title,excerpt,category,published,created_at').order('created_at',{ascending:false});
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/blog/:slug', async (req, res) => {
  try {
    const { data, error } = await supabase.from('blog_posts').select('*').eq('slug',req.params.slug).eq('published',true).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Post not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/blog/generate', async (req, res) => {
  const { topic, ticker, category } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });
  try {
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 2000, temperature: 0.7,
      system: `You are a financial writer for QuAInt Signal. Write educational blog posts about trading. Return ONLY valid JSON.`,
      messages: [{ role: 'user', content: `Write a blog post about: "${topic}"${ticker?` focused on ${ticker}`:''}.
Category: ${category||'Market Analysis'}
Return JSON: {"title":"string","excerpt":"string","content":"HTML string","tags":[""],"slug":"string"}` }]
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/blog/publish', async (req, res) => {
  const { title, slug, excerpt, content, category, tags } = req.body;
  if (!title || !slug || !content) return res.status(400).json({ error: 'title, slug, content required' });
  try {
    const { data, error } = await supabase.from('blog_posts')
      .upsert({ slug, title, excerpt, content, category: category||'Market Analysis', tags: tags||[], published: true, updated_at: new Date().toISOString() }, { onConflict: 'slug' })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/blog/:slug', async (req, res) => {
  try {
    const { error } = await supabase.from('blog_posts').delete().eq('slug', req.params.slug);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Watchlist routes — Option B (separate per market) ───────────────────────

app.get('/watchlist/:userId', async (req, res) => {
  const market  = req.query.market || 'US';
  const isIndia = market === 'INDIA';
  try {
    const { data, error } = await supabase
      .from('watchlist').select('ticker,added_at,market')
      .eq('user_id', req.params.userId)
      .eq('market', market)
      .order('added_at', { ascending: false });
    if (error) throw error;
    if (!data?.length) return res.json([]);

    const tickers = data.map(r => r.ticker);

    if (isIndia) {
      // Fetch India prices from Yahoo Finance (.NS suffix)
      const priceResults = await Promise.all(
        tickers.map(async ticker => {
          const q = await getNSEQuote(ticker);
          return { ticker, q };
        })
      );
      return res.json(priceResults.map(({ ticker, q }) => ({
        ticker, added_at: data.find(r => r.ticker === ticker)?.added_at,
        market, price: q?.price || null,
        changePct: q?.changePct || null,
        change: q?.change || null,
        volume: q?.volume || null,
      })));
    } else {
      // Fetch US prices from Tradier
      const quotes    = await tradierGet(`/v1/markets/quotes?symbols=${tickers.join(',')}&greeks=false`);
      const raw       = quotes?.quotes?.quote || [];
      const quoteList = Array.isArray(raw) ? raw : [raw];
      const quoteMap  = {};
      quoteList.forEach(q => { quoteMap[q.symbol] = q; });
      return res.json(data.map(row => {
        const q = quoteMap[row.ticker];
        return { ticker: row.ticker, added_at: row.added_at, market, price: q?.last ? parseFloat(q.last) : null, changePct: q?.change_percentage ? parseFloat(q.change_percentage) : null, change: q?.change ? parseFloat(q.change) : null, volume: q?.volume ? parseInt(q.volume) : null };
      }));
    }
  } catch (e) {
    console.error('[watchlist GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/watchlist/:userId', async (req, res) => {
  const { ticker, market = 'US' } = req.body;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  try {
    const user = await getOrCreateUser(req.params.userId);
    if (user.plan !== 'pro') {
      const { count } = await supabase
        .from('watchlist').select('*', { count: 'exact', head: true })
        .eq('user_id', req.params.userId)
        .eq('market', market);
      if (count >= 5) return res.status(403).json({ error: `Free tier limit: 5 ${market} watchlist items. Upgrade to Pro for unlimited.` });
    }
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ user_id: req.params.userId, ticker: ticker.toUpperCase(), market })
      .select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Already in watchlist' });
      throw error;
    }
    res.json(data);
  } catch (e) {
    console.error('[watchlist POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/watchlist/:userId/:ticker', async (req, res) => {
  const market = req.query.market || 'US';
  try {
    const { error } = await supabase
      .from('watchlist').delete()
      .eq('user_id', req.params.userId)
      .eq('ticker', req.params.ticker.toUpperCase())
      .eq('market', market);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('[watchlist DELETE]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── India market — Yahoo Finance (.NS suffix) ────────────────────────────────

// Nifty 50 tickers with Yahoo Finance .NS suffix
const NIFTY500 = [
  'HDFCBANK','ICICIBANK','KOTAKBANK','SBIN','AXISBANK','BAJFINANCE','BAJAJFINSV','SHRIRAMFIN',
  'SBILIFE','HDFCLIFE','ICICIPRULI','ICICIGI','SBICARD','HDFCAMC','NIPPONLIFE','UTIAMC',
  'BANKBARODA','CANBK','PNB','UNIONBANK','IDFCFIRSTB','FEDERALBNK','INDUSINDBK','BANDHANBNK',
  'AUBANK','CHOLAFIN','MUTHOOTFIN','LICHSGFIN','RECLTD','PFC','IRFC','M&MFIN',
  'SUNDARMFIN','LTFH','ABCAPITAL','POONAWALLA','MANAPPURAM','CREDITACC','IIFL','360ONE',
  'ANGELONE','MOTILALOFS','NUVAMA','CANFINHOME','HOMEFIRST','AAVAS','APTUS','RBLBANK',
  'JMFINANCIL','EDELWEISS','STARHEALTH','GODIGIT','NIACL','GICRE','LICINDIA','BSE',
  'CDSL','MCX','CAMS','KFINTECH','TCS','INFOSYS','HCLTECH','WIPRO',
  'TECHM','LTIM','MPHASIS','PERSISTENT','COFORGE','KPITTECH','LTTS','TATAELXSI',
  'CYIENT','BIRLASOFT','OFSS','HEXAWARE','NIIT','ZENSAR','SONATSOFTW','INTELLECT',
  'NEWGEN','TANLA','ROUTE','MASTEK','FSL','RAMSARUP','NAUKRI','INDIAMART',
  'JUSTDIAL','CARTRADE','DELHIVERY','ZOMATO','PAYTM','POLICYBZR','RELIANCE','ONGC',
  'BPCL','IOC','HINDPETRO','GAIL','PETRONET','GSPL','MGL','IGL',
  'ATGL','MRPL','CASTROLIND','GULFOILLUB','MARUTI','TATAMOTORS','M&M','BAJAJ-AUTO',
  'HEROMOTOCO','EICHERMOT','TVSMOTOR','ASHOKLEY','ESCORTS','FORCEMOT','BHARATFORG','MOTHERSON',
  'BALKRISIND','MRF','APOLLOTYRE','CEATLTD','JKTYRE','EXIDEIND','AMARAJABAT','BOSCHLTD',
  'SUNDRMFAST','ENDURANCE','SUPRAJIT','GABRIEL','UNOMINDA','MAHINDCIE','CRAFTSMAN','SUBROS',
  'SETCO','TIINDIA','SCHAEFFLER','SKFINDIA','TIMKEN','GREAVESCOT','HINDUNILVR','ITC',
  'NESTLEIND','BRITANNIA','TATACONSUM','DABUR','GODREJCP','MARICO','COLPAL','EMAMILTD',
  'JYOTHYLAB','BAJAJCON','VBLLTD','RADICO','UNITDSPR','MCDOWELL-N','PGHH','GILLETTE',
  'ZYDUSWELL','HONASA','BIKAJI','CCL','TASTYBITELTD','SUNPHARMA','DRREDDY','CIPLA',
  'DIVISLAB','BIOCON','AUROPHARMA','TORNTPHARM','LUPIN','ALKEM','GLENMARK','IPCALAB',
  'ABBOTINDIA','GLAXO','PFIZER','SANOFI','NATCOPHARM','GRANULES','LAURUSLABS','ZYDUSLIFE',
  'JBCHEPHARM','GLAND','SUVEN','SOLARA','SEQUENT','APLLTD','AJANTPHARM','ERIS',
  'MARKSANS','APOLLOHOSP','MAXHEALTH','FORTIS','LALPATHLAB','METROPOLIS','THYROCARE','KRSNAA',
  'VIJAYADIAG','HEALTHCARE','NARAYANHRU','KIMS','LT','SIEMENS','ABB','BHEL',
  'THERMAX','CUMMINSIND','KECL','KALPATPOWR','AHLUCONT','NCC','PNC','IRB',
  'HGINFRA','GPIL','HAL','BEL','BHFC','COCHINSHIP','MAZAGON','GRSE',
  'BEML','RAILTEL','RVNL','IRCON','NBCC','ENGINERSIN','VOLTAS','BLUESTARCO',
  'WHIRLPOOL','HAVELLS','POLYCAB','KEI','FINOLEX','APAR','TATASTEEL','JSWSTEEL',
  'HINDALCO','VEDL','NATIONALUM','SAIL','NMDC','COALINDIA','MOIL','HINDCOPPER',
  'WELCORP','RATNAMANI','JINDALSAW','JSPL','APLAPOLLO','KALYANKJIL','TITAN','RAJESHEXPO',
  'PCJEWELLER','ULTRACEMCO','SHREECEM','AMBUJACEM','ACCIND','RAMCOCEM','JKCEMENT','DALMIACEMT',
  'BIRLACORPN','HEIDELBERG','INDIACEM','GRASIM','NCLIND','JKIL','DLF','GODREJPROP',
  'OBEROIRLTY','PRESTIGE','BRIGADE','SOBHA','PHOENIXLTD','MAHLIFE','KOLTEPATIL','SUNTECK',
  'ANANTRAJ','LODHA','SIGNATURE','RAYMOND','TREEHOUSE','NTPC','POWERGRID','ADANIPOWER',
  'ADANIGREEN','TATAPOWER','TORNTPOWER','CESC','NHPC','SJVN','JSWENERGY','INDIAGRID',
  'POWERMECH','BHARTIARTL','IDEA','TATACOMM','HFCL','STLTECH','INDUS','CROMPTON',
  'ORIENTELEC','VAIBHAVGBL','AMBER','DIXON','PGEL','VEDANT','NYKAA','BATA',
  'RELAXO','METROBRAND','VMART','SHOPERSTOP','TRENTLTD','ABFRL','GOCOLORS','MANYAVAR',
  'SUNTV','ZEEL','PVRINOX','NETWORK18','TV18BRDCST','JAGRAN','CONCOR','IRCTC',
  'BLUEDART','GATI','VRL','MAHLOG','TCI','SHREYAS','SICAL','INDIAPORT',
  'INDHOTEL','LEMONTRE','CHALET','EIHOTEL','MAHINDHOLIDAYS','PIDILITIND','VINATIORGA','AARTIIND',
  'DEEPAKNITR','NAVINFLUOR','SRF','FLUOROCHEM','CLEAN','ROSSARI','NEOGEN','SUDARSCHEM',
  'FINEORG','GALAXYSURF','TATACHEM','GHCL','ATUL','NOCIL','DHARAMSI','IOLCP',
  'COROMANDEL','CHAMBLFERT','GNFC','GSFC','FACT','KSCL','RALSIL','PI',
  'BAYER','DHANUKA','ASTEC','SUMICHEM','JSWHL','TRIDENT','PAGEIND','ARVIND',
  'VARDHACRLC','WELSPUNIND','SPANDANA','UFLEX','BALRAMCHIN','DHAMPUR','RENUKA','ADANIENT',
  'ADANIPORTS','BAJAJHLDNG','3MINDIA','HONAUT','GOODYEAR',
];
const NIFTY50 = [
  // Official NSE Nifty 50 Index constituents
  'RELIANCE','TCS','HDFCBANK','BHARTIARTL','ICICIBANK','INFOSYS','SBIN',
  'HINDUNILVR','ITC','BAJFINANCE','LT','KOTAKBANK','HCLTECH','AXISBANK',
  'ASIANPAINT','MARUTI','SUNPHARMA','TITAN','ULTRACEMCO','NTPC','POWERGRID',
  'WIPRO','JSWSTEEL','TATAMOTORS','ADANIPORTS','COALINDIA','BAJAJFINSV',
  'TECHM','NESTLEIND','TATASTEEL','ONGC','DRREDDY','BAJAJ-AUTO','DIVISLAB',
  'CIPLA','EICHERMOT','APOLLOHOSP','HINDALCO','BRITANNIA','TATACONSUM',
  'GRASIM','HEROMOTOCO','ADANIENT','INDUSINDBK','M&M','BPCL','SHRIRAMFIN',
  'SBILIFE','HDFCLIFE','TRENT',
];

const NIFTY100 = [
  'RELIANCE','TCS','HDFCBANK','BHARTIARTL','ICICIBANK','INFOSYS','SBIN','HINDUNILVR',
  'ITC','BAJFINANCE','LT','KOTAKBANK','HCLTECH','AXISBANK','ASIANPAINT','MARUTI',
  'SUNPHARMA','TITAN','ULTRACEMCO','NTPC','POWERGRID','WIPRO','JSWSTEEL','TATAMOTORS',
  'ADANIPORTS','COALINDIA','BAJAJFINSV','TECHM','NESTLEIND','TATASTEEL','ONGC','DRREDDY',
  'BAJAJ-AUTO','DIVISLAB','CIPLA','EICHERMOT','APOLLOHOSP','HINDALCO','BRITANNIA','TATACONSUM',
  'GRASIM','HEROMOTOCO','ADANIENT','INDUSINDBK','M&M','BPCL','SHRIRAMFIN','SBILIFE',
  'HDFCLIFE','TRENT','DMART','ZOMATO','LTIM','VEDL','PIDILITIND','HAL',
  'SIEMENS','AMBUJACEM','GODREJCP','BOSCHLTD','MOTHERSON','BANKBARODA','RECLTD','PFC',
  'CANBK','INDIGO','ADANIGREEN','ADANIPOWER','ATGL','NAUKRI','MCDOWELL-N','HAVELLS',
  'DABUR','MARICO','COLPAL','BERGEPAINT','PGHH','PAGEIND','MUTHOOTFIN','CHOLAFIN',
  'TORNTPHARM','LUPIN','AUROPHARMA','BIOCON','ALKEM','IPCALAB','ABBOTINDIA','GLAXO',
  'LALPATHLAB','SJVN','NHPC','CESC','TORNTPOWER','DLF','GODREJPROP','OBEROIRLTY',
  'TATAPOWER','JSWENERGY','POLYCAB','BEL',
];

// NSE symbol → display name map
const NSE_NAMES = {
  'HDFCBANK':'HDFC Bank','ICICIBANK':'ICICI Bank','KOTAKBANK':'Kotak Mahindra Bank','SBIN':'State Bank of India',
  'AXISBANK':'Axis Bank','BAJFINANCE':'Bajaj Finance','BAJAJFINSV':'Bajaj Finserv','SHRIRAMFIN':'Shriram Finance',
  'SBILIFE':'SBI Life Insurance','HDFCLIFE':'HDFC Life Insurance','ICICIPRULI':'ICICI Prudential Life','ICICIGI':'ICICI Lombard General',
  'SBICARD':'SBI Cards & Payment','HDFCAMC':'HDFC AMC','NIPPONLIFE':'Nippon Life India AMC','UTIAMC':'UTI AMC',
  'BANKBARODA':'Bank of Baroda','CANBK':'Canara Bank','PNB':'Punjab National Bank','UNIONBANK':'Union Bank of India',
  'IDFCFIRSTB':'IDFC First Bank','FEDERALBNK':'Federal Bank','INDUSINDBK':'IndusInd Bank','BANDHANBNK':'Bandhan Bank',
  'AUBANK':'AU Small Finance Bank','CHOLAFIN':'Cholamandalam Investment','MUTHOOTFIN':'Muthoot Finance','LICHSGFIN':'LIC Housing Finance',
  'RECLTD':'REC Ltd','PFC':'Power Finance Corp','IRFC':'Indian Railway Finance','M&MFIN':'Mahindra & Mahindra Financial',
  'SUNDARMFIN':'Sundaram Finance','LTFH':'L&T Finance','ABCAPITAL':'Aditya Birla Capital','POONAWALLA':'Poonawalla Fincorp',
  'MANAPPURAM':'Manappuram Finance','CREDITACC':'CreditAccess Grameen','IIFL':'IIFL Finance','360ONE':'360 ONE WAM',
  'ANGELONE':'Angel One','MOTILALOFS':'Motilal Oswal Financial','NUVAMA':'Nuvama Wealth Management','CANFINHOME':'Can Fin Homes',
  'HOMEFIRST':'Home First Finance','AAVAS':'Aavas Financiers','APTUS':'Aptus Value Housing Finance','RBLBANK':'RBL Bank',
  'JMFINANCIL':'JM Financial','EDELWEISS':'Edelweiss Financial','STARHEALTH':'Star Health Insurance','GODIGIT':'Go Digit General Insurance',
  'NIACL':'New India Assurance','GICRE':'GIC Re','LICINDIA':'LIC of India','BSE':'BSE Ltd',
  'CDSL':'Central Depository Services','MCX':'Multi Commodity Exchange','CAMS':'Computer Age Management Services','KFINTECH':'KFin Technologies',
  'TCS':'Tata Consultancy Services','INFOSYS':'Infosys','HCLTECH':'HCL Technologies','WIPRO':'Wipro',
  'TECHM':'Tech Mahindra','LTIM':'LTIMindtree','MPHASIS':'Mphasis','PERSISTENT':'Persistent Systems',
  'COFORGE':'Coforge','KPITTECH':'KPIT Technologies','LTTS':'L&T Technology Services','TATAELXSI':'Tata Elxsi',
  'CYIENT':'Cyient','BIRLASOFT':'Birlasoft','OFSS':'Oracle Financial Services Software','HEXAWARE':'Hexaware Technologies',
  'NIIT':'NIIT Technologies','ZENSAR':'Zensar Technologies','SONATSOFTW':'Sonata Software','INTELLECT':'Intellect Design Arena',
  'NEWGEN':'Newgen Software Technologies','TANLA':'Tanla Platforms','ROUTE':'Route Mobile','MASTEK':'Mastek',
  'FSL':'Firstsource Solutions','RAMSARUP':'Ram Sarup Industries','NAUKRI':'Info Edge India','INDIAMART':'IndiaMART InterMESH',
  'JUSTDIAL':'Just Dial','CARTRADE':'CarTrade Tech','DELHIVERY':'Delhivery','ZOMATO':'Zomato',
  'PAYTM':'One97 Communications (Paytm)','POLICYBZR':'PB Fintech (PolicyBazaar)','RELIANCE':'Reliance Industries','ONGC':'ONGC',
  'BPCL':'BPCL','IOC':'Indian Oil Corp','HINDPETRO':'HPCL','GAIL':'GAIL India',
  'PETRONET':'Petronet LNG','GSPL':'Gujarat State Petronet','MGL':'Mahanagar Gas','IGL':'Indraprastha Gas',
  'ATGL':'Adani Total Gas','MRPL':'Mangalore Refinery','CASTROLIND':'Castrol India','GULFOILLUB':'Gulf Oil Lubricants',
  'MARUTI':'Maruti Suzuki India','TATAMOTORS':'Tata Motors','M&M':'Mahindra & Mahindra','BAJAJ-AUTO':'Bajaj Auto',
  'HEROMOTOCO':'Hero MotoCorp','EICHERMOT':'Eicher Motors','TVSMOTOR':'TVS Motor Company','ASHOKLEY':'Ashok Leyland',
  'ESCORTS':'Escorts Kubota','FORCEMOT':'Force Motors','BHARATFORG':'Bharat Forge','MOTHERSON':'Samvardhana Motherson',
  'BALKRISIND':'Balkrishna Industries','MRF':'MRF','APOLLOTYRE':'Apollo Tyres','CEATLTD':'CEAT',
  'JKTYRE':'JK Tyre & Industries','EXIDEIND':'Exide Industries','AMARAJABAT':'Amara Raja Energy & Mobility','BOSCHLTD':'Bosch',
  'SUNDRMFAST':'Sundram Fasteners','ENDURANCE':'Endurance Technologies','SUPRAJIT':'Suprajit Engineering','GABRIEL':'Gabriel India',
  'UNOMINDA':'Uno Minda','MAHINDCIE':'Mahindra CIE Automotive','CRAFTSMAN':'Craftsman Automation','SUBROS':'Subros',
  'SETCO':'Setco Automotive','TIINDIA':'Tube Investments of India','SCHAEFFLER':'Schaeffler India','SKFINDIA':'SKF India',
  'TIMKEN':'Timken India','GREAVESCOT':'Greaves Cotton','HINDUNILVR':'Hindustan Unilever','ITC':'ITC Ltd',
  'NESTLEIND':'Nestle India','BRITANNIA':'Britannia Industries','TATACONSUM':'Tata Consumer Products','DABUR':'Dabur India',
  'GODREJCP':'Godrej Consumer Products','MARICO':'Marico','COLPAL':'Colgate-Palmolive India','EMAMILTD':'Emami',
  'JYOTHYLAB':'Jyothy Labs','BAJAJCON':'Bajaj Consumer Care','VBLLTD':'Varun Beverages','RADICO':'Radico Khaitan',
  'UNITDSPR':'United Spirits','MCDOWELL-N':'United Breweries','PGHH':'Procter & Gamble Hygiene','GILLETTE':'Gillette India',
  'ZYDUSWELL':'Zydus Wellness','HONASA':'Honasa Consumer (Mamaearth)','BIKAJI':'Bikaji Foods International','CCL':'CCL Products',
  'TASTYBITELTD':'Tasty Bite Eatables','SUNPHARMA':'Sun Pharmaceutical','DRREDDY':'Dr Reddys Laboratories','CIPLA':'Cipla',
  'DIVISLAB':'Divis Laboratories','BIOCON':'Biocon','AUROPHARMA':'Aurobindo Pharma','TORNTPHARM':'Torrent Pharmaceuticals',
  'LUPIN':'Lupin','ALKEM':'Alkem Laboratories','GLENMARK':'Glenmark Pharmaceuticals','IPCALAB':'IPCA Laboratories',
  'ABBOTINDIA':'Abbott India','GLAXO':'GlaxoSmithKline Pharmaceuticals','PFIZER':'Pfizer India','SANOFI':'Sanofi India',
  'NATCOPHARM':'Natco Pharma','GRANULES':'Granules India','LAURUSLABS':'Laurus Labs','ZYDUSLIFE':'Zydus Lifesciences',
  'JBCHEPHARM':'JB Chemicals & Pharmaceuticals','GLAND':'Gland Pharma','SUVEN':'Suven Pharmaceuticals','SOLARA':'Solara Active Pharma Sciences',
  'SEQUENT':'Sequent Scientific','APLLTD':'Alembic Pharmaceuticals','AJANTPHARM':'Ajanta Pharma','ERIS':'Eris Lifesciences',
  'MARKSANS':'Marksans Pharma','APOLLOHOSP':'Apollo Hospitals','MAXHEALTH':'Max Healthcare Institute','FORTIS':'Fortis Healthcare',
  'LALPATHLAB':'Dr Lal PathLabs','METROPOLIS':'Metropolis Healthcare','THYROCARE':'Thyrocare Technologies','KRSNAA':'Krsnaa Diagnostics',
  'VIJAYADIAG':'Vijaya Diagnostic','HEALTHCARE':'Healthcare Global','NARAYANHRU':'Narayana Hrudayalaya','KIMS':'Krishna Institute of Medical Sciences',
  'LT':'Larsen & Toubro','SIEMENS':'Siemens India','ABB':'ABB India','BHEL':'Bharat Heavy Electricals',
  'THERMAX':'Thermax','CUMMINSIND':'Cummins India','KECL':'KEC International','KALPATPOWR':'Kalpataru Projects International',
  'AHLUCONT':'Ahluwalia Contracts','NCC':'NCC','PNC':'PNC Infratech','IRB':'IRB Infrastructure Developers',
  'HGINFRA':'HG Infra Engineering','GPIL':'Godawari Power & Ispat','HAL':'Hindustan Aeronautics','BEL':'Bharat Electronics',
  'BHFC':'Bharat Forge','COCHINSHIP':'Cochin Shipyard','MAZAGON':'Mazagon Dock Shipbuilders','GRSE':'Garden Reach Shipbuilders',
  'BEML':'BEML','RAILTEL':'RailTel Corporation','RVNL':'Rail Vikas Nigam','IRCON':'Ircon International',
  'NBCC':'NBCC India','ENGINERSIN':'Engineers India','VOLTAS':'Voltas','BLUESTARCO':'Blue Star',
  'WHIRLPOOL':'Whirlpool India','HAVELLS':'Havells India','POLYCAB':'Polycab India','KEI':'KEI Industries',
  'FINOLEX':'Finolex Cables','APAR':'APAR Industries','TATASTEEL':'Tata Steel','JSWSTEEL':'JSW Steel',
  'HINDALCO':'Hindalco Industries','VEDL':'Vedanta','NATIONALUM':'National Aluminium','SAIL':'Steel Authority of India',
  'NMDC':'NMDC','COALINDIA':'Coal India','MOIL':'MOIL','HINDCOPPER':'Hindustan Copper',
  'WELCORP':'Welspun Corp','RATNAMANI':'Ratnamani Metals & Tubes','JINDALSAW':'Jindal Saw','JSPL':'Jindal Steel & Power',
  'APLAPOLLO':'APL Apollo Tubes','KALYANKJIL':'Kalyan Jewellers','TITAN':'Titan Company','RAJESHEXPO':'Rajesh Exports',
  'PCJEWELLER':'PC Jeweller','ULTRACEMCO':'UltraTech Cement','SHREECEM':'Shree Cement','AMBUJACEM':'Ambuja Cements',
  'ACCIND':'ACC','RAMCOCEM':'Ramco Cements','JKCEMENT':'JK Cement','DALMIACEMT':'Dalmia Bharat',
  'BIRLACORPN':'Birla Corporation','HEIDELBERG':'HeidelbergCement India','INDIACEM':'India Cements','GRASIM':'Grasim Industries',
  'NCLIND':'NCL Industries','JKIL':'JK Lakshmi Cement','DLF':'DLF','GODREJPROP':'Godrej Properties',
  'OBEROIRLTY':'Oberoi Realty','PRESTIGE':'Prestige Estates Projects','BRIGADE':'Brigade Enterprises','SOBHA':'Sobha',
  'PHOENIXLTD':'Phoenix Mills','MAHLIFE':'Mahindra Lifespace Developers','KOLTEPATIL':'Kolte-Patil Developers','SUNTECK':'Sunteck Realty',
  'ANANTRAJ':'Anant Raj','LODHA':'Macrotech Developers (Lodha)','SIGNATURE':'Signature Global','RAYMOND':'Raymond',
  'TREEHOUSE':'Tree House Education','NTPC':'NTPC','POWERGRID':'Power Grid Corp','ADANIPOWER':'Adani Power',
  'ADANIGREEN':'Adani Green Energy','TATAPOWER':'Tata Power','TORNTPOWER':'Torrent Power','CESC':'CESC',
  'NHPC':'NHPC','SJVN':'SJVN','JSWENERGY':'JSW Energy','INDIAGRID':'IndiGrid',
  'POWERMECH':'Power Mech Projects','BHARTIARTL':'Bharti Airtel','IDEA':'Vodafone Idea','TATACOMM':'Tata Communications',
  'HFCL':'HFCL','STLTECH':'Sterlite Technologies','INDUS':'Indus Towers','CROMPTON':'Crompton Greaves Consumer',
  'ORIENTELEC':'Orient Electric','VAIBHAVGBL':'Vaibhav Global','AMBER':'Amber Enterprises','DIXON':'Dixon Technologies',
  'PGEL':'PG Electroplast','VEDANT':'Vedant Fashions (Manyavar)','NYKAA':'FSN E-Commerce (Nykaa)','BATA':'Bata India',
  'RELAXO':'Relaxo Footwears','METROBRAND':'Metro Brands','VMART':'V-Mart Retail','SHOPERSTOP':'Shoppers Stop',
  'TRENTLTD':'Trent','ABFRL':'Aditya Birla Fashion & Retail','GOCOLORS':'Go Fashion (India)','MANYAVAR':'Vedant Fashions',
  'SUNTV':'Sun TV Network','ZEEL':'Zee Entertainment Enterprises','PVRINOX':'PVR Inox','NETWORK18':'Network18 Media',
  'TV18BRDCST':'TV18 Broadcast','JAGRAN':'Jagran Prakashan','CONCOR':'Container Corp of India','IRCTC':'IRCTC',
  'BLUEDART':'Blue Dart Express','GATI':'Gati','VRL':'VRL Logistics','MAHLOG':'Mahindra Logistics',
  'TCI':'Transport Corporation of India','SHREYAS':'Shreyas Shipping','SICAL':'SICAL Logistics','INDIAPORT':'India Port Global',
  'INDHOTEL':'Indian Hotels','LEMONTRE':'Lemon Tree Hotels','CHALET':'Chalet Hotels','EIHOTEL':'EIH (Oberoi Hotels)',
  'MAHINDHOLIDAYS':'Club Mahindra Holidays','PIDILITIND':'Pidilite Industries','VINATIORGA':'Vinati Organics','AARTIIND':'Aarti Industries',
  'DEEPAKNITR':'Deepak Nitrite','NAVINFLUOR':'Navin Fluorine International','SRF':'SRF','FLUOROCHEM':'Gujarat Fluorochemicals',
  'CLEAN':'Clean Science & Technology','ROSSARI':'Rossari Biotech','NEOGEN':'Neogen Chemicals','SUDARSCHEM':'Sudarshan Chemical Industries',
  'FINEORG':'Fine Organics','GALAXYSURF':'Galaxy Surfactants','TATACHEM':'Tata Chemicals','GHCL':'GHCL',
  'ATUL':'Atul Ltd','NOCIL':'NOCIL','DHARAMSI':'Dharamsi Morarji Chemical','IOLCP':'IOL Chemicals & Pharmaceuticals',
  'COROMANDEL':'Coromandel International','CHAMBLFERT':'Chambal Fertilizers & Chemicals','GNFC':'Gujarat Narmada Valley Fertilizers','GSFC':'Gujarat State Fertilizers & Chemicals',
  'FACT':'Fertilisers and Chemicals Travancore','KSCL':'Kaveri Seed Company','RALSIL':'Rallis India','PI':'PI Industries',
  'BAYER':'Bayer CropScience','DHANUKA':'Dhanuka Agritech','ASTEC':'Astec LifeSciences','SUMICHEM':'Sumitomo Chemical India',
  'JSWHL':'JSW Holdings','TRIDENT':'Trident','PAGEIND':'Page Industries','ARVIND':'Arvind',
  'VARDHACRLC':'Vardhman Textiles','WELSPUNIND':'Welspun India','SPANDANA':'Spandana Sphoorty','UFLEX':'Uflex',
  'BALRAMCHIN':'Balrampur Chini Mills','DHAMPUR':'Dhampur Sugar Mills','RENUKA':'Shree Renuka Sugars','ADANIENT':'Adani Enterprises',
  'ADANIPORTS':'Adani Ports & SEZ','BAJAJHLDNG':'Bajaj Holdings & Investment','3MINDIA':'3M India','HONAUT':'Honeywell Automation India',
  'GOODYEAR':'Goodyear India',
};

// Fetch Yahoo Finance quote for a single NSE stock
// ─── NSE India — primary: stock-nse-india package, fallback: Yahoo Finance ────
let nseIndia = null;
try {
  const { NseIndia } = require('stock-nse-india');
  nseIndia = new NseIndia();
  console.log('[NSE] stock-nse-india loaded successfully');
} catch (e) {
  console.warn('[NSE] stock-nse-india not available, using Yahoo Finance fallback:', e.message);
}

// cache declarations moved to top of file

// YAHOO config moved to top

async function getNSEHistory(symbol, range = '3mo') {
  const cacheKey = `${symbol}:${range}`;
  const cached   = nseHistoryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < NSE_HISTORY_TTL) return cached.data;
  // Serve stale cache up to 24h while refreshing in background
  if (cached && Date.now() - cached.ts < 24 * 60 * 60 * 1000) {
    refreshNSEHistory(symbol, range).catch(() => {});
    return cached.data;
  }

  let result = null;

  // Primary: stock-nse-india historical data
  if (nseIndia) {
    try {
      const daysMap = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730 };
      const days  = daysMap[range] || 90;
      const end   = new Date();
      const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const data  = await nseIndia.getEquityHistoricalData(symbol, { start, end });
      // Combine all pages — API returns array of {data:[...], meta:{}} chunks
      let rows = [];
      if (Array.isArray(data)) {
        for (const chunk of data) {
          const chunkRows = chunk?.data || (Array.isArray(chunk) ? chunk : []);
          rows = rows.concat(chunkRows);
        }
      }
      if (!rows.length) rows = data || [];

      if (rows.length) {
        const parseDate = s => {
          if (!s) return 0;
          const [d, m, y] = s.split('-');
          return new Date(`${m} ${d} ${y}`).getTime();
        };
        const sorted = [...rows]
          .filter(r => r.mtimestamp && r.chClosingPrice)
          .sort((a, b) => parseDate(a.mtimestamp) - parseDate(b.mtimestamp));

        const closes = sorted.map(r => parseFloat(r.chClosingPrice));
        console.log(`[NSE history] ${symbol}: ${sorted.length} rows from stock-nse-india`);
        result = {
          close:      sorted.map(r => parseFloat(r.chClosingPrice)),
          open:       sorted.map(r => parseFloat(r.chOpeningPrice)),
          high:       sorted.map(r => parseFloat(r.chTradeHighPrice)),
          low:        sorted.map(r => parseFloat(r.chTradeLowPrice)),
          volume:     sorted.map(r => parseInt(r.chTotTradedQty) || 0),
          timestamps: sorted.map(r => parseDate(r.mtimestamp)),
          current:    closes[closes.length - 1],
          prev:       closes[closes.length - 2],
        };
      }
    } catch (e) { console.warn(`[NSE] history failed ${symbol}:`, e.message); }
  }

  // Fallback: Yahoo Finance (retry across hosts)
  if (!result) {
    const ySymbol     = `${symbol}.NS`;
    const intervalMap = { '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1wk', '2y': '1wk' };
    const interval    = intervalMap[range] || '1d';

    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      for (const host of YAHOO_HOSTS) {
        try {
          const data = await httpsGet(host,
            `/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${interval}&range=${range}&includePrePost=false&events=history`,
            { ...YAHOO_HEADERS, 'Cache-Control': 'no-cache' }
          );
          const cr = data?.chart?.result?.[0];
          if (!cr) continue;
          const q  = cr.indicators?.quote?.[0] || {};
          const cl = (q.close || []).filter(c => c != null);
          if (!cl.length) continue;
          result = {
            close: q.close, open: q.open, high: q.high, low: q.low, volume: q.volume,
            timestamps: cr.timestamp || [],
            current: cl[cl.length - 1], prev: cl[cl.length - 2],
            source: 'yahoo_history',
          };
          console.log(`[NSE history] Yahoo succeeded: ${symbol} ${cl.length} bars (attempt ${attempt+1})`);
          break;
        } catch { continue; }
      }
      if (!result && attempt < 2) await new Promise(r => setTimeout(r, 800));
    }
    if (!result) console.warn(`[NSE history] Yahoo failed for ${symbol} after 3 attempts`);
  }

  // Last resort: Sharekhan history
  if (!result && sharekhanToken && SHAREKHAN_API_KEY) {
    result = await getSharekhanHistory(symbol, range).catch(() => null);
  }

  if (result) {
    nseHistoryCache.set(cacheKey, { data: result, ts: Date.now() });
  } else if (cached) {
    console.warn(`[NSE] all history sources failed ${symbol}, using stale cache`);
    return cached.data;
  }
  return result;
}

// Alias for background refresh
async function refreshNSEHistory(symbol, range) {
  return getNSEHistory(symbol, range);
}

// ─── GET /india/debug/:symbol — inspect raw NSE data ─────────────────────────
app.get('/india/debug/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const result = {};

  // Test getNSEHistory
  try {
    const daysMap = { '3mo': 90 };
    const days  = 90;
    const end   = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (nseIndia) {
      const raw = await nseIndia.getEquityHistoricalData(symbol, { start, end });
      result.rawHistoryType    = typeof raw;
      result.rawHistoryIsArray = Array.isArray(raw);
      result.rawHistoryLength  = Array.isArray(raw) ? raw.length : null;
      result.firstItem         = Array.isArray(raw) ? raw[0] : raw;
      result.firstItemKeys     = Array.isArray(raw) && raw[0] ? Object.keys(raw[0]) : null;
      // If nested
      if (raw?.[0]?.data) {
        result.nestedDataLength = raw[0].data.length;
        result.nestedFirstRow   = raw[0].data[0];
      }
    } else {
      result.nseIndia = 'not loaded';
    }
  } catch (e) {
    result.historyError = e.message;
  }

  // Test getNSEQuote
  try {
    if (nseIndia) {
      const q = await nseIndia.getEquityDetails(symbol);
      result.quotePriceInfo = q?.priceInfo;
    }
  } catch (e) {
    result.quoteError = e.message;
  }

  res.json(result);
});

// ─── GET /india/search ────────────────────────────────────────────────────────
app.get('/india/search', (req, res) => {
  const q = (req.query.q || '').toUpperCase().trim();
  if (!q) return res.json([]);
  const all = NIFTY500.map(sym => ({ ticker: sym, name: NSE_NAMES[sym] || sym, exchange: 'NSE' }));
  const startsWith = all.filter(s => s.ticker.startsWith(q));
  const contains   = all.filter(s => !s.ticker.startsWith(q) && (s.ticker.includes(q) || s.name.toUpperCase().includes(q)));
  res.json([...startsWith, ...contains].slice(0, 10));
});

// ─── GET /india/quote/:symbol ─────────────────────────────────────────────────
app.get('/india/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const q = await getNSEQuote(symbol);
    if (!q) return res.status(404).json({ error: `No data for ${symbol}.NS` });
    res.json({ symbol, name: NSE_NAMES[symbol] || symbol, ...q });
  } catch (e) {
    console.error('[india/quote]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /india/history/:symbol ───────────────────────────────────────────────
app.get('/india/history/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const range  = req.query.range || '3mo';
  try {
    const data = await getNSEHistory(symbol, range);
    if (!data) return res.status(404).json({ error: `No history for ${symbol}.NS` });

    // Filter out null/undefined rows — keep only indices where close is valid
    const close  = data.close      || [];
    const open   = data.open       || [];
    const high   = data.high       || [];
    const low    = data.low        || [];
    const volume = data.volume     || [];
    const ts     = data.timestamps || [];

    const validIndices = close.map((c, i) => i).filter(i => close[i] != null && !isNaN(close[i]));

    if (!validIndices.length) return res.status(404).json({ error: `No valid OHLCV data for ${symbol}` });

    const pick = (arr) => validIndices.map(i => arr[i] ?? null);

    const cleanClose  = pick(close);
    const cleanOpen   = pick(open);
    const cleanHigh   = pick(high);
    const cleanLow    = pick(low);
    const cleanVolume = pick(volume);
    const cleanTs     = pick(ts);

    res.json({ chart: { result: [{ meta: { symbol, currency: 'INR' },
      timestamp: cleanTs,
      indicators: { quote: [{ open: cleanOpen, high: cleanHigh, low: cleanLow, close: cleanClose, volume: cleanVolume }] }
    }] } });
  } catch (e) {
    console.error('[india/history]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── India macro — sectoral indices + macro data ─────────────────────────────

// Sectoral ETFs as proxies for sectoral indices (all NSE-listed)
// NSE index symbols for Yahoo Finance (^NSEI etc) — more reliable than ETF proxies
const SECTORAL_ETFS = [
  { symbol: 'NIFTYBEES',  yahooSymbol: '^NSEI',      name: 'Nifty 50',    category: 'index'    },
  { symbol: 'BANKBEES',   yahooSymbol: '^NSEBANK',   name: 'Nifty Bank',  category: 'sector'   },
  { symbol: 'ITBEES',     yahooSymbol: '^CNXIT',     name: 'Nifty IT',    category: 'sector'   },
  { symbol: 'PHARMABEES', yahooSymbol: '^CNXPHARMA', name: 'Nifty Pharma',category: 'sector'   },
  { symbol: 'AUTOBEES',   yahooSymbol: '^CNXAUTO',   name: 'Nifty Auto',  category: 'sector'   },
  { symbol: 'FMCGBEES',   yahooSymbol: '^CNXFMCG',   name: 'Nifty FMCG',  category: 'sector'   },
  { symbol: 'INFRABEES',  yahooSymbol: 'INFRABEES.NS',name: 'Nifty Infra', category: 'sector'   },
  { symbol: 'PSUBNKBEES', yahooSymbol: '^NSPSE',     name: 'PSU Bank',    category: 'sector'   },
  { symbol: 'GOLDBEES',   yahooSymbol: 'GC=F',       name: 'Gold',        category: 'commodity'},
  { symbol: 'CPSEETF',    yahooSymbol: 'CPSEETF.NS', name: 'CPSE/Energy', category: 'sector'   },
];

// Midcap/Smallcap index stocks as proxies
const MIDSMALL_STOCKS = ['PERSISTENT','COFORGE','KPITTECH','DIXON','AMBER','POLYCAB','KEI','APLAPOLLO','KALYANKJIL','GODREJPROP'];

const indiaMacroCache = { data: null, ts: 0 };
const INDIA_MACRO_TTL = 5 * 60 * 1000;

async function fetchIndiaMacroData() {
  // 1. Fetch sectoral ETF quotes via Yahoo Finance directly
  // ETFs use different NSE endpoint than equities — Yahoo .NS is more reliable here
  const sectorData = await Promise.allSettled(
    SECTORAL_ETFS.map(async etf => {
      let q = null;
      // Try Yahoo Finance using the index symbol (^NSEI, ^NSEBANK etc)
      const ySymbol = etf.yahooSymbol || (etf.symbol + '.NS');
      for (const host of YAHOO_HOSTS) {
        try {
          const data = await httpsGet(host,
            `/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5d&includePrePost=false`,
            YAHOO_HEADERS
          );
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice) {
            const price = meta.regularMarketPrice;
            const prev  = meta.previousClose || meta.chartPreviousClose;
            q = {
              price,
              changePct: prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : null,
              change:    prev ? parseFloat((price - prev).toFixed(2)) : null,
            };
            break;
          }
        } catch { continue; }
      }
      // Fallback to getNSEQuote (equity endpoint)
      if (!q) q = await getNSEQuote(etf.symbol);
      return { ...etf, price: q?.price || null, changePct: q?.changePct || null, change: q?.change || null };
    })
  );
  const sectors = sectorData
    .filter(r => r.status === 'fulfilled' && r.value?.price)
    .map(r => r.value);

  // 2–5. Fetch macro data via Polygon (reliable) + Yahoo fallback for USD/INR
  let usdInr = null, crude = null, gold = null;

  // ── USD/INR via open.er-api.com (free, no auth, no IP restrictions) ─────────
  try {
    const fxData = await httpsGet('open.er-api.com', '/v6/latest/USD', { 'Accept': 'application/json' });
    if (fxData?.rates?.INR) {
      const rate     = fxData.rates.INR;
      const rateDate = fxData.time_last_update_utc;
      usdInr = { price: parseFloat(rate.toFixed(4)), changePct: null, source: 'er-api', updatedAt: rateDate };
      // Try to get prev day rate for changePct
      const prevData = await httpsGet('open.er-api.com', '/v6/history/USD/1', { 'Accept': 'application/json' }).catch(() => null);
      if (prevData?.rates?.INR) {
        const prev = prevData.rates.INR;
        usdInr.prevClose = parseFloat(prev.toFixed(4));
        usdInr.changePct = parseFloat(((rate - prev) / prev * 100).toFixed(3));
      }
      console.log(`[india/macro] USD/INR: ${rate} (er-api)`);
    }
  } catch (e) { console.warn('[india/macro] er-api USD/INR failed:', e.message); }

  // Fallback: Yahoo Finance for USD/INR
  if (!usdInr) {
    try {
      for (const host of YAHOO_HOSTS) {
        try {
          const d = await httpsGet(host, '/v8/finance/chart/USDINR=X?interval=1d&range=5d', YAHOO_HEADERS);
          const meta = d?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice) {
            const price = meta.regularMarketPrice;
            const prev  = meta.previousClose || meta.chartPreviousClose;
            usdInr = { price, prevClose: prev, changePct: prev ? parseFloat(((price-prev)/prev*100).toFixed(3)) : null, source: 'yahoo' };
            break;
          }
        } catch { continue; }
      }
    } catch {}
  }

  // ── Gold via Tradier (GLD ETF) + convert to per-gram INR ────────────────────
  // GLD = 1/10 troy oz of gold. Gold price = GLD * 10 / 31.1035 per gram
  try {
    const gldData = await tradierGet('/v1/markets/quotes?symbols=GLD,USO&greeks=false');
    const quotes  = gldData?.quotes?.quote || [];
    const qlist   = Array.isArray(quotes) ? quotes : [quotes];
    const gld     = qlist.find(q => q.symbol === 'GLD');
    const uso     = qlist.find(q => q.symbol === 'USO');
    const inrRate = usdInr?.price || 84;

    if (gld?.last) {
      const goldPriceUsd = parseFloat(gld.last) * 10; // GLD = 1/10 troy oz
      const goldPct      = gld.change_percentage ? parseFloat(gld.change_percentage) : null;
      gold = {
        priceUsd: parseFloat(goldPriceUsd.toFixed(2)),
        priceInr: Math.round(goldPriceUsd * inrRate / 31.1035), // per gram INR
        changePct: goldPct,
        source: 'tradier_gld',
      };
      console.log(`[india/macro] Gold: $${goldPriceUsd.toFixed(0)}/troy oz (GLD ETF)`);
    }
    if (uso?.last) {
      // USO ≈ 0.1 barrel of WTI crude. Brent ≈ WTI + $2-4
      const wti   = parseFloat(uso.last) * 10;
      const brent = wti + 3; // rough Brent premium
      crude = {
        price:     parseFloat(brent.toFixed(2)),
        priceWTI:  parseFloat(wti.toFixed(2)),
        changePct: uso.change_percentage ? parseFloat(uso.change_percentage) : null,
        source:    'tradier_uso',
      };
      console.log(`[india/macro] Crude: $${brent.toFixed(1)}/bbl Brent (USO ETF proxy)`);
    }
  } catch (e) { console.warn('[india/macro] Tradier GLD/USO failed:', e.message); }

  // Fallback: Polygon for GLD/USO
  if (!gold || !crude) {
    try {
      const macroProxies = [
        ...(!gold  ? [{ poly: 'GLD', yahoo: 'GC=F', key: 'gold'  }] : []),
        ...(!crude ? [{ poly: 'USO', yahoo: 'CL=F', key: 'crude' }] : []),
      ];
      const results = await polygonBatch(macroProxies, 5);
      const inrRate = usdInr?.price || 84;
      results.forEach((r, i) => {
        if (r.current == null) return;
        const key = macroProxies[i].key;
        if (key === 'gold' && !gold) {
          gold = { priceUsd: r.current * 10, priceInr: Math.round(r.current * 10 * inrRate / 31.1035), changePct: r.changePct, source: 'polygon' };
        }
        if (key === 'crude' && !crude) {
          crude = { price: r.current * 10 + 3, changePct: r.changePct, source: 'polygon' };
        }
      });
    } catch (e) { console.warn('[india/macro] Polygon fallback failed:', e.message); }
  }

  // Last resort: Yahoo Finance direct fetch for gold and crude
  if (!gold) {
    try {
      for (const host of YAHOO_HOSTS) {
        try {
          const d = await httpsGet(host, '/v8/finance/chart/GC%3DF?interval=1d&range=2d', YAHOO_HEADERS);
          const meta = d?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice) {
            const inrRate = usdInr?.price || 84;
            const priceUsd = meta.regularMarketPrice;
            gold = {
              priceUsd: parseFloat(priceUsd.toFixed(2)),
              priceInr: Math.round(priceUsd * inrRate / 31.1035),
              changePct: meta.previousClose ? parseFloat(((priceUsd - meta.previousClose) / meta.previousClose * 100).toFixed(2)) : null,
              source: 'yahoo_direct',
            };
            console.log(`[india/macro] Gold via Yahoo direct: $${priceUsd.toFixed(0)}`);
            break;
          }
        } catch { continue; }
      }
    } catch {}
  }
  if (!crude) {
    try {
      for (const host of YAHOO_HOSTS) {
        try {
          const d = await httpsGet(host, '/v8/finance/chart/CL%3DF?interval=1d&range=2d', YAHOO_HEADERS);
          const meta = d?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice) {
            const price = meta.regularMarketPrice;
            crude = {
              price: parseFloat(price.toFixed(2)),
              changePct: meta.previousClose ? parseFloat(((price - meta.previousClose) / meta.previousClose * 100).toFixed(2)) : null,
              source: 'yahoo_direct',
            };
            console.log(`[india/macro] Crude via Yahoo direct: $${price.toFixed(1)}`);
            break;
          }
        } catch { continue; }
      }
    } catch {}
  }
  // Absolute last resort fallbacks — static recent values
  if (!gold)  gold  = { priceUsd: 3300, priceInr: Math.round(3300 * (usdInr?.price || 84) / 31.1035), changePct: null, source: 'fallback' };
  if (!crude) crude = { price: 70, changePct: null, source: 'fallback' };

  // ── India 10Y bond yield ───────────────────────────────────────────────────
  // RBI publishes G-Sec yields. Use Yahoo as primary, fallback to last known.
  let india10Y = null;
  try {
    for (const host of YAHOO_HOSTS) {
      try {
        const d = await httpsGet(host, '/v8/finance/chart/%5EINBY?interval=1d&range=5d', YAHOO_HEADERS);
        const meta = d?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          india10Y = { yield: meta.regularMarketPrice, prevYield: meta.previousClose };
          break;
        }
      } catch { continue; }
    }
  } catch {}
  // Fallback: use a reasonable default if Yahoo blocked (RBI rate ~7%)
  if (!india10Y) india10Y = { yield: 7.0, prevYield: 7.0, estimated: true };

  // Global signals — via Polygon (reliable)
  // Global signals — reuse Polygon data via polygonBatch (same as /international endpoint)
  let globalSignals = {};
  try {
    const globalSymbols = [
      { poly: 'SPY',  yahoo: 'SPY',       key: 'sp500', label: 'S&P 500' },
      { poly: 'UUP',  yahoo: 'DX-Y.NYB',  key: 'dxy',   label: 'DXY'     },
      { poly: 'EWJ',  yahoo: '^N225',      key: 'n225',  label: 'Nikkei'  },
      { poly: 'FXI',  yahoo: '000001.SS',  key: 'china', label: 'Shanghai'},
    ];
    const results = await polygonBatch(globalSymbols, 5);
    results.forEach((r, i) => {
      if (r.current != null) {
        globalSignals[globalSymbols[i].key] = {
          label:     globalSymbols[i].label,
          price:     r.current,
          changePct: r.changePct != null ? parseFloat(r.changePct.toFixed(2)) : null,
        };
      }
    });
  } catch (e) {
    console.warn('[india/macro] globalSignals error:', e.message);
  }

  return { sectors, usdInr, india10Y, crude, gold, globalSignals, updatedAt: Date.now() };
}

app.get('/india/macro', async (req, res) => {
  try {
    if (indiaMacroCache.data && Date.now() - indiaMacroCache.ts < INDIA_MACRO_TTL) {
      return res.json({ ...indiaMacroCache.data, cached: true });
    }
    const data = await fetchIndiaMacroData();
    indiaMacroCache.data = data;
    indiaMacroCache.ts   = Date.now();
    persistCacheSet('india_macro', data).catch(() => {});
    res.json(data);
  } catch (e) {
    console.error('[india/macro]', e.message);
    if (indiaMacroCache.data) return res.json({ ...indiaMacroCache.data, stale: true });
    res.status(500).json({ error: e.message });
  }
});

// ─── India movers — cached, background refresh ───────────────────────────────
async function fetchIndiaMoversData() {
  let results = [];

  // Method 1: Fetch NIFTY 50 + NIFTY NEXT 50 for wider universe (100 stocks)
  if (nseIndia) {
    try {
      const [nifty50, niftyNext50, nifty100] = await Promise.allSettled([
        nseIndia.getEquityStockIndices('NIFTY 50'),
        nseIndia.getEquityStockIndices('NIFTY NEXT 50'),
        nseIndia.getEquityStockIndices('NIFTY MIDCAP 50'),
      ]);
      const seen = new Set();
      const allStocks = [
        ...(nifty50.value?.data    || []),
        ...(niftyNext50.value?.data || []),
        ...(nifty100.value?.data   || []),
      ];
      if (allStocks.length > 0) {
        results = allStocks
          .filter(s => s.symbol && s.lastPrice && !seen.has(s.symbol) && seen.add(s.symbol))
          .map(s => ({
            ticker:    s.symbol,
            name:      NSE_NAMES[s.symbol] || s.companyName || s.symbol,
            price:     s.lastPrice,
            change:    s.change     ? parseFloat(s.change.toFixed(2))     : null,
            changePct: s.pChange    ? parseFloat(s.pChange.toFixed(2))    : null,
            volume:    s.totalTradedVolume || s.tradedVolume || 0,
            open:      s.open    || null,
            high:      s.dayHigh || null,
            low:       s.dayLow  || null,
          }));
        console.log(`[india/movers] got ${results.length} stocks from NIFTY 50+NEXT50+MIDCAP50`);
      }
    } catch (e) {
      console.warn('[india/movers] getEquityStockIndices failed:', e.message);
    }
  }

  // Method 2: Try gainers/losers endpoints directly from NSE
  if (!results.length && nseIndia) {
    try {
      const [gainersData, losersData] = await Promise.allSettled([
        nseIndia.getEquityStockIndices('NIFTY NEXT 50'),
        nseIndia.getEquityStockIndices('NIFTY 100'),
      ]);
      const stocks = [
        ...(gainersData.value?.data || []),
        ...(losersData.value?.data  || []),
      ];
      if (stocks.length) {
        const seen = new Set();
        results = stocks
          .filter(s => s.symbol && s.lastPrice && !seen.has(s.symbol) && seen.add(s.symbol))
          .map(s => ({
            ticker:    s.symbol,
            name:      NSE_NAMES[s.symbol] || s.companyName || s.symbol,
            price:     s.lastPrice,
            change:    s.change  ? parseFloat(s.change.toFixed(2))  : null,
            changePct: s.pChange ? parseFloat(s.pChange.toFixed(2)) : null,
            volume:    s.totalTradedVolume || 0,
          }));
        console.log(`[india/movers] got ${results.length} stocks from index fallback`);
      }
    } catch (e) {
      console.warn('[india/movers] index fallback failed:', e.message);
    }
  }

  // Method 3: Individual quote fallback for NIFTY50 (last resort)
  if (!results.length) {
    console.warn('[india/movers] falling back to individual quotes');
    const batchSize = 5;
    for (let i = 0; i < NIFTY50.slice(0, 20).length; i += batchSize) {
      const batch = NIFTY50.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map(async ticker => {
        const q = await getNSEQuote(ticker);
        if (!q?.price) return null;
        return { ticker, name: NSE_NAMES[ticker] || ticker, ...q };
      }));
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      }
      if (i + batchSize < 20) await sleep(300);
    }
  }

  if (!results.length) return null;

  // Compute changePct from price/prevClose if missing
  const enriched = results.map(s => {
    if (s.changePct == null && s.price && s.prevClose && s.prevClose > 0) {
      const chg = s.price - s.prevClose;
      return { ...s, change: parseFloat(chg.toFixed(2)), changePct: parseFloat((chg / s.prevClose * 100).toFixed(2)) };
    }
    return s;
  });
  const validResults = enriched.filter(s => s.changePct != null);
  return {
    gainers: [...validResults].sort((a, b) => b.changePct - a.changePct).filter(s => s.changePct > 0).slice(0, 10),
    losers:  [...validResults].sort((a, b) => a.changePct - b.changePct).filter(s => s.changePct < 0).slice(0, 10),
    volume:  [...enriched].filter(s => s.volume > 0).sort((a, b) => (b.volume||0) - (a.volume||0)).slice(0, 10),
    total:   enriched.length,
  };
}

async function warmIndiaMoversCache() {
  try {
    console.log('[india/movers] warming cache...');
    const data = await fetchIndiaMoversData();
    if (data) {
      indiaMoversCache.data = data;
      indiaMoversCache.ts   = Date.now();
      persistCacheSet('india_movers', data).catch(() => {});
    }
    console.log('[india/movers] cache warm');
  } catch (e) { console.error('[india/movers] warm error', e.message); }
}

// Warm on startup and refresh every 5 minutes
warmIndiaMoversCache();
setInterval(warmIndiaMoversCache, INDIA_MOVERS_TTL);

app.get('/india/movers', async (req, res) => {
  try {
    // Serve from cache instantly if fresh
    if (indiaMoversCache.data && Date.now() - indiaMoversCache.ts < INDIA_MOVERS_TTL) {
      return res.json({ ...indiaMoversCache.data, cached: true });
    }
    // Cache stale — fetch fresh and update cache
    const data = await fetchIndiaMoversData();
    if (!data) return res.json({ gainers: [], losers: [], volume: [], error: 'No data available' });
    indiaMoversCache.data = data;
    indiaMoversCache.ts   = Date.now();
    res.json(data);
  } catch (e) {
    console.error('[india/movers]', e.message);
    // Return stale cache if available rather than error
    if (indiaMoversCache.data) return res.json({ ...indiaMoversCache.data, stale: true });
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /india/news/:symbol ─────────────────────────────────────────────────
app.get('/india/news/:symbol', async (req, res) => {
  const symbol  = req.params.symbol.toUpperCase();
  const name    = NSE_NAMES[symbol] || symbol;
  const ySymbol = `${symbol}.NS`;
  try {
    // Try Yahoo Finance news via search endpoint
    const data = await httpsGet(
      'query1.finance.yahoo.com',
      `/v1/finance/search?q=${encodeURIComponent(ySymbol)}&newsCount=8&quotesCount=0&enableFuzzyQuery=false`,
      { 'User-Agent': 'Mozilla/5.0' }
    );
    const items = data?.news || [];
    if (items.length > 0) {
      return res.json(items.slice(0, 8).map(n => ({
        title:     n.title,
        publisher: n.publisher || '',
        time:      n.providerPublishTime,
        url:       n.link || '',
      })));
    }

    // Fallback: Finnhub with company name search
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to   = new Date().toISOString().split('T')[0];
    const fdata = await finnhubGet(`/company-news?symbol=${encodeURIComponent(ySymbol)}&from=${from}&to=${to}`);
    if (Array.isArray(fdata) && fdata.length > 0) {
      return res.json(fdata.slice(0, 8).map(n => ({
        title: n.headline, publisher: n.source || '', time: n.datetime, url: n.url,
      })));
    }

    res.json([]);
  } catch (e) {
    console.error('[india/news]', e.message);
    res.json([]);
  }
});

// ─── GET /india/fundamentals/:symbol ─────────────────────────────────────────
app.get('/india/fundamentals/:symbol', async (req, res) => {
  const symbol  = req.params.symbol.toUpperCase();
  const ySymbol = `${symbol}.NS`;
  try {
    // Fetch from Yahoo Finance using .NS suffix
    let result = null;
    for (const host of YAHOO_HOSTS) {
      try {
        const data = await httpsGet(
          host,
          `/v10/finance/quoteSummary/${encodeURIComponent(ySymbol)}?modules=financialData,defaultKeyStatistics,summaryDetail`,
          YAHOO_HEADERS
        );
        const r = data?.quoteSummary?.result?.[0];
        if (!r) continue;
        result = {
          companyName:       r.quoteType?.longName || r.quoteType?.shortName || '',
          pe:                r.summaryDetail?.trailingPE?.raw         || null,
          eps:               r.defaultKeyStatistics?.trailingEps?.raw || null,
          beta:              r.summaryDetail?.beta?.raw               || null,
          fiftyTwoWeekHigh:  r.summaryDetail?.fiftyTwoWeekHigh?.raw   || null,
          fiftyTwoWeekLow:   r.summaryDetail?.fiftyTwoWeekLow?.raw    || null,
          averageVolume:     r.summaryDetail?.averageVolume?.raw      || null,
          roe:               r.financialData?.returnOnEquity?.raw     || null,
          debtToEquity:      r.financialData?.debtToEquity?.raw       || null,
          revenueGrowth:     r.financialData?.revenueGrowth?.raw      || null,
          grossMargins:      r.financialData?.grossMargins?.raw       || null,
          targetMeanPrice:   r.financialData?.targetMeanPrice?.raw    || null,
          recommendationKey: r.financialData?.recommendationKey       || null,
          numberOfAnalystOpinions: r.financialData?.numberOfAnalystOpinions?.raw || null,
        };
        break;
      } catch { continue; }
    }
    if (!result) return res.status(404).json({ error: `No fundamentals for ${ySymbol}` });
    res.json(result);
  } catch (e) {
    console.error('[india/fundamentals]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/portfolio/chat ─────────────────────────────────────────────────
// Conversational advisor — takes message history, returns next advisor message
// When advisor has enough info, returns { done: true, portfolioReady: true }
app.post('/api/portfolio/chat', async (req, res) => {
  const { messages, sipAmount, language = 'en' } = req.body;
  const msgHistory = Array.isArray(messages) ? messages : [];

  const LANG_INSTRUCTIONS = {
    en: 'Converse in English.',
    hi: 'Converse entirely in Hindi (हिंदी). Use simple conversational Hindi. Financial terms like SIP, ETF, NAV, mutual fund can stay in English.',
    ta: 'Converse entirely in Tamil (தமிழ்). Use simple conversational Tamil. Financial terms like SIP, ETF, NAV, mutual fund can stay in English.',
    te: 'Converse entirely in Telugu (తెలుగు). Use simple conversational Telugu. Financial terms like SIP, ETF, NAV, mutual fund can stay in English.',
    kn: 'Converse entirely in Kannada (ಕನ್ನಡ). Use simple conversational Kannada. Financial terms like SIP, ETF, NAV, mutual fund can stay in English.',
    ml: 'Converse entirely in Malayalam (മലയാളം). Use simple conversational Malayalam. Financial terms like SIP, ETF, NAV, mutual fund can stay in English.',
    mr: 'Converse entirely in Marathi (मराठी). Use simple conversational Marathi. Financial terms like SIP, ETF, NAV, mutual fund can stay in English.',
    bn: 'Converse entirely in Bengali (বাংলা). Use simple conversational Bengali. Financial terms like SIP, ETF, NAV, mutual fund can stay in English.',
    gu: 'Converse entirely in Gujarati (ગુજરાતી). Use simple conversational Gujarati. Financial terms like SIP, ETF, NAV, mutual fund can stay in English.',
  };
  const langInstruction = LANG_INSTRUCTIONS[language] || LANG_INSTRUCTIONS.en;
  const budget = `₹${Number(sipAmount || 10000).toLocaleString('en-IN')}/month`;

  try {
    const result = await callClaudeRaw({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `You are Arya, a friendly and knowledgeable Indian investment advisor at QuAInt Signal.
You are having a conversational intake with a new investor to understand their financial situation before recommending a portfolio.

LANGUAGE: ${langInstruction}

YOUR JOB: Ask questions ONE AT A TIME in a natural, conversational way to gather:
1. Age and occupation
2. Monthly income (approximate range is fine)
3. Primary investment goal (retirement / child education / house / wealth creation / other)
4. Investment timeline / horizon
5. Existing investments if any (FDs, PPF, stocks, MFs)
6. Monthly EMIs or financial obligations
7. Emergency fund status (do they have 3-6 months expenses saved)
8. Risk comfort (scenario: "if your portfolio dropped 20%, would you panic, hold, or buy more?")
9. Tax bracket (rough idea — helps with debt fund advice)

RULES:
- Ask only ONE question at a time
- Keep responses SHORT — 1-2 sentences max
- Be warm and conversational, not robotic
- After 6-8 exchanges when you have sufficient information, end with EXACTLY this JSON on its own line:
  {"PORTFOLIO_READY": true}
- Do NOT generate the portfolio yourself — just signal when ready
- The monthly SIP budget is already known: ${budget}
- Do not ask about SIP amount again

Start by greeting them warmly and asking their age and occupation in one natural question.`,
      messages: msgHistory.length > 0
        ? msgHistory.map(m => ({ role: m.role, content: m.content }))
        : [{ role: 'user', content: 'Hello, I want to start investing.' }],
    });

    // Handle Anthropic API errors
    if (result?.error) {
      console.error('[portfolio/chat] Claude API error:', result.error);
      throw new Error(result.error.message || 'Claude API error');
    }

    const text = result?.content?.[0]?.text || '';
    if (!text) {
      console.error('[portfolio/chat] Empty response from Claude. Full result:', JSON.stringify(result).slice(0, 300));
      throw new Error('No response from AI. Please try again.');
    }

    // Check if advisor signals portfolio is ready
    if (text.includes('"PORTFOLIO_READY": true')) {
      return res.json({
        message: text.replace(/\{"PORTFOLIO_READY":\s*true\}/g, '').trim() ||
          'Great, I have everything I need! Let me build your personalised portfolio now...',
        done: true,
      });
    }

    res.json({ message: text, done: false });
  } catch (e) {
    console.error('[portfolio/chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/portfolio/generate ──────────────────────────────────────────────
// Generate portfolio from full conversation transcript
app.post('/api/portfolio/generate', async (req, res) => {
  const { messages, sipAmount, language = 'en' } = req.body;
  const LANG_NAMES_GEN = {
    en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
    kn: 'Kannada', ml: 'Malayalam', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati',
  };
  const langNameGen = LANG_NAMES_GEN[language] || 'English';
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  // Build transcript for context
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Investor' : 'Advisor'}: ${m.content}`)
    .join('\n');

  try {
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      temperature: 0,
      system: `You are a SEBI-registered investment advisor. Based on the intake conversation below, generate a detailed, personalised SIP portfolio recommendation for an Indian retail investor.

LANGUAGE: Write "summary", "suitability", "reason", "taxStrategy", "rebalancing", "emergencyFundAdvice", "redFlags", "advice", and "keyConsiderations" in ${langNameGen}. Keep fund names, NSE symbols, numbers, and financial terms (SIP, ETF, NAV, LTCG) in English.

Return ONLY valid JSON matching this exact schema:
{
  "summary": "2-3 sentence personalised overview mentioning their specific situation",
  "investorProfile": {
    "age": number,
    "goal": "string",
    "horizon": "string",
    "riskLabel": "Conservative|Moderate|Aggressive|Very Aggressive",
    "taxBracket": "string",
    "keyConsiderations": ["point 1", "point 2"]
  },
  "riskAssessment": {
    "label": "string",
    "expectedReturn": "X-Y% p.a.",
    "volatility": "Low|Moderate|High|Very High",
    "suitability": "one sentence"
  },
  "topPicks": [
    {
      "name": "full fund name",
      "type": "ETF|MF",
      "symbol": "NSE symbol if ETF else null",
      "allocation": number,
      "amount": number,
      "expenseRatio": "0.XX%",
      "expectedReturn": "X-Y% p.a.",
      "taxCategory": "Equity|Debt|Hybrid",
      "pros": ["point 1", "point 2"],
      "cons": ["point 1"],
      "reason": "personalised 2 sentence rationale referencing their specific goal"
    }
  ],
  "monthlyPlan": {
    "total": number,
    "breakdown": [{"instrument": "string", "amount": number, "sipDate": "1st|5th|10th|15th|25th"}]
  },
  "assetAllocation": { "equity": number, "debt": number, "gold": number, "international": number },
  "rebalancing": "specific rebalancing advice based on their situation",
  "taxStrategy": "personalised tax advice based on their bracket and goals",
  "emergencyFundAdvice": "advice on emergency fund if relevant from conversation",
  "redFlags": ["specific risk or concern from their situation"],
  "advice": "personalised next steps referencing their specific goals and situation"
}`,
      messages: [{
        role: 'user',
        content: `Here is the intake conversation:

${transcript}

Monthly SIP budget: ₹${Number(sipAmount).toLocaleString('en-IN')}
Current date: ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}

Generate a comprehensive, personalised portfolio recommendation based on everything discussed. Make all amounts add up to exactly ₹${Number(sipAmount).toLocaleString('en-IN')}/month.`,
      }],
    });

    res.json(result);
  } catch (e) {
    console.error('[portfolio/generate]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/analyze/portfolio ─────────────────────────────────────────────
app.post('/api/analyze/portfolio', async (req, res) => {
  const { riskProfile, score, sipAmount, horizon, reaction, goal } = req.body;
  try {
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 3000, temperature: 0,
      system: `You are a SEBI-registered investment advisor specializing in Indian mutual funds and NSE ETFs.
You give detailed, actionable, India-specific SIP portfolio recommendations.

RULES:
- Always recommend a mix of asset classes appropriate for the risk profile
- Prefer direct plans over regular plans (lower expense ratio)
- Include specific NSE ETF symbols (e.g. NIFTYBEES, GOLDBEES, BANKBEES) where relevant
- Include specific mutual fund names with "Direct Growth" suffix
- Be precise about expense ratios, expected returns, and tax treatment
- Account for Indian tax laws: LTCG >₹1.25L taxed at 12.5%, STCG at 20% for equity; debt funds at slab rate
- Suggest rebalancing frequency based on horizon

Return ONLY valid JSON matching this exact schema:
{
  "summary": "2-3 sentence overview of the recommended strategy and why it suits this investor",
  "riskAssessment": {
    "label": "Conservative|Moderate|Aggressive|Very Aggressive",
    "score": number,
    "expectedReturn": "X-Y% p.a. (historical estimate)",
    "volatility": "Low|Moderate|High|Very High",
    "suitability": "one sentence on why this profile fits the investor"
  },
  "topPicks": [
    {
      "name": "full fund/ETF name",
      "type": "ETF|MF",
      "symbol": "NSE symbol if ETF, else null",
      "allocation": number,
      "amount": number,
      "expenseRatio": "0.XX%",
      "expectedReturn": "X-Y% p.a.",
      "taxCategory": "Equity|Debt|Hybrid",
      "pros": ["point 1", "point 2"],
      "cons": ["point 1"],
      "reason": "2 sentence rationale specific to this investor"
    }
  ],
  "monthlyPlan": {
    "total": number,
    "breakdown": [{"instrument": "string", "amount": number, "sipDate": "1st|5th|10th|15th|25th"}]
  },
  "assetAllocation": {
    "equity": number,
    "debt": number,
    "gold": number,
    "international": number
  },
  "rebalancing": "How often and how to rebalance — be specific",
  "taxStrategy": "2-3 sentences on tax harvesting, LTCG exemption usage, and optimal holding period",
  "redFlags": ["risk or concern specific to this investor's profile"],
  "advice": "2-3 sentences of personalised final advice including what to do first"
}`,
      messages: [{
        role: 'user',
        content: `Investor profile:
- Risk profile: ${riskProfile} (score ${score}/16)
- Monthly SIP budget: ₹${Number(sipAmount).toLocaleString('en-IN')}
- Investment horizon: ${horizon}
- Market crash reaction: ${reaction}
- Primary goal: ${goal}

Current date: ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
Market context: Post-budget India, RBI in rate-cut cycle, Nifty 50 at ~22,000-24,000 range.

Recommend 4-6 specific instruments. Make the monthly amounts add exactly to ₹${Number(sipAmount).toLocaleString('en-IN')}. Include at least one index ETF (NIFTYBEES or similar) and appropriate gold/debt allocation based on risk profile.`,
      }],
    });
    res.json(result);
  } catch (e) {
    console.error('[portfolio]', e.message);
    res.status(500).json({ error: e.message });
  }
});


// ─── US Portfolio Advisor ─────────────────────────────────────────────────────

// POST /api/us-portfolio/chat — conversational intake with Max, the US advisor
app.post('/api/us-portfolio/chat', async (req, res) => {
  const { messages, monthlyBudget, payFrequency = 'monthly' } = req.body;
  const msgHistory = Array.isArray(messages) ? messages : [];
  const paycheckAmt = payFrequency === 'weekly' ? Math.round(monthlyBudget * 12 / 52)
    : payFrequency === 'biweekly' ? Math.round(monthlyBudget * 12 / 26) : monthlyBudget;
  const freqWord = payFrequency === 'weekly' ? 'week' : payFrequency === 'biweekly' ? 'paycheck' : 'month';
  const budget = `$${Number(monthlyBudget || 500).toLocaleString()}/month ($${paycheckAmt.toLocaleString()} per ${freqWord})`;

  try {
    const result = await callClaudeRaw({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 700,
      system: `You are Max, a friendly and knowledgeable US financial advisor at QuAInt Signal.
You are doing a conversational intake with a new investor to understand their full financial picture before generating a personalized portfolio.

YOUR JOB: Ask questions ONE AT A TIME in a natural, conversational way to gather:
1. Age and employment status (W-2, self-employed, retired)
2. Annual household income (approximate range)
3. Primary investment goal (retirement / house down payment / wealth building / college fund / other)
4. Investment timeline / horizon
5. Account types they have or want (401k, Roth IRA, brokerage, HSA)
6. Existing investments (if any — 401k balance, index funds, stocks, crypto)
7. Monthly expenses and any debt (student loans, mortgage, credit cards)
8. Emergency fund status (do they have 3-6 months saved)
9. Risk tolerance (scenario: "if your portfolio dropped 30% in a crash like 2020, would you panic sell, hold, or buy more?")
10. Tax situation (rough bracket — helps optimize account placement)
11. Any specific sectors or companies they want to avoid (ESG, Big Tech, etc.)

RULES:
- Ask only ONE question at a time
- Keep responses SHORT — 1-2 sentences max
- Be warm and conversational, not robotic or stiff
- After 8-10 exchanges when you have sufficient information, end with EXACTLY this JSON on its own line:
  {"PORTFOLIO_READY": true}
- Do NOT generate the portfolio yourself — just signal when ready
- Monthly investment budget is already known: ${budget}
- Do not ask about monthly budget again

Start by greeting them warmly and asking their age and employment status in one natural question.`,
      messages: msgHistory.length > 0
        ? msgHistory.map(m => ({ role: m.role, content: m.content }))
        : [{ role: 'user', content: 'Hi, I want to start investing and building wealth.' }],
    });

    if (result?.error) throw new Error(result.error.message || 'Claude API error');
    const text = result?.content?.[0]?.text || '';
    if (!text) throw new Error('No response from AI. Please try again.');

    if (text.includes('"PORTFOLIO_READY": true')) {
      return res.json({
        message: text.replace(/\{"PORTFOLIO_READY":\s*true\}/g, '').trim() ||
          "Perfect, I have everything I need! Let me build your personalized US portfolio now...",
        done: true,
      });
    }

    res.json({ message: text, done: false });
  } catch (e) {
    console.error('[us-portfolio/chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/us-portfolio/generate — generate full US portfolio from conversation
app.post('/api/us-portfolio/generate', async (req, res) => {
  const { messages, monthlyBudget, payFrequency = 'monthly' } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Investor' : 'Advisor'}: ${m.content}`)
    .join('\n');

  try {
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0,
      system: `You are a fiduciary US financial advisor (CFP-level knowledge). Based on the intake conversation, generate a comprehensive, personalized portfolio recommendation for a US investor.

Return ONLY valid JSON matching this EXACT schema (no markdown, no explanation):
{
  "summary": "3-4 sentence personalized overview referencing their specific situation, goals, and timeline",
  "investorProfile": {
    "age": number,
    "employmentType": "W-2|Self-Employed|Retired|Student",
    "goal": "string",
    "horizon": "string",
    "riskLabel": "Conservative|Moderate|Aggressive|Very Aggressive",
    "taxBracket": "10%|12%|22%|24%|32%|35%|37%",
    "accountStrategy": "Roth IRA first|401k match first|Taxable brokerage|HSA maximization|Mixed",
    "keyConsiderations": ["string", "string", "string"]
  },
  "riskAssessment": {
    "label": "string",
    "score": number,
    "expectedAnnualReturn": "X-Y%",
    "maxDrawdown": "X-Y%",
    "volatility": "Low|Moderate|High|Very High",
    "suitability": "one sentence"
  },
  "accountPlan": [
    {
      "accountType": "401k|Roth IRA|Traditional IRA|HSA|529|Taxable Brokerage",
      "monthlyContribution": number,
      "annualLimit": number,
      "priority": number,
      "taxBenefit": "Pre-tax growth|Tax-free growth|Tax deduction|Taxable",
      "rationale": "one sentence why this account type for this investor"
    }
  ],
  "holdings": [
    {
      "ticker": "string",
      "name": "full ETF or fund name",
      "type": "ETF|Index Fund|Bond ETF|REIT|Sector ETF|Crypto ETF",
      "allocation": number,
      "monthlyAmount": number,
      "expenseRatio": "0.XX%",
      "expectedReturn": "X-Y% p.a.",
      "dividendYield": "X.X%",
      "accountPlacement": "Roth IRA|401k|Taxable|HSA",
      "assetClass": "US Equity|International Equity|Bonds|Real Estate|Commodities|Cash",
      "pros": ["string", "string"],
      "cons": ["string"],
      "rationale": "2 sentence personalized rationale referencing their goal and situation"
    }
  ],
  "assetAllocation": {
    "usEquity": number,
    "internationalEquity": number,
    "bonds": number,
    "realEstate": number,
    "commodities": number,
    "cash": number
  },
  "monthlyPlan": {
    "total": number,
    "breakdown": [
      { "account": "string", "ticker": "string", "amount": number, "frequency": "Monthly|Bi-weekly|Weekly" }
    ]
  },
  "taxStrategy": {
    "accountPlacementStrategy": "2 sentences on what goes in Roth vs 401k vs taxable",
    "taxLossHarvesting": "specific advice on when and how to tax-loss harvest",
    "rothConversion": "advice on Roth conversion ladder if applicable",
    "capitalGains": "advice on long-term vs short-term gains management"
  },
  "retirementProjection": {
    "monthlyContribution": number,
    "currentAge": number,
    "retirementAge": 65,
    "projectedBalance": number,
    "assumedReturn": "X%",
    "monthlyRetirementIncome": number,
    "socialSecurityEstimate": number,
    "totalMonthlyInRetirement": number
  },
  "rebalancing": {
    "frequency": "Quarterly|Semi-annually|Annually",
    "method": "Threshold-based|Calendar-based|Contribution-based",
    "instructions": "specific step-by-step rebalancing instructions"
  },
  "emergencyFund": {
    "status": "Adequate|Needs building|Critical",
    "targetAmount": number,
    "recommendation": "specific advice"
  },
  "redFlags": ["specific risk or concern from their situation"],
  "milestones": [
    { "timeframe": "string", "goal": "string", "amount": number }
  ],
  "nextSteps": ["specific action 1", "specific action 2", "specific action 3", "specific action 4"]
}`,
      messages: [{
        role: 'user',
        content: `Here is the full intake conversation:

${transcript}

Monthly investment budget: $${Number(monthlyBudget).toLocaleString()} (pay frequency: ${payFrequency})
Current date: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
Market context: US market 2026, Fed rate environment, S&P 500 around 5,500.

Generate a comprehensive, highly personalized portfolio. Make all monthly amounts add up to exactly $${Number(monthlyBudget).toLocaleString()}. Include 5-8 specific ETF/fund tickers. Reference their specific goals and situation throughout.`,
      }],
    });

    res.json(result);
  } catch (e) {
    console.error('[us-portfolio/generate]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET/POST /us-portfolio/:userId — save and load US portfolio
app.get('/us-portfolio/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('us_portfolio_recommendations')
      .select('result, monthly_budget, pay_frequency, updated_at')
      .eq('user_id', req.params.userId)
      .single();
    if (error && error.code === 'PGRST116') return res.json({ portfolio: null });
    if (error) throw error;
    res.json({
      portfolio: data?.result ? {
        result:        data.result,
        monthlyBudget: data.monthly_budget,
        payFrequency:  data.pay_frequency,
        savedAt:       data.updated_at,
      } : null
    });
  } catch (e) {
    console.error('[us-portfolio GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/us-portfolio/:userId', async (req, res) => {
  try {
    const { portfolio } = req.body;
    if (!portfolio?.result) return res.status(400).json({ error: 'result required' });
    const { error } = await supabase
      .from('us_portfolio_recommendations')
      .upsert({
        user_id:        req.params.userId,
        result:         portfolio.result,
        monthly_budget: portfolio.monthlyBudget,
        pay_frequency:  portfolio.payFrequency || 'monthly',
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[us-portfolio POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/us-portfolio/:userId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('us_portfolio_recommendations')
      .delete()
      .eq('user_id', req.params.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[us-portfolio DELETE]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Quarterly Financials ────────────────────────────────────────────────────

function calcYoY(current, prior) {
  if (current == null || prior == null || prior === 0) return null;
  return parseFloat(((current - prior) / Math.abs(prior) * 100).toFixed(1));
}

// US — Quarterly Financials via Financial Modeling Prep (FMP)
// Free tier: 250 req/day, no IP blocks, works from Railway
// Get free key at: https://financialmodelingprep.com/developer/docs/
const FMP_KEY = process.env.FMP_API_KEY || 'SOfbx10EQBKh8R5HLptRDLxt7A3nAGxl';

// FMP cache — avoid re-fetching same ticker on same day (saves quota)
const fmpCache = new Map();
const FMP_TTL  = 6 * 60 * 60 * 1000; // 6 hours

async function fmpGet(path) {
  const sep      = path.includes('?') ? '&' : '?';
  const fullPath = `${path}${sep}apikey=${FMP_KEY}`;
  const cached   = fmpCache.get(fullPath);
  if (cached && Date.now() - cached.ts < FMP_TTL) return cached.data;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'financialmodelingprep.com',
      path: fullPath,
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'QuAIntSignal/1.0' },
    }, response => {
      let data = '';
      response.on('data', c => (data += c));
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // FMP returns { 'Error Message': '...' } on bad key or limit hit
          if (parsed?.['Error Message']) {
            console.error('[fmpGet] FMP error:', parsed['Error Message'], 'path:', path);
            resolve(null);
            return;
          }
          if (parsed?.['Note']) {
            console.error('[fmpGet] FMP note (rate limit?):', parsed['Note']);
            resolve(null);
            return;
          }
          if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
            fmpCache.set(fullPath, { data: parsed, ts: Date.now() });
            resolve(parsed);
          } else {
            resolve(null);
          }
        } catch (e) {
          console.error('[fmpGet] parse error for', path, '- raw:', data.slice(0, 200));
          resolve(null);
        }
      });
    });
    req.on('error', e => { console.error('[fmpGet] request error:', e.message); resolve(null); });
    req.end();
  });
}

// Debug: see raw Finnhub financials structure
app.get('/debug/finnhub/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const data = await finnhubGet(`/stock/financials-reported?symbol=${ticker}&freq=quarterly`);
    res.json({
      totalReports: data?.data?.length,
      // Show period info for first 6 reports
      reports: (data?.data || []).slice(0, 6).map(r => ({
        period:    r.period,
        fp:        r.report?.fp,
        fy:        r.report?.fy,
        startDate: r.startDate,
        endDate:   r.endDate,
        year:      r.year,
        icCount:   r.report?.ic?.length,
      })),
    });
  } catch(e) { res.json({ error: e.message }); }
});

// US Quarterly Financials via Finnhub (free tier, already integrated)
// /stock/financials-reported → actual SEC-filed income statements
// /stock/earnings → EPS surprise history
app.get('/financials/us/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const [reported, earnings] = await Promise.all([
      finnhubGet(`/stock/financials-reported?symbol=${ticker}&freq=quarterly`),
      finnhubGet(`/stock/earnings?symbol=${ticker}`),
    ]);

    // Parse SEC-filed quarterly reports
    const reports = (reported?.data || []).slice(0, 8);

    const parseReport = (r) => {
      const ic = r.report?.ic || [];

      // Match by concept (XBRL tag) first — more reliable than label
      // Finnhub uses underscores: us-gaap_Revenues (not colons)
      const getByConcept = (...concepts) => {
        for (const c of concepts) {
          const item = ic.find(i => i.concept === c);
          if (item?.value != null) return item.value;
        }
        return null;
      };

      const revenue    = getByConcept(
        'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax',
        'us-gaap_Revenues', 'us-gaap_SalesRevenueNet',
        'us-gaap_RevenueFromContractWithCustomerIncludingAssessedTax',
        'us-gaap_NetRevenues', 'us-gaap_SalesRevenueGoodsNet',
        'us-gaap_SalesRevenueGoodsGross', 'us-gaap_RevenueFromContractWithCustomer'
      );
      const netIncome  = getByConcept(
        'us-gaap_NetIncomeLoss',
        'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic',
        'us-gaap_ProfitLoss', 'us-gaap_NetIncome'
      );
      const grossProfit = getByConcept('us-gaap_GrossProfit');
      const epsDiluted  = getByConcept(
        'us-gaap_EarningsPerShareDiluted',
        'us-gaap_EarningsPerShareBasic'
      );

      // Derive quarter from endDate month (no fp field in Finnhub)
      const endD   = new Date(r.endDate || r.period || '');
      const month  = endD.getMonth() + 1; // 1-12
      const qNum   = month <= 1 ? 'Q4' : month <= 4 ? 'Q1' : month <= 7 ? 'Q2' : 'Q3';
      const qYear  = r.year ?? endD.getFullYear();
      const period = !isNaN(endD) ? `${qNum} FY${qYear}` : null;

      return {
        period,
        endDate:  r.endDate?.slice(0, 10) ?? r.period?.slice(0, 10) ?? null,
        revenue,
        netIncome,
        grossProfit,
        epsDiluted,
        netMargin:   revenue && netIncome   ? parseFloat((netIncome   / revenue * 100).toFixed(2)) : null,
        grossMargin: revenue && grossProfit ? parseFloat((grossProfit / revenue * 100).toFixed(2)) : null,
      };
    };

    const allQ    = reports.map(parseReport).filter(q => q.revenue || q.netIncome);
    const quarters = allQ.slice(0, 4);

    // Annual = group by year from quarterly or use annual endpoint
    const annualReported = await finnhubGet(`/stock/financials-reported?symbol=${ticker}&freq=annual`).catch(() => ({ data: [] }));
    const annuals = (annualReported?.data || []).slice(0, 4).map(parseReport).filter(q => q.revenue || q.netIncome);

    const yoy = allQ.length >= 5 ? {
      revenueYoY:   calcYoY(allQ[0].revenue,   allQ[4]?.revenue),
      netIncomeYoY: calcYoY(allQ[0].netIncome,  allQ[4]?.netIncome),
      epsYoY:       calcYoY(allQ[0].epsDiluted, allQ[4]?.epsDiluted),
      netMarginYoY: allQ[0].netMargin != null && allQ[4]?.netMargin != null
        ? parseFloat((allQ[0].netMargin - allQ[4].netMargin).toFixed(2)) : null,
    } : {};

    // EPS beat/miss
    const epsHistory = (earnings || []).slice(0, 4).map(e => ({
      quarter:     e.period       ?? null,
      epsActual:   e.actual       ?? null,
      epsEstimate: e.estimate     ?? null,
      surprisePct: e.actual != null && e.estimate
        ? parseFloat(((e.actual - e.estimate) / Math.abs(e.estimate) * 100).toFixed(1)) : null,
      beat: (e.actual ?? 0) >= (e.estimate ?? 0),
    }));

    // Next earnings date
    const earningsCalendar = await finnhubGet(`/calendar/earnings?symbol=${ticker}&from=${new Date().toISOString().split('T')[0]}&to=${new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0]}`).catch(() => null);
    const nextEarnings = earningsCalendar?.earningsCalendar?.[0]?.date ?? null;

    if (!quarters.length && !annuals.length && !epsHistory.length) {
      return res.status(404).json({ error: `No financial data found for ${ticker}` });
    }

    res.json({ ticker, quarters, annuals, yoy, epsHistory, nextEarnings });
  } catch (e) {
    console.error('[financials/us]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Debug: test Screener.in response for India stocks


// India — Quarterly Financials via stock-nse-india getEquityCorporateInfo
// financial_results.data contains: income (Lakhs), proLossAftTax (Lakhs), reDilEPS, to_date
app.get('/financials/india/:symbol', async (req, res) => {
  const raw = req.params.symbol.toUpperCase().replace(/\.NS$/i, '');

  try {
    if (!nseIndia) return res.status(503).json({ error: 'NSE data service unavailable' });

    const corp = await nseIndia.getEquityCorporateInfo(raw);
    const frData = corp?.financial_results?.data || [];

    if (!frData.length) {
      return res.status(404).json({ error: `No financial results found for ${raw}` });
    }

    // Parse NSE financial results
    // Values are in LAKHS (×1e5 = INR absolute)
    const LAC = 1e5;
    const parseRow = (r) => {
      const revenue   = r.income           ? parseFloat(r.income)           * LAC : null;
      const netIncome = r.proLossAftTax    ? parseFloat(r.proLossAftTax)    * LAC : null;
      const pbt       = r.reProLossBefTax  ? parseFloat(r.reProLossBefTax)  * LAC : null;
      const expend    = r.expenditure      ? parseFloat(r.expenditure)      * LAC : null;
      const grossProfit = revenue && expend ? revenue - expend : null;
      const epsDiluted  = r.reDilEPS ? parseFloat(r.reDilEPS) : null;

      // Derive quarter label from to_date e.g. "31 Dec 2025" → Q3 FY2026
      let period = null;
      if (r.to_date) {
        const parts = r.to_date.split(' ');
        const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          .indexOf(parts[1]) + 1;
        const year  = parseInt(parts[2]);
        const q     = month <= 3 ? 'Q4' : month <= 6 ? 'Q1' : month <= 9 ? 'Q2' : 'Q3';
        const fy    = month <= 3 ? year : year + 1; // Indian FY: Apr-Mar
        period = `${q} FY${fy}`;
      }

      return {
        period,
        endDate:     r.to_date ?? null,
        audited:     r.audited ?? null,
        revenue,
        netIncome,
        grossProfit,
        epsDiluted,
        netMargin:   revenue && netIncome   ? parseFloat((netIncome   / revenue * 100).toFixed(2)) : null,
        grossMargin: revenue && grossProfit ? parseFloat((grossProfit / revenue * 100).toFixed(2)) : null,
      };
    };

    // Filter to non-cumulative quarterly results only
    const allQ = frData
      .filter(r => !r.cumulative || r.cumulative === 'Non-cumulative' || r.cumulative === null)
      .slice(0, 8)
      .map(parseRow)
      .filter(q => q.revenue || q.netIncome);

    const quarters = allQ.slice(0, 4);

    // YoY: compare q[0] to q[4] (same quarter last year)
    const yoy = allQ.length >= 5 ? {
      revenueYoY:   calcYoY(allQ[0].revenue,   allQ[4]?.revenue),
      netIncomeYoY: calcYoY(allQ[0].netIncome,  allQ[4]?.netIncome),
      epsYoY:       calcYoY(allQ[0].epsDiluted, allQ[4]?.epsDiluted),
      netMarginYoY: allQ[0].netMargin != null && allQ[4]?.netMargin != null
        ? parseFloat((allQ[0].netMargin - allQ[4].netMargin).toFixed(2)) : null,
    } : {};

    // EPS history via Finnhub
    let epsHistory = [];
    try {
      const earnings = await finnhubGet(`/stock/earnings?symbol=${raw}.NS`);
      if (Array.isArray(earnings) && earnings.length) {
        epsHistory = earnings.slice(0, 4).map(e => ({
          quarter:     e.period    ?? null,
          epsActual:   e.actual    ?? null,
          epsEstimate: e.estimate  ?? null,
          surprisePct: e.actual != null && e.estimate
            ? parseFloat(((e.actual - e.estimate) / Math.abs(e.estimate) * 100).toFixed(1)) : null,
          beat: (e.actual ?? 0) >= (e.estimate ?? 0),
        }));
      }
    } catch {}

    // No annual data from this endpoint — skip for now
    const annuals = [];

    res.json({ symbol: raw, quarters, annuals, yoy, epsHistory, nextEarnings: null });
  } catch (e) {
    console.error('[financials/india]', e.message);
    res.status(500).json({ error: e.message });
  }
});



// ─── US Sector Heatmap ───────────────────────────────────────────────────────
const US_SECTORS = [
  { symbol: 'XLK',  name: 'Technology',        color: '#4488ff' },
  { symbol: 'XLF',  name: 'Financials',         color: '#ff9a00' },
  { symbol: 'XLV',  name: 'Healthcare',         color: '#00ff88' },
  { symbol: 'XLE',  name: 'Energy',             color: '#ffaa00' },
  { symbol: 'XLI',  name: 'Industrials',        color: '#aa88ff' },
  { symbol: 'XLY',  name: 'Consumer Discret.',  color: '#ff6688' },
  { symbol: 'XLP',  name: 'Consumer Staples',   color: '#44ddcc' },
  { symbol: 'XLU',  name: 'Utilities',          color: '#88aaff' },
  { symbol: 'XLRE', name: 'Real Estate',        color: '#ffcc44' },
  { symbol: 'XLB',  name: 'Materials',          color: '#66dd88' },
  { symbol: 'XLC',  name: 'Comm. Services',     color: '#ff8844' },
];

const usSectorCache = { data: null, ts: 0 };
const US_SECTOR_TTL = 2 * 60 * 1000; // 2 min during market hours

app.get('/sectors/us', async (req, res) => {
  try {
    if (usSectorCache.data && Date.now() - usSectorCache.ts < US_SECTOR_TTL) {
      return res.json({ sectors: usSectorCache.data, cached: true });
    }
    const symbols = US_SECTORS.map(s => s.symbol).join(',');
    const data    = await tradierGet(`/v1/markets/quotes?symbols=${symbols}&greeks=false`);
    const raw     = data?.quotes?.quote || [];
    const quotes  = Array.isArray(raw) ? raw : [raw];
    const quoteMap = {};
    quotes.forEach(q => { quoteMap[q.symbol] = q; });

    const sectors = US_SECTORS.map(s => {
      const q = quoteMap[s.symbol];
      return {
        ...s,
        price:     q?.last     ? parseFloat(q.last)              : null,
        changePct: q?.change_percentage ? parseFloat(q.change_percentage) : null,
        change:    q?.change   ? parseFloat(q.change)            : null,
        volume:    q?.volume   ? parseInt(q.volume)              : null,
        week52High: q?.week_52_high ? parseFloat(q.week_52_high) : null,
        week52Low:  q?.week_52_low  ? parseFloat(q.week_52_low)  : null,
      };
    });

    usSectorCache.data = sectors;
    usSectorCache.ts   = Date.now();
    res.json({ sectors, cached: false });
  } catch (e) {
    console.error('[sectors/us]', e.message);
    if (usSectorCache.data) return res.json({ sectors: usSectorCache.data, stale: true });
    res.status(500).json({ error: e.message });
  }
});

// ─── Portfolio recommendation persistence ─────────────────────────────────────
app.get('/portfolio/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('portfolio_recommendations')
      .select('*')
      .eq('user_id', req.params.userId)
      .single();
    if (error && error.code === 'PGRST116') return res.json(null);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[portfolio GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/portfolio/:userId', async (req, res) => {
  const { result, sipAmount, language = 'en' } = req.body;
  if (!result) return res.status(400).json({ error: 'result required' });
  try {
    const { data, error } = await supabase
      .from('portfolio_recommendations')
      .upsert({
        user_id:    req.params.userId,
        language,
        sip_amount: sipAmount,
        result,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[portfolio POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/portfolio/:userId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('portfolio_recommendations')
      .delete()
      .eq('user_id', req.params.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('[portfolio DELETE]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── MFAPI proxy — search and NAV ────────────────────────────────────────────
app.get('/mf/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json([]);
  try {
    const data = await httpsGet('api.mfapi.in', `/mf/search?q=${encodeURIComponent(q)}`);
    res.json(Array.isArray(data) ? data.slice(0, 10) : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/mf/nav/:schemeCode', async (req, res) => {
  try {
    const data = await httpsGet('api.mfapi.in', `/mf/${req.params.schemeCode}/latest`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SIPs CRUD ────────────────────────────────────────────────────────────────
app.get('/sips/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sips')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[sips GET] Supabase error:', error.code, error.message, error.hint);
      throw error;
    }
    res.json(data || []);
  } catch (e) {
    console.error('[sips GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check for sips table
app.get('/sips-check', async (req, res) => {
  try {
    const { data, error } = await supabase.from('sips').select('count').limit(1);
    if (error) return res.json({ ok: false, error: error.message, code: error.code, hint: error.hint });
    res.json({ ok: true, message: 'sips table exists and is accessible' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/sips/:userId', async (req, res) => {
  const { name, amount, startDate, frequency } = req.body;

  // ── Field validation ──────────────────────────────────────────────────────
  if (!name || !amount || !startDate)
    return res.status(400).json({ error: 'Fund name, amount, and start date are required.' });

  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount < 100)
    return res.status(400).json({ error: 'Amount must be at least ₹100.' });
  if (parsedAmount > 10000000)
    return res.status(400).json({ error: 'Amount cannot exceed ₹1 Crore per SIP.' });

  const start = new Date(startDate);
  if (isNaN(start.getTime()))
    return res.status(400).json({ error: 'Invalid start date.' });
  const today = new Date(); today.setHours(0,0,0,0);
  const tenYearsAgo = new Date(today); tenYearsAgo.setFullYear(today.getFullYear() - 10);
  if (start > today)
    return res.status(400).json({ error: 'Start date cannot be in the future.' });
  if (start < tenYearsAgo)
    return res.status(400).json({ error: 'Start date cannot be more than 10 years ago.' });

  const validFrequencies = ['monthly', 'weekly', 'quarterly'];
  if (frequency && !validFrequencies.includes(frequency))
    return res.status(400).json({ error: 'Frequency must be monthly, weekly, or quarterly.' });

  // ── Ticker validation — must be a known NSE stock/ETF or mutual fund ──────
  const tickerName = name.trim().toUpperCase();
  const isKnownNSE = NSE_NAMES[tickerName] !== undefined;

  // Also allow common mutual fund names (free text) if they contain >= 3 words
  // or are in our known ETF list
  const ETF_SYMBOLS = [
    'NIFTYBEES','JUNIORBEES','SETFNN50','MOM100','MIDCAPETF','SENSEXETF','ICICINIFTY',
    'BANKBEES','ITBEES','PHARMABEES','INFRABEES','PSUBNKBEES','AUTOBEES','FMCGBEES',
    'GOLDBEES','SILVERETF','SETFGOLD','HDFCGOLD','LIQUIDBEES','LIQUIDETF','CPSEETF',
  ];
  const isKnownETF = ETF_SYMBOLS.includes(tickerName);

  // If it looks like a ticker (all caps, no spaces, <= 20 chars) it must be validated
  const looksLikeTicker = /^[A-Z0-9&-]{1,20}$/.test(tickerName);

  if (looksLikeTicker && !isKnownNSE && !isKnownETF) {
    // Try live NSE lookup as a last resort
    try {
      const q = await getNSEQuote(tickerName);
      if (!q || !q.price) {
        return res.status(400).json({
          error: `"${tickerName}" is not a recognised NSE stock or ETF. Please check the symbol and try again.`
        });
      }
    } catch {
      return res.status(400).json({
        error: `"${tickerName}" could not be verified on NSE. Please check the symbol and try again.`
      });
    }
  }

  // For mutual funds (name has spaces / multiple words) we trust the user
  // since we don't have a comprehensive MF name DB — just sanitise the input
  const sanitisedName = name.trim().slice(0, 100);

  // ── Duplicate check ───────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('sips').select('id')
    .eq('user_id', req.params.userId)
    .ilike('name', sanitisedName)
    .single();
  if (existing) return res.status(409).json({ error: `You already have a SIP for "${sanitisedName}".` });

  try {
    const { data, error } = await supabase
      .from('sips')
      .insert({ user_id: req.params.userId, name: sanitisedName, amount: parsedAmount, start_date: startDate, frequency: frequency || 'monthly' })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[sips POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/sips/:userId/:sipId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('sips')
      .delete()
      .eq('id', req.params.sipId)
      .eq('user_id', req.params.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('[sips DELETE]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Tiingo Historical Data ──────────────────────────────────────────────────
const TIINGO_TOKEN = process.env.TIINGO_TOKEN || '';

async function tiingoGet(path) {
  if (!TIINGO_TOKEN) return null;
  try {
    // Add token as query param (Tiingo requires this in addition to header)
    const sep      = path.includes('?') ? '&' : '?';
    const fullPath = `${path}${sep}token=${TIINGO_TOKEN}`;
    const data = await httpsGet('api.tiingo.com', fullPath, {
      'Content-Type':  'application/json',
      'Authorization': `Token ${TIINGO_TOKEN}`,
    });
    return data;
  } catch (e) {
    console.warn('[tiingo]', path.split('?')[0], e.message);
    return null;
  }
}

app.get('/tiingo/:ticker/history', async (req, res) => {
  if (!TIINGO_TOKEN) return res.status(503).json({ error: 'Tiingo not configured. Add TIINGO_TOKEN to Railway env vars.' });
  const { startDate, endDate } = req.query;
  const ticker = req.params.ticker.toUpperCase();
  try {
    const data = await tiingoGet(`/tiingo/daily/${ticker}/prices?startDate=${startDate || '2022-01-01'}&endDate=${endDate || new Date().toISOString().split('T')[0]}&resampleFreq=daily&sort=date`);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/tiingo/:ticker/fundamentals', async (req, res) => {
  if (!TIINGO_TOKEN) return res.status(503).json({ error: 'Tiingo not configured' });
  const ticker = req.params.ticker.toUpperCase();
  try {
    const data = await tiingoGet(`/tiingo/fundamentals/${ticker}/statements?startDate=2020-01-01&token=${TIINGO_TOKEN}`);
    const statements = data?.statementData || [];
    const quarterly = statements
      .filter(s => s.period === 'quarter')
      .slice(0, 12)
      .map(s => ({
        date:        s.date,
        period:      s.year + ' Q' + s.quarter,
        revenue:     s.overview?.revenue,
        netIncome:   s.overview?.netIncome,
        grossProfit: s.overview?.grossProfit,
        eps:         s.overview?.eps,
        operatingCF: s.cashFlow?.operatingCashFlow,
        capex:       s.cashFlow?.capitalExpenditures,
        totalAssets: s.balanceSheet?.totalAssets,
        totalDebt:   s.balanceSheet?.totalDebt,
        equity:      s.balanceSheet?.shareholderEquity,
      }));
    res.json(quarterly);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// 50+ tickers across all S&P 500 sectors for comprehensive backtesting
const DEFAULT_BACKTEST_TICKERS = [
  // Technology
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','INTC','CRM','ORCL','ADBE','QCOM','TXN','AVGO',
  // Financials
  'JPM','BAC','WFC','GS','MS','V','MA','AXP','BLK','C',
  // Healthcare
  'JNJ','UNH','PFE','MRK','ABBV','LLY','TMO','ABT','MDT','AMGN',
  // Consumer
  'PG','KO','PEP','WMT','COST','MCD','NKE','SBUX','HD','TGT',
  // Energy
  'XOM','CVX','COP','SLB','EOG',
  // Industrials
  'CAT','DE','BA','HON','GE','MMM','UPS','FDX',
  // Real Estate & Utilities
  'AMT','PLD','NEE','DUK',
  // Small/Mid cap for diversity
  'PLTR','SNOW','COIN','RIVN','LCID',
];

async function optimizeWeights(correlations, summary) {
  const factorNames = ['momentum','trend','rsi','macd','volume','revenue','quality','analyst','macro'];

  // Key insight: factors with NEGATIVE correlation should get LOWER weight (not higher).
  // A negative correlation means the factor predicts wrong — we should reduce its weight.
  // Factors with zero correlation (no data) get a small floor weight.
  // Formula: weight proportional to max(0, correlation) — negative factors get near-zero weight.

  const posCorr = {};
  let totalPos = 0;
  for (const f of factorNames) {
    const c = correlations[f] || 0;
    posCorr[f] = Math.max(0.005, c); // floor at 0.005 so no factor fully disappears
    totalPos += posCorr[f];
  }

  const currentWeights = await getSignalWeights() || {
    swing: { momentum:0.20, trend:0.15, rsi:0.10, macd:0.10, volume:0.05, revenue:0.15, quality:0.10, analyst:0.10, macro:0.05 }
  };

  const newSwing = {};
  for (const f of factorNames) {
    const dataWeight  = posCorr[f] / totalPos;
    const priorWeight = currentWeights.swing?.[f] || (1/factorNames.length);
    // Blend: 60% data-driven, 40% prior (more aggressive update)
    newSwing[f] = parseFloat((dataWeight * 0.6 + priorWeight * 0.4).toFixed(4));
  }

  // Re-normalize
  const tot = Object.values(newSwing).reduce((s,v)=>s+v,0);
  for (const f of factorNames) newSwing[f] = parseFloat((newSwing[f]/tot).toFixed(4));

  // Log which factors were penalized
  const penalized = factorNames.filter(f => (correlations[f]||0) < 0);
  console.log('[optimizer] penalized (negative correlation):', penalized);

  const newWeights = {
    swing:    newSwing,
    short:    { ...newSwing, momentum: Math.min(0.35, +(newSwing.momentum+0.05).toFixed(4)), revenue: Math.max(0.01, +(newSwing.revenue-0.03).toFixed(4)) },
    position: { ...newSwing, revenue: Math.min(0.30, +(newSwing.revenue+0.05).toFixed(4)),   momentum: Math.max(0.03, +(newSwing.momentum-0.05).toFixed(4)) },
    longterm: { ...newSwing, revenue: Math.min(0.35, +(newSwing.revenue+0.10).toFixed(4)),   momentum: Math.max(0.02, +(newSwing.momentum-0.08).toFixed(4)) },
  };

  await saveSignalWeights(newWeights, { summary, correlations, penalized, optimizedAt: new Date().toISOString() });
  console.log('[optimizer] weights updated:', newSwing);
  return newWeights;
}


async function runBacktest(tickers, startDate, endDate, market) {
  const results = [];
  // Fetch SPY as market regime indicator via Tradier
  let spyPrices = [];
  try {
    const spyData = await tradierGet(`/v1/markets/history?symbol=SPY&interval=daily&start=${startDate}&end=${endDate}`);
    spyPrices = (spyData?.history?.day || []).map(b => ({
      date: b.date, adjClose: b.close, close: b.close, volume: b.volume,
    }));
    console.log(`[backtest] SPY: got ${spyPrices.length} days`);
  } catch (e) { console.warn('[backtest] SPY fetch:', e.message); }

  console.log(`[backtest] Starting backtest: ${tickers.length} tickers from ${startDate} to ${endDate}`);
  for (const ticker of tickers) {
    try {
      const tradierHist = await tradierGet(`/v1/markets/history?symbol=${ticker}&interval=daily&start=${startDate}&end=${endDate}`);
      const prices = (tradierHist?.history?.day || []).map(b => ({
        date: b.date, adjClose: b.close, close: b.close, volume: b.volume,
      }));
      console.log(`[backtest] ${ticker}: got ${prices.length} days`);
      if (prices.length < 60) {
        console.warn(`[backtest] ${ticker}: insufficient data (${prices.length} days), skipping`);
        continue;
      }
      // Use Finnhub for fundamentals (already integrated, free, returns XBRL data)
      let quarters = [];
      try {
        const finnhubFund = await finnhubGet(`/stock/financials-reported?symbol=${ticker}&freq=quarterly`);
        quarters = (finnhubFund?.data || []).map(r => {
          const ic = r.report?.ic || [];
          const cf = r.report?.cf || [];
          const bs = r.report?.bs || [];
          const get = (arr, ...concepts) => {
            for (const c of concepts) {
              const item = arr.find(i => i.concept === c);
              if (item?.value != null) return item.value;
            }
            return null;
          };
          return {
            date:        r.endDate?.slice(0, 10) || r.period,
            revenue:     get(ic, 'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap_Revenues', 'us-gaap_SalesRevenueNet'),
            netIncome:   get(ic, 'us-gaap_NetIncomeLoss'),
            eps:         get(ic, 'us-gaap_EarningsPerShareDiluted', 'us-gaap_EarningsPerShareBasic'),
            operatingCF: get(cf, 'us-gaap_NetCashProvidedByUsedInOperatingActivities'),
            capex:       get(cf, 'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment'),
            equity:      get(bs, 'us-gaap_StockholdersEquity', 'us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'),
          };
        }).filter(q => q.revenue != null);
      } catch (e) { console.warn(`[backtest] finnhub fundamentals ${ticker}:`, e.message); }

      for (let i = 60; i < prices.length - 60; i++) {
        const date     = prices[i].date;
        const closeArr = prices.slice(0, i+1).map(p => p.adjClose || p.close);
        const cur      = closeArr[closeArr.length - 1];
        const sma20    = closeArr.slice(-20).reduce((s,v)=>s+v,0) / 20;
        const sma50    = closeArr.length >= 50  ? closeArr.slice(-50).reduce((s,v)=>s+v,0)/50   : null;
        const sma200   = closeArr.length >= 200 ? closeArr.slice(-200).reduce((s,v)=>s+v,0)/200 : null;

        // RSI14
        const gains = [], losses = [];
        for (let k = closeArr.length-14; k < closeArr.length; k++) {
          const d = closeArr[k] - closeArr[k-1];
          d > 0 ? gains.push(d) : losses.push(Math.abs(d));
        }
        const avgG = gains.reduce((s,v)=>s+v,0)/14, avgL = losses.reduce((s,v)=>s+v,0)/14;
        const rsi14 = avgL === 0 ? 100 : 100 - 100/(1+avgG/avgL);

        const volRatio = (() => {
          const rv = prices[i]?.volume || 0;
          const av = prices.slice(Math.max(0,i-20),i).reduce((s,p)=>s+(p.volume||0),0)/20;
          return av > 0 ? rv/av : 1;
        })();

        const availQ  = quarters.filter(q => q.date && new Date(q.date) <= new Date(date));
        const latestQ  = availQ[0];
        const yearAgoQ = availQ[4]; // same quarter prior year (approx)
        const revNow   = latestQ?.revenue;
        const revPrev  = yearAgoQ?.revenue;
        const revGrowth = revNow && revPrev ? ((revNow-revPrev)/Math.abs(revPrev)*100) : null;

        const ta = { sma20, sma50, sma200, rsi14: rsi14.toFixed(1), volumeRatio: volRatio, trendSignal: cur > (sma200||0) ? 'UPTREND' : 'DOWNTREND', macd: { cross: null, trend: cur > sma20 ? 'BULLISH' : 'BEARISH' } };
        const roe = latestQ?.netIncome && latestQ?.equity && latestQ.equity !== 0 ? latestQ.netIncome / latestQ.equity : null;
        const fundamentals = { roe };
        const financials = { yoy: { revenueYoY: revGrowth, netIncomeYoY: null, epsYoY: null } };

        const { signal, confidence, totalScore, scores } = computeSignal({ ohlcv: { close: closeArr }, ta, fundamentals, financials, enhanced: null, options: null, market, timeframeKey: 'swing', news: [] });

        const returns = {};
        for (const period of [5,20,60]) {
          if (i+period < prices.length) returns[`ret${period}d`] = ((prices[i+period].adjClose||prices[i+period].close) - cur) / cur * 100;
        }
        // Market regime: is SPY above its 200-day SMA at this date?
        const spyIdx = spyPrices.findIndex(p => p.date >= date);
        let bearMarket = false;
        if (spyIdx >= 200) {
          const spyCur  = spyPrices[spyIdx]?.adjClose || spyPrices[spyIdx]?.close;
          const spy200  = spyPrices.slice(spyIdx-200, spyIdx).reduce((s,p)=>s+(p.adjClose||p.close),0)/200;
          bearMarket = spyCur < spy200;
        }

        // Use 60-day returns — reduces noise, better matches position trade horizon
        const correct60d = returns.ret60d != null
          ? (signal==='BUY'&&returns.ret60d>3) || (signal==='SELL'&&returns.ret60d<-3) || (signal==='HOLD'&&Math.abs(returns.ret60d)<8)
          : null;
        // Also track 20d for comparison
        const correct20d = returns.ret20d != null
          ? (signal==='BUY'&&returns.ret20d>2) || (signal==='SELL'&&returns.ret20d<-2) || (signal==='HOLD'&&Math.abs(returns.ret20d)<5)
          : null;
        results.push({ ticker, date, signal, confidence, totalScore, scores, ...returns, correct20d, correct60d, bearMarket });
      }
      await new Promise(r => setTimeout(r, 300)); // Tradier rate limit: 200 req/min
    } catch (e) { console.warn(`[backtest] ${ticker}:`, e.message); }
  }

  const resolved = results.filter(r => r.correct60d != null);
  const accuracy = resolved.length ? resolved.filter(r=>r.correct60d).length / resolved.length : 0;
  const resolved20 = results.filter(r => r.correct20d != null);
  const accuracy20 = resolved20.length ? resolved20.filter(r=>r.correct20d).length / resolved20.length : 0;

  // Factor correlations with 20d return
  const factorNames = ['momentum','trend','rsi','macd','volume','revenue','quality','analyst','macro'];
  const factorCorrelations = {};
  for (const factor of factorNames) {
    const pairs = resolved.filter(r => r.scores?.[factor] != null && r.ret60d != null);
    if (pairs.length < 10) continue;
    const n=pairs.length, mx=pairs.reduce((s,r)=>s+r.scores[factor],0)/n, my=pairs.reduce((s,r)=>s+r.ret60d,0)/n;
    const cov=pairs.reduce((s,r)=>s+(r.scores[factor]-mx)*(r.ret60d-my),0)/n;
    const sdx=Math.sqrt(pairs.reduce((s,r)=>s+(r.scores[factor]-mx)**2,0)/n);
    const sdy=Math.sqrt(pairs.reduce((s,r)=>s+(r.ret60d-my)**2,0)/n);
    factorCorrelations[factor] = sdx&&sdy ? parseFloat((cov/(sdx*sdy)).toFixed(4)) : 0;
  }

  const bullSignals = resolved.filter(r => !r.bearMarket);
  const bearSignals = resolved.filter(r => r.bearMarket);
  const bullAccuracy = bullSignals.length ? bullSignals.filter(r=>r.correct60d).length/bullSignals.length : 0;
  const bearAccuracy = bearSignals.length ? bearSignals.filter(r=>r.correct60d).length/bearSignals.length : 0;

  const summary = {
    tickers: tickers.length, signals: results.length,
    resolved60d: resolved.length,   accuracy60d: (accuracy*100).toFixed(1)+'%',
    resolved20d: resolved20.length, accuracy20d: (accuracy20*100).toFixed(1)+'%',
    bullMarketAccuracy: (bullAccuracy*100).toFixed(1)+'%',
    bearMarketAccuracy: (bearAccuracy*100).toFixed(1)+'%',
    factorCorrelations,
    note: 'Correlations measured against 60-day forward returns',
  };

  if (resolved.length >= 50) {
    try {
      await supabase.from('backtest_results').insert({ run_at: new Date().toISOString(), market, start_date: startDate, end_date: endDate, summary, factor_correlations: factorCorrelations });
    } catch (e) { console.warn('[backtest] save error:', e.message); }
    await optimizeWeights(factorCorrelations, summary);
  }
  return { summary, factorCorrelations };
}


// GET trigger for browser — no CORS issues
app.get('/backtest/trigger', async (req, res) => {
  const startDate = req.query.startDate || '2020-01-01';
  const market    = req.query.market    || 'US';
  res.json({ message: 'Backtest started', tickers: DEFAULT_BACKTEST_TICKERS.length, startDate });
  runBacktest(DEFAULT_BACKTEST_TICKERS, startDate, new Date().toISOString().split('T')[0], market)
    .then(r => console.log('[backtest] complete:', r.summary))
    .catch(e => console.error('[backtest] error:', e.message));
});

app.post('/backtest/run', async (req, res) => {
  const { tickers, startDate = '2020-01-01', endDate, market = 'US' } = req.body;
  // Use comprehensive default list if none provided
  const tickerList = (tickers && tickers.length > 0) ? tickers : DEFAULT_BACKTEST_TICKERS;
  res.json({ message: 'Backtest started in background', tickers: tickerList.length, startDate, endDate: endDate || 'today' });
  runBacktest(tickerList, startDate, endDate || new Date().toISOString().split('T')[0], market)
    .then(r => console.log('[backtest] complete:', r.summary))
    .catch(e => console.error('[backtest] error:', e.message));
});



app.get('/backtest/weights', async (req, res) => {
  try { const w = await getSignalWeights(); res.json({ weights: w, hasOptimized: !!w }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/backtest/results', async (req, res) => {
  try {
    const { data } = await supabase.from('backtest_results').select('*').order('run_at', { ascending: false }).limit(5);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ─── Social Sentiment Screener ────────────────────────────────────────────────
// Aggregates Reddit WSB + StockTwits + Finnhub + Yahoo trending
// Returns ticker mention counts + sentiment for bubble chart

const socialCache = { data: null, ts: 0 };
const SOCIAL_TTL  = 15 * 60 * 1000; // 15 minutes

async function fetchSocialSentiment() {
  const tickers = {};

  const SKIP_WORDS = new Set([
    // Finance acronyms
    'DD','WSB','CEO','IPO','ETF','OTM','ATM','ITM','PUT','CALL','THE','AND','FOR',
    'NOT','ARE','YOU','NOW','ALL','NEW','GET','OUT','CAN','HAS','ITS','YTD','EPS',
    'PE','AI','IV','SEC','GDP','CPI','USA','USD','EUR','GBP','JPY','FED','IMF',
    'WHO','WTO','NATO','US','UK','EU','PMI','NFP','ISM','APR','AUG','JAN','FEB',
    'MAR','MAY','JUN','JUL','SEP','OCT','NOV','DEC',
    // Reddit slang / common words mistaken for tickers
    'EDIT','TLDR','IMO','FWIW','HODL','YOLO','APE','MOON','BEAR','BULL',
    'GAIN','LOSS','LOL','OMG','WTF','BUY','SELL','HOLD','RIP','GG','EZ',
    'FOMO','BTFD','DYOR','NFA','EOD','EOW','ATH','YOY','QOQ','MOM',
    'LMAO','LMFAO','SMH','TBH','TIL','IIRC','AFAIK','ETA','FYI','PSA',
    'OP','OG','DM','PM','MOD','SUB','LONG','SHORT','PUTS','CALLS',
    'CASH','DEBT','RISK','FUND','BANK','RATE','BOND','LOAN','LOSS','SAVE',
    'HIGH','LOWW','OPEN','NOPE','NEXT','LAST','BEST','ONLY','JUST','ALSO',
    'GOOD','VERY','REAL','BACK','DOWN','STAY','SAFE','SURE','NEED','WANT',
  ]);

  const addTicker = (symbol, source, bullish = null, mentions = 1) => {
    if (!symbol) return;
    const s = symbol.toUpperCase().replace(/[^A-Z]/g, '');
    if (!s || s.length < 2 || s.length > 5) return;
    if (SKIP_WORDS.has(s)) return;
    if (!tickers[s]) tickers[s] = { symbol: s, mentions: 0, bullish: 0, bearish: 0, sources: new Set() };
    tickers[s].mentions  += mentions;
    tickers[s].sources.add(source);
    if (bullish === true)  tickers[s].bullish++;
    if (bullish === false) tickers[s].bearish++;
  };

  // ── 1. StockTwits trending ────────────────────────────────────────────────
  try {
    const st = await httpsGet('api.stocktwits.com', '/api/2/trending/symbols.json?limit=30', {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });
    const symbols = st?.response?.symbols || [];
    for (const s of symbols) {
      const title  = (s.title || s.symbol || '').toLowerCase();
      const bull   = title.includes('bull') || title.includes('call') || title.includes('breakout');
      const bear   = title.includes('bear') || title.includes('put')  || title.includes('crash');
      const weight = s.watchlist_count ? Math.max(2, Math.floor(s.watchlist_count / 5000)) : 2;
      addTicker(s.symbol, 'stocktwits', bull ? true : bear ? false : null, weight);
    }
    console.log(`[social] StockTwits: ${symbols.length} tickers`);
  } catch (e) { console.warn('[social] StockTwits failed:', e.message); }

  // ── 2. Reddit — 4 subreddits ─────────────────────────────────────────────
  const REDDIT_SUBS = [
    { sub: 'wallstreetbets', source: 'reddit_wsb',   limit: 50 },
    { sub: 'stocks',         source: 'reddit_stocks',limit: 25 },
    { sub: 'investing',      source: 'reddit_inv',   limit: 20 },
    { sub: 'options',        source: 'reddit_opts',  limit: 20 },
  ];
  for (const { sub, source, limit } of REDDIT_SUBS) {
    try {
      const data = await httpsGet('www.reddit.com', `/r/${sub}/hot.json?limit=${limit}&raw_json=1`, {
        'User-Agent': 'Mozilla/5.0 (compatible; QuAIntSignal/2.0; +https://quaint-signal.tech)',
        'Accept': 'application/json',
      });
      const posts = data?.data?.children || [];
      const tickerRe = /\b([A-Z]{2,5})\b/g;
      let found = 0;
      for (const post of posts) {
        const title   = post.data?.title || '';
        const flair   = (post.data?.link_flair_text || '').toLowerCase();
        const upvotes = post.data?.ups || 0;
        const bull = flair.includes('bull') || title.toLowerCase().includes('moon') || title.toLowerCase().includes('calls');
        const bear = flair.includes('bear') || title.toLowerCase().includes('puts')  || title.toLowerCase().includes('short');
        const weight = Math.max(1, Math.ceil(upvotes / 200));
        const matches = [...title.matchAll(tickerRe)].map(m => m[1]).filter(t => !SKIP_WORDS.has(t));
        for (const ticker of matches) { addTicker(ticker, source, bull ? true : bear ? false : null, weight); found++; }
      }
      console.log(`[social] Reddit r/${sub}: ${posts.length} posts, ${found} mentions`);
      await sleep(300);
    } catch (e) { console.warn(`[social] Reddit r/${sub} failed:`, e.message); }
  }

  // ── 3. Finnhub company news — free tier, derive sentiment from headlines ──
  const WATCH_TICKERS = [
    'AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','AMD','PLTR','COIN',
    'MSTR','MARA','RIOT','HOOD','SPY','QQQ','NFLX','AVGO','LLY','JPM',
  ];
  try {
    const from = new Date(Date.now() - 2*24*3600*1000).toISOString().split('T')[0];
    const to   = new Date().toISOString().split('T')[0];
    const BULL_WORDS = ['beat','surge','rally','breakout','upgrade','strong','growth','record'];
    const BEAR_WORDS = ['miss','plunge','crash','downgrade','weak','loss','concern','tumble'];
    for (const ticker of WATCH_TICKERS) {
      try {
        const news     = await finnhubGet(`/company-news?symbol=${ticker}&from=${from}&to=${to}`);
        const articles = Array.isArray(news) ? news : [];
        if (!articles.length) continue;
        let bull = 0, bear = 0;
        for (const a of articles) {
          const h = (a.headline || '').toLowerCase();
          if (BULL_WORDS.some(w => h.includes(w))) bull++;
          if (BEAR_WORDS.some(w => h.includes(w))) bear++;
        }
        addTicker(ticker, 'finnhub', bull > bear ? true : bear > bull ? false : null, Math.min(articles.length, 8));
      } catch {}
      await sleep(60);
    }
    console.log('[social] Finnhub news: done');
  } catch (e) { console.warn('[social] Finnhub failed:', e.message); }

  // ── 4. Yahoo Finance trending ─────────────────────────────────────────────
  try {
    for (const host of YAHOO_HOSTS) {
      try {
        const data = await httpsGet(host, '/v1/finance/trending/US?count=25', YAHOO_HEADERS);
        const quotes = data?.finance?.result?.[0]?.quotes || [];
        for (const q of quotes) {
          if (q.symbol && !q.symbol.includes('.') && !q.symbol.includes('='))
            addTicker(q.symbol, 'yahoo', null, 3);
        }
        console.log(`[social] Yahoo trending: ${quotes.length} tickers`);
        break;
      } catch { continue; }
    }
  } catch (e) { console.warn('[social] Yahoo trending failed:', e.message); }

  // ── 5. Yahoo most active — price change = sentiment signal ────────────────
  try {
    for (const host of YAHOO_HOSTS) {
      try {
        const data = await httpsGet(host, '/v1/finance/screener/predefined/saved?formatted=false&scrIds=most_actives&count=20', YAHOO_HEADERS);
        const quotes = data?.finance?.result?.[0]?.quotes || [];
        for (const q of quotes) {
          if (!q.symbol || q.symbol.includes('.') || q.symbol.includes('=')) continue;
          const pct  = q.regularMarketChangePercent || 0;
          addTicker(q.symbol, 'yahoo_active', pct > 1 ? true : pct < -1 ? false : null, 4);
        }
        console.log(`[social] Yahoo most active: ${quotes.length} tickers`);
        break;
      } catch { continue; }
    }
  } catch (e) { console.warn('[social] Yahoo most active failed:', e.message); }

  // ── Normalize + score ─────────────────────────────────────────────────────
  // Filter noise — must have ≥2 mentions or appear in multiple sources
  const KNOWN_TICKERS = new Set([
    'AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','GOOG','AMD','NFLX',
    'PLTR','COIN','MSTR','MARA','RIOT','HOOD','SOFI','GME','AMC','BB',
    'SPY','QQQ','IWM','GLD','SOXL','TQQQ','ARKK','INTC','MU','AVGO',
    'SMCI','NET','CRWD','DDOG','SNOW','SHOP','UBER','LYFT','ABNB','RDDT',
    'ARM','AMAT','LRCX','KLAC','QCOM','TXN','ORCL','CRM','ADBE','NOW',
    'RKLB','LUNR','ASTS','JOBY','ACHR','OKLO','SMR','NNE','IONQ','RGTI',
    'LLY','ABBV','PFE','MRNA','BNTX','NVAX','GILD','REGN','VRTX','AMGN',
    'JPM','BAC','GS','MS','WFC','BX','KKR','V','MA','PYPL','SQ',
    'TSLA','RIVN','LCID','NIO','XPEV','LI','GM','F','STLA',
    'XOM','CVX','OXY','SLB','FCX','NEM','GOLD','MP',
    'DIS','NFLX','SPOT','SNAP','PINS','RDDT','RBLX','TTWO',
  ]);

  const maxMentions = Math.max(...Object.values(tickers).map(t => t.mentions), 1);
  const result = Object.values(tickers)
    .filter(t => {
      if (KNOWN_TICKERS.has(t.symbol)) return t.mentions >= 1;
      // Unknown tickers: need 3+ mentions from 2+ distinct sources to avoid false positives like RIP, GG etc.
      return t.mentions >= 3 && t.sources.size >= 2;
    })
    .map(t => {
      const total     = t.bullish + t.bearish;
      const sentiment = total > 0 ? (t.bullish - t.bearish) / total : 0; // -1 to +1
      return {
        symbol:       t.symbol,
        mentions:     t.mentions,
        normalizedSize: t.mentions / maxMentions, // 0-1 for bubble size
        sentiment,    // -1 bearish, 0 neutral, +1 bullish
        bullPct:      total > 0 ? Math.round(t.bullish / total * 100) : null,
        bearPct:      total > 0 ? Math.round(t.bearish / total * 100) : null,
        sources:      [...t.sources],
      };
    })
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 40); // top 40

  return result;
}

app.get('/social/trending', async (req, res) => {
  try {
    if (socialCache.data && Date.now() - socialCache.ts < SOCIAL_TTL) {
      return res.json({ tickers: socialCache.data, cached: true, cachedAt: socialCache.ts });
    }
    const data = await fetchSocialSentiment();
    socialCache.data = data;
    socialCache.ts   = Date.now();
    res.json({ tickers: data, cached: false });
  } catch (e) {
    console.error('[social/trending]', e.message);
    if (socialCache.data) return res.json({ tickers: socialCache.data, cached: true, stale: true });
    res.status(500).json({ error: e.message });
  }
});

// Warm social cache on startup
setTimeout(() => {
  fetchSocialSentiment()
    .then(data => { socialCache.data = data; socialCache.ts = Date.now(); console.log(`[social] warmed: ${data.length} tickers`); })
    .catch(e => console.warn('[social] warm failed:', e.message));
}, 5000);


// ─── Unusual Activity Screener ────────────────────────────────────────────────
// Scans 80 tickers for volume spikes, options flow anomalies, news velocity
// Cached 30 minutes — runs in background

const unusualCache = { US: { data: null, ts: 0 }, INDIA: { data: null, ts: 0 } };
const UNUSUAL_TTL  = 30 * 60 * 1000;

const SCREEN_TICKERS_US = [
  'AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','AMD','AVGO','LLY',
  'PLTR','COIN','MSTR','MARA','RIOT','HOOD','SOFI','GME','AMC','RDDT',
  'DDOG','NET','CRWD','SNOW','MNDY','GTLB','BILL','RKLB','ASTS','LUNR',
  'JPM','GS','BAC','XOM','CVX','OXY','ABBV','PFE','MRNA','NFLX',
  'INTC','MU','QCOM','ARM','AMAT','LRCX','KLAC','SMCI','IONQ','RGTI',
  'RIVN','LCID','NIO','JOBY','ACHR','OKLO','SMR','NNE',
  'SPY','QQQ','IWM','GLD','TLT','SOXL','TQQQ','ARKK','XLK','XLE',
  'DIS','SHOP','UBER','ABNB','SNAP','PINS','RBLX','U','SQ','PYPL',
];

const SCREEN_TICKERS_INDIA = [
  // Nifty 50 large cap
  'RELIANCE','TCS','HDFCBANK','ICICIBANK','INFOSYS','BHARTIARTL','SBIN','LT',
  'HINDUNILVR','ITC','KOTAKBANK','AXISBANK','BAJFINANCE','WIPRO','HCLTECH',
  // High-beta / momentum
  'ADANIPORTS','ADANIENT','TATAMOTORS','BAJAJFINSV','ZOMATO','PAYTM',
  'NYKAA','IRCTC','DELHIVERY','POLICYBZR',
  // Mid-cap quality
  'PERSISTENT','COFORGE','KPITTECH','DIXON','POLYCAB','TIINDIA','APARINDS',
  'ANGELONE','MFSL','CDSL',
  // Sector leaders
  'SUNPHARMA','DRREDDY','TITAN','ASIANPAINT','MARUTI','ULTRACEMCO',
  'POWERGRID','NTPC','ONGC','COALINDIA',
];

async function fetchUnusualActivity(market = 'US') {
  const results = [];
  const from = new Date(Date.now() - 2*24*3600*1000).toISOString().split('T')[0];
  const to   = new Date().toISOString().split('T')[0];

  // Batch fetch quotes from Tradier (volume data)
  const tickerList    = market === 'INDIA' ? SCREEN_TICKERS_INDIA : SCREEN_TICKERS_US;
  const uniqueTickers = [...new Set(tickerList)].filter(t => !t.includes('='));
  let quotes = {};
  try {
    if (market === 'INDIA') {
      // NSE quotes via getNSEQuote — returns price, changePct, volume, high, low, weekHigh52, weekLow52
      // Batch all fetches in parallel for speed
      const nseResults = await Promise.allSettled(
        uniqueTickers.slice(0, 30).map(ticker => getNSEQuote(ticker).then(q => ({ ticker, q })))
      );
      for (const r of nseResults) {
        if (r.status !== 'fulfilled' || !r.value?.q?.price) continue;
        const { ticker, q } = r.value;
        quotes[ticker] = {
          symbol:              ticker,
          last:                q.price,
          change_percentage:   q.changePct || 0,
          volume:              q.volume    || 0,
          average_volume:      q.volume    || 1, // NSE doesn't give avg vol - volRatio not used for India
          fifty_two_week_high: q.weekHigh52  || q.high  || 0,
          fifty_two_week_low:  q.weekLow52   || q.low   || 0,
        };
      }
      console.log(`[unusual/india] fetched ${Object.keys(quotes).length} NSE quotes`);
    } else {
      const batches = [];
      for (let i = 0; i < uniqueTickers.length; i += 20) batches.push(uniqueTickers.slice(i, i + 20));
      for (const batch of batches) {
        const q = await tradierGet(`/v1/markets/quotes?symbols=${batch.join(',')}&greeks=false`);
        const raw = q?.quotes?.quote || [];
        (Array.isArray(raw) ? raw : [raw]).forEach(q => { if (q?.symbol) quotes[q.symbol] = q; });
        await sleep(100);
      }
    }
  } catch (e) { console.warn('[unusual] quotes failed:', e.message); }

  // Fetch news counts from Finnhub — US only (Finnhub doesn't support NSE symbols)
  const newsCount = {};
  if (market !== 'INDIA') {
    for (const ticker of uniqueTickers.slice(0, 40)) {
      try {
        const news = await finnhubGet(`/company-news?symbol=${ticker}&from=${from}&to=${to}`);
        newsCount[ticker] = Array.isArray(news) ? news.length : 0;
      } catch {}
      await sleep(60);
    }
  }

  // Score each ticker
  for (const ticker of uniqueTickers) {
    const q = quotes[ticker];
    if (!q) continue;

    const signals = [];
    let score = 0;

    // 1. Volume spike — compare today's volume to average volume
    const vol     = parseInt(q.volume)        || 0;
    const avgVol  = parseInt(q.average_volume) || parseInt(q.volume) || 1;
    const volRatio = vol / avgVol;

    const volHigh = market === 'INDIA' ? 3 : 5;
    const volMed  = market === 'INDIA' ? 2 : 3;
    const volLow  = market === 'INDIA' ? 1.5 : 2;
    if (volRatio >= volHigh)     { signals.push({ type: 'VOLUME', label: `${volRatio.toFixed(1)}x avg volume`, severity: 'high' });   score += 3; }
    else if (volRatio >= volMed) { signals.push({ type: 'VOLUME', label: `${volRatio.toFixed(1)}x avg volume`, severity: 'medium' }); score += 2; }
    else if (volRatio >= volLow) { signals.push({ type: 'VOLUME', label: `${volRatio.toFixed(1)}x avg volume`, severity: 'low' });    score += 1; }

    // 2. Price move — India stocks are more volatile, lower threshold
    const pct = parseFloat(q.change_percentage) || 0;
    const priceThreshold = market === 'INDIA' ? 3 : 5;
    const volThreshold   = market === 'INDIA' ? 1 : 2; // India avg vol unreliable
    if (Math.abs(pct) >= priceThreshold && volRatio >= volThreshold) {
      signals.push({ type: 'PRICE', label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% on volume`, severity: Math.abs(pct) >= 8 ? 'high' : 'medium' });
      score += Math.abs(pct) >= 8 ? 3 : 2;
    } else if (market === 'INDIA' && Math.abs(pct) >= 2) {
      // For India: any notable % move is a signal — pChange is the most reliable NSE data
      const sev = Math.abs(pct) >= 5 ? 'high' : 'medium';
      signals.push({ type: 'PRICE', label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% move`, severity: sev });
      score += Math.abs(pct) >= 5 ? 3 : 2;
    }

    // 3. News velocity
    const articles = newsCount[ticker] || 0;
    if (articles >= 8)      { signals.push({ type: 'NEWS', label: `${articles} articles today`, severity: 'high' });   score += 2; }
    else if (articles >= 4) { signals.push({ type: 'NEWS', label: `${articles} articles today`, severity: 'medium' }); score += 1; }

    // 4. 52-week high/low proximity
    const price  = parseFloat(q.last) || 0;
    const high52 = parseFloat(q.fifty_two_week_high) || 0;
    const low52  = parseFloat(q.fifty_two_week_low)  || 0;
    if (high52 && price >= high52 * 0.99) {
      signals.push({ type: 'BREAKOUT', label: '52W high breakout', severity: 'high' });
      score += 3;
    } else if (low52 && price <= low52 * 1.01) {
      signals.push({ type: 'BREAKDOWN', label: '52W low breakdown', severity: 'high' });
      score += 3;
    }

    if (signals.length === 0) continue;

    results.push({
      ticker,
      price:      parseFloat(q.last)              || 0,
      changePct:  parseFloat(q.change_percentage)  || 0,
      volume:     vol,
      avgVolume:  avgVol,
      volRatio:   parseFloat(volRatio.toFixed(1)),
      newsCount:  newsCount[ticker] || 0,
      signals,
      score,
    });
  }

  // Sort by absolute % change descending — biggest movers first
  results.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  return results.slice(0, 20);
}

app.get('/unusual/activity', async (req, res) => {
  const market = (req.query.market || 'US').toUpperCase();
  const cache  = unusualCache[market] || unusualCache.US;
  try {
    if (cache.data && Date.now() - cache.ts < UNUSUAL_TTL) {
      return res.json({ tickers: cache.data, cached: true, cachedAt: cache.ts });
    }
    const data = await fetchUnusualActivity(market);
    cache.data = data; cache.ts = Date.now();
    res.json({ tickers: data, cached: false });
  } catch (e) {
    console.error('[unusual/activity]', e.message);
    if (cache.data) return res.json({ tickers: cache.data, cached: true, stale: true });
    res.status(500).json({ error: e.message });
  }
});

// ─── Sector Rotation Signal ───────────────────────────────────────────────────
const sectorCache = { data: null, ts: 0 };
const SECTOR_TTL  = 30 * 60 * 1000;

const SECTOR_LIST = [
  { name: 'Technology',    etf: 'XLK',  tickers: ['AAPL','MSFT','NVDA','AMD','AVGO','INTC','QCOM','TXN','AMAT','MU'] },
  { name: 'Financials',    etf: 'XLF',  tickers: ['JPM','BAC','GS','MS','WFC','BX','KKR','V','MA','AXP'] },
  { name: 'Healthcare',    etf: 'XLV',  tickers: ['LLY','ABBV','UNH','PFE','MRK','AMGN','GILD','REGN','VRTX','BMY'] },
  { name: 'Energy',        etf: 'XLE',  tickers: ['XOM','CVX','OXY','SLB','COP','EOG','PSX','VLO','MPC','HAL'] },
  { name: 'Consumer Disc', etf: 'XLY',  tickers: ['AMZN','TSLA','HD','MCD','NKE','LOW','SBUX','TJX','BKNG','CMG'] },
  { name: 'Industrials',   etf: 'XLI',  tickers: ['GE','CAT','RTX','HON','UNP','DE','LMT','BA','MMM','ITW'] },
  { name: 'Crypto/Alt',    etf: 'MSTR', tickers: ['MSTR','COIN','MARA','RIOT','HOOD','CLSK','BTBT','HUT','CIFR','WULF'] },
  { name: 'AI/Semis',      etf: 'SOXL', tickers: ['NVDA','AMD','AVGO','INTC','MU','QCOM','ARM','SMCI','AMAT','LRCX'] },
  { name: 'Space/Defense', etf: 'ITA',  tickers: ['RKLB','LMT','RTX','NOC','GD','ASTS','LUNR','JOBY','ACHR','KTOS'] },
  { name: 'Biotech',       etf: 'XBI',  tickers: ['MRNA','BNTX','NVAX','REGN','VRTX','GILD','BIIB','SGEN','ALNY','FOLD'] },
];

async function fetchSectorRotation() {
  const sectors = [];
  for (const sector of SECTOR_LIST) {
    try {
      const q = await tradierGet(`/v1/markets/quotes?symbols=${sector.etf}&greeks=false`);
      const etf = q?.quotes?.quote;
      if (!etf) continue;
      const changePct    = parseFloat(etf.change_percentage) || 0;
      const volRatio     = etf.volume && etf.average_volume ? parseFloat(etf.volume) / parseFloat(etf.average_volume) : 1;
      const momentum     = changePct > 1.5 ? 'LEADING' : changePct < -1.5 ? 'LAGGING' : changePct > 0.3 ? 'RISING' : changePct < -0.3 ? 'FALLING' : 'FLAT';
      const momentumColor = { LEADING:'#00ff88', RISING:'#44cc88', FLAT:'#ffaa00', FALLING:'#ff8844', LAGGING:'#ff4444' };
      sectors.push({
        name:      sector.name,
        etf:       sector.etf,
        changePct: parseFloat(changePct.toFixed(2)),
        volRatio:  parseFloat(volRatio.toFixed(1)),
        price:     parseFloat(etf.last),
        momentum,
        color:     momentumColor[momentum],
        tickers:   sector.tickers,
      });
      await sleep(80);
    } catch {}
  }
  sectors.sort((a, b) => b.changePct - a.changePct);
  return sectors;
}

app.get('/sector/rotation', async (req, res) => {
  try {
    if (sectorCache.data && Date.now() - sectorCache.ts < SECTOR_TTL) {
      return res.json({ sectors: sectorCache.data, cached: true });
    }
    const data = await fetchSectorRotation();
    sectorCache.data = data;
    sectorCache.ts   = Date.now();
    res.json({ sectors: data, cached: false });
  } catch (e) {
    console.error('[sector/rotation]', e.message);
    if (sectorCache.data) return res.json({ sectors: sectorCache.data, cached: true, stale: true });
    res.status(500).json({ error: e.message });
  }
});

// Warm caches on startup
setTimeout(() => {
  fetchUnusualActivity('US')
    .then(d => { unusualCache.US.data = d; unusualCache.US.ts = Date.now(); console.log(`[unusual] US warmed: ${d.length}`); })
    .catch(e => console.warn('[unusual] US warm failed:', e.message));
  fetchSectorRotation()
    .then(d => { sectorCache.data = d; sectorCache.ts = Date.now(); console.log(`[sector] warmed: ${d.length}`); })
    .catch(e => console.warn('[sector] warm failed:', e.message));
}, 8000);

// ─── Signal History ──────────────────────────────────────────────────────────

app.post('/signal-history', async (req, res) => {
  const {
    userId, ticker, market, signal, confidence,
    priceAtSignal, priceTarget, stopLoss, timeframe, thesis,
    // Options-specific fields
    signalType,      // 'STOCK' | 'OPTION'
    optionType,      // 'CALL' | 'PUT'
    strike,          // strike price
    expiry,          // expiry date string YYYY-MM-DD
    entryPremium,    // premium paid per share (mid price)
    optionSymbol,    // OCC symbol if available
  } = req.body;
  if (!userId || !ticker || !signal) return res.status(400).json({ error: 'userId, ticker, signal required' });
  try {
    const { data, error } = await supabase.from('signal_history').insert({
      user_id:         userId,
      ticker:          ticker.toUpperCase(),
      market:          market || 'US',
      signal,
      confidence:      confidence || 0,
      price_at_signal: priceAtSignal,
      price_target:    priceTarget  || null,
      stop_loss:       stopLoss     || null,
      timeframe:       timeframe    || null,
      thesis:          thesis       || null,
      outcome_result:  'PENDING',
      // Options fields
      signal_type:     signalType   || 'STOCK',
      option_type:     optionType   || null,
      strike:          strike       || null,
      expiry:          expiry       || null,
      entry_premium:   entryPremium || null,
      option_symbol:   optionSymbol || null,
    }).select('id').single();
    if (error) throw error;
    const logLabel = signalType === 'OPTION'
      ? `${ticker} ${optionType} $${strike} exp:${expiry} @$${entryPremium}`
      : ticker;
    console.log('[signal-history] saved:', logLabel, signal, confidence + '%');
    res.json({ id: data.id });
  } catch (e) {
    console.error('[signal-history POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/signal-history/:userId', async (req, res) => {
  const market = req.query.market || 'US';
  const all    = req.query.all === 'true';
  try {
    let query = supabase
      .from('signal_history')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!all) query = query.eq('market', market);
    const { data, error } = await query;
    if (error) throw error;

    const resolved   = (data || []).filter(s => s.outcome_result && s.outcome_result !== 'PENDING');
    const wins       = resolved.filter(s => s.outcome_result === 'WIN').length;
    const losses     = resolved.filter(s => s.outcome_result === 'LOSS').length;
    const bySignal   = { BUY: { wins:0, total:0 }, SELL: { wins:0, total:0 }, HOLD: { wins:0, total:0 } };
    resolved.forEach(s => {
      if (bySignal[s.signal]) {
        bySignal[s.signal].total++;
        if (s.outcome_result === 'WIN') bySignal[s.signal].wins++;
      }
    });
    const highConf     = resolved.filter(s => s.confidence >= 70);
    const highConfWins = highConf.filter(s => s.outcome_result === 'WIN').length;

    // Separate stock vs options stats
    const stockResolved  = resolved.filter(s => !s.signal_type || s.signal_type === 'STOCK');
    const optionResolved = resolved.filter(s => s.signal_type === 'OPTION');
    const optionWins     = optionResolved.filter(s => s.outcome_result === 'WIN').length;
    const optionAvgPnl   = optionResolved.length
      ? parseFloat((optionResolved.reduce((s,x) => s + (x.outcome_pct||0), 0) / optionResolved.length).toFixed(1))
      : null;
    const optionByType   = { CALL: { wins:0, losses:0, total:0, avgPnl:0 }, PUT: { wins:0, losses:0, total:0, avgPnl:0 } };
    optionResolved.forEach(s => {
      const t = s.option_type;
      if (t && optionByType[t]) {
        optionByType[t].total++;
        optionByType[t].avgPnl += (s.outcome_pct || 0);
        if (s.outcome_result === 'WIN')  optionByType[t].wins++;
        if (s.outcome_result === 'LOSS') optionByType[t].losses++;
      }
    });
    Object.values(optionByType).forEach(t => {
      if (t.total) t.avgPnl = parseFloat((t.avgPnl / t.total).toFixed(1));
    });

    res.json({
      signals: data || [],
      stats: {
        total:           resolved.length,
        wins, losses,
        winRate:         resolved.length ? Math.round(wins/resolved.length*100) : null,
        avgOutcomePct:   resolved.length ? parseFloat((resolved.reduce((s,x)=>s+(x.outcome_pct||0),0)/resolved.length).toFixed(1)) : null,
        bySignal,
        highConfWinRate: highConf.length ? Math.round(highConfWins/highConf.length*100) : null,
        highConfTotal:   highConf.length,
        pending:         (data||[]).filter(s=>s.outcome_result==='PENDING').length,
        // Stock-specific
        stock: {
          total:   stockResolved.length,
          wins:    stockResolved.filter(s=>s.outcome_result==='WIN').length,
          winRate: stockResolved.length ? Math.round(stockResolved.filter(s=>s.outcome_result==='WIN').length/stockResolved.length*100) : null,
        },
        // Options-specific
        options: {
          total:   optionResolved.length,
          wins:    optionWins,
          winRate: optionResolved.length ? Math.round(optionWins/optionResolved.length*100) : null,
          avgPnl:  optionAvgPnl,
          byType:  optionByType,
          pending: (data||[]).filter(s=>s.signal_type==='OPTION'&&s.outcome_result==='PENDING').length,
        },
      }
    });
  } catch (e) {
    console.error('[signal-history GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/signal-history/:userId/check-outcomes', async (req, res) => {
  try {
    const { data: pending } = await supabase
      .from('signal_history').select('*')
      .eq('user_id', req.params.userId)
      .eq('outcome_result', 'PENDING');
    if (!pending?.length) return res.json({ checked: 0 });

    const tfMs = {
      'Short Term (1-5 days)': 5*864e5, 'Swing Trade (1-4 weeks)': 28*864e5,
      'Position Trade (1-3 months)': 90*864e5, 'Long Term (6-12 months)': 365*864e5,
    };
    const now     = Date.now();
    const toCheck = pending.filter(s => now - new Date(s.created_at).getTime() >= (tfMs[s.timeframe] || 7*864e5));
    if (!toCheck.length) return res.json({ checked: 0, message: 'No signals ready for outcome check yet' });

    const usTickers    = [...new Set(toCheck.filter(s=>s.market!=='INDIA').map(s=>s.ticker))];
    const indiaTickers = [...new Set(toCheck.filter(s=>s.market==='INDIA').map(s=>s.ticker))];
    const prices = {};

    if (usTickers.length) {
      const q = await tradierGet(`/v1/markets/quotes?symbols=${usTickers.join(',')}&greeks=false`);
      const raw = q?.quotes?.quote || [];
      (Array.isArray(raw)?raw:[raw]).forEach(q => { if (q.symbol) prices[q.symbol]=parseFloat(q.last); });
    }
    for (const ticker of indiaTickers) {
      try { const q = await getNSEQuote(ticker); if (q?.price) prices[ticker]=q.price; } catch {}
    }

    let checked = 0;
    for (const sig of toCheck) {
      const cur = prices[sig.ticker];
      if (!cur) continue;

      let pct, result;

      if (sig.signal_type === 'OPTION' && sig.entry_premium && sig.strike && sig.option_type) {
        // ── Options outcome: calculate actual P&L using intrinsic value ──────
        // At expiry: intrinsic value = max(0, spot - strike) for CALL
        //                            = max(0, strike - spot) for PUT
        // P&L % = (intrinsic_value - entry_premium) / entry_premium * 100
        const intrinsic = sig.option_type === 'CALL'
          ? Math.max(0, cur - sig.strike)
          : Math.max(0, sig.strike - cur);
        const pnl = intrinsic - sig.entry_premium;
        pct    = parseFloat((pnl / sig.entry_premium * 100).toFixed(2));
        // WIN = option profitable (intrinsic > premium paid)
        // LOSS = option expired worthless or below breakeven
        // SCRATCH = within 10% of breakeven
        result = pct > 10 ? 'WIN' : pct < -10 ? 'LOSS' : 'SCRATCH';
        console.log(`[options outcome] ${sig.ticker} ${sig.option_type} $${sig.strike}: spot=$${cur} intrinsic=$${intrinsic.toFixed(2)} entry=$${sig.entry_premium} pnl=${pct}% → ${result}`);
      } else {
        // ── Stock outcome: original logic ─────────────────────────────────────
        pct = (cur - sig.price_at_signal) / sig.price_at_signal * 100;
        if (sig.signal==='BUY')  result = pct>2?'WIN':pct<-2?'LOSS':'SCRATCH';
        if (sig.signal==='SELL') result = pct<-2?'WIN':pct>2?'LOSS':'SCRATCH';
        if (sig.signal==='HOLD') result = Math.abs(pct)<5?'WIN':'LOSS';
      }

      await supabase.from('signal_history').update({
        outcome_price:      cur,
        outcome_checked_at: new Date().toISOString(),
        outcome_pct:        parseFloat(pct.toFixed(2)),
        outcome_result:     result,
      }).eq('id', sig.id);
      checked++;
    }
    res.json({ checked });
  } catch (e) {
    console.error('[signal-history check-outcomes]', e.message);
    res.status(500).json({ error: e.message });
  }
});



// ─── Save Options Signal (called from frontend after options analysis) ─────────
app.post('/signal-history/options', async (req, res) => {
  const {
    userId, ticker, recommendation, confidence,
    livePrice, selectedExpiry,
    bestCall, bestPut,
  } = req.body;
  if (!userId || !ticker || !recommendation) return res.status(400).json({ error: 'missing required fields' });

  const saved = [];
  try {
    // Save the recommended direction only (CALL or PUT — not NEUTRAL)
    const sides = recommendation === 'NEUTRAL' ? [] : [recommendation];

    for (const side of sides) {
      const contract = side === 'CALL' ? bestCall : bestPut;
      if (!contract?.strike || !contract?.mid) continue;

      const { data, error } = await supabase.from('signal_history').insert({
        user_id:         userId,
        ticker:          ticker.toUpperCase(),
        market:          'US',
        signal:          recommendation, // CALL or PUT
        confidence:      confidence || 0,
        price_at_signal: livePrice,
        timeframe:       selectedExpiry, // expiry date as timeframe
        thesis:          contract.thesis || `${side} on ${ticker} — entry $${contract.mid}`,
        outcome_result:  'PENDING',
        // Options fields
        signal_type:     'OPTION',
        option_type:     side,
        strike:          contract.strike,
        expiry:          selectedExpiry,
        entry_premium:   contract.mid,
        option_symbol:   contract.symbol || null,
        price_target:    contract.mid * 2, // 2x premium as target
        stop_loss:       contract.mid * 0.5, // 50% stop
      }).select('id').single();

      if (error) throw error;
      saved.push({ side, id: data.id, strike: contract.strike, premium: contract.mid });
      console.log(`[options-history] saved ${ticker} ${side} $${contract.strike} exp:${selectedExpiry} @$${contract.mid}`);
    }

    res.json({ saved });
  } catch (e) {
    console.error('[options-history POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Automated Batch Signal Engine ───────────────────────────────────────────
// Runs every Sunday night for US, Monday morning IST for India
// Generates signals for top stocks across all 4 timeframes
// Stored under user_id = 'SYSTEM' for public accuracy tracking

const BATCH_US_TICKERS = [
  // Mega cap benchmark (8) — most liquid, hardest to beat
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','JPM',
  // High-volatility momentum (8) — technicals dominate, signals have real edge
  'MSTR','COIN','AMD','SMCI','PLTR','MARA','RIOT','HOOD',
  // Mid-cap growth / SaaS (7) — earnings quality + momentum factors shine
  'DDOG','NET','CRWD','SNOW','MNDY','GTLB','BILL',
  // Sector leaders with strong fundamental signals (7) — earnings + analyst combo
  'LLY','ABBV','AVGO','COST','V','XOM','GS',
];

const BATCH_INDIA_TICKERS = [
  // Nifty large cap benchmark (8)
  'RELIANCE','TCS','HDFCBANK','ICICIBANK','INFOSYS','BHARTIARTL','SBIN','LT',
  // High-beta / momentum names (8) — circuit breakers, FII flow signals matter
  'ADANIPORTS','ADANIENT','BAJFINANCE','TATAMOTORS','ZOMATO','NYKAA','PAYTM','IRCTC',
  // Mid-cap quality (7) — delivery %, promoter holding signals strong here
  'PERSISTENT','COFORGE','KPITTECH','DIXON','POLYCAB','TIINDIA','APARINDS',
  // Sector leaders with strong fundamentals (7)
  'SUNPHARMA','DRREDDY','TITAN','ASIANPAINT','MARUTI','KOTAKBANK','AXISBANK',
];

const BATCH_TIMEFRAMES = ['short', 'swing', 'position', 'longterm'];
const BATCH_USER_ID    = 'SYSTEM';
const batchRunCache    = { lastRun: null, running: false };

async function runBatchSignals(market = 'US') {
  if (batchRunCache.running) {
    console.log('[batch] already running, skipping');
    return { skipped: true };
  }
  batchRunCache.running = true;
  const tickers   = market === 'INDIA' ? BATCH_INDIA_TICKERS : BATCH_US_TICKERS;
  const results   = { market, generated: 0, errors: 0, signals: [] };
  const startedAt = Date.now();

  console.log(`[batch] starting ${market} batch — ${tickers.length} tickers × ${BATCH_TIMEFRAMES.length} timeframes`);

  for (const ticker of tickers) {
    for (const timeframeKey of BATCH_TIMEFRAMES) {
      try {
        // Check if we already have a PENDING signal for this ticker+timeframe from today
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await supabase
          .from('signal_history')
          .select('id')
          .eq('user_id', BATCH_USER_ID)
          .eq('ticker', ticker)
          .eq('timeframe', timeframeKey)
          .eq('market', market)
          .gte('created_at', today + 'T00:00:00Z')
          .maybeSingle();

        if (existing) {
          console.log(`[batch] skip ${ticker}/${timeframeKey} — already run today`);
          continue;
        }

        // Fetch all data needed for the signal
        const tf     = TIMEFRAMES[timeframeKey];
        const isIndia = market === 'INDIA';

        // Price history
        let ohlcv = null, ta = null;
        if (isIndia) {
          try {
            const hist = await getNSEHistory(ticker, tf.range);
            if (hist?.close?.length >= 20) {
              ohlcv = { close: hist.close, open: hist.open, high: hist.high, low: hist.low, volume: hist.volume };
              ta    = computeTA(ohlcv, timeframeKey);
            }
          } catch {}
        } else {
          try {
            const hist = await tradierHistory(ticker, tf.range);
            if (hist?.close?.length >= 20) {
              ohlcv = { close: hist.close, open: hist.open, high: hist.high, low: hist.low, volume: hist.volume };
              ta    = computeTA(ohlcv, timeframeKey);
            }
          } catch {}
        }
        if (!ohlcv || !ta) { results.errors++; continue; }

        const price = ohlcv.close[ohlcv.close.length - 1];
        if (!price) { results.errors++; continue; }

        // Fundamentals (lightweight — no options, no enhanced for batch speed)
        let fundamentals = null, financials = null;
        try {
          const fin = await getFinnhubFinancials(ticker);
          fundamentals = fin?.fundamentals || null;
          financials   = fin?.financials   || null;
        } catch {}

        // Regime (cached — free)
        let regime = null;
        if (!isIndia) {
          try { regime = regimeCache.data || null; } catch {}
        }

        // Compute signal deterministically
        const computed = computeSignal({
          ohlcv, ta, fundamentals, financials,
          enhanced: null, options: null,
          market, timeframeKey, news: [],
          optimizedWeights: null, regime, bonds: null,
        });

        const { signal, confidence, totalScore } = computed;
        const atr      = ta?.atr?.atr || null;
        const priceTarget = atr ? parseFloat((signal === 'SELL' ? price - atr*2 : price + atr*2).toFixed(2)) : null;
        const stopLoss    = atr ? parseFloat((signal === 'SELL' ? price + atr   : price - atr).toFixed(2))   : null;

        // Save to signal_history under SYSTEM user
        const { data: saved, error: saveErr } = await supabase.from('signal_history').insert({
          user_id:         BATCH_USER_ID,
          ticker:          ticker.toUpperCase(),
          market,
          signal,
          confidence,
          price_at_signal: price,
          price_target:    priceTarget,
          stop_loss:       stopLoss,
          timeframe:       timeframeKey,
          thesis:          `Batch signal. Score: ${totalScore.toFixed(3)}. Regime: ${regime?.regime || 'N/A'}.`,
          outcome_result:  'PENDING',
        }).select('id').single();

        if (saveErr) throw saveErr;

        results.generated++;
        results.signals.push({ ticker, timeframeKey, signal, confidence, price });
        console.log(`[batch] ${ticker}/${timeframeKey}: ${signal} ${confidence}% @ ${isIndia ? '₹' : '$'}${price}`);

        // Small delay to avoid rate limits
        await sleep(200);

      } catch (e) {
        console.warn(`[batch] error ${ticker}/${timeframeKey}:`, e.message);
        results.errors++;
      }
    }
  }

  batchRunCache.running = false;
  batchRunCache.lastRun = Date.now();
  console.log(`[batch] complete — ${results.generated} signals generated, ${results.errors} errors in ${((Date.now()-startedAt)/1000).toFixed(0)}s`);
  return results;
}

// ─── Batch outcomes checker — runs daily to check resolved signals ────────────
async function checkBatchOutcomes() {
  try {
    const tfDays = { short: 5, swing: 28, position: 90, longterm: 365 };
    const now    = Date.now();

    const { data: pending } = await supabase
      .from('signal_history')
      .select('*')
      .eq('user_id', BATCH_USER_ID)
      .eq('outcome_result', 'PENDING');

    if (!pending?.length) return;

    const toCheck = pending.filter(s => {
      const days = tfDays[s.timeframe] || 7;
      return now - new Date(s.created_at).getTime() >= days * 864e5;
    });

    if (!toCheck.length) return;

    // Batch fetch current prices
    const usTickers    = [...new Set(toCheck.filter(s=>s.market!=='INDIA').map(s=>s.ticker))];
    const indiaTickers = [...new Set(toCheck.filter(s=>s.market==='INDIA').map(s=>s.ticker))];
    const prices = {};

    if (usTickers.length) {
      const q   = await tradierGet(`/v1/markets/quotes?symbols=${usTickers.join(',')}&greeks=false`);
      const raw = q?.quotes?.quote || [];
      (Array.isArray(raw) ? raw : [raw]).forEach(q => { if (q.symbol) prices[q.symbol] = parseFloat(q.last); });
    }
    for (const t of indiaTickers) {
      try { const q = await getNSEQuote(t); if (q?.price) prices[t] = q.price; } catch {} 
    }

    let checked = 0;
    for (const sig of toCheck) {
      const cur = prices[sig.ticker];
      if (!cur) continue;
      const pct    = (cur - sig.price_at_signal) / sig.price_at_signal * 100;
      let result;
      if (sig.signal === 'BUY')  result = pct >  2 ? 'WIN' : pct < -2 ? 'LOSS' : 'SCRATCH';
      if (sig.signal === 'SELL') result = pct < -2 ? 'WIN' : pct >  2 ? 'LOSS' : 'SCRATCH';
      if (sig.signal === 'HOLD') result = Math.abs(pct) < 5 ? 'WIN' : 'LOSS';
      await supabase.from('signal_history').update({
        outcome_price:      cur,
        outcome_checked_at: new Date().toISOString(),
        outcome_pct:        parseFloat(pct.toFixed(2)),
        outcome_result:     result,
      }).eq('id', sig.id);
      checked++;
    }
    console.log(`[batch outcomes] checked ${checked} signals`);
  } catch (e) {
    console.error('[batch outcomes]', e.message);
  }
}

// ─── GET /batch/signals — public leaderboard of system signals ────────────────
app.get('/batch/signals', async (req, res) => {
  try {
    const market     = req.query.market    || 'US';
    const timeframe  = req.query.timeframe || null;
    const status     = req.query.status    || null; // PENDING | WIN | LOSS | SCRATCH
    const limit      = Math.min(parseInt(req.query.limit) || 120, 500);

    let query = supabase
      .from('signal_history')
      .select('*')
      .eq('user_id', BATCH_USER_ID)
      .eq('market', market)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (timeframe) query = query.eq('timeframe', timeframe);
    if (status)    query = query.eq('outcome_result', status);

    const { data, error } = await query;
    if (error) throw error;

    const resolved   = (data || []).filter(s => s.outcome_result !== 'PENDING');
    const wins       = resolved.filter(s => s.outcome_result === 'WIN').length;
    const losses     = resolved.filter(s => s.outcome_result === 'LOSS').length;
    const scratches  = resolved.filter(s => s.outcome_result === 'SCRATCH').length;
    const byTf       = {};
    const bySignal   = { BUY:{wins:0,losses:0,total:0}, SELL:{wins:0,losses:0,total:0}, HOLD:{wins:0,losses:0,total:0} };

    resolved.forEach(s => {
      if (!byTf[s.timeframe]) byTf[s.timeframe] = { wins:0, losses:0, total:0 };
      byTf[s.timeframe].total++;
      if (s.outcome_result==='WIN')  byTf[s.timeframe].wins++;
      if (s.outcome_result==='LOSS') byTf[s.timeframe].losses++;
      if (bySignal[s.signal]) {
        bySignal[s.signal].total++;
        if (s.outcome_result==='WIN')  bySignal[s.signal].wins++;
        if (s.outcome_result==='LOSS') bySignal[s.signal].losses++;
      }
    });

    res.json({
      signals: data || [],
      stats: {
        total: resolved.length, wins, losses, scratches,
        winRate:   resolved.length ? Math.round(wins/resolved.length*100) : null,
        pending:   (data||[]).filter(s=>s.outcome_result==='PENDING').length,
        byTimeframe: byTf,
        bySignal,
        lastRun: batchRunCache.lastRun,
      }
    });
  } catch (e) {
    console.error('[batch/signals]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /batch/run — trigger a batch run (protected by secret) ──────────────
app.post('/batch/run', async (req, res) => {
  const secret = req.headers['x-batch-secret'] || req.body?.secret;
  if (secret !== process.env.BATCH_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const market = req.body?.market || 'US';
  res.json({ message: 'batch started', market });
  runBatchSignals(market).catch(e => console.error('[batch/run]', e.message));
});

// ─── POST /batch/check-outcomes — trigger outcome check ──────────────────────
app.post('/batch/check-outcomes', async (req, res) => {
  const secret = req.headers['x-batch-secret'] || req.body?.secret;
  if (secret !== process.env.BATCH_SECRET) return res.status(401).json({ error: 'unauthorized' });
  res.json({ message: 'checking outcomes...' });
  checkBatchOutcomes().catch(e => console.error('[batch/check-outcomes]', e.message));
});

// ─── Scheduled batch runs ─────────────────────────────────────────────────────
// Sunday 8PM ET = Monday 9:30AM IST — run US batch
// Monday 3AM ET = Monday 8:30AM IST — run India batch
function scheduleBatchRuns() {
  setInterval(async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day  = now.getDay();    // 0=Sun
    const hour = now.getHours();
    const min  = now.getMinutes();

    // Sunday 8:00 PM ET → US batch
    if (day === 0 && hour === 20 && min < 5 && !batchRunCache.running) {
      console.log('[batch scheduler] triggering US weekly batch');
      runBatchSignals('US').catch(console.error);
    }
    // Monday 3:00 AM ET → India batch
    if (day === 1 && hour === 3 && min < 5 && !batchRunCache.running) {
      console.log('[batch scheduler] triggering India weekly batch');
      runBatchSignals('INDIA').catch(console.error);
    }
    // Daily 6:00 AM ET → check outcomes
    if (hour === 6 && min < 5) {
      checkBatchOutcomes().catch(console.error);
    }
  }, 4 * 60 * 1000); // check every 4 minutes
}

scheduleBatchRuns();
console.log('[batch] scheduler started');

// ─── Share Cards ─────────────────────────────────────────────────────────────
// Store shareable card data in Supabase, return a short ID

app.post('/share', async (req, res) => {
  const { type, data } = req.body;
  if (!type || !data) return res.status(400).json({ error: 'type and data required' });
  try {
    // Store in a simple share_cards table
    const { data: card, error } = await supabase
      .from('share_cards')
      .insert({
        type,       // 'signal' | 'simulator'
        data,       // JSON blob with all card data
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    res.json({ id: card.id, url: `${process.env.FRONTEND_URL || 'https://quaint-signal.tech'}/share/${card.id}` });
  } catch (e) {
    console.error('[share POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/share/:id', async (req, res) => {
  try {
    const { data: card, error } = await supabase
      .from('share_cards')
      .select('type, data, created_at')
      .eq('id', req.params.id)
      .single();
    if (error || !card) return res.status(404).json({ error: 'Card not found' });
    res.json(card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Simulator ────────────────────────────────────────────────────────────────
const SIM_BALANCE_US    = 10000;    // $10,000 USD
const SIM_BALANCE_INDIA = 1000000;  // ₹10,00,000 (10 Lakhs)

function simStartingBalance(market) {
  return market === 'INDIA' ? SIM_BALANCE_INDIA : SIM_BALANCE_US;
}

async function getOrCreateSimAccount(userId, market = 'US') {
  const simId = `${userId}_${market}`; // separate account per market
  const { data, error } = await supabase
    .from('sim_account').select('*').eq('user_id', simId).single();
  if (error && error.code === 'PGRST116') {
    const { data: newAcc, error: e2 } = await supabase
      .from('sim_account')
      .insert({ user_id: simId, balance: simStartingBalance(market), starting_balance: simStartingBalance(market) })
      .select().single();
    if (e2) throw e2;
    return newAcc;
  }
  if (error) throw error;
  return data;
}

// GET /sim/:userId — account + positions filtered by market
app.get('/sim/:userId', async (req, res) => {
  const market = req.query.market || 'US';
  try {
    const [account, positions] = await Promise.all([
      getOrCreateSimAccount(req.params.userId, market),
      supabase.from('sim_positions').select('*')
        .eq('user_id', req.params.userId)
        .eq('market', market)
        .order('opened_at', { ascending: false }),
    ]);
    if (positions.error) throw positions.error;
    res.json({ account, positions: positions.data || [] });
  } catch (e) {
    console.error('[sim GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /sim/:userId/open — open a position
app.post('/sim/:userId/open', async (req, res) => {
  const { ticker, market = 'US', direction = 'LONG', entryPrice,
          quantity, signal, confidence, timeframe,
          priceTarget, stopLoss, thesis } = req.body;

  const positionType = req.body.positionType || 'STOCK';
  const isOption = positionType === 'OPTION';

  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (isOption && (!req.body.strike || !req.body.expiry || !req.body.optionType))
    return res.status(400).json({ error: 'strike, expiry, optionType required for options' });
  if (!isOption && (!entryPrice || !quantity))
    return res.status(400).json({ error: 'entryPrice, quantity required' });

  if (confidence != null && confidence < 65)
    return res.status(400).json({ error: `Signal confidence too low (${confidence}%) — need 65%+ to simulate` });

  try {
    const account  = await getOrCreateSimAccount(req.params.userId, market);
    // Options: notional = premium × 100 shares × contracts
    // Stocks:  notional = price × quantity
    const contracts = parseInt(req.body.contracts) || 1;
    const notional  = isOption
      ? parseFloat(entryPrice) * 100 * contracts
      : parseFloat(entryPrice) * parseFloat(quantity);

    // LONG: deduct full notional from cash
    // SHORT: require 50% margin (industry standard for paper trading)
    const SHORT_MARGIN = 0.5;
    const cashRequired = direction === 'LONG' ? notional : notional * SHORT_MARGIN;

    if (cashRequired > account.balance)
      return res.status(400).json({
        error: `Insufficient balance. Need ${market === 'INDIA' ? '₹' : '$'}${cashRequired.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${direction === 'SHORT' ? '50% margin' : 'full notional'}). Available: ${market === 'INDIA' ? '₹' : '$'}${account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      });

    const newBalance = account.balance - cashRequired;

    // Insert position first
    const insertData = {
      user_id:       req.params.userId,
      ticker:        ticker.toUpperCase(),
      market,
      direction:     isOption ? 'LONG' : direction, // options are always long
      position_type: positionType,
      entry_price:   parseFloat(entryPrice),
      quantity:      isOption ? contracts : parseFloat(quantity),
      notional,
      signal,
      confidence,
      timeframe,
      price_target:  priceTarget || null,
      stop_loss:     stopLoss    || null,
      thesis:        thesis      || null,
      status:        'OPEN',
    };

    // Options-specific fields
    if (isOption) {
      insertData.option_type   = req.body.optionType;   // 'CALL' | 'PUT'
      insertData.strike        = parseFloat(req.body.strike);
      insertData.expiry        = req.body.expiry;
      insertData.contracts     = parseInt(req.body.contracts) || 1;
      insertData.premium       = parseFloat(entryPrice); // mid price = premium per share
      insertData.entry_delta   = req.body.delta   || null;
      insertData.entry_iv      = req.body.iv      || null;
      insertData.option_symbol = req.body.optionSymbol || null;
    }

    const posResult = await supabase.from('sim_positions').insert(insertData).select().single();

    if (posResult.error) throw posResult.error;
    console.log('[sim open] position created:', posResult.data?.id, ticker, direction, market, 'notional:', notional);

    // Deduct balance — use upsert so it works even if account row is missing
    const simId = `${req.params.userId}_${market}`;
    const balResult = await supabase.from('sim_account').update({
      balance:    parseFloat(newBalance.toFixed(2)),
      updated_at: new Date().toISOString(),
    }).eq('user_id', simId);

    if (balResult.error) {
      console.error('[sim open] balance update failed:', balResult.error.message, 'simId:', simId);
      // Don't throw — position was created, balance update failed
      // Try upsert as fallback
      await supabase.from('sim_account').upsert({
        user_id:          simId,
        balance:          parseFloat(newBalance.toFixed(2)),
        starting_balance: simStartingBalance(market),
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }

    res.json({ position: posResult.data, newBalance });
  } catch (e) {
    console.error('[sim open]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /sim/:userId/close/:positionId — close a position
app.post('/sim/:userId/close/:positionId', async (req, res) => {
  const { exitPrice, exitReason = 'MANUAL' } = req.body;
  if (!exitPrice) return res.status(400).json({ error: 'exitPrice required' });

  try {
    const { data: pos, error: posErr } = await supabase
      .from('sim_positions').select('*')
      .eq('id', req.params.positionId)
      .eq('user_id', req.params.userId)
      .single();
    if (posErr || !pos) return res.status(404).json({ error: 'Position not found' });
    if (pos.status === 'CLOSED') return res.status(400).json({ error: 'Already closed' });

    const exit = parseFloat(exitPrice);
    const pnl  = pos.direction === 'LONG'
      ? (exit - pos.entry_price) * pos.quantity
      : (pos.entry_price - exit) * pos.quantity; // SHORT profits when price falls
    const pct  = pos.direction === 'LONG'
      ? ((exit - pos.entry_price) / pos.entry_price) * 100
      : ((pos.entry_price - exit) / pos.entry_price) * 100;

    const account    = await getOrCreateSimAccount(req.params.userId, pos.market);
    const SHORT_MARGIN = 0.5;
    const newBalance = pos.direction === 'LONG'
      ? account.balance + (exit * pos.quantity)            // return full notional at exit price
      : account.balance + (pos.notional * SHORT_MARGIN) + pnl; // return margin + realized pnl

    await Promise.all([
      supabase.from('sim_positions').update({
        status:      'CLOSED',
        exit_price:  exit,
        exit_reason: exitReason,
        closed_at:   new Date().toISOString(),
        realized_pnl: parseFloat(pnl.toFixed(2)),
        realized_pct: parseFloat(pct.toFixed(2)),
      }).eq('id', req.params.positionId),
      supabase.from('sim_account').update({
        balance:    parseFloat(newBalance.toFixed(2)),
        updated_at: new Date().toISOString(),
      }).eq('user_id', `${req.params.userId}_${pos.market}`),
    ]);

    res.json({ pnl, pct, newBalance });
  } catch (e) {
    console.error('[sim close]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /sim/:userId/reset — reset with 30-day cooldown, max 1 reset lifetime
app.post('/sim/:userId/reset', async (req, res) => {
  const market = req.query.market || req.body?.market || 'US';
  const simId  = `${req.params.userId}_${market}`;
  const RESET_COOLDOWN_DAYS = 30;

  try {
    // Check existing account
    const { data: acct } = await supabase
      .from('sim_account').select('*').eq('user_id', simId).single();

    if (acct) {
      // Block if already reset once
      if ((acct.reset_count || 0) >= 1) {
        return res.status(403).json({
          error: 'You have already used your one lifetime reset. Results are permanent to ensure authenticity.',
          reset_count: acct.reset_count,
        });
      }
      // Block if reset within last 30 days (safety check)
      if (acct.last_reset) {
        const daysSince = (Date.now() - new Date(acct.last_reset).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < RESET_COOLDOWN_DAYS) {
          return res.status(403).json({
            error: `Reset cooldown active. You can reset again in ${Math.ceil(RESET_COOLDOWN_DAYS - daysSince)} days.`,
            cooldown_days_remaining: Math.ceil(RESET_COOLDOWN_DAYS - daysSince),
          });
        }
      }
    }

    const now = new Date().toISOString();
    await Promise.all([
      supabase.from('sim_account').upsert({
        user_id:          simId,
        balance:          simStartingBalance(market),
        starting_balance: simStartingBalance(market),
        updated_at:       now,
        last_reset:       now,
        reset_count:      (acct?.reset_count || 0) + 1,
      }, { onConflict: 'user_id' }),
      supabase.from('sim_positions').delete()
        .eq('user_id', req.params.userId)
        .eq('market', market),
    ]);
    res.json({ success: true, balance: simStartingBalance(market), reset_count: (acct?.reset_count || 0) + 1 });
  } catch (e) {
    console.error('[sim reset]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /sim/:userId/prices — fetch current prices for all open positions
app.get('/sim/:userId/prices', async (req, res) => {
  try {
    const market = req.query.market || 'US';
    const { data: positions } = await supabase
      .from('sim_positions').select('id, ticker, market, position_type, option_symbol, strike, expiry, option_type')
      .eq('user_id', req.params.userId)
      .eq('market', market)
      .eq('status', 'OPEN');

    if (!positions?.length) return res.json({});

    const stockPositions  = positions.filter(p => p.position_type !== 'OPTION' && p.market !== 'INDIA');
    const optionPositions = positions.filter(p => p.position_type === 'OPTION');
    const indiaTickers    = positions.filter(p => p.market === 'INDIA').map(p => p.ticker);

    const prices = {};

    // Stock prices
    if (stockPositions.length) {
      const tickers = [...new Set(stockPositions.map(p => p.ticker))];
      const data = await tradierGet(`/v1/markets/quotes?symbols=${tickers.join(',')}&greeks=false`);
      const raw  = data?.quotes?.quote || [];
      const list = Array.isArray(raw) ? raw : [raw];
      list.forEach(q => { if (q.symbol && q.last) prices[q.symbol] = parseFloat(q.last); });
    }

    // Option prices — fetch by OCC symbol or reconstruct from strike/expiry
    if (optionPositions.length) {
      await Promise.allSettled(optionPositions.map(async pos => {
        try {
          // Build option symbol if not stored: TICKER + YYMMDD + C/P + 8-digit strike
          let sym = pos.option_symbol;
          if (!sym && pos.strike && pos.expiry) {
            const d = pos.expiry.replace(/-/g, '').slice(2); // YYMMDD
            const strikeStr = (parseFloat(pos.strike) * 1000).toFixed(0).padStart(8, '0');
            sym = `${pos.ticker}${d}${pos.option_type === 'PUT' ? 'P' : 'C'}${strikeStr}`;
          }
          if (!sym) return;
          const data = await tradierGet(`/v1/markets/quotes?symbols=${sym}&greeks=true`);
          const q = data?.quotes?.quote;
          if (q) {
            const mid = q.bid && q.ask ? (q.bid + q.ask) / 2 : q.last;
            if (mid) {
              prices[`OPT:${pos.id}`] = {
                mid:   parseFloat(mid.toFixed(4)),
                bid:   q.bid,
                ask:   q.ask,
                last:  q.last,
                delta: q.greeks?.delta,
                theta: q.greeks?.theta,
                gamma: q.greeks?.gamma,
                vega:  q.greeks?.vega,
                iv:    q.greeks?.mid_iv,
              };
            }
          }
        } catch (e) { console.warn('[sim option price]', pos.ticker, e.message); }
      }));
    }

    if (indiaTickers.length) {
      await Promise.allSettled(indiaTickers.map(async ticker => {
        const q = await getNSEQuote(ticker);
        if (q?.price) prices[ticker] = q.price;
      }));
    }

    res.json(prices);
  } catch (e) {
    console.error('[sim prices]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Simulator Auto-Close Engine ─────────────────────────────────────────────
// Runs every 60s — checks all open positions against live prices
// Auto-closes when price target or stop loss is hit

async function runSimAutoClose() {
  try {
    // Get all open positions that have a target or stop
    const { data: openPositions } = await supabase
      .from('sim_positions')
      .select('*')
      .eq('status', 'OPEN')
      .or('price_target.not.is.null,stop_loss.not.is.null');

    if (!openPositions?.length) return;

    // Group by market
    const usPosns     = openPositions.filter(p => p.market !== 'INDIA');
    const indiaPosns  = openPositions.filter(p => p.market === 'INDIA');
    const prices      = {};

    // Fetch US prices
    if (usPosns.length) {
      const tickers = [...new Set(usPosns.map(p => p.ticker))];
      try {
        const data = await tradierGet(`/v1/markets/quotes?symbols=${tickers.join(',')}&greeks=false`);
        const raw  = data?.quotes?.quote || [];
        const list = Array.isArray(raw) ? raw : [raw];
        list.forEach(q => { if (q.symbol && q.last) prices[q.symbol] = parseFloat(q.last); });
      } catch {}
    }

    // Fetch India prices
    if (indiaPosns.length) {
      const tickers = [...new Set(indiaPosns.map(p => p.ticker))];
      await Promise.allSettled(tickers.map(async ticker => {
        const q = await getNSEQuote(ticker);
        if (q?.price) prices[ticker] = q.price;
      }));
    }

    // Check each position
    const closes = [];
    for (const pos of openPositions) {
      const cur = prices[pos.ticker];
      if (!cur) continue;

      let exitReason = null;
      let exitPrice  = null;

      if (pos.direction === 'LONG') {
        if (pos.price_target && cur >= parseFloat(pos.price_target)) {
          exitReason = 'TARGET'; exitPrice = parseFloat(pos.price_target);
        } else if (pos.stop_loss && cur <= parseFloat(pos.stop_loss)) {
          exitReason = 'STOP'; exitPrice = parseFloat(pos.stop_loss);
        }
      } else { // SHORT
        if (pos.price_target && cur <= parseFloat(pos.price_target)) {
          exitReason = 'TARGET'; exitPrice = parseFloat(pos.price_target);
        } else if (pos.stop_loss && cur >= parseFloat(pos.stop_loss)) {
          exitReason = 'STOP'; exitPrice = parseFloat(pos.stop_loss);
        }
      }

      if (exitReason) closes.push({ pos, exitPrice, exitReason });
    }

    // Execute closes
    for (const { pos, exitPrice, exitReason } of closes) {
      try {
        const pnl = pos.direction === 'LONG'
          ? (exitPrice - pos.entry_price) * pos.quantity
          : (pos.entry_price - exitPrice) * pos.quantity;
        const pct = pos.direction === 'LONG'
          ? ((exitPrice - pos.entry_price) / pos.entry_price) * 100
          : ((pos.entry_price - exitPrice) / pos.entry_price) * 100;

        const simId     = `${pos.user_id}_${pos.market}`;
        const { data: acc } = await supabase.from('sim_account').select('balance').eq('user_id', simId).single();
        const newBalance = acc
          ? (pos.direction === 'LONG'
              ? acc.balance + (exitPrice * pos.quantity)
              : acc.balance + pnl)
          : null;

        await Promise.all([
          supabase.from('sim_positions').update({
            status:       'CLOSED',
            exit_price:   exitPrice,
            exit_reason:  exitReason,
            closed_at:    new Date().toISOString(),
            realized_pnl: parseFloat(pnl.toFixed(2)),
            realized_pct: parseFloat(pct.toFixed(2)),
          }).eq('id', pos.id),
          ...(newBalance != null ? [supabase.from('sim_account').update({
            balance:    parseFloat(newBalance.toFixed(2)),
            updated_at: new Date().toISOString(),
          }).eq('user_id', simId)] : []),
        ]);

        console.log(`[sim auto-close] ${pos.ticker} ${exitReason} @ ${exitPrice} | P&L: ${pnl.toFixed(2)}`);
      } catch (e) {
        console.error('[sim auto-close] error closing', pos.ticker, e.message);
      }
    }
  } catch (e) {
    console.error('[sim auto-close] engine error:', e.message);
  }
}

// Run auto-close every 60 seconds
setInterval(runSimAutoClose, 60 * 1000);
// Also run on startup after 10s delay
setTimeout(runSimAutoClose, 10000);;

// POST /sim/:userId/check-expiry — auto-close expired options
app.post('/sim/:userId/check-expiry', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: expired } = await supabase
      .from('sim_positions')
      .select('*')
      .eq('user_id', req.params.userId)
      .eq('status', 'OPEN')
      .eq('position_type', 'OPTION')
      .lte('expiry', today);

    if (!expired?.length) return res.json({ expired: 0 });

    // For each expired option, calculate intrinsic value
    const closed = [];
    for (const pos of expired) {
      // Fetch underlying stock price
      let stockPrice = 0;
      try {
        const q = await tradierGet(`/v1/markets/quotes?symbols=${pos.ticker}&greeks=false`);
        stockPrice = parseFloat(q?.quotes?.quote?.last || 0);
      } catch {}

      // Intrinsic value at expiry
      const intrinsic = pos.option_type === 'CALL'
        ? Math.max(0, stockPrice - pos.strike)
        : Math.max(0, pos.strike - stockPrice);

      const exitPrice  = intrinsic; // per share intrinsic value
      const pnl        = (exitPrice - pos.premium) * pos.contracts * 100;
      const pct        = pos.premium > 0 ? ((exitPrice - pos.premium) / pos.premium * 100) : -100;
      const account    = await getOrCreateSimAccount(pos.user_id, pos.market);
      // Return premium paid + pnl
      const cashReturn = pos.premium * pos.contracts * 100; // original cost
      const newBalance = account.balance + cashReturn + pnl;

      await Promise.all([
        supabase.from('sim_positions').update({
          status:       'CLOSED',
          exit_price:   exitPrice,
          exit_reason:  'EXPIRED',
          closed_at:    new Date().toISOString(),
          realized_pnl: parseFloat(pnl.toFixed(2)),
          realized_pct: parseFloat(pct.toFixed(2)),
        }).eq('id', pos.id),
        supabase.from('sim_account').update({
          balance:    parseFloat(newBalance.toFixed(2)),
          updated_at: new Date().toISOString(),
        }).eq('user_id', `${pos.user_id}_${pos.market}`),
      ]);

      closed.push({ ticker: pos.ticker, option_type: pos.option_type, strike: pos.strike, pnl });
    }

    res.json({ expired: closed.length, closed });
  } catch (e) {
    console.error('[sim check-expiry]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3001, '0.0.0.0', () => {
  console.log(`✅ QuAInt Signal backend on port ${process.env.PORT || 3001}`);
  // Hydrate in-memory caches from persistent DB on startup
  hydrateFromPersistentCache().catch(e => console.warn('[cache] hydration error:', e.message));

  // Auto-run backtest 60s after startup if no weights exist yet
  setTimeout(async () => {
    try {
      const existing = await getSignalWeights();
      // Backtest disabled — 2020-2025 dataset produces negative factor correlations
      // due to anomalous macro conditions (COVID, ZIRP, rate hikes, AI mania)
      // Will re-enable once we have 6+ months of real signal accuracy data
      console.log('[backtest] Auto-backtest disabled — using theory-based default weights');
    } catch (e) {
      console.warn('[backtest] Auto-start check failed:', e.message);
    }
  }, 60000); // 60 second delay to let server stabilize
});