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
  const prevClose = ohlcv?.prev   || quote?.prevClose || null;

  let ctx = '\n=== INTRADAY MOVE ===\n';

  if (current && prevClose) {
    const dayChangePct = ((current - prevClose) / prevClose * 100);
    const direction    = dayChangePct > 0 ? 'UP' : 'DOWN';
    const abs          = Math.abs(dayChangePct).toFixed(2);
    ctx += `TODAY: ${direction} ${abs}% from prev close $${prevClose.toFixed(2)} → $${current.toFixed(2)}\n`;

    if (dayChangePct <= -1.5)
      ctx += `⚠ ALREADY DOWN ${abs}% TODAY — put IV likely spiked, remaining downside may be priced in. Mean reversion risk HIGH. Justify new PUT entry carefully.\n`;
    else if (dayChangePct <= -0.75)
      ctx += `⚠ DOWN ${abs}% TODAY — put premiums elevated. Assess if downside already partially priced in.\n`;
    else if (dayChangePct >= 1.5)
      ctx += `⚠ ALREADY UP ${abs}% TODAY — call IV likely spiked, remaining upside may be priced in. Mean reversion risk HIGH. Justify new CALL entry carefully.\n`;
    else if (dayChangePct >= 0.75)
      ctx += `⚠ UP ${abs}% TODAY — call premiums elevated. Assess if upside already partially priced in.\n`;
  }

  if (current && open) {
    const fromOpen = ((current - open) / open * 100);
    ctx += `FROM OPEN: ${fromOpen > 0 ? '+' : ''}${fromOpen.toFixed(2)}% (open=$${open.toFixed(2)})\n`;
  }

  if (ohlcv?.close?.length >= 5) {
    const closes   = ohlcv.close.slice(-5);
    const momentum = ((closes[4] - closes[0]) / closes[0] * 100).toFixed(2);
    ctx += `5-SESSION MOMENTUM: ${parseFloat(momentum) > 0 ? 'UP' : 'DOWN'} ${Math.abs(momentum)}% | ${closes.map(c => `$${c.toFixed(2)}`).join(' → ')}\n`;

    let downDays = 0;
    for (let i = closes.length - 1; i > 0; i--) { if (closes[i] < closes[i-1]) downDays++; else break; }
    let upDays = 0;
    for (let i = closes.length - 1; i > 0; i--) { if (closes[i] > closes[i-1]) upDays++; else break; }

    if (downDays >= 3) ctx += `⚠ ${downDays} CONSECUTIVE DOWN SESSIONS — oversold, mean reversion risk HIGH for new PUT entries.\n`;
    if (upDays   >= 3) ctx += `⚠ ${upDays} CONSECUTIVE UP SESSIONS — overbought, mean reversion risk HIGH for new CALL entries.\n`;
  }

  return ctx;
}

// ─── Enhanced options chain context ──────────────────────────────────────────
function buildChainContext(chain, price, ta) {
  if (!chain) return '';
  let ctx = '\n=== OPTIONS INTELLIGENCE ===\n';

  // IV analysis
  ctx += `IV SKEW: ${chain.ivSkewPct}% (${chain.ivSkewLabel}) — ${
    chain.ivSkewLabel === 'PUT_SKEW' ? 'Market pricing crash risk, puts expensive' :
    chain.ivSkewLabel === 'CALL_SKEW' ? 'Market pricing melt-up, calls expensive' :
    'Balanced IV, no directional bias from skew'}\n`;

  ctx += `IV PERCENTILE: ${chain.ivPercentile}% — ${chain.ivPctLabel}\n`;

  // Volume vs OI
  ctx += `VOLUME/OI RATIO: Calls=${chain.callVolOIRatio} | Puts=${chain.putVolOIRatio} | P/C Volume=${parseFloat(chain.putCallVolRatio?.toFixed(2))}\n`;

  // Unusual activity
  if (chain.unusualCalls?.length > 0)
    ctx += `🔥 UNUSUAL CALL VOLUME (smart money?): ${chain.unusualCalls.join(', ')}\n`;
  if (chain.unusualPuts?.length > 0)
    ctx += `🔥 UNUSUAL PUT VOLUME (smart money?): ${chain.unusualPuts.join(', ')}\n`;

  // Gamma pin
  if (chain.highGammaStrike)
    ctx += `GAMMA PIN: Highest gamma at $${chain.highGammaStrike} — price may gravitate here near expiry\n`;

  // SMA distances
  if (chain.sma20Dist  != null) ctx += `SMA DISTANCES: SMA20=${chain.sma20Dist}% | SMA50=${chain.sma50Dist ?? 'N/A'}% | SMA200=${chain.sma200Dist ?? 'N/A'}% from current price\n`;

  // Wide spread warnings
  const wideCalls = (chain.topCalls || []).filter(c => c.wideSpread).map(c => `$${c.strike}`);
  const widePuts  = (chain.topPuts  || []).filter(p => p.wideSpread).map(p => `$${p.strike}`);
  if (wideCalls.length) ctx += `⚠ WIDE SPREAD CALLS (illiquid, high slippage): ${wideCalls.join(', ')}\n`;
  if (widePuts.length)  ctx += `⚠ WIDE SPREAD PUTS (illiquid, high slippage): ${widePuts.join(', ')}\n`;

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
    ctx += `SIGNALS: VIX=${vix?.current?.toFixed(2)} ${vix?.current > 25 ? '⚠ HIGH — all options expensive' : vix?.current > 20 ? 'ELEVATED' : 'CALM — options cheap'} | DXY=${dxy?.current?.toFixed(2)} | Gold=$${gold?.current?.toFixed(2)} | Oil=$${oil?.current?.toFixed(2)}\n`;
  }
  if (calendar?.length) ctx += `CALENDAR: ${calendar.slice(0, 4).map(e => e.title).join(' | ')}\n`;
  if (macroNews?.length) ctx += `GEO NEWS: ${macroNews.slice(0, 4).map(n => n.title).join(' | ')}\n`;
  return ctx;
}

// ─── COMBINED single Claude call ──────────────────────────────────────────────

export async function runCombinedAnalysis(ticker, price, ohlcv, fundamentals, chain, news, bonds, macroNews, intlMarkets, calendar, ta, expiry, timeframeKey = 'swing', quote = null) {
  const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
  const intradayCtx = buildIntradayContext(ohlcv, quote);
  const chainCtx    = buildChainContext(chain, price, ta);
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

  const current      = price;
  const prevClose    = ohlcv?.prev || quote?.prevClose;
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

CRITICAL OPTIONS RULES:
1. If stock already down >1% today: PUT premiums inflated by IV spike. Only recommend PUT if strong additional catalyst exists. Otherwise NEUTRAL.
2. If stock already up >1% today: CALL premiums inflated. Only recommend CALL if strong additional catalyst exists. Otherwise NEUTRAL.
3. IV PERCENTILE >80%: Options are EXPENSIVE — buying options here is high risk. Prefer spreads or NEUTRAL.
4. IV PERCENTILE <20%: Options are CHEAP — good environment for outright buys.
5. WIDE SPREAD contracts (>15% spread): Flag as illiquid, recommend tighter-spread alternatives.
6. UNUSUAL VOLUME on calls/puts: Strong directional signal — smart money positioning. Weight heavily.
7. PUT SKEW high: Market pricing crash risk — assess if justified or overdone.
8. 3+ consecutive down days: Mean reversion risk HIGH, avoid new PUTs.
9. 3+ consecutive up days: Mean reversion risk HIGH, avoid new CALLs.
10. SMA200 distance >10%: Price extended, reversion likely. Adjust targets.
11. NEUTRAL is correct when risk/reward is poor. Use it.
12. Always use EXACT bid/ask/mid from the chain data provided. Never invent prices.

Return ONLY a single JSON object with keys "price" and "options". No markdown.`,
    messages: [{
      role: 'user',
      content: `Analyze ${ticker} @ $${price?.toFixed(2)} | ${tf.label} | Expiry: ${expiry}
Market: ${isMarketClosed() ? 'CLOSED' : 'OPEN'} | ${new Date().toLocaleDateString()}
${intradayCtx}
${chainCtx}
TECHNICALS: ${tf.indicators}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe} | RevGrowth=${fundamentals?.revenueGrowth}
OPTIONS FLOW: P/C OI=${chain?.putCallRatio?.toFixed(2)} | P/C Vol=${parseFloat(chain?.putCallVolRatio)?.toFixed(2)} | CallIV=${chain?.avgCallIV}% | PutIV=${chain?.avgPutIV}%
PRICE (5 closes): ${JSON.stringify(ohlcv?.close?.slice(-5))}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET CHANGE' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
${macroCtx}
ATM CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid}|a$${c.ask}|m$${c.mid}|IV${c.iv}%|d${c.delta}|g${c.gamma}|OI${c.oi}|vol${c.volume}|spread${c.spreadPct}%${c.unusualVolume ? '🔥UNUSUAL' : ''}${c.wideSpread ? '⚠WIDE' : ''}`).join(' ')}
ATM PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid}|a$${p.ask}|m$${p.mid}|IV${p.iv}%|d${p.delta}|g${p.gamma}|OI${p.oi}|vol${p.volume}|spread${p.spreadPct}%${p.unusualVolume ? '🔥UNUSUAL' : ''}${p.wideSpread ? '⚠WIDE' : ''}`).join(' ')}

KEY QUESTION: Stock is ${dayChangePct >= 0 ? 'UP' : 'DOWN'} ${Math.abs(dayChangePct).toFixed(2)}% today. IV percentile is ${chain?.ivPercentile}% (${chain?.ivPctLabel}). Does premium justify a new position given what has already moved?

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
    "reasoning":"string — MUST address: today's move (${dayChangePct >= 0 ? '+' : ''}${dayChangePct.toFixed(2)}%), IV percentile (${chain?.ivPercentile}%), any unusual volume, skew (${chain?.ivSkewLabel})",
    "ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string",
    "positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string",
    "bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"Sell at $${callTarget} — profit $${((parseFloat(callTarget)-callMid)*100*callContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop} (50% loss)","thesis":"string","delta":"string","iv":"string"},
    "bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"Sell at $${putTarget} — profit $${((parseFloat(putTarget)-putMid)*100*putContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop} (50% loss)","thesis":"string","delta":"string","iv":"string"}
  }
}
RULES: Use EXACT bid/ask/mid. Avoid wide-spread contracts. Strike closest to $${price?.toFixed(2)}, OI>50. Return JSON only.`
    }]
  });

  return { priceSignal: result.price, optionsSignal: result.options };
}

// ─── Price only — scanner ─────────────────────────────────────────────────────

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

  // SMA distance for price analysis
  let smaCtx = '';
  if (ta && price) {
    if (ta.sma20)  smaCtx += `SMA20 dist: ${(((price - ta.sma20)  / ta.sma20)  * 100).toFixed(1)}% | `;
    if (ta.sma50)  smaCtx += `SMA50 dist: ${(((price - ta.sma50)  / ta.sma50)  * 100).toFixed(1)}% | `;
    if (ta.sma200) smaCtx += `SMA200 dist: ${(((price - ta.sma200) / ta.sma200) * 100).toFixed(1)}%`;
  }

  return callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
    system: `You are a quantitative trading analyst. Timeframe: ${tf.label}. Focus: ${tf.focus}
[UPGRADE]/[INSIDER/FUND] = bullish. [DOWNGRADE]/[SHORT ATTACK] = bearish.
If SMA200 distance >10%, price is extended — factor mean reversion risk into thesis.
Return ONLY JSON: {"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"timeframe":"${tf.label}","thesis":"string","bullFactors":["","",""],"bearFactors":["","",""],"riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":0,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"}`,
    messages: [{
      role: 'user',
      content: `${ticker} @ $${price?.toFixed(2)} | ${tf.label}
PRICE: ${JSON.stringify(ohlcv?.close?.slice(-5))}
TECHNICALS: ${tf.indicators}
SMA DISTANCES: ${smaCtx || 'N/A'}
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
  const intradayCtx = buildIntradayContext(ohlcv = null, quote);
  const chainCtx    = buildChainContext(chain, price, ta);
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
RULES: 1) Down >1% today = PUT IV spiked, justify new entry. 2) Up >1% = CALL IV spiked. 3) IV percentile >80% = expensive, prefer NEUTRAL or spreads. 4) IV percentile <20% = cheap, good for buys. 5) Wide spread (>15%) = illiquid, avoid. 6) Unusual volume = smart money signal, weight heavily. 7) 3+ consecutive same-direction days = mean reversion risk. 8) NEUTRAL is valid. 9) Use EXACT bid/ask/mid from chain. Never invent prices.
Return ONLY JSON.`,
    messages: [{
      role: 'user',
      content: `OPTIONS: ${ticker} @ $${price?.toFixed(2)} | Expiry: ${expiry} | ${isMarketClosed() ? 'CLOSED' : 'OPEN'}
${intradayCtx}
${chainCtx}
Price Signal: ${priceSignal?.signal} ${priceSignal?.confidence}% | Macro: ${priceSignal?.macroImpact} | Global: ${priceSignal?.globalMarketTrend}
TECHNICALS: RSI=${ta?.rsi14} [${ta?.rsiSignal}] | Trend=${ta?.trendSignal} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)
FUNDAMENTALS: Rec=${fundamentals?.recommendationKey?.toUpperCase()} | Target=$${fundamentals?.targetMeanPrice}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid}|a$${c.ask}|m$${c.mid}|IV${c.iv}%|d${c.delta}|OI${c.oi}|vol${c.volume}|sprd${c.spreadPct}%${c.unusualVolume ? '🔥' : ''}${c.wideSpread ? '⚠' : ''}`).join(' ')}
PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid}|a$${p.ask}|m$${p.mid}|IV${p.iv}%|d${p.delta}|OI${p.oi}|vol${p.volume}|sprd${p.spreadPct}%${p.unusualVolume ? '🔥' : ''}${p.wideSpread ? '⚠' : ''}`).join(' ')}
${macroCtx}
Return JSON: {"recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,"reasoning":"string — address IV percentile (${chain?.ivPercentile}%), skew (${chain?.ivSkewLabel}), unusual volume, intraday move","ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string","positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string","bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop}","thesis":"string","delta":"string","iv":"string"},"bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop}","thesis":"string","delta":"string","iv":"string"}}`
    }]
  });
}