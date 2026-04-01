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

// ─── Raw body for Stripe webhooks ─────────────────────────────────────────────
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Surrogate-Control', 'no-store');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const POLYGON_KEY   = process.env.POLYGON_API_KEY;
const TRADIER_TOKEN = process.env.TRADIER_TOKEN;

// ─── Rate limiting ────────────────────────────────────────────────────────────

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

// ─── Supabase helpers ─────────────────────────────────────────────────────────

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

// ─── Usage routes ─────────────────────────────────────────────────────────────

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
    console.log(`[track] userId=${req.params.userId} type=${type} plan=${user.plan}`);
    const updated = await trackUsage(req.params.userId, type);
    console.log(`[track] result:`, updated);
    res.json({ ...updated, plan: user.plan });
  } catch (e) {
    console.error('[usage POST]', e.message);
    res.json({ scans: 0, options: 0, plan: 'free' });
  }
});

// ─── Stripe checkout ──────────────────────────────────────────────────────────

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

// ─── Stripe billing portal ────────────────────────────────────────────────────

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

// ─── Stripe webhook ───────────────────────────────────────────────────────────

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[webhook] signature error:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId  = session.metadata?.clerk_user_id;
        if (userId) {
          await supabase.from('users').update({ plan: 'pro', stripe_subscription_id: session.subscription }).eq('id', userId);
          console.log(`[webhook] upgraded ${userId} to pro`);
        }
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused': {
        const sub = event.data.object;
        const { data: user } = await supabase.from('users').select('id').eq('stripe_customer_id', sub.customer).single();
        if (user) { await supabase.from('users').update({ plan: 'free' }).eq('id', user.id); }
        break;
      }
      case 'customer.subscription.updated': {
        const sub    = event.data.object;
        const active = sub.status === 'active' || sub.status === 'trialing';
        const { data: user } = await supabase.from('users').select('id').eq('stripe_customer_id', sub.customer).single();
        if (user) { await supabase.from('users').update({ plan: active ? 'pro' : 'free' }).eq('id', user.id); }
        break;
      }
    }
  } catch (e) { console.error('[webhook] handler error:', e.message); }
  res.json({ received: true });
});

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

const polygonGet = path =>
  httpsGet('api.polygon.io', `${path}${path.includes('?') ? '&' : '?'}apiKey=${POLYGON_KEY}`);
const tradierGet = path =>
  httpsGet('api.tradier.com', path, { Authorization: `Bearer ${TRADIER_TOKEN}` });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Tradier history ──────────────────────────────────────────────────────────

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

// ─── Polygon aggs ─────────────────────────────────────────────────────────────

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

// ─── Stock history ────────────────────────────────────────────────────────────

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

// ─── Fundamentals ─────────────────────────────────────────────────────────────

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

// ─── Stock news ───────────────────────────────────────────────────────────────

app.get('/yahoo/v1/finance/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    const data = await polygonGet(`/v2/reference/news?ticker=${q}&limit=8&order=desc&sort=published_utc`);
    res.json({ news: (data.results || []).map(n => ({
      title: n.title, publisher: n.publisher?.name || '',
      providerPublishTime: Math.floor(new Date(n.published_utc).getTime() / 1000),
      link: n.article_url,
    })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Ticker search ────────────────────────────────────────────────────────────

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

// ─── Movers ───────────────────────────────────────────────────────────────────

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

// ─── Crypto ───────────────────────────────────────────────────────────────────

app.get('/crypto', async (req, res) => {
  try {
    const COINS = [
      'bitcoin','ethereum','solana','ripple','binancecoin',
      'dogecoin','cardano','avalanche-2','chainlink','matic-network',
      'polkadot','shiba-inu','tron','litecoin','uniswap',
      'stellar','monero','internet-computer','aptos','arbitrum',
      'optimism','near','the-graph','injective-protocol','sui',
    ];
    const data = await httpsGet(
      'api.coingecko.com',
      `/api/v3/coins/markets?vs_currency=usd&ids=${COINS.join(',')}&order=market_cap_desc&per_page=25&page=1&price_change_percentage=24h`,
      { 'Accept': 'application/json', 'User-Agent': 'QuAIntSignal/1.0' }
    );
    if (!Array.isArray(data)) return res.json({ gainers: [], losers: [], volume: [] });
    const list = data.map(c => ({
      ticker: c.symbol?.toUpperCase(), name: c.name,
      price: c.current_price || 0, change: c.price_change_24h || 0,
      changePct: c.price_change_percentage_24h || 0,
      volume: c.total_volume || 0, marketCap: c.market_cap || 0, type: 'crypto',
    }));
    const sorted = [...list].sort((a, b) => b.changePct - a.changePct);
    res.json({
      gainers: sorted.filter(c => c.changePct > 0).slice(0, 10),
      losers:  [...list].sort((a, b) => a.changePct - b.changePct).filter(c => c.changePct < 0).slice(0, 10),
      volume:  [...list].sort((a, b) => b.volume - a.volume).slice(0, 10),
    });
  } catch (e) { res.json({ gainers: [], losers: [], volume: [] }); }
});

// ─── Tradier routes ───────────────────────────────────────────────────────────

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

// ─── Bonds ────────────────────────────────────────────────────────────────────

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

// ─── International ────────────────────────────────────────────────────────────

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

// ─── Calendar ─────────────────────────────────────────────────────────────────

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

// ─── Indicator helpers (server-side — not exposed to client) ──────────────────

function checkRSIContradiction(rsi14, recommendation) {
  if (!rsi14 || !recommendation) return null;
  if (recommendation === 'CALL' && rsi14 > 70)
    return `⚠ RSI CONTRADICTION: RSI=${rsi14} OVERBOUGHT but recommending CALLs — mean reversion risk HIGH`;
  if (recommendation === 'PUT' && rsi14 < 30)
    return `⚠ RSI CONTRADICTION: RSI=${rsi14} OVERSOLD but recommending PUTs — bounce risk HIGH`;
  if (recommendation === 'CALL' && rsi14 > 65)
    return `CAUTION: RSI=${rsi14} approaching overbought for CALL entry`;
  if (recommendation === 'PUT' && rsi14 < 35)
    return `CAUTION: RSI=${rsi14} approaching oversold for PUT entry`;
  return null;
}

function calcDeltaAdjustedSize(delta, premium, budget = 1500) {
  if (!delta || !premium || premium <= 0) return null;
  const absDelta  = Math.abs(parseFloat(delta));
  const contracts = Math.max(1, Math.floor(budget / (premium * 100)));
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
  const risk =
    daysToEarnings <= 3  ? 'CRITICAL' :
    daysToEarnings <= 7  ? 'HIGH'     :
    daysToEarnings <= 14 ? 'MEDIUM'   : 'LOW';
  const advice =
    daysToEarnings <= 3  ? 'Earnings <3 days away — IV crush risk extreme. Avoid buying options.' :
    daysToEarnings <= 7  ? 'Earnings within 1 week — IV elevated, premium expensive.' :
    daysToEarnings <= 14 ? 'Earnings within 2 weeks — factor IV expansion into cost.' :
                           'No imminent earnings risk.';
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
    if (t.includes('upgrade') || t.includes('outperform') || t.includes('buy rating') || t.includes('overweight') || t.includes('initiated'))
      return `[UPGRADE] ${n.title}`;
    if (t.includes('downgrade') || t.includes('underperform') || t.includes('sell rating') || t.includes('underweight') || t.includes('cuts to'))
      return `[DOWNGRADE] ${n.title}`;
    if (t.includes('price target') || t.includes('raises target') || t.includes('lowers target') || t.includes('pt raised') || t.includes('pt cut'))
      return `[ANALYST TARGET] ${n.title}`;
    if (t.includes('13f') || t.includes('insider') || t.includes('stake') || t.includes('buffett') || t.includes('bought shares') || t.includes('sold shares'))
      return `[INSIDER/FUND] ${n.title}`;
    if (t.includes('earnings') || t.includes('eps') || t.includes('revenue') || t.includes('beat') || t.includes('miss') || t.includes('guidance'))
      return `[EARNINGS] ${n.title}`;
    if (t.includes('fda') || t.includes('approval') || t.includes('lawsuit') || t.includes('sec') || t.includes('merger') || t.includes('acquisition'))
      return `[REGULATORY/EVENT] ${n.title}`;
    if (t.includes('short seller') || t.includes('hindenburg') || t.includes('citron'))
      return `[SHORT ATTACK] ${n.title}`;
    return `[NEWS] ${n.title}`;
  });
}

function buildMacroContext(bonds, macroNews, intlMarkets, calendar) {
  let ctx = '\n=== MACRO ===\n';
  if (bonds)
    ctx += `BONDS: 10Y=${bonds.tnx?.current?.toFixed(2)}% | 2Y=${bonds.irx?.current?.toFixed(2)}% | Curve=${bonds.yieldCurve}% ${bonds.inverted ? '⚠ INVERTED' : ''} | TLT=$${bonds.tlt?.current?.toFixed(2)}\n`;
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
    if      (dayChangePct <= -1.5)  ctx += `⚠ DOWN ${abs}% TODAY — put IV likely elevated, assess if move already priced in.\n`;
    else if (dayChangePct <= -0.75) ctx += `NOTE: Down ${abs}% today — put premiums slightly elevated.\n`;
    else if (dayChangePct >= 1.5)   ctx += `⚠ UP ${abs}% TODAY — call IV likely elevated, assess if move already priced in.\n`;
    else if (dayChangePct >= 0.75)  ctx += `NOTE: Up ${abs}% today — call premiums slightly elevated.\n`;
  }
  if (current && open)
    ctx += `FROM OPEN: ${((current - open) / open * 100).toFixed(2)}% (open=$${open.toFixed(2)})\n`;
  if (ohlcv?.close?.length >= 5) {
    const closes   = ohlcv.close.slice(-5);
    const momentum = ((closes[4] - closes[0]) / closes[0] * 100).toFixed(2);
    ctx += `5-SESSION: ${parseFloat(momentum) > 0 ? 'UP' : 'DOWN'} ${Math.abs(momentum)}% | ${closes.map(c => `$${c.toFixed(2)}`).join('→')}\n`;
    let downDays = 0, upDays = 0;
    for (let i = closes.length - 1; i > 0; i--) { if (closes[i] < closes[i-1]) downDays++; else break; }
    for (let i = closes.length - 1; i > 0; i--) { if (closes[i] > closes[i-1]) upDays++;   else break; }
    if (downDays >= 4) ctx += `⚠ ${downDays} CONSECUTIVE DOWN SESSIONS — extended move, bounce risk elevated.\n`;
    if (upDays   >= 4) ctx += `⚠ ${upDays} CONSECUTIVE UP SESSIONS — extended move, pullback risk elevated.\n`;
  }
  return ctx;
}

function buildTAContext(ta, ticker = '', calendar = null, selectedExpiry = null) {
  if (!ta) return '';
  let ctx = '\n=== TECHNICAL ANALYSIS ===\n';
  if (ta.macd) {
    ctx += `MACD: Line=${ta.macd.macdLine} | Signal=${ta.macd.signalLine} | Hist=${ta.macd.histogram} | ${ta.macd.trend} | ${ta.macd.cross}\n`;
    if (ta.macd.cross === 'BULLISH_CROSS') ctx += `✅ MACD BULLISH CROSS — momentum turning up\n`;
    if (ta.macd.cross === 'BEARISH_CROSS') ctx += `🔴 MACD BEARISH CROSS — momentum turning down\n`;
  }
  if (ta.bb) {
    ctx += `BB: Upper=$${ta.bb.upper} | Mid=$${ta.bb.middle} | Lower=$${ta.bb.lower} | Width=${ta.bb.bWidth}% | %B=${ta.bb.bPct} | ${ta.bb.position}\n`;
    if (ta.bb.squeeze)                   ctx += `🔥 BB SQUEEZE — breakout likely soon\n`;
    if (ta.bb.position === 'NEAR_UPPER') ctx += `NOTE: Price near BB upper band — slightly extended\n`;
    if (ta.bb.position === 'NEAR_LOWER') ctx += `NOTE: Price near BB lower band — potential support\n`;
  }
  if (ta.atr) {
    ctx += `ATR(14): ${ta.atr.atr} (${ta.atr.atrPct}% of price) | Volatility=${ta.atr.volatility}\n`;
    ctx += `ATR STOPS: Long=$${ta.atr.atr1Stop} (1x) / $${ta.atr.atr2Stop} (2x) | Short=$${ta.atr.shortStop}\n`;
    ctx += `ATR TARGETS: 1x=$${ta.atr.atr1Target} | 2x=$${ta.atr.atr2Target}\n`;
    if (ta.atr.volatility === 'HIGH') ctx += `⚠ HIGH ATR — wide price swings, size down accordingly\n`;
    if (ta.atr.volatility === 'LOW')  ctx += `ℹ LOW ATR — tight range, options may be cheap\n`;
  }
  if (ta.stochRSI) {
    ctx += `STOCH RSI: K=${ta.stochRSI.k} | D=${ta.stochRSI.d} | ${ta.stochRSI.signal}${ta.stochRSI.crossover ? ` | ${ta.stochRSI.crossover}` : ''}\n`;
    if (ta.stochRSI.signal === 'OVERBOUGHT') ctx += `⚠ STOCH RSI EXTREME OVERBOUGHT (K=${ta.stochRSI.k} >90) — strong mean reversion warning\n`;
    if (ta.stochRSI.signal === 'OVERSOLD')   ctx += `✅ STOCH RSI EXTREME OVERSOLD (K=${ta.stochRSI.k} <10) — strong bounce signal\n`;
    if (ta.stochRSI.crossover === 'BULLISH_CROSS') ctx += `✅ STOCH RSI BULLISH CROSS — short-term momentum turning up\n`;
    if (ta.stochRSI.crossover === 'BEARISH_CROSS') ctx += `🔴 STOCH RSI BEARISH CROSS — short-term momentum turning down\n`;
  }
  if (ta.sr) {
    ctx += `SUPPORT: ${ta.sr.supportLevels.map(s => `$${s}`).join(', ') || 'none'} | Nearest=$${ta.sr.nearestSupport} (${ta.sr.distToSupport}% below)\n`;
    ctx += `RESISTANCE: ${ta.sr.resistanceLevels.map(r => `$${r}`).join(', ') || 'none'} | Nearest=$${ta.sr.nearestResistance} (${ta.sr.distToResistance}% above)\n`;
    ctx += `S/R Ratio=${ta.sr.srRatio} | Period High=$${ta.sr.periodHigh} | Period Low=$${ta.sr.periodLow}\n`;
    if (ta.sr.distToResistance < 5)         ctx += `NOTE: Within 5% of resistance ($${ta.sr.nearestResistance}) — factor into CALL target\n`;
    if (ta.sr.distToSupport    < 5)         ctx += `NOTE: Within 5% of support ($${ta.sr.nearestSupport}) — factor into PUT target\n`;
    if (ta.sr.srRatio && ta.sr.srRatio > 2) ctx += `✅ GOOD LONG SETUP: ${ta.sr.distToResistance}% to resistance vs ${ta.sr.distToSupport}% to support\n`;
  }
  if (ta.priceVsSma20 != null)
    ctx += `SMA DIST: vs SMA20=${ta.priceVsSma20}% | vs SMA50=${ta.priceVsSma50 ?? 'N/A'}% | vs SMA200=${ta.priceVsSma200 ?? 'N/A'}%\n`;
  if (ta.priceVsSma200 && Math.abs(parseFloat(ta.priceVsSma200)) > 15)
    ctx += `⚠ Price ${ta.priceVsSma200}% from SMA200 — very extended, mean reversion risk\n`;
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
  ctx += `IV PERCENTILE (session estimate): ${chain.ivPercentile}% — ${chain.ivPctLabel} (note: rough estimate, use as secondary signal only)\n`;
  ctx += `VOL/OI: Calls=${chain.callVolOIRatio} | Puts=${chain.putVolOIRatio} | P/C Vol=${parseFloat(chain.putCallVolRatio)?.toFixed(2)}\n`;
  if (chain.unusualCalls?.length) ctx += `🔥 UNUSUAL CALL VOL: ${chain.unusualCalls.join(', ')}\n`;
  if (chain.unusualPuts?.length)  ctx += `🔥 UNUSUAL PUT VOL: ${chain.unusualPuts.join(', ')}\n`;
  if (chain.highGammaStrike) ctx += `GAMMA PIN: $${chain.highGammaStrike}\n`;
  const wideCalls = (chain.topCalls || []).filter(c => c.wideSpread).map(c => `$${c.strike}`);
  const widePuts  = (chain.topPuts  || []).filter(p => p.wideSpread).map(p => `$${p.strike}`);
  if (wideCalls.length) ctx += `⚠ WIDE SPREAD CALLS (illiquid): ${wideCalls.join(', ')}\n`;
  if (widePuts.length)  ctx += `⚠ WIDE SPREAD PUTS (illiquid): ${widePuts.join(', ')}\n`;
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

// ─── Combined analysis (scanner + options) ────────────────────────────────────

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
    const callStop      = (callMid * 0.50).toFixed(2);
    const callTarget    = (callMid * 2.00).toFixed(2);
    const putStop       = (putMid  * 0.50).toFixed(2);
    const putTarget     = (putMid  * 2.00).toFixed(2);

    const prevClose    = ohlcv?.prev || quote?.prevClose;
    const dayChangePct = price && prevClose ? ((price - prevClose) / prevClose * 100) : 0;
    const callContradiction = checkRSIContradiction(ta?.rsi14, 'CALL');
    const putContradiction  = checkRSIContradiction(ta?.rsi14, 'PUT');
    const ep = calcEarningsProximity(calendar, ticker, expiry);

    const tfMeta = {
      short:    { label: 'Short Term (1-5 days)',      indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}] | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
      swing:    { label: 'Swing Trade (1-4 weeks)',     indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} | MACD=${ta?.macd?.cross} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | ATR=${ta?.atr?.atr} | BB=${ta?.bb?.position} | Trend=${ta?.trendSignal}` },
      position: { label: 'Position Trade (1-3 months)', indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
      longterm: { label: 'Long Term (6-12 months)',     indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
    };
    const tf = tfMeta[timeframeKey] || tfMeta.swing;

    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
      system: `You are a quantitative trading analyst and expert options trader.

HARD RULES (these MUST block or heavily penalize a recommendation):
1. RSI >70 + CALL recommendation: Must explicitly address overbought risk.
2. RSI <30 + PUT recommendation: Must explicitly address oversold/bounce risk.
3. StochRSI >90 + CALL: Extreme overbought — strong warning.
4. StochRSI <10 + PUT: Extreme oversold — strong warning.
5. Earnings BEFORE expiry + CRITICAL/HIGH risk: Strongly consider NEUTRAL due to IV crush.
6. Stock already down >2% today + PUT: Assess if move already priced in.
7. Stock already up >2% today + CALL: Assess if move already priced in.
8. Wide spread contracts (⚠WIDE): Avoid — recommend liquid alternatives.

INFORMATIONAL SIGNALS (weigh but do not automatically block):
- IV Percentile (session estimate — lower confidence, use as secondary signal)
- StochRSI between 10-90: Informational trend signal only
- MACD cross: Adds directional weight but not a blocker
- BB position: Context only unless extreme
- S/R proximity: Note in reasoning if within 5%, but not a blocker
- ATR HIGH/LOW: Affects sizing recommendation
- Consecutive days (3+): Elevated caution, not automatic NEUTRAL
- SMA200 distance >15%: Extended, note in thesis

IMPORTANT: NEUTRAL is valid when multiple HARD RULES fire simultaneously.
But do NOT default to NEUTRAL for normal market conditions.
A stock can be slightly overbought with RSI 65 and still be a valid CALL if trend, MACD, and macro are aligned.
Use all signals together — single signals rarely justify NEUTRAL.

Return ONLY JSON with keys "price" and "options". No markdown.`,
      messages: [{
        role: 'user',
        content: `Analyze ${ticker} @ $${price?.toFixed(2)} | ${tf.label} | Expiry: ${expiry}
Market: ${isMarketClosed() ? 'CLOSED' : 'OPEN'} | ${new Date().toLocaleDateString()}
${intradayCtx}
${taCtx}
${chainCtx}
${sizingCtx}
${callContradiction ? `RSI WARNING: ${callContradiction}` : ''}
${putContradiction  ? `RSI WARNING: ${putContradiction}`  : ''}
${ep ? `EARNINGS RISK: ${ep.daysToEarnings}d away | Before expiry: ${ep.earningsBeforeExpiry} | ${ep.risk} | ${ep.advice}` : ''}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe}
OPTIONS FLOW: P/C OI=${chain?.putCallRatio?.toFixed(2)} | P/C Vol=${parseFloat(chain?.putCallVolRatio)?.toFixed(2)} | CallIV=${chain?.avgCallIV}% | PutIV=${chain?.avgPutIV}%
PRICE (5 closes): ${JSON.stringify(ohlcv?.close?.slice(-5))}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
${macroCtx}
ATM CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid}|a$${c.ask}|m$${c.mid}|IV${c.iv}%|d${c.delta}|g${c.gamma}|OI${c.oi}|vol${c.volume}|sprd${c.spreadPct}%${c.unusualVolume ? '🔥' : ''}${c.wideSpread ? '⚠WIDE' : ''}`).join(' ')}
ATM PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid}|a$${p.ask}|m$${p.mid}|IV${p.iv}%|d${p.delta}|g${p.gamma}|OI${p.oi}|vol${p.volume}|sprd${p.spreadPct}%${p.unusualVolume ? '🔥' : ''}${p.wideSpread ? '⚠WIDE' : ''}`).join(' ')}
DECISION SUMMARY:
- Today: ${dayChangePct >= 0 ? 'UP' : 'DOWN'} ${Math.abs(dayChangePct).toFixed(2)}%
- RSI: ${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI: K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}]
- MACD: ${ta?.macd?.cross || 'N/A'} | BB: ${ta?.bb?.position || 'N/A'}
- ATR: ${ta?.atr?.atr} (${ta?.atr?.volatility}) | ATR stop: $${ta?.atr?.atr1Stop}
- Resistance: $${ta?.sr?.nearestResistance} (${ta?.sr?.distToResistance}% away)
- Support: $${ta?.sr?.nearestSupport} (${ta?.sr?.distToSupport}% away)
- Earnings: ${ep ? `${ep.daysToEarnings}d [${ep.risk}]${ep.earningsBeforeExpiry ? ' BEFORE EXPIRY ⚠' : ''}` : 'none'}
- IV Pct (estimate): ${chain?.ivPercentile}% | Skew: ${chain?.ivSkewLabel}
- Unusual vol: ${[...(chain?.unusualCalls || []), ...(chain?.unusualPuts || [])].length > 0 ? 'YES' : 'NONE'}
Return JSON:
{
  "price": {
    "signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,
    "timeframe":"${tf.label}","thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],
    "riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":0,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL",
    "bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"
  },
  "options": {
    "recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,
    "reasoning":"Address the key signals: today's move, RSI, MACD, BB, S/R, ATR, earnings if any.",
    "ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string",
    "positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string",
    "bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"Sell at $${callTarget} — profit $${((parseFloat(callTarget)-callMid)*100*callContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop} (50% loss). ATR stop: $${ta?.atr?.atr1Stop}","thesis":"string","delta":"string","iv":"string"},
    "bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"Sell at $${putTarget} — profit $${((parseFloat(putTarget)-putMid)*100*putContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop} (50% loss). ATR stop: $${ta?.atr?.shortStop}","thesis":"string","delta":"string","iv":"string"}
  }
}
RULES: Exact bid/ask/mid only. Avoid wide-spread strikes. OI>50. Return JSON only.`
      }]
    });

    res.json({ priceSignal: result.price, optionsSignal: result.options });
  } catch (e) {
    console.error('[analyze/combined]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Price only analysis (scanner) ───────────────────────────────────────────

app.post('/api/analyze/price', async (req, res) => {
  try {
    const { ticker, price, ohlcv, fundamentals, options, news,
            bonds, macroNews, intlMarkets, calendar, ta, timeframeKey = 'swing' } = req.body;

    const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
    const taCtx       = buildTAContext(ta, ticker, calendar);
    const categorized = categorizeNews(news).slice(0, 8);
    const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
    const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
    const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));

    const tfMeta = {
      short:    { label: 'Short Term (1-5 days)',      focus: 'momentum, RSI, StochRSI, volume, news.',      indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}] | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
      swing:    { label: 'Swing Trade (1-4 weeks)',     focus: 'trend, SMA20/50, MACD, BB, S/R, ATR stops.', indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | BB=${ta?.bb?.position} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
      position: { label: 'Position Trade (1-3 months)', focus: 'SMA50/200, fundamentals, ATR, macro.',        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
      longterm: { label: 'Long Term (6-12 months)',     focus: 'fundamentals, macro cycle, analyst consensus.',indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
    };
    const tf = tfMeta[timeframeKey] || tfMeta.swing;

    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
      system: `You are a quantitative trading analyst. Timeframe: ${tf.label}. Focus: ${tf.focus}
[UPGRADE]/[INSIDER/FUND]=bullish. [DOWNGRADE]/[SHORT ATTACK]=bearish.
Use ATR for stop/target sizing. Use S/R levels as natural price targets.
SMA200 dist >15% = extended, factor mean reversion into thesis.
Return ONLY JSON: {"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"timeframe":"${tf.label}","thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":0,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"}`,
      messages: [{
        role: 'user',
        content: `${ticker} @ $${price?.toFixed(2)} | ${tf.label}
PRICE (5 closes): ${JSON.stringify(ohlcv?.close?.slice(-5))}
TECHNICALS: ${tf.indicators}
${taCtx}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe} | RevGrowth=${fundamentals?.revenueGrowth}
OPTIONS FLOW: P/C=${options?.putCallRatio?.toFixed(2)} | CallIV=${options?.avgCallIV}% | PutIV=${options?.avgPutIV}%
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
${macroCtx}
Return JSON only.`
      }]
    });

    res.json(result);
  } catch (e) {
    console.error('[analyze/price]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Options only analysis (expiry switch) ────────────────────────────────────

app.post('/api/analyze/options', async (req, res) => {
  try {
    const { ticker, price, expiry, chain, fundamentals, news, priceSignal,
            bonds, macroNews, intlMarkets, calendar, ta, quote } = req.body;

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
    const callStop      = (callMid * 0.50).toFixed(2);
    const callTarget    = (callMid * 2.00).toFixed(2);
    const putStop       = (putMid  * 0.50).toFixed(2);
    const putTarget     = (putMid  * 2.00).toFixed(2);

    const callContradiction = checkRSIContradiction(ta?.rsi14, 'CALL');
    const putContradiction  = checkRSIContradiction(ta?.rsi14, 'PUT');
    const ep = calcEarningsProximity(calendar, ticker, expiry);

    const result = await callClaudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
      system: `You are an expert options trader.

HARD RULES (must address explicitly):
1. RSI >70 + CALL = overbought warning. RSI <30 + PUT = oversold warning.
2. StochRSI >90 + CALL = extreme overbought. StochRSI <10 + PUT = extreme oversold.
3. Earnings BEFORE expiry + HIGH/CRITICAL risk = IV crush warning, consider NEUTRAL.
4. Stock down >2% today + PUT = assess if already priced in.
5. Stock up >2% today + CALL = assess if already priced in.
6. Wide spread (⚠WIDE) = avoid that strike.

INFORMATIONAL (weigh but do not auto-block):
- IV Percentile (session estimate — secondary signal only)
- MACD, BB, S/R proximity within 5%, ATR, consecutive days

IMPORTANT: Do NOT default to NEUTRAL for normal market conditions.
Use all signals holistically. Single mild signals do not justify NEUTRAL.
NEUTRAL is for when multiple hard rules fire or risk/reward is genuinely poor.

Return ONLY JSON.`,
      messages: [{
        role: 'user',
        content: `OPTIONS: ${ticker} @ $${price?.toFixed(2)} | Expiry: ${expiry} | ${isMarketClosed() ? 'CLOSED' : 'OPEN'}
${intradayCtx}
${taCtx}
${chainCtx}
${sizingCtx}
${callContradiction ? `RSI WARNING: ${callContradiction}` : ''}
${putContradiction  ? `RSI WARNING: ${putContradiction}`  : ''}
${ep ? `EARNINGS: ${ep.daysToEarnings}d | Before expiry: ${ep.earningsBeforeExpiry} | ${ep.risk} | ${ep.advice}` : ''}
Price Signal: ${priceSignal?.signal} ${priceSignal?.confidence}% | Macro: ${priceSignal?.macroImpact} | Global: ${priceSignal?.globalMarketTrend}
FUNDAMENTALS: Rec=${fundamentals?.recommendationKey?.toUpperCase()} | Target=$${fundamentals?.targetMeanPrice}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid}|a$${c.ask}|m$${c.mid}|IV${c.iv}%|d${c.delta}|g${c.gamma}|OI${c.oi}|vol${c.volume}|sprd${c.spreadPct}%${c.unusualVolume ? '🔥' : ''}${c.wideSpread ? '⚠' : ''}`).join(' ')}
PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid}|a$${p.ask}|m$${p.mid}|IV${p.iv}%|d${p.delta}|g${p.gamma}|OI${p.oi}|vol${p.volume}|sprd${p.spreadPct}%${p.unusualVolume ? '🔥' : ''}${p.wideSpread ? '⚠' : ''}`).join(' ')}
${macroCtx}
Return JSON: {"recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,"reasoning":"Explain overall picture — RSI (${ta?.rsi14}), StochRSI (K=${ta?.stochRSI?.k}), MACD (${ta?.macd?.cross}), BB (${ta?.bb?.position}), S/R (res $${ta?.sr?.nearestResistance} ${ta?.sr?.distToResistance}% away), ATR (${ta?.atr?.volatility}), earnings (${ep ? ep.risk : 'none'}), intraday move, unusual vol","ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string","positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string","bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop}. ATR stop: $${ta?.atr?.atr1Stop}","thesis":"string","delta":"string","iv":"string"},"bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop}. ATR stop: $${ta?.atr?.shortStop}","thesis":"string","delta":"string","iv":"string"}}`
      }]
    });

    res.json(result);
  } catch (e) {
    console.error('[analyze/options]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Legacy Claude proxy (keep for backward compat) ───────────────────────────

app.post('/api/analyze', (req, res) => {
  const body = JSON.stringify(req.body || {});
  const request = https.request({
    hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01',
      'content-type': 'application/json', 'content-length': Buffer.byteLength(body),
    }
  }, response => {
    let data = '';
    response.on('data', c => (data += c));
    response.on('end', () => {
      try { res.json(JSON.parse(data)); }
      catch { res.status(500).json({ error: 'Parse error', raw: data }); }
    });
  });
  request.on('error', e => res.status(500).json({ error: e.message }));
  request.write(body);
  request.end();
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3001, '0.0.0.0', () =>
  console.log(`✅ QuAInt Signal backend on port ${process.env.PORT || 3001}`));