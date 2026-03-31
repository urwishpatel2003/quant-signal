require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express      = require('express');
const https        = require('https');
const rateLimit    = require('express-rate-limit');
const Stripe       = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
app.set('trust proxy', 1);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
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
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code === 'PGRST116') {
    // User doesn't exist — create
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ id: userId, email, plan: 'free' })
      .select()
      .single();
    if (insertError) throw insertError;
    return newUser;
  }
  if (error) throw error;
  return data;
}

async function getUsage(userId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('usage')
    .select('scans, options')
    .eq('user_id', userId)
    .eq('date', today)
    .single();
  if (error && error.code === 'PGRST116') return { scans: 0, options: 0 };
  if (error) throw error;
  return data;
}

async function trackUsage(userId, type) {
  const today = new Date().toISOString().split('T')[0];
  const col   = type === 'scan' ? 'scans' : 'options';

  // Get current usage
  const current = await getUsage(userId);
  const updated = {
    user_id: userId,
    date:    today,
    scans:   col === 'scans'   ? (current.scans   || 0) + 1 : (current.scans   || 0),
    options: col === 'options' ? (current.options || 0) + 1 : (current.options || 0),
  };

  const { error } = await supabase
    .from('usage')
    .upsert(updated, { onConflict: 'user_id,date' });

  if (error) {
    console.error('[trackUsage] upsert error:', error.message);
    throw error;
  }
  return { scans: updated.scans, options: updated.options };
}
// ─── Usage SQL function — run this in Supabase SQL editor ─────────────────────
// create or replace function increment_usage(p_user_id text, p_date date, p_column text)
// returns void as $$
// begin
//   insert into usage(user_id, date, scans, options)
//   values(p_user_id, p_date, case when p_column='scans' then 1 else 0 end, case when p_column='options' then 1 else 0 end)
//   on conflict(user_id, date) do update
//   set scans   = case when p_column='scans'   then usage.scans+1   else usage.scans end,
//       options = case when p_column='options' then usage.options+1 else usage.options end;
// end;
// $$ language plpgsql;

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
    const user  = await getOrCreateUser(req.params.userId);
    const { type } = req.body;

    // Pro users have no limits
    if (user.plan === 'pro') {
      const usage = await getUsage(req.params.userId);
      await trackUsage(req.params.userId, type);
      return res.json({ ...usage, plan: 'pro' });
    }

    const usage   = await getUsage(req.params.userId);
    const updated = await trackUsage(req.params.userId, type);
    res.json({ ...updated, plan: user.plan });
  } catch (e) {
    console.error('[usage POST]', e.message);
    res.json({ scans: 0, options: 0, plan: 'free' });
  }
});

// ─── Stripe — create checkout session ────────────────────────────────────────

app.post('/stripe/checkout', async (req, res) => {
  const { userId, email } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    await getOrCreateUser(userId, email);

    // Check if user already has a Stripe customer
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id, plan')
      .eq('id', userId)
      .single();

    if (user?.plan === 'pro') {
      return res.json({ alreadyPro: true });
    }

    let customerId = user?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email, metadata: { clerk_user_id: userId }
      });
      customerId = customer.id;
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
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

// ─── Stripe — create billing portal (manage subscription) ─────────────────────

app.post('/stripe/portal', async (req, res) => {
  const { userId } = req.body;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

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
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('[webhook] signature error:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session  = event.data.object;
        const userId   = session.metadata?.clerk_user_id;
        const subId    = session.subscription;
        if (userId) {
          await supabase.from('users').update({
            plan: 'pro',
            stripe_subscription_id: subId,
          }).eq('id', userId);
          console.log(`[webhook] upgraded ${userId} to pro`);
        }
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused': {
        const sub      = event.data.object;
        const customerId = sub.customer;
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();
        if (user) {
          await supabase.from('users').update({ plan: 'free' }).eq('id', user.id);
          console.log(`[webhook] downgraded ${user.id} to free`);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub        = event.data.object;
        const customerId = sub.customer;
        const active     = sub.status === 'active' || sub.status === 'trialing';
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();
        if (user) {
          await supabase.from('users').update({
            plan: active ? 'pro' : 'free'
          }).eq('id', user.id);
        }
        break;
      }
    }
  } catch (e) {
    console.error('[webhook] handler error:', e.message);
  }

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
      close:      bars.map(b => b.close),
      open:       bars.map(b => b.open),
      high:       bars.map(b => b.high),
      low:        bars.map(b => b.low),
      volume:     bars.map(b => b.volume),
      timestamps: bars.map(b => new Date(b.date).getTime()),
      current:    closes[closes.length - 1],
      prev:       closes[closes.length - 2],
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
    const bars    = data.results || [];
    if (!bars.length) return null;
    const current = bars[bars.length - 1]?.c;
    const prev    = bars[bars.length - 2]?.c;
    return {
      current, prev,
      change:    current && prev ? current - prev : null,
      changePct: current && prev ? ((current - prev) / prev) * 100 : null,
    };
  } catch (e) { return null; }
}

async function polygonBatch(symbols, days = 10) {
  const results = [];
  for (const { poly, yahoo } of symbols) {
    const d = await polygonAggs(poly, days);
    results.push({
      symbol:    yahoo,
      current:   d?.current   ?? null,
      prev:      d?.prev      ?? null,
      change:    d?.change    ?? null,
      changePct: d?.changePct ?? null,
    });
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
    res.json({
      chart: { result: [{ meta: { symbol: ticker, currency: 'USD' }, timestamp: data.timestamps,
        indicators: { quote: [{ close: data.close, open: data.open, high: data.high, low: data.low, volume: data.volume }] } }] }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Fundamentals ─────────────────────────────────────────────────────────────

app.get('/yahoo/v10/finance/quoteSummary/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const [details, financials, quoteData] = await Promise.all([
      polygonGet(`/v3/reference/tickers/${ticker}`),
      polygonGet(`/vX/reference/financials?ticker=${ticker}&limit=1&timeframe=annual`),
      tradierGet(`/v1/markets/quotes?symbols=${ticker}&greeks=false`),
    ]);
    const f       = financials?.results?.[0]?.financials || {};
    const income  = f.income_statement  || {};
    const balance = f.balance_sheet     || {};
    const q       = quoteData?.quotes?.quote || {};
    const revenue     = income.revenues?.value;
    const netIncome   = income.net_income_loss?.value;
    const totalEquity = balance.equity?.value;
    const totalDebt   = balance.liabilities?.value;
    const eps         = income.basic_earnings_per_share?.value;
    const grossProfit = income.gross_profit?.value;
    res.json({
      quoteSummary: { result: [{ summaryDetail: {
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
      } }] }
    });
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
    const seen = new Set();
    const results = [];
    for (const t of (byTicker.results || [])) {
      if (!seen.has(t.ticker)) { seen.add(t.ticker); results.push({ ticker: t.ticker, name: t.name, type: t.type }); }
    }
    const nameResults = (byName.results || []).filter(t => !seen.has(t.ticker))
      .sort((a, b) => {
        const aS = a.ticker.startsWith(q) ? 0 : 1, bS = b.ticker.startsWith(q) ? 0 : 1;
        if (aS !== bS) return aS - bS;
        const aC = a.type === 'CS' ? 0 : 1, bC = b.type === 'CS' ? 0 : 1;
        if (aC !== bC) return aC - bC;
        return a.ticker.length - b.ticker.length;
      });
    for (const t of nameResults) {
      if (!seen.has(t.ticker)) { seen.add(t.ticker); results.push({ ticker: t.ticker, name: t.name, type: t.type }); }
    }
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
    const sorted  = [...list].sort((a, b) => b.changePct - a.changePct);
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
    { ticker: 'SPY', category: 'FEDERAL RESERVE' }, { ticker: 'TLT', category: 'BONDS/RATES'      },
    { ticker: 'GLD', category: 'COMMODITIES'      }, { ticker: 'QQQ', category: 'TECH/EARNINGS'    },
    { ticker: 'DIA', category: 'MACRO/ECONOMY'    }, { ticker: 'USO', category: 'OIL/ENERGY'       },
    { ticker: 'EEM', category: 'EMERGING MARKETS' }, { ticker: 'FXI', category: 'CHINA ECONOMY'    },
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

// ─── Claude API proxy ─────────────────────────────────────────────────────────

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

app.post('/usage/:userId/track', async (req, res) => {
  try {
    const user  = await getOrCreateUser(req.params.userId);
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

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3001, '0.0.0.0', () =>
  console.log(`✅ QuAInt Signal backend on port ${process.env.PORT || 3001}`));