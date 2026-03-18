import { isMarketClosed } from './tradier';
import { checkRSIContradiction, calcDeltaAdjustedSize } from '../utils/indicators';

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

// ─── Intraday context ─────────────────────────────────────────────────────────
function buildIntradayContext(ohlcv, quote) {
  const current   = quote?.last     || ohlcv?.current;
  const open      = quote?.open     || null;
  const prevClose = ohlcv?.prev     || quote?.prevClose || null;

  let ctx = '\n=== INTRADAY MOVE ===\n';

  if (current && prevClose) {
    const dayChangePct = ((current - prevClose) / prevClose * 100);
    const direction    = dayChangePct > 0 ? 'UP' : 'DOWN';
    const abs          = Math.abs(dayChangePct).toFixed(2);
    ctx += `TODAY: ${direction} ${abs}% | prev close $${prevClose.toFixed(2)} → $${current.toFixed(2)}\n`;
    if (dayChangePct <= -1.5)
      ctx += `⚠ DOWN ${abs}% TODAY — put IV spiked, remaining downside may be priced in. Mean reversion risk HIGH.\n`;
    else if (dayChangePct <= -0.75)
      ctx += `⚠ DOWN ${abs}% TODAY — put premiums elevated, assess if move already priced in.\n`;
    else if (dayChangePct >= 1.5)
      ctx += `⚠ UP ${abs}% TODAY — call IV spiked, remaining upside may be priced in. Mean reversion risk HIGH.\n`;
    else if (dayChangePct >= 0.75)
      ctx += `⚠ UP ${abs}% TODAY — call premiums elevated.\n`;
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
    if (downDays >= 3) ctx += `⚠ ${downDays} CONSECUTIVE DOWN SESSIONS — oversold, bounce risk HIGH for new PUT entries.\n`;
    if (upDays   >= 3) ctx += `⚠ ${upDays} CONSECUTIVE UP SESSIONS — overbought, pullback risk HIGH for new CALL entries.\n`;
  }

  return ctx;
}

// ─── Enhanced technicals context ──────────────────────────────────────────────
function buildTAContext(ta) {
  if (!ta) return '';
  let ctx = '\n=== TECHNICAL ANALYSIS ===\n';

  // MACD
  if (ta.macd) {
    ctx += `MACD: Line=${ta.macd.macdLine} | Signal=${ta.macd.signalLine} | Histogram=${ta.macd.histogram} | Trend=${ta.macd.trend} | Cross=${ta.macd.cross}\n`;
    if (ta.macd.cross === 'BULLISH_CROSS')  ctx += `✅ MACD BULLISH CROSS — momentum turning up\n`;
    if (ta.macd.cross === 'BEARISH_CROSS')  ctx += `🔴 MACD BEARISH CROSS — momentum turning down\n`;
  }

  // Bollinger Bands
  if (ta.bb) {
    ctx += `BOLLINGER BANDS: Upper=$${ta.bb.upper} | Middle=$${ta.bb.middle} | Lower=$${ta.bb.lower} | Width=${ta.bb.bWidth}% | %B=${ta.bb.bPct} | Position=${ta.bb.position}\n`;
    if (ta.bb.squeeze)             ctx += `🔥 BB SQUEEZE detected — low volatility, breakout likely soon\n`;
    if (ta.bb.position === 'NEAR_UPPER') ctx += `⚠ Price near BB upper band — overbought, CALL entry risky\n`;
    if (ta.bb.position === 'NEAR_LOWER') ctx += `✅ Price near BB lower band — oversold, PUT entry risky, potential bounce\n`;
  }

  // SMA distances
  if (ta.priceVsSma20  != null) ctx += `SMA DISTANCES: vs SMA20=${ta.priceVsSma20}% | vs SMA50=${ta.priceVsSma50 ?? 'N/A'}% | vs SMA200=${ta.priceVsSma200 ?? 'N/A'}%\n`;
  if (Math.abs(parseFloat(ta.priceVsSma200)) > 10)
    ctx += `⚠ Price ${ta.priceVsSma200}% from SMA200 — EXTENDED, mean reversion risk elevated\n`;

  return ctx;
}

// ─── Enhanced chain context ───────────────────────────────────────────────────
function buildChainContext(chain, price, ta) {
  if (!chain) return '';
  let ctx = '\n=== OPTIONS INTELLIGENCE ===\n';

  ctx += `IV SKEW: ${chain.ivSkewPct}% (${chain.ivSkewLabel}) — ${
    chain.ivSkewLabel === 'PUT_SKEW'  ? 'Market pricing crash risk, puts expensive' :
    chain.ivSkewLabel === 'CALL_SKEW' ? 'Market pricing melt-up, calls expensive'  :
    'Balanced IV'}\n`;

  ctx += `IV PERCENTILE: ${chain.ivPercentile}% — ${chain.ivPctLabel}\n`;

  ctx += `VOL/OI: Calls=${chain.callVolOIRatio} | Puts=${chain.putVolOIRatio} | P/C Vol Ratio=${parseFloat(chain.putCallVolRatio)?.toFixed(2)}\n`;

  if (chain.unusualCalls?.length) ctx += `🔥 UNUSUAL CALL VOLUME: ${chain.unusualCalls.join(', ')}\n`;
  if (chain.unusualPuts?.length)  ctx += `🔥 UNUSUAL PUT VOLUME: ${chain.unusualPuts.join(', ')}\n`;

  if (chain.highGammaStrike) ctx += `GAMMA PIN: $${chain.highGammaStrike} — price may gravitate here near expiry\n`;

  const wideCalls = (chain.topCalls || []).filter(c => c.wideSpread).map(c => `$${c.strike}`);
  const widePuts  = (chain.topPuts  || []).filter(p => p.wideSpread).map(p => `$${p.strike}`);
  if (wideCalls.length) ctx += `⚠ WIDE SPREAD CALLS (illiquid): ${wideCalls.join(', ')}\n`;
  if (widePuts.length)  ctx += `⚠ WIDE SPREAD PUTS (illiquid): ${widePuts.join(', ')}\n`;

  return ctx;
}

// ─── Delta-adjusted sizing context ───────────────────────────────────────────
function buildSizingContext(calls, puts, budget = 1500) {
  let ctx = '\n=== DELTA-ADJUSTED SIZING ===\n';
  const bestCall = calls[0];
  const bestPut  = puts[0];

  if (bestCall?.delta && bestCall?.mid) {
    const sizing = calcDeltaAdjustedSize(bestCall.delta, bestCall.mid, budget);
    if (sizing) ctx += `CALL $${bestCall.strike}: ${sizing.sizeAdvice} | Dollar delta=$${sizing.dollarDelta}\n`;
  }
  if (bestPut?.delta && bestPut?.mid) {
    const sizing = calcDeltaAdjustedSize(bestPut.delta, bestPut.mid, budget);
    if (sizing) ctx += `PUT $${bestPut.strike}: ${sizing.sizeAdvice} | Dollar delta=$${sizing.dollarDelta}\n`;
  }
  return ctx;
}

export function buildMacroContext(bonds, macroNews, intlMarkets, calendar) {
  let ctx = '\n=== MACRO ===\n';
  if (bonds)
    ctx += `BONDS: 10Y=${bonds.tnx?.current?.toFixed(2)}% | 2Y=${bonds.irx?.current?.toFixed(2)}% | Curve=${bonds.yieldCurve}% ${bonds.inverted ? '⚠ INVERTED' : ''} | TLT=$${bonds.tlt?.current?.toFixed(2)}\n`;
  if (intlMarkets?.length) {
    const find = sym => intlMarkets.find(m => m.symbol === sym);
    const pct  = m => m?.changePct != null ? `${m.changePct > 0 ? '+' : ''}${m.changePct.toFixed(2)}%` : 'N/A';
    const vix  = find('^VIX'), dxy = find('DX-Y.NYB'), gold = find('GC=F'), oil = find('CL=F');
    ctx += `ASIA: N225=${pct(find('^N225'))} | HSI=${pct(find('^HSI'))} | Sensex=${pct(find('^BSESN'))}\n`;
    ctx += `EUROPE: DAX=${pct(find('^GDAXI'))} | FTSE=${pct(find('^FTSE'))} | CAC=${pct(find('^FCHI'))}\n`;
    ctx += `SIGNALS: VIX=${vix?.current?.toFixed(2)} ${vix?.current > 25 ? '⚠ HIGH — options expensive' : vix?.current > 20 ? 'ELEVATED' : 'CALM — options cheap'} | DXY=${dxy?.current?.toFixed(2)} | Gold=$${gold?.current?.toFixed(2)} | Oil=$${oil?.current?.toFixed(2)}\n`;
  }
  if (calendar?.length) ctx += `CALENDAR: ${calendar.slice(0, 4).map(e => e.title).join(' | ')}\n`;
  if (macroNews?.length) ctx += `GEO NEWS: ${macroNews.slice(0, 4).map(n => n.title).join(' | ')}\n`;
  return ctx;
}

// ─── COMBINED single Claude call ──────────────────────────────────────────────

export async function runCombinedAnalysis(ticker, price, ohlcv, fundamentals, chain, news, bonds, macroNews, intlMarkets, calendar, ta, expiry, timeframeKey = 'swing', quote = null) {
  const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
  const intradayCtx = buildIntradayContext(ohlcv, quote);
  const taCtx       = buildTAContext(ta);
  const chainCtx    = buildChainContext(chain, price, ta);
  const categorized = categorizeNews(news).slice(0, 8);
  const calls       = chain?.topCalls?.slice(0, 5) || [];
  const puts        = chain?.topPuts?.slice(0,  5) || [];
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

  // Pre-compute RSI contradiction for context
  const callContradiction = checkRSIContradiction(ta?.rsi14, 'CALL');
  const putContradiction  = checkRSIContradiction(ta?.rsi14, 'PUT');

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

CRITICAL OPTIONS RULES — follow all of these:
1. Already down >1% today: PUT IV spiked, justify new PUT entry or recommend NEUTRAL.
2. Already up >1% today: CALL IV spiked, justify new CALL entry or recommend NEUTRAL.
3. IV PERCENTILE >80%: Options EXPENSIVE — buying outright is high risk, prefer NEUTRAL.
4. IV PERCENTILE <20%: Options CHEAP — good for outright buys.
5. Wide spread contracts (>15%): Illiquid — avoid recommending these strikes.
6. Unusual volume (🔥): Strong smart money signal — weight heavily in recommendation.
7. RSI >70 + CALL recommendation: CONTRADICTION — must explicitly address this.
8. RSI <30 + PUT recommendation: CONTRADICTION — must explicitly address this.
9. MACD BEARISH CROSS + CALL recommendation: CONTRADICTION — must address.
10. MACD BULLISH CROSS + PUT recommendation: CONTRADICTION — must address.
11. BB NEAR_UPPER + CALL recommendation: Overbought — must address.
12. BB NEAR_LOWER + PUT recommendation: Oversold — must address.
13. SMA200 distance >10%: Extended price — adjust targets for mean reversion.
14. 3+ consecutive same-direction days: Mean reversion risk HIGH.
15. Use DELTA-ADJUSTED sizing from the sizing context provided.
16. NEUTRAL is correct when multiple contradictions exist. Use it freely.
17. Always use EXACT bid/ask/mid from chain data. Never invent prices.

Return ONLY JSON with keys "price" and "options". No markdown.`,
    messages: [{
      role: 'user',
      content: `Analyze ${ticker} @ $${price?.toFixed(2)} | ${tf.label} | Expiry: ${expiry}
Market: ${isMarketClosed() ? 'CLOSED' : 'OPEN'} | ${new Date().toLocaleDateString()}
${intradayCtx}
${taCtx}
${chainCtx}
${sizingCtx}
${callContradiction ? `RSI vs CALLS: ${callContradiction}` : ''}
${putContradiction  ? `RSI vs PUTS: ${putContradiction}`   : ''}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe} | RevGrowth=${fundamentals?.revenueGrowth}
OPTIONS FLOW: P/C OI=${chain?.putCallRatio?.toFixed(2)} | P/C Vol=${parseFloat(chain?.putCallVolRatio)?.toFixed(2)} | CallIV=${chain?.avgCallIV}% | PutIV=${chain?.avgPutIV}%
PRICE (5 closes): ${JSON.stringify(ohlcv?.close?.slice(-5))}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET CHANGE' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
${macroCtx}
ATM CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid}|a$${c.ask}|m$${c.mid}|IV${c.iv}%|d${c.delta}|g${c.gamma}|OI${c.oi}|vol${c.volume}|sprd${c.spreadPct}%${c.unusualVolume ? '🔥' : ''}${c.wideSpread ? '⚠WIDE' : ''}`).join(' ')}
ATM PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid}|a$${p.ask}|m$${p.mid}|IV${p.iv}%|d${p.delta}|g${p.gamma}|OI${p.oi}|vol${p.volume}|sprd${p.spreadPct}%${p.unusualVolume ? '🔥' : ''}${p.wideSpread ? '⚠WIDE' : ''}`).join(' ')}

DECISION CHECKLIST:
- Today's move: ${dayChangePct >= 0 ? 'UP' : 'DOWN'} ${Math.abs(dayChangePct).toFixed(2)}%
- IV Percentile: ${chain?.ivPercentile}% (${chain?.ivPctLabel})
- RSI: ${ta?.rsi14} [${ta?.rsiSignal}]
- MACD: ${ta?.macd?.cross || 'N/A'} | BB: ${ta?.bb?.position || 'N/A'}
- Skew: ${chain?.ivSkewLabel}
- Unusual volume: ${[...(chain?.unusualCalls || []), ...(chain?.unusualPuts || [])].length > 0 ? 'YES' : 'NONE'}

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
    "reasoning":"MUST address: today's move, IV percentile, RSI vs direction, MACD cross, BB position, any unusual volume or contradictions",
    "ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string",
    "positionSizing":"string — use delta-adjusted sizing guidance above",
    "keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string",
    "bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"Sell at $${callTarget} — profit $${((parseFloat(callTarget)-callMid)*100*callContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop} (50% loss)","thesis":"string","delta":"string","iv":"string"},
    "bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"Sell at $${putTarget} — profit $${((parseFloat(putTarget)-putMid)*100*putContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop} (50% loss)","thesis":"string","delta":"string","iv":"string"}
  }
}
RULES: Exact bid/ask/mid only. Avoid wide-spread contracts. OI>50. Return JSON only.`
    }]
  });

  return { priceSignal: result.price, optionsSignal: result.options };
}

// ─── Price only — scanner ─────────────────────────────────────────────────────

export async function runPriceAnalysis(ticker, price, ohlcv, fundamentals, options, news, bonds, macroNews, intlMarkets, calendar, ta, timeframeKey = 'swing') {
  const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
  const taCtx       = buildTAContext(ta);
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
[UPGRADE]/[INSIDER/FUND]=bullish. [DOWNGRADE]/[SHORT ATTACK]=bearish.
Consider MACD cross direction, BB position, SMA distances. If SMA200 dist >10%, price is extended.
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
}

// ─── Options only — expiry switch ─────────────────────────────────────────────

export async function runOptionsAnalysis(ticker, price, expiry, chain, fundamentals, news, priceSignal, bonds, macroNews, intlMarkets, calendar, ta, quote = null) {
  const macroCtx    = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
  const intradayCtx = buildIntradayContext(null, quote);
  const taCtx       = buildTAContext(ta);
  const chainCtx    = buildChainContext(chain, price, ta);
  const categorized = categorizeNews(news).slice(0, 8);
  const calls       = chain?.topCalls?.slice(0, 5) || [];
  const puts        = chain?.topPuts?.slice(0,  5) || [];
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

  return callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
    system: `You are an expert options trader.
RULES: 1) Down >1% today = PUT IV spiked. 2) Up >1% = CALL IV spiked. 3) IV >80% = expensive, prefer NEUTRAL. 4) IV <20% = cheap, good buys. 5) Wide spread = illiquid, avoid. 6) Unusual volume = smart money. 7) RSI >70 + CALL = contradiction, address it. 8) RSI <30 + PUT = contradiction, address it. 9) MACD cross contradicts direction = address it. 10) BB NEAR_UPPER + CALL = overbought risk. 11) BB NEAR_LOWER + PUT = oversold risk. 12) Use delta-adjusted sizing. 13) NEUTRAL is valid. 14) Exact prices only.
Return ONLY JSON.`,
    messages: [{
      role: 'user',
      content: `OPTIONS: ${ticker} @ $${price?.toFixed(2)} | Expiry: ${expiry} | ${isMarketClosed() ? 'CLOSED' : 'OPEN'}
${intradayCtx}
${taCtx}
${chainCtx}
${sizingCtx}
${callContradiction ? `RSI vs CALLS: ${callContradiction}` : ''}
${putContradiction  ? `RSI vs PUTS: ${putContradiction}`   : ''}
Price Signal: ${priceSignal?.signal} ${priceSignal?.confidence}% | Macro: ${priceSignal?.macroImpact} | Global: ${priceSignal?.globalMarketTrend}
FUNDAMENTALS: Rec=${fundamentals?.recommendationKey?.toUpperCase()} | Target=$${fundamentals?.targetMeanPrice}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid}|a$${c.ask}|m$${c.mid}|IV${c.iv}%|d${c.delta}|g${c.gamma}|OI${c.oi}|vol${c.volume}|sprd${c.spreadPct}%${c.unusualVolume ? '🔥' : ''}${c.wideSpread ? '⚠' : ''}`).join(' ')}
PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid}|a$${p.ask}|m$${p.mid}|IV${p.iv}%|d${p.delta}|g${p.gamma}|OI${p.oi}|vol${p.volume}|sprd${p.spreadPct}%${p.unusualVolume ? '🔥' : ''}${p.wideSpread ? '⚠' : ''}`).join(' ')}
${macroCtx}
Return JSON: {"recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,"reasoning":"MUST address: IV percentile (${chain?.ivPercentile}%), skew (${chain?.ivSkewLabel}), RSI contradictions, MACD (${ta?.macd?.cross || 'N/A'}), BB position (${ta?.bb?.position || 'N/A'}), unusual volume, intraday move","ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string","positionSizing":"string — delta-adjusted","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string","bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop}","thesis":"string","delta":"string","iv":"string"},"bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop}","thesis":"string","delta":"string","iv":"string"}}`
    }]
  });
}