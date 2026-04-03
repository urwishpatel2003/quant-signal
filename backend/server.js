require('dotenv').config();
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
      trial_settings: {
        end_behavior: { missing_payment_method: 'cancel' }, // cancel if no card added before trial ends
      },
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
  // Invalidate cache at market open — if cache is from before 9:30 AM ET today, force refresh
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const marketOpenToday = new Date(nowET);
  marketOpenToday.setHours(9, 30, 0, 0);
  if (usMoversCache.ts && usMoversCache.ts < marketOpenToday.getTime() && nowET >= marketOpenToday) {
    usMoversCache.ts = 0; // force refresh when market opens
  }
  // During market hours use 90s TTL, outside hours use 10 min TTL
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
    // session_filter=all includes pre/post market, ensures today's data
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
    const status = getMarketStatus();
    const payload = { gainers, losers, volume, marketStatus: status };
    usMoversCache.data = payload;
    usMoversCache.ts   = Date.now();
    res.json(payload);
  } catch (e) {
    if (usMoversCache.data) return res.json({ ...usMoversCache.data, stale: true });
    res.status(500).json({ error: e.message });
  }
});

// ─── Debug: inspect raw Tradier quote for troubleshooting ───────────────────
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

// US market holidays 2025-2027
const US_HOLIDAYS = new Set([
  '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26',
  '2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31',
  '2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
]);

function getMarketStatus() {
  const now  = new Date();
  const et   = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = et.getDay();
  const h    = et.getHours(), m = et.getMinutes();
  const mins = h * 60 + m;
  const dateStr = et.toISOString().split('T')[0];

  if (US_HOLIDAYS.has(dateStr)) {
    const names = {
      '2026-04-03': 'Good Friday', '2026-01-01': 'New Year's Day',
      '2026-01-19': 'MLK Day', '2026-02-16': 'Presidents Day',
      '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth',
      '2026-07-03': 'Independence Day', '2026-09-07': 'Labor Day',
      '2026-11-26': 'Thanksgiving', '2026-12-25': 'Christmas',
    };
    return { closed: true, reason: names[dateStr] || 'Market Holiday' };
  }
  if (day === 0 || day === 6) return { closed: true, reason: day === 6 ? 'Weekend' : 'Weekend' };
  if (mins < 570) return { closed: true, reason: 'Pre-Market' };
  if (mins >= 960) return { closed: true, reason: 'After Hours' };
  return { closed: false, reason: 'Open' };
}

function isMarketClosed() {
  return getMarketStatus().closed;
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

function buildChainContext(chain) {
  if (!chain) return '';
  let ctx = '\n=== OPTIONS INTELLIGENCE ===\n';
  ctx += `IV SKEW: ${chain.ivSkewPct}% (${chain.ivSkewLabel})\n`;
  ctx += `IV PERCENTILE: ${chain.ivPercentile}% — ${chain.ivPctLabel}\n`;
  ctx += `VOL/OI: Calls=${chain.callVolOIRatio} | Puts=${chain.putVolOIRatio} | P/C Vol=${parseFloat(chain.putCallVolRatio)?.toFixed(2)}\n`;
  if (chain.unusualCalls?.length) ctx += `🔥 UNUSUAL CALL VOL: ${chain.unusualCalls.join(', ')}\n`;
  if (chain.unusualPuts?.length)  ctx += `🔥 UNUSUAL PUT VOL: ${chain.unusualPuts.join(', ')}\n`;
  if (chain.highGammaStrike) ctx += `GAMMA PIN: $${chain.highGammaStrike}\n`;
  const wideCalls = (chain.topCalls || []).filter(c => c.wideSpread).map(c => `$${c.strike}`);
  const widePuts  = (chain.topPuts  || []).filter(p => p.wideSpread).map(p => `$${p.strike}`);
  if (wideCalls.length) ctx += `⚠ WIDE SPREAD CALLS: ${wideCalls.join(', ')}\n`;
  if (widePuts.length)  ctx += `⚠ WIDE SPREAD PUTS: ${widePuts.join(', ')}\n`;
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
          const text   = parsed.content?.[0]?.text || '{}';
          const clean  = text.replace(/```json|```/g, '').trim();
          resolve(JSON.parse(clean));
        } catch (e) { reject(new Error('Claude response parse error: ' + e.message)); }
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
    const chainCtx    = buildChainContext(chain);
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

app.post('/api/analyze/price', async (req, res) => {
  try {
    const { ticker, price, ohlcv, fundamentals, options, news, bonds, macroNews, intlMarkets, calendar, ta, timeframeKey = 'swing', market = 'US' } = req.body;
    const isIndia = market === 'INDIA';
    const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
    const taCtx       = buildTAContext(ta, ticker, calendar);
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

    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
      system: `You are a quantitative trading analyst specializing in ${tf.label} trades.
MARKET: ${isIndia ? 'NSE India (INR-denominated, Indian macroeconomic context, RBI policy, FII flows, domestic consumption)' : 'US equities (USD, Fed policy, global macro)'}
FOCUS: ${tf.focus}
TARGET/STOP RULE: ${tf.targetRule}
NEWS SIGNALS: [UPGRADE]/[INSIDER/FUND]=bullish. [DOWNGRADE]/[SHORT ATTACK]=bearish. [EARNINGS]=high impact.
BULL FACTORS should focus on: ${tf.bullFactorFocus}
BEAR FACTORS should focus on: ${tf.bearFactorFocus}
THESIS RULE: 2-3 sentences — (1) what the ${isIndia ? 'NSE-listed Indian company' : 'company'} does and its sector, (2) key fundamental driver for ${tf.label}, (3) technical setup. Never purely technical.
${isIndia ? 'India context: consider RBI rates, INR/USD, FII/DII flows, GST, Budget, SEBI regulations as relevant macro factors.' : 'SMA200 dist >15% = extended, factor mean reversion.'}
Return ONLY JSON: {"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"timeframe":"${tf.label}","thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":0,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"}`,
      messages: [{ role: 'user', content: `${ticker} @ $${price?.toFixed(2)} | ${tf.label}
${dayChangePct ? `TODAY: ${parseFloat(dayChangePct) >= 0 ? '+' : ''}${dayChangePct}% | prev close $${prevClose?.toFixed(2)}` : ''}
PRICE (${closes?.length} closes): ${JSON.stringify(closes)}
KEY INDICATORS: ${tf.indicators}
${taCtx}
FUNDAMENTALS: P/E=${fundamentals?.pe} | EPS=$${fundamentals?.eps?.toFixed(2)} | Beta=${fundamentals?.beta} | 52W High=$${fundamentals?.fiftyTwoWeekHigh} | 52W Low=$${fundamentals?.fiftyTwoWeekLow} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe ? (fundamentals.roe*100).toFixed(1)+'%' : 'N/A'} | GrossMargin=${fundamentals?.grossMargins ? (fundamentals.grossMargins*100).toFixed(1)+'%' : 'N/A'}
${(!isIndia && timeframeKey !== 'longterm') ? `OPTIONS SENTIMENT: P/C=${options?.putCallRatio?.toFixed(2)} | CallIV=${options?.avgCallIV}% | PutIV=${options?.avgPutIV}%` : ''}
${hasUpgrade?'🟢 ANALYST UPGRADE':''}${hasDowngrade?'🔴 ANALYST DOWNGRADE':''}${hasFund?'🏦 INSTITUTIONAL ACTIVITY':''}${hasShort?'⚠ SHORT ATTACK':''}${hasEarnings?'📊 EARNINGS NEWS':''}
NEWS: ${categorized.slice(0,6).join(' | ')}
${macroCtx}
Return JSON only.` }]
    });
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
    const chainCtx    = buildChainContext(chain);
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
      system: `You are an expert options trader.
HARD RULES: 1.RSI>70+CALL=overbought 2.RSI<30+PUT=oversold 3.Earnings BEFORE expiry+HIGH/CRITICAL=IV crush 4.Down>2%+PUT=assess 5.Up>2%+CALL=assess 6.Wide spread=avoid
Do NOT default to NEUTRAL. Return ONLY JSON.`,
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

const nseQuoteCache   = new Map();
const indiaMoversCache = { data: null, ts: 0 };
const usMoversCache    = { data: null, ts: 0 };
const INDIA_MOVERS_TTL = 5 * 60 * 1000;  // 5 minutes
const US_MOVERS_TTL    = 90 * 1000;       // 90 seconds during market hours
const nseHistoryCache = new Map();
const NSE_QUOTE_TTL   = 5  * 60 * 1000;
const NSE_HISTORY_TTL = 30 * 60 * 1000;

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};
const YAHOO_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];

async function yahooNSEQuote(symbol) {
  try {
    const ySymbol = `${symbol}.NS`;
    for (const host of YAHOO_HOSTS) {
      try {
        const data = await httpsGet(host,
          `/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5d&includePrePost=false`,
          YAHOO_HEADERS
        );
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) continue;
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
        };
      } catch { continue; }
    }
    return null;
  } catch { return null; }
}

async function getNSEQuote(symbol) {
  const cached = nseQuoteCache.get(symbol);
  if (cached && Date.now() - cached.ts < NSE_QUOTE_TTL) return cached.data;

  let result = null;

  // Primary: stock-nse-india (direct NSE API, no IP blocks)
  if (nseIndia) {
    try {
      const details = await nseIndia.getEquityDetails(symbol);
      const p = details?.priceInfo;
      if (p?.lastPrice) {
        result = {
          price:     p.lastPrice,
          prevClose: p.previousClose || p.close,
          change:    p.change  ? parseFloat(p.change.toFixed(2))  : null,
          changePct: p.pChange ? parseFloat(p.pChange.toFixed(2)) : null,
          volume:    details?.preOpenMarket?.totalTradedVolume || details?.securityInfo?.tradedVolume || 0,
          open: p.open || null,
          high: p.intraDayHighLow?.max || null,
          low:  p.intraDayHighLow?.min || null,
        };
      }
    } catch (e) { console.warn(`[NSE] primary quote failed ${symbol}:`, e.message); }
  }

  // Fallback: Yahoo Finance
  if (!result) result = await yahooNSEQuote(symbol);

  if (result) {
    nseQuoteCache.set(symbol, { data: result, ts: Date.now() });
  } else if (cached) {
    console.warn(`[NSE] stale cache for ${symbol}`);
    return cached.data;
  }
  return result;
}

async function getNSEHistory(symbol, range = '3mo') {
  const cacheKey = `${symbol}:${range}`;
  const cached   = nseHistoryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < NSE_HISTORY_TTL) return cached.data;

  let result = null;

  // Primary: stock-nse-india historical data
  if (nseIndia) {
    try {
      const daysMap = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365 };
      const days  = daysMap[range] || 90;
      const end   = new Date();
      const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const data  = await nseIndia.getEquityHistoricalData(symbol, { start, end });
      const rows  = data?.[0]?.data || data || [];
      if (rows.length) {
        const sorted = [...rows].sort((a, b) => {
          // mtimestamp format: "09-Mar-2026" — parse it
          const parseDate = s => {
            const [d, m, y] = s.split('-');
            return new Date(`${m} ${d} ${y}`).getTime();
          };
          return parseDate(a.mtimestamp) - parseDate(b.mtimestamp);
        });
        const closes = sorted.map(r => r.chClosingPrice).filter(Boolean);
        result = {
          close:      sorted.map(r => r.chClosingPrice),
          open:       sorted.map(r => r.chOpeningPrice),
          high:       sorted.map(r => r.chTradeHighPrice),
          low:        sorted.map(r => r.chTradeLowPrice),
          volume:     sorted.map(r => r.chTotTradedQty),
          timestamps: sorted.map(r => {
            const [d, m, y] = r.mtimestamp.split('-');
            return new Date(`${m} ${d} ${y}`).getTime();
          }),
          current:    closes[closes.length - 1],
          prev:       closes[closes.length - 2],
        };
      }
    } catch (e) { console.warn(`[NSE] history failed ${symbol}:`, e.message); }
  }

  // Fallback: Yahoo Finance
  if (!result) {
    try {
      const ySymbol     = `${symbol}.NS`;
      const intervalMap = { '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1wk' };
      const interval    = intervalMap[range] || '1d';
      for (const host of YAHOO_HOSTS) {
        try {
          const data = await httpsGet(host,
            `/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${interval}&range=${range}&includePrePost=false`,
            YAHOO_HEADERS
          );
          const cr = data?.chart?.result?.[0];
          if (!cr) continue;
          const q  = cr.indicators?.quote?.[0] || {};
          const cl = q.close || [];
          if (!cl.length) continue;
          result = {
            close: q.close, open: q.open, high: q.high, low: q.low, volume: q.volume,
            timestamps: cr.timestamp || [],
            current: cl[cl.length - 1], prev: cl[cl.length - 2],
          };
          break;
        } catch { continue; }
      }
    } catch { }
  }

  if (result) {
    nseHistoryCache.set(cacheKey, { data: result, ts: Date.now() });
  } else if (cached) {
    console.warn(`[NSE] stale history cache for ${symbol}:${range}`);
    return cached.data;
  }
  return result;
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

// ─── India movers — cached, background refresh ───────────────────────────────
async function fetchIndiaMoversData() {
  const batchSize = 10;
  const results   = [];
  for (let i = 0; i < NIFTY50.length; i += batchSize) {
    const batch = NIFTY50.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(async ticker => {
      const q = await getNSEQuote(ticker);
      if (!q || q.price == null) return null;
      return { ticker, name: NSE_NAMES[ticker] || ticker, ...q };
    }));
    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    if (i + batchSize < NIFTY50.length) await sleep(150); // reduced from 300ms
  }
  if (!results.length) return null;
  return {
    gainers: [...results].sort((a, b) => b.changePct - a.changePct).filter(s => s.changePct > 0).slice(0, 10),
    losers:  [...results].sort((a, b) => a.changePct - b.changePct).filter(s => s.changePct < 0).slice(0, 10),
    volume:  [...results].sort((a, b) => b.volume - a.volume).slice(0, 10),
  };
}

async function warmIndiaMoversCache() {
  try {
    console.log('[india/movers] warming cache...');
    const data = await fetchIndiaMoversData();
    if (data) { indiaMoversCache.data = data; indiaMoversCache.ts = Date.now(); }
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

// ─── POST /api/analyze/portfolio ─────────────────────────────────────────────
app.post('/api/analyze/portfolio', async (req, res) => {
  const { riskProfile, score, sipAmount, horizon, reaction, goal } = req.body;
  try {
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000, temperature: 0,
      system: `You are an Indian investment advisor specializing in ETFs and mutual funds for retail investors.
Give practical, specific SIP recommendations using NSE-listed ETFs and popular Indian mutual funds.
THESIS RULE: Be specific with fund names and NSE symbols. Focus on low-cost index ETFs.
Return ONLY JSON: {"summary":"string","topPicks":[{"name":"string","type":"ETF|MF","symbol":"string","allocation":number,"reason":"string"}],"monthlyPlan":{"total":number,"breakdown":[{"instrument":"string","amount":number}]},"advice":"string"}`,
      messages: [{
        role: 'user',
        content: `Risk profile: ${riskProfile} (score ${score}/16)
Monthly SIP budget: ₹${sipAmount?.toLocaleString('en-IN') || '10,000'}
Investment horizon: ${horizon}
Market reaction: ${reaction}
Goal: ${goal}
Suggest 3-5 specific NSE ETFs or Indian mutual funds with exact allocation percentages. Focus on low-cost index ETFs and diversification. Keep monthly amounts adding up to the total budget.`,
      }],
    });
    res.json(result);
  } catch (e) {
    console.error('[portfolio]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3001, '0.0.0.0', () =>
  console.log(`✅ QuAInt Signal backend on port ${process.env.PORT || 3001}`));