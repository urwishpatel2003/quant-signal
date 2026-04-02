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
  const { userId, email } = req.body;
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
    const session = await stripe.checkout.sessions.create({
      customer:   customerId, mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || 'https://quaint-signal.tech'}/?upgraded=true`,
      cancel_url:  `${process.env.FRONTEND_URL  || 'https://quaint-signal.tech'}/?cancelled=true`,
      metadata:    { clerk_user_id: userId },
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
    const [, financials, quoteData] = await Promise.all([
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
    res.json({ quoteSummary: { result: [{ summaryDetail: {
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
    res.json({ gainers, losers, volume });
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

function isMarketClosed() {
  const now = new Date();
  const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(), h = et.getHours(), m = et.getMinutes();
  const mins = h * 60 + m;
  if (day === 0 || day === 6) return true;
  return mins < 570 || mins >= 960;
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
      short:    { label: 'Short Term (1-5 days)',       indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
      swing:    { label: 'Swing Trade (1-4 weeks)',      indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} | MACD=${ta?.macd?.cross} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | ATR=${ta?.atr?.atr} | BB=${ta?.bb?.position} | Trend=${ta?.trendSignal}` },
      position: { label: 'Position Trade (1-3 months)', indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
      longterm: { label: 'Long Term (6-12 months)',      indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
    };
    const tf = tfMeta[timeframeKey] || tfMeta.swing;
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
      system: `You are a quantitative trading analyst and expert options trader.
HARD RULES: 1.RSI>70+CALL=overbought 2.RSI<30+PUT=oversold 3.StochRSI>90+CALL=extreme overbought 4.StochRSI<10+PUT=extreme oversold 5.Earnings BEFORE expiry+CRITICAL/HIGH=consider NEUTRAL 6.Down>2%+PUT=assess 7.Up>2%+CALL=assess 8.Wide spread=avoid
NEUTRAL only when multiple HARD RULES fire. Do NOT default to NEUTRAL.
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
    const { ticker, price, ohlcv, fundamentals, options, news, bonds, macroNews, intlMarkets, calendar, ta, timeframeKey = 'swing' } = req.body;
    const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
    const taCtx       = buildTAContext(ta, ticker, calendar);
    const categorized = categorizeNews(news).slice(0, 8);
    const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
    const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
    const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));
    const tfMeta = {
      short:    { label: 'Short Term (1-5 days)',       focus: 'momentum, RSI, StochRSI, volume, news.',       indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
      swing:    { label: 'Swing Trade (1-4 weeks)',      focus: 'trend, SMA20/50, MACD, BB, S/R, ATR stops.',  indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | BB=${ta?.bb?.position} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
      position: { label: 'Position Trade (1-3 months)', focus: 'SMA50/200, fundamentals, ATR, macro.',         indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
      longterm: { label: 'Long Term (6-12 months)',      focus: 'fundamentals, macro cycle, analyst consensus.', indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
    };
    const tf = tfMeta[timeframeKey] || tfMeta.swing;
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
      system: `You are a quantitative trading analyst. Timeframe: ${tf.label}. Focus: ${tf.focus}
[UPGRADE]/[INSIDER/FUND]=bullish. [DOWNGRADE]/[SHORT ATTACK]=bearish.
Use ATR for stop/target sizing. SMA200 dist >15% = extended.
Return ONLY JSON: {"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"timeframe":"${tf.label}","thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":0,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"}`,
      messages: [{ role: 'user', content: `${ticker} @ $${price?.toFixed(2)} | ${tf.label}
PRICE (5): ${JSON.stringify(ohlcv?.close?.slice(-5))}
TECHNICALS: ${tf.indicators}
${taCtx}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe}
OPTIONS: P/C=${options?.putCallRatio?.toFixed(2)} | CallIV=${options?.avgCallIV}% | PutIV=${options?.avgPutIV}%
${hasUpgrade?'🟢 UPGRADE':''}${hasDowngrade?'🔴 DOWNGRADE':''}${hasFund?'🏦 INSTITUTIONAL':''}
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
    const { ticker, price, ohlcv, fundamentals, news, ta } = req.body;
    const categorized = categorizeNews(news).slice(0, 5);
    const taCtx       = buildTAContext(ta, ticker);
    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 800, temperature: 0,
      system: `You are a quantitative trading analyst. Timeframe: Long Term (6-12 months).
Focus: fundamentals, macro cycle, SMA200, analyst consensus.
Return ONLY JSON: {"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH"}`,
      messages: [{ role: 'user', content: `${ticker} @ $${price?.toFixed(2)} | LONG TERM
PRICE (5): ${JSON.stringify(ohlcv?.close?.slice(-5))}
RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal}
${taCtx}
FUNDAMENTALS: P/E=${fundamentals?.pe} | EPS=$${fundamentals?.eps} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice}
NEWS: ${categorized.slice(0,4).join(' | ')}
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
          const q = await yahooNSEQuote(ticker);
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
const NIFTY50 = [
  'RELIANCE','TCS','HDFCBANK','BHARTIARTL','ICICIBANK','INFOSYS','SBIN','HINDUNILVR',
  'ITC','BAJFINANCE','LT','KOTAKBANK','HCLTECH','AXISBANK','ASIANPAINT','MARUTI',
  'SUNPHARMA','TITAN','ULTRACEMCO','NTPC','POWERGRID','WIPRO','JSWSTEEL','TATAMOTORS',
  'ADANIPORTS','COALINDIA','BAJAJFINSV','TECHM','INDUSINDBK','BRITANNIA','HINDALCO',
  'BAJAJ-AUTO','GRASIM','TATACONSUM','CIPLA','APOLLOHOSP','DRREDDY','EICHERMOT',
  'DIVISLAB','HEROMOTOCO','BPCL','ONGC','M&M','NESTLEIND','SBILIFE','HDFCLIFE',
  'TATASTEEL','UPL','ADANIENT','SHRIRAMFIN',
];

// NSE symbol → display name map
const NSE_NAMES = {
  'RELIANCE':'Reliance Industries','TCS':'Tata Consultancy Services','HDFCBANK':'HDFC Bank',
  'BHARTIARTL':'Bharti Airtel','ICICIBANK':'ICICI Bank','INFOSYS':'Infosys',
  'SBIN':'State Bank of India','HINDUNILVR':'Hindustan Unilever','ITC':'ITC Ltd',
  'BAJFINANCE':'Bajaj Finance','LT':'Larsen & Toubro','KOTAKBANK':'Kotak Mahindra Bank',
  'HCLTECH':'HCL Technologies','AXISBANK':'Axis Bank','ASIANPAINT':'Asian Paints',
  'MARUTI':'Maruti Suzuki','SUNPHARMA':'Sun Pharmaceutical','TITAN':'Titan Company',
  'ULTRACEMCO':'UltraTech Cement','NTPC':'NTPC Ltd','POWERGRID':'Power Grid Corp',
  'WIPRO':'Wipro','JSWSTEEL':'JSW Steel','TATAMOTORS':'Tata Motors',
  'ADANIPORTS':'Adani Ports','COALINDIA':'Coal India','BAJAJFINSV':'Bajaj Finserv',
  'TECHM':'Tech Mahindra','INDUSINDBK':'IndusInd Bank','BRITANNIA':'Britannia Industries',
  'HINDALCO':'Hindalco Industries','BAJAJ-AUTO':'Bajaj Auto','GRASIM':'Grasim Industries',
  'TATACONSUM':'Tata Consumer Products','CIPLA':'Cipla','APOLLOHOSP':'Apollo Hospitals',
  'DRREDDY':"Dr. Reddy's Laboratories",'EICHERMOT':'Eicher Motors',
  'DIVISLAB':"Divi's Laboratories",'HEROMOTOCO':'Hero MotoCorp','BPCL':'BPCL',
  'ONGC':'ONGC','M&M':'Mahindra & Mahindra','NESTLEIND':'Nestle India',
  'SBILIFE':'SBI Life Insurance','HDFCLIFE':'HDFC Life Insurance','TATASTEEL':'Tata Steel',
  'UPL':'UPL Ltd','ADANIENT':'Adani Enterprises','SHRIRAMFIN':'Shriram Finance',
};

// Fetch Yahoo Finance quote for a single NSE stock
async function yahooNSEQuote(symbol) {
  try {
    const ySymbol = `${symbol}.NS`;
    const data = await httpsGet(
      'query1.finance.yahoo.com',
      `/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5d`,
      { 'User-Agent': 'Mozilla/5.0' }
    );
    const meta   = data?.chart?.result?.[0]?.meta;
    const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0];
    const closes = data?.chart?.result?.[0]?.timestamp;
    if (!meta?.regularMarketPrice) return null;
    const price     = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const change    = price && prevClose ? price - prevClose : null;
    const changePct = change && prevClose ? (change / prevClose) * 100 : null;
    const volume    = meta.regularMarketVolume || 0;
    return {
      price, prevClose,
      change:    change    ? parseFloat(change.toFixed(2))    : null,
      changePct: changePct ? parseFloat(changePct.toFixed(2)) : null,
      volume, open: meta.regularMarketOpen || null,
      high: meta.regularMarketDayHigh || null,
      low:  meta.regularMarketDayLow  || null,
    };
  } catch (e) { return null; }
}

// Fetch Yahoo Finance history for NSE stock
async function yahooNSEHistory(symbol, range = '3mo') {
  try {
    const ySymbol  = `${symbol}.NS`;
    const intervalMap = { '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1wk' };
    const interval = intervalMap[range] || '1d';
    const data = await httpsGet(
      'query1.finance.yahoo.com',
      `/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${interval}&range=${range}`,
      { 'User-Agent': 'Mozilla/5.0' }
    );
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const quote      = result.indicators?.quote?.[0] || {};
    const closes     = quote.close || [];
    if (!closes.length) return null;
    return {
      close: quote.close, open: quote.open, high: quote.high,
      low: quote.low, volume: quote.volume, timestamps,
      current: closes[closes.length - 1],
      prev:    closes[closes.length - 2],
    };
  } catch (e) { return null; }
}

// ─── GET /india/search ────────────────────────────────────────────────────────
app.get('/india/search', (req, res) => {
  const q = (req.query.q || '').toUpperCase().trim();
  if (!q) return res.json([]);
  const all = NIFTY50.map(sym => ({ ticker: sym, name: NSE_NAMES[sym] || sym, exchange: 'NSE' }));
  const startsWith = all.filter(s => s.ticker.startsWith(q));
  const contains   = all.filter(s => !s.ticker.startsWith(q) && (s.ticker.includes(q) || s.name.toUpperCase().includes(q)));
  res.json([...startsWith, ...contains].slice(0, 10));
});

// ─── GET /india/quote/:symbol ─────────────────────────────────────────────────
app.get('/india/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const q = await yahooNSEQuote(symbol);
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
    const data = await yahooNSEHistory(symbol, range);
    if (!data) return res.status(404).json({ error: `No history for ${symbol}.NS` });
    res.json({ chart: { result: [{ meta: { symbol, currency: 'INR' },
      timestamp: data.timestamps,
      indicators: { quote: [{ open: data.open, high: data.high, low: data.low, close: data.close, volume: data.volume }] }
    }] } });
  } catch (e) {
    console.error('[india/history]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /india/movers ────────────────────────────────────────────────────────
app.get('/india/movers', async (req, res) => {
  try {
    // Fetch all Nifty 50 quotes in parallel batches of 10
    const batchSize = 10;
    const results   = [];
    for (let i = 0; i < NIFTY50.length; i += batchSize) {
      const batch = NIFTY50.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async ticker => {
        const q = await yahooNSEQuote(ticker);
        if (!q || q.price == null) return null;
        return { ticker, name: NSE_NAMES[ticker] || ticker, ...q };
      }));
      results.push(...batchResults.filter(Boolean));
      if (i + batchSize < NIFTY50.length) await sleep(200);
    }

    const sorted  = [...results].sort((a, b) => b.changePct - a.changePct);
    res.json({
      gainers: sorted.filter(s => s.changePct > 0).slice(0, 10),
      losers:  [...results].sort((a, b) => a.changePct - b.changePct).filter(s => s.changePct < 0).slice(0, 10),
      volume:  [...results].sort((a, b) => b.volume - a.volume).slice(0, 10),
    });
  } catch (e) {
    console.error('[india/movers]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3001, '0.0.0.0', () =>
  console.log(`✅ QuAInt Signal backend on port ${process.env.PORT || 3001}`));