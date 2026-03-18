import { isMarketClosed } from './tradier';

async function callClaude(payload) {
  const res  = await fetch(`${import.meta.env.VITE_API_BASE}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), mode: 'cors', credentials: 'omit',
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error('Claude JSON parse error:', e.message);
    console.error('Raw response tail:', clean.slice(-200));
    throw new Error('AI response was cut off — please try again');
  }
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

// ─── Intraday move context ────────────────────────────────────────────────────
function buildIntradayContext(ohlcv, quote) {
  const current   = quote?.last   || ohlcv?.current;
  const open      = quote?.open   || null;
  const prevClose = ohlcv?.prev   || null;

  let ctx = '\n=== INTRADAY MOVE ===\n';

  if (current && prevClose) {
    const dayChangePct = ((current - prevClose) / prevClose * 100);
    const direction    = dayChangePct > 0 ? 'UP' : 'DOWN';
    const abs          = Math.abs(dayChangePct).toFixed(2);
    ctx += `TODAY: ${direction} ${abs}% from prev close $${prevClose.toFixed(2)} → $${current.toFixed(2)}\n`;

    // Warning flags
    if (dayChangePct <= -1.5) {
      ctx += `⚠ ALREADY DOWN ${abs}% TODAY — puts are now MORE EXPENSIVE (IV spike likely). Remaining downside may be limited short-term. Mean reversion risk is HIGH. Consider if bearish thesis is already priced in.\n`;
    } else if (dayChangePct <= -0.75) {
      ctx += `⚠ DOWN ${abs}% TODAY — put premiums elevated. Assess if downside move is already partially priced in before adding new put positions.\n`;
    } else if (dayChangePct >= 1.5) {
      ctx += `⚠ ALREADY UP ${abs}% TODAY — calls are now MORE EXPENSIVE (IV spike likely). Remaining upside may be limited short-term. Mean reversion risk is HIGH.\n`;
    } else if (dayChangePct >= 0.75) {
      ctx += `⚠ UP ${abs}% TODAY — call premiums elevated. Assess if upside move is already partially priced in.\n`;
    }
  }

  if (current && open) {
    const fromOpen = ((current - open) / open * 100);
    ctx += `FROM OPEN: ${fromOpen > 0 ? '+' : ''}${fromOpen.toFixed(2)}% (open=$${open.toFixed(2)})\n`;
  }

  // Recent 5-candle momentum
  if (ohlcv?.close?.length >= 5) {
    const closes    = ohlcv.close.slice(-5);
    const momentum  = ((closes[4] - closes[0]) / closes[0] * 100).toFixed(2);
    const direction = parseFloat(momentum) > 0 ? 'UP' : 'DOWN';
    ctx += `5-SESSION MOMENTUM: ${direction} ${Math.abs(momentum)}% | Closes: ${closes.map(c => `$${c.toFixed(2)}`).join(' → ')}\n`;

    // Consecutive down days
    let downDays = 0;
    for (let i = closes.length - 1; i > 0; i--) {
      if (closes[i] < closes[i - 1]) downDays++;
      else break;
    }
    if (downDays >= 3) {
      ctx += `⚠ ${downDays} CONSECUTIVE DOWN SESSIONS — oversold conditions possible, mean reversion risk elevated for new PUT entries.\n`;
    }
    let upDays = 0;
    for (let i = closes.length - 1; i > 0; i--) {
      if (closes[i] > closes[i - 1]) upDays++;
      else break;
    }
    if (upDays >= 3) {
      ctx += `⚠ ${upDays} CONSECUTIVE UP SESSIONS — overbought conditions possible, mean reversion risk elevated for new CALL entries.\n`;
    }
  }

  return ctx;
}

export function buildMacroContext(bonds, macroNews, intlMarkets, calendar) {
  let ctx = '\n=== MACRO ===\n';
  if (bonds) {
    ctx += `BONDS: 10Y=${bonds.tnx?.current?.toFixed(2)}% | 2Y=${bonds.irx?.current?.toFixed(2)}% | Curve=${bonds.yieldCurve}% ${bonds.inverted ? '⚠ INVERTED' : ''} | TLT=$${bonds.tlt?.current?.toFixed(2)}\n`;
  }
  if (intlMarkets?.length) {
    const find = sym => intlMarkets.find(m => m.symbol === sym);
    const pct  = m => m?.changePct != null ? `${m.changePct > 0 ? '+' : ''}${m.changePct.toFixed(2)}%` : 'N/A';
    const vix  = find('^VIX'), dxy = find('DX-Y.NYB'), gold = find('GC=F'), oil = find('CL=F');
    ctx += `ASIA: N225=${pct(find('^N225'))} | HSI=${pct(find('^HSI'))} | Sensex=${pct(find('^BSESN'))}\n`;
    ctx += `EUROPE: DAX=${pct(find('^GDAXI'))} | FTSE=${pct(find('^FTSE'))} | CAC=${pct(find('^FCHI'))}\n`;
    ctx += `SIGNALS: VIX=${vix?.current?.toFixed(2)} ${vix?.current > 25 ? '⚠ HIGH' : vix?.current > 20 ? 'ELEV' : 'CALM'} | DXY=${dxy?.current?.toFixed(2)} | Gold=$${gold?.current?.toFixed(2)} | Oil=$${oil?.current?.toFixed(2)}\n`;
  }
  if (calendar?.length) {
    ctx += `CALENDAR: ${calendar.slice(0, 4).map(e => e.title).join(' | ')}\n`;
  }
  if (macroNews?.length) {
    ctx += `GEO NEWS: ${macroNews.slice(0, 4).map(n => n.title).join(' | ')}\n`;
  }
  return ctx;
}

// ─── COMBINED single Claude call for both price + options analysis ────────────

export async function runCombinedAnalysis(ticker, price, ohlcv, fundamentals, chain, news, bonds, macroNews, intlMarkets, calendar, ta, expiry, timeframeKey = 'swing', quote = null) {
  const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
  const intradayCtx = buildIntradayContext(ohlcv, quote);
  const categorized = categorizeNews(news).slice(0, 8);
  const calls       = chain?.topCalls?.slice(0, 5) || [];
  const puts        = chain?.topPuts?.slice(0,  5) || [];

  const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
  const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
  const hasTarget    = categorized.some(n => n.startsWith('[ANALYST TARGET]'));
  const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));
  const hasShort     = categorized.some(n => n.startsWith('[SHORT ATTACK]'));

  const callMid       = calls[0]?.mid || 0;
  const putMid        = puts[0]?.mid  || 0;
  const callContracts = Math.max(1, Math.floor(1500 / (callMid * 100)));
  const putContracts  = Math.max(1, Math.floor(1500 / (putMid  * 100)));
  const callStop      = (callMid * 0.50).toFixed(2);
  const callTarget    = (callMid * 2.00).toFixed(2);
  const putStop       = (putMid  * 0.50).toFixed(2);
  const putTarget     = (putMid  * 2.00).toFixed(2);

  // Intraday change for prompt context
  const current      = price;
  const prevClose    = ohlcv?.prev;
  const dayChangePct = current && prevClose ? ((current - prevClose) / prevClose * 100) : 0;

  const tfMeta = {
    short:    { label: 'Short Term (1-5 days)',       indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | SMA20=$${ta?.sma20} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
    swing:    { label: 'Swing Trade (1-4 weeks)',      indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | Trend=${ta?.trendSignal} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
    position: { label: 'Position Trade (1-3 months)',  indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal}` },
    longterm: { label: 'Long Term (6-12 months)',      indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
  };
  const tf = tfMeta[timeframeKey] || tfMeta.swing;

  const result = await callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
    system: `You are a quantitative trading analyst and expert options trader.

CRITICAL OPTIONS RULES — you MUST follow these:
1. If the stock is already down >1% today, PUT premiums are elevated due to IV expansion. Only recommend PUTS if significant additional downside is likely AND the premium is justified.
2. If the stock is already up >1% today, CALL premiums are elevated. Only recommend CALLS if significant additional upside is likely.
3. Always assess: "Has the move already happened? Is the remaining potential worth the current premium cost?"
4. If the stock has 3+ consecutive down days, mean reversion risk is HIGH — avoid new PUT recommendations unless breakdown is confirmed.
5. If the stock has 3+ consecutive up days, mean reversion risk is HIGH — avoid new CALL recommendations unless breakout is confirmed.
6. NEUTRAL is a valid and often correct recommendation when the risk/reward is poor.

Return ONLY a single JSON object with two keys: "price" and "options". No markdown, no explanation.`,
    messages: [{
      role: 'user',
      content: `Analyze ${ticker} @ $${price?.toFixed(2)} | Timeframe: ${tf.label} | Expiry: ${expiry}
Market: ${isMarketClosed() ? 'CLOSED' : 'OPEN'} | Today: ${new Date().toLocaleDateString()}
${intradayCtx}
TECHNICALS: ${tf.indicators}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe} | RevGrowth=${fundamentals?.revenueGrowth}
OPTIONS FLOW: P/C=${chain?.putCallRatio?.toFixed(2)} | CallIV=${chain?.avgCallIV}% | PutIV=${chain?.avgPutIV}%
PRICE (5 closes): ${JSON.stringify(ohlcv?.close?.slice(-5))}
${hasUpgrade   ? '🟢 UPGRADE detected' : ''}${hasDowngrade ? '🔴 DOWNGRADE detected' : ''}${hasTarget ? '📊 TARGET CHANGE' : ''}${hasFund ? '🏦 INSTITUTIONAL activity' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
${macroCtx}
ATM CALLS: ${calls.map(c => `$${c.strike}|bid$${c.bid.toFixed(2)}|ask$${c.ask.toFixed(2)}|mid$${c.mid.toFixed(2)}|IV${c.iv}%|d${c.delta}|OI${c.oi}`).join(' ')}
ATM PUTS:  ${puts.map(p => `$${p.strike}|bid$${p.bid.toFixed(2)}|ask$${p.ask.toFixed(2)}|mid$${p.mid.toFixed(2)}|IV${p.iv}%|d${p.delta}|OI${p.oi}`).join(' ')}

KEY QUESTION: Stock is ${dayChangePct >= 0 ? 'UP' : 'DOWN'} ${Math.abs(dayChangePct).toFixed(2)}% today. Does the current options premium justify a new position given what has already moved?

Return this exact JSON:
{
  "price": {
    "signal":"BUY"|"SELL"|"HOLD",
    "confidence":0-100,
    "priceTarget":number,
    "stopLoss":number,
    "timeframe":"${tf.label}",
    "thesis":"string",
    "bullFactors":["","",""],
    "bearFactors":["","",""],
    "riskLevel":"LOW"|"MEDIUM"|"HIGH",
    "sentimentScore":0,
    "macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL",
    "bondSignal":"string",
    "geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH",
    "globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED",
    "calendarRisk":"string"
  },
  "options": {
    "recommendation":"CALL"|"PUT"|"NEUTRAL",
    "confidence":0-100,
    "reasoning":"string — must explicitly address whether today's move (${dayChangePct >= 0 ? '+' : ''}${dayChangePct.toFixed(2)}%) makes this entry risky or justified",
    "ivRank":"LOW"|"MEDIUM"|"HIGH",
    "ivComment":"string",
    "macroSetup":"string",
    "calendarWarning":"string",
    "positionSizing":"string",
    "keyRisks":["","",""],
    "catalysts":["","",""],
    "macroRisks":["",""],
    "globalMarketRisk":"string",
    "bestCall":{
      "strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,
      "estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,
      "targetReturn":"Sell at $${callTarget} per contract — profit $${((parseFloat(callTarget) - callMid) * 100 * callContracts).toFixed(0)}",
      "maxLoss":0,
      "entryTiming":"string",
      "exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop} (50% loss)",
      "thesis":"string","delta":"string","iv":"string"
    },
    "bestPut":{
      "strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,
      "estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,
      "targetReturn":"Sell at $${putTarget} per contract — profit $${((parseFloat(putTarget) - putMid) * 100 * putContracts).toFixed(0)}",
      "maxLoss":0,
      "entryTiming":"string",
      "exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop} (50% loss)",
      "thesis":"string","delta":"string","iv":"string"
    }
  }
}
RULES: Use EXACT bid/ask/mid from contracts above. Strike closest to $${price?.toFixed(2)}, OI>50. expiry="${expiry}". Return JSON only.`
    }]
  });

  return {
    priceSignal:   result.price,
    optionsSignal: result.options,
  };
}

// ─── Price only — scanner tab ─────────────────────────────────────────────────

export async function runPriceAnalysis(ticker, price, ohlcv, fundamentals, options, news, bonds, macroNews, intlMarkets, calendar, ta, timeframeKey = 'swing') {
  const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
  const categorized = categorizeNews(news).slice(0, 8);
  const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
  const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
  const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));

  const tfMeta = {
    short:    { label: 'Short Term (1-5 days)',       focus: 'momentum, RSI, volume spikes, news catalysts.',        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | SMA20=$${ta?.sma20} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x) | Trend=${ta?.trendSignal}` },
    swing:    { label: 'Swing Trade (1-4 weeks)',      focus: 'trend direction, SMA20/50 crossovers, macro context.', indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | Trend=${ta?.trendSignal} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
    position: { label: 'Position Trade (1-3 months)',  focus: 'SMA50/200 trend, fundamentals, macro environment.',    indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal}` },
    longterm: { label: 'Long Term (6-12 months)',      focus: 'fundamentals, macro cycle, analyst consensus.',         indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
  };
  const tf = tfMeta[timeframeKey] || tfMeta.swing;

  return callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
    system: `You are a quantitative trading analyst. Timeframe: ${tf.label}. Focus: ${tf.focus}
[UPGRADE]/[INSIDER/FUND] = bullish. [DOWNGRADE]/[SHORT ATTACK] = bearish.
Return ONLY JSON: {"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"timeframe":"${tf.label}","thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":0,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"}`,
    messages: [{
      role: 'user',
      content: `${ticker} @ $${price?.toFixed(2)} | ${tf.label}
PRICE: ${JSON.stringify(ohlcv?.close?.slice(-5))}
TECHNICALS: ${tf.indicators}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe} | RevGrowth=${fundamentals?.revenueGrowth}
OPTIONS FLOW: P/C=${options?.putCallRatio?.toFixed(2)} | CallIV=${options?.avgCallIV}% | PutIV=${options?.avgPutIV}%
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
${macroCtx}
Return JSON only.`
    }]
  });
}

// ─── Options only — expiry switch ─────────────────────────────────────────────

export async function runOptionsAnalysis(ticker, price, expiry, chain, fundamentals, news, priceSignal, bonds, macroNews, intlMarkets, calendar, ta, quote = null) {
  const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
  const intradayCtx = buildIntradayContext({ prev: null, close: null }, quote);
  const categorized = categorizeNews(news).slice(0, 8);
  const calls       = chain?.topCalls?.slice(0, 5) || [];
  const puts        = chain?.topPuts?.slice(0,  5) || [];

  const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
  const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
  const hasTarget    = categorized.some(n => n.startsWith('[ANALYST TARGET]'));
  const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));
  const hasShort     = categorized.some(n => n.startsWith('[SHORT ATTACK]'));

  const callMid       = calls[0]?.mid || 0;
  const putMid        = puts[0]?.mid  || 0;
  const callContracts = Math.max(1, Math.floor(1500 / (callMid * 100)));
  const putContracts  = Math.max(1, Math.floor(1500 / (putMid  * 100)));
  const callStop      = (callMid * 0.50).toFixed(2);
  const callTarget    = (callMid * 2.00).toFixed(2);
  const putStop       = (putMid  * 0.50).toFixed(2);
  const putTarget     = (putMid  * 2.00).toFixed(2);

  return callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
    system: `You are an expert options trader.

CRITICAL RULES:
1. If already down >1% today, PUT premiums are elevated. Only recommend if additional downside is justified.
2. If already up >1% today, CALL premiums are elevated. Only recommend if additional upside is justified.  
3. Assess: "Has the move already happened? Is remaining potential worth current premium?"
4. 3+ consecutive down days = mean reversion risk HIGH for new PUTs.
5. 3+ consecutive up days = mean reversion risk HIGH for new CALLs.
6. NEUTRAL is valid when risk/reward is poor.
Use EXACT bid/ask/mid from contracts. Never invent prices.
Return ONLY JSON.`,
    messages: [{
      role: 'user',
      content: `OPTIONS: ${ticker} @ $${price?.toFixed(2)} | Expiry: ${expiry} | ${isMarketClosed() ? 'CLOSED' : 'OPEN'}
${intradayCtx}
Price Signal: ${priceSignal?.signal} ${priceSignal?.confidence}% | Macro: ${priceSignal?.macroImpact} | Global: ${priceSignal?.globalMarketTrend}
TECHNICALS: RSI=${ta?.rsi14} [${ta?.rsiSignal}] | Trend=${ta?.trendSignal} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)
FUNDAMENTALS: Rec=${fundamentals?.recommendationKey?.toUpperCase()} | Target=$${fundamentals?.targetMeanPrice}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET CHANGE' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid.toFixed(2)}|a$${c.ask.toFixed(2)}|m$${c.mid.toFixed(2)}|IV${c.iv}%|d${c.delta}|OI${c.oi}`).join(' ')}
PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid.toFixed(2)}|a$${p.ask.toFixed(2)}|m$${p.mid.toFixed(2)}|IV${p.iv}%|d${p.delta}|OI${p.oi}`).join(' ')}
${macroCtx}
Return JSON: {"recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,"reasoning":"string — must address whether today's move makes this entry risky","ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string","positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string","bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop}","thesis":"string","delta":"string","iv":"string"},"bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop}","thesis":"string","delta":"string","iv":"string"}}`
    }]
  });
}