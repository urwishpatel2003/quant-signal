import { isMarketClosed } from './tradier';
import { checkRSIContradiction, calcDeltaAdjustedSize, calcEarningsProximity } from '../utils/indicators';

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
    const abs          = Math.abs(dayChangePct).toFixed(2);
    ctx += `TODAY: ${dayChangePct > 0 ? 'UP' : 'DOWN'} ${abs}% | prev $${prevClose.toFixed(2)} → $${current.toFixed(2)}\n`;
    if      (dayChangePct <= -1.5) ctx += `⚠ DOWN ${abs}% TODAY — put IV spiked, remaining downside may be priced in. Mean reversion risk HIGH.\n`;
    else if (dayChangePct <= -0.75) ctx += `⚠ DOWN ${abs}% TODAY — put premiums elevated.\n`;
    else if (dayChangePct >= 1.5)  ctx += `⚠ UP ${abs}% TODAY — call IV spiked, remaining upside may be priced in. Mean reversion risk HIGH.\n`;
    else if (dayChangePct >= 0.75) ctx += `⚠ UP ${abs}% TODAY — call premiums elevated.\n`;
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
    if (downDays >= 3) ctx += `⚠ ${downDays} CONSECUTIVE DOWN SESSIONS — bounce risk HIGH for new PUT entries.\n`;
    if (upDays   >= 3) ctx += `⚠ ${upDays} CONSECUTIVE UP SESSIONS — pullback risk HIGH for new CALL entries.\n`;
  }
  return ctx;
}

// ─── Enhanced TA context ──────────────────────────────────────────────────────
function buildTAContext(ta, ticker = '', calendar = null, selectedExpiry = null) {
  if (!ta) return '';
  let ctx = '\n=== TECHNICAL ANALYSIS ===\n';

  // MACD
  if (ta.macd) {
    ctx += `MACD: Line=${ta.macd.macdLine} | Signal=${ta.macd.signalLine} | Hist=${ta.macd.histogram} | ${ta.macd.trend} | ${ta.macd.cross}\n`;
    if (ta.macd.cross === 'BULLISH_CROSS') ctx += `✅ MACD BULLISH CROSS — momentum turning up\n`;
    if (ta.macd.cross === 'BEARISH_CROSS') ctx += `🔴 MACD BEARISH CROSS — momentum turning down\n`;
  }

  // Bollinger Bands
  if (ta.bb) {
    ctx += `BB: Upper=$${ta.bb.upper} | Mid=$${ta.bb.middle} | Lower=$${ta.bb.lower} | Width=${ta.bb.bWidth}% | %B=${ta.bb.bPct} | ${ta.bb.position}\n`;
    if (ta.bb.squeeze)                    ctx += `🔥 BB SQUEEZE — low volatility, breakout imminent\n`;
    if (ta.bb.position === 'NEAR_UPPER')  ctx += `⚠ Price near BB upper — overbought, CALL entry risky\n`;
    if (ta.bb.position === 'NEAR_LOWER')  ctx += `✅ Price near BB lower — oversold, PUT entry risky\n`;
  }

  // ATR
  if (ta.atr) {
    ctx += `ATR(14): ${ta.atr.atr} (${ta.atr.atrPct}% of price) | Volatility=${ta.atr.volatility}\n`;
    ctx += `ATR STOPS: Long stop=$${ta.atr.atr1Stop} (1x) | $${ta.atr.atr2Stop} (2x) | Short stop=$${ta.atr.shortStop}\n`;
    ctx += `ATR TARGETS: 1x=$${ta.atr.atr1Target} | 2x=$${ta.atr.atr2Target}\n`;
    if (ta.atr.volatility === 'HIGH')   ctx += `⚠ HIGH ATR — wide price swings, options premiums likely elevated, use wider stops\n`;
    if (ta.atr.volatility === 'LOW')    ctx += `ℹ LOW ATR — tight range, options may be cheap, good for debit spreads\n`;
  }

  // Stochastic RSI
  if (ta.stochRSI) {
    ctx += `STOCH RSI: K=${ta.stochRSI.k} | D=${ta.stochRSI.d} | ${ta.stochRSI.signal}${ta.stochRSI.crossover ? ` | ${ta.stochRSI.crossover}` : ''}\n`;
    if (ta.stochRSI.signal === 'OVERBOUGHT')      ctx += `⚠ STOCH RSI OVERBOUGHT (K=${ta.stochRSI.k}) — pullback likely, CALL entry risky\n`;
    if (ta.stochRSI.signal === 'OVERSOLD')        ctx += `✅ STOCH RSI OVERSOLD (K=${ta.stochRSI.k}) — bounce likely, PUT entry risky\n`;
    if (ta.stochRSI.crossover === 'BULLISH_CROSS') ctx += `✅ STOCH RSI BULLISH CROSS — short-term momentum turning up\n`;
    if (ta.stochRSI.crossover === 'BEARISH_CROSS') ctx += `🔴 STOCH RSI BEARISH CROSS — short-term momentum turning down\n`;
  }

  // Support & Resistance
  if (ta.sr) {
    ctx += `SUPPORT: ${ta.sr.supportLevels.map(s => `$${s}`).join(', ') || 'none'} | Nearest=$${ta.sr.nearestSupport} (${ta.sr.distToSupport}% below)\n`;
    ctx += `RESISTANCE: ${ta.sr.resistanceLevels.map(r => `$${r}`).join(', ') || 'none'} | Nearest=$${ta.sr.nearestResistance} (${ta.sr.distToResistance}% above)\n`;
    ctx += `PERIOD HIGH=$${ta.sr.periodHigh} | PERIOD LOW=$${ta.sr.periodLow} | S/R Ratio=${ta.sr.srRatio} (>1 = better long setup)\n`;
    if (ta.sr.distToResistance < 1.5) ctx += `⚠ NEAR RESISTANCE ($${ta.sr.nearestResistance}) — only ${ta.sr.distToResistance}% upside to resistance, CALL reward limited\n`;
    if (ta.sr.distToSupport    < 1.5) ctx += `⚠ NEAR SUPPORT ($${ta.sr.nearestSupport}) — only ${ta.sr.distToSupport}% to support, PUT reward limited\n`;
    if (ta.sr.srRatio && ta.sr.srRatio > 2) ctx += `✅ GOOD LONG SETUP: ${ta.sr.distToResistance}% to resistance vs ${ta.sr.distToSupport}% to support (ratio=${ta.sr.srRatio})\n`;
  }

  // SMA distances
  if (ta.priceVsSma20 != null)
    ctx += `SMA DIST: vs SMA20=${ta.priceVsSma20}% | vs SMA50=${ta.priceVsSma50 ?? 'N/A'}% | vs SMA200=${ta.priceVsSma200 ?? 'N/A'}%\n`;
  if (ta.priceVsSma200 && Math.abs(parseFloat(ta.priceVsSma200)) > 10)
    ctx += `⚠ Price ${ta.priceVsSma200}% from SMA200 — EXTENDED, mean reversion risk elevated\n`;

  // Earnings proximity
  if (ticker && calendar) {
    const ep = calcEarningsProximity(calendar, ticker, selectedExpiry);
    if (ep) {
      ctx += `\nEARNINGS: ${ep.daysToEarnings} days away (${ep.earningsDate})${ep.earningsBeforeExpiry ? ' — ⚠ BEFORE EXPIRY' : ''} | Risk=${ep.risk}\n`;
      ctx += `EARNINGS ADVICE: ${ep.advice}\n`;
    }
  }

  return ctx;
}

// ─── Chain context ────────────────────────────────────────────────────────────
function buildChainContext(chain) {
  if (!chain) return '';
  let ctx = '\n=== OPTIONS INTELLIGENCE ===\n';
  ctx += `IV SKEW: ${chain.ivSkewPct}% (${chain.ivSkewLabel}) — ${
    chain.ivSkewLabel === 'PUT_SKEW'  ? 'Market pricing crash risk, puts expensive' :
    chain.ivSkewLabel === 'CALL_SKEW' ? 'Market pricing melt-up, calls expensive'  : 'Balanced IV'}\n`;
  ctx += `IV PERCENTILE: ${chain.ivPercentile}% — ${chain.ivPctLabel}\n`;
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

// ─── Delta-adjusted sizing context ───────────────────────────────────────────
function buildSizingContext(calls, puts, budget = 1500) {
  let ctx = '\n=== DELTA-ADJUSTED SIZING ===\n';
  const bestCall = calls[0];
  const bestPut  = puts[0];
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
  const taCtx       = buildTAContext(ta, ticker, calendar, expiry);
  const chainCtx    = buildChainContext(chain);
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

  const callContradiction = checkRSIContradiction(ta?.rsi14, 'CALL');
  const putContradiction  = checkRSIContradiction(ta?.rsi14, 'PUT');

  // Earnings proximity
  const ep = calcEarningsProximity(calendar, ticker, expiry);

  const tfMeta = {
    short:    { label: 'Short Term (1-5 days)',       indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}] | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
    swing:    { label: 'Swing Trade (1-4 weeks)',      indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} | MACD=${ta?.macd?.cross} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
    position: { label: 'Position Trade (1-3 months)',  indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
    longterm: { label: 'Long Term (6-12 months)',      indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
  };
  const tf = tfMeta[timeframeKey] || tfMeta.swing;

  const result = await callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
    system: `You are a quantitative trading analyst and expert options trader.

CRITICAL OPTIONS RULES:
1. Already down >1% today: PUT IV spiked — justify new PUT or recommend NEUTRAL.
2. Already up >1% today: CALL IV spiked — justify new CALL or recommend NEUTRAL.
3. IV PERCENTILE >80%: Options EXPENSIVE — buying outright is high risk.
4. IV PERCENTILE <20%: Options CHEAP — good for outright buys.
5. Wide spread (>15%): Illiquid — avoid these strikes.
6. Unusual volume 🔥: Smart money signal — weight heavily.
7. RSI >70 + CALL: Contradiction — address explicitly.
8. RSI <30 + PUT: Contradiction — address explicitly.
9. StochRSI OVERBOUGHT + CALL: Contradiction — address.
10. StochRSI OVERSOLD + PUT: Contradiction — address.
11. MACD cross contradicts direction: Address it.
12. BB NEAR_UPPER + CALL: Overbought risk.
13. BB NEAR_LOWER + PUT: Oversold risk.
14. Price near resistance (<2%): CALL reward limited — address.
15. Price near support (<2%): PUT reward limited — address.
16. ATR HIGH: Wide stops needed, adjust position size.
17. Earnings before expiry: IV crush risk after report — critical risk.
18. SMA200 distance >10%: Extended, mean reversion risk.
19. 3+ consecutive same-direction days: Mean reversion risk.
20. Use delta-adjusted sizing. NEUTRAL is valid. Exact prices only.

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
${ep ? `EARNINGS RISK: ${ep.daysToEarnings}d away | Before expiry: ${ep.earningsBeforeExpiry} | ${ep.risk} | ${ep.advice}` : ''}
FUNDAMENTALS: P/E=${fundamentals?.pe} | Beta=${fundamentals?.beta} | Target=$${fundamentals?.targetMeanPrice} | Rec=${fundamentals?.recommendationKey} | ROE=${fundamentals?.roe}
OPTIONS FLOW: P/C OI=${chain?.putCallRatio?.toFixed(2)} | P/C Vol=${parseFloat(chain?.putCallVolRatio)?.toFixed(2)} | CallIV=${chain?.avgCallIV}% | PutIV=${chain?.avgPutIV}%
PRICE (5 closes): ${JSON.stringify(ohlcv?.close?.slice(-5))}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
${macroCtx}
ATM CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid}|a$${c.ask}|m$${c.mid}|IV${c.iv}%|d${c.delta}|g${c.gamma}|OI${c.oi}|vol${c.volume}|sprd${c.spreadPct}%${c.unusualVolume ? '🔥' : ''}${c.wideSpread ? '⚠WIDE' : ''}`).join(' ')}
ATM PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid}|a$${p.ask}|m$${p.mid}|IV${p.iv}%|d${p.delta}|g${p.gamma}|OI${p.oi}|vol${p.volume}|sprd${p.spreadPct}%${p.unusualVolume ? '🔥' : ''}${p.wideSpread ? '⚠WIDE' : ''}`).join(' ')}

DECISION CHECKLIST:
- Today's move: ${dayChangePct >= 0 ? 'UP' : 'DOWN'} ${Math.abs(dayChangePct).toFixed(2)}%
- IV Percentile: ${chain?.ivPercentile}% (${chain?.ivPctLabel})
- RSI: ${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI: K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}]
- MACD: ${ta?.macd?.cross || 'N/A'} | BB: ${ta?.bb?.position || 'N/A'}
- ATR: ${ta?.atr?.atr} (${ta?.atr?.volatility}) | ATR Stop: $${ta?.atr?.atr1Stop}
- Nearest Resistance: $${ta?.sr?.nearestResistance} (${ta?.sr?.distToResistance}% away)
- Nearest Support: $${ta?.sr?.nearestSupport} (${ta?.sr?.distToSupport}% away)
- Earnings: ${ep ? `${ep.daysToEarnings}d [${ep.risk}]${ep.earningsBeforeExpiry ? ' BEFORE EXPIRY ⚠' : ''}` : 'none detected'}
- Skew: ${chain?.ivSkewLabel} | Unusual vol: ${[...(chain?.unusualCalls || []), ...(chain?.unusualPuts || [])].length > 0 ? 'YES' : 'NONE'}

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
    "reasoning":"MUST address: today's move, IV percentile, RSI+StochRSI vs direction, MACD, BB, S/R proximity, ATR, earnings risk if any, unusual volume",
    "ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string",
    "positionSizing":"string — use delta-adjusted + ATR-based stop sizing",
    "keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string",
    "bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"Sell at $${callTarget} — profit $${((parseFloat(callTarget)-callMid)*100*callContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop} (50% loss). ATR stop: $${ta?.atr?.atr1Stop}","thesis":"string","delta":"string","iv":"string"},
    "bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"Sell at $${putTarget} — profit $${((parseFloat(putTarget)-putMid)*100*putContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop} (50% loss). ATR stop: $${ta?.atr?.shortStop}","thesis":"string","delta":"string","iv":"string"}
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
  const taCtx       = buildTAContext(ta, ticker, calendar);
  const categorized = categorizeNews(news).slice(0, 8);
  const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
  const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
  const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));

  const tfMeta = {
    short:    { label: 'Short Term (1-5 days)',       focus: 'momentum, RSI, StochRSI, volume spikes, news.',        indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}] | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
    swing:    { label: 'Swing Trade (1-4 weeks)',      focus: 'trend, SMA20/50, MACD, BB, S/R levels.',               indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | BB=${ta?.bb?.position} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
    position: { label: 'Position Trade (1-3 months)',  focus: 'SMA50/200 trend, fundamentals, ATR, macro.',           indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
    longterm: { label: 'Long Term (6-12 months)',      focus: 'fundamentals, macro cycle, analyst consensus.',         indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
  };
  const tf = tfMeta[timeframeKey] || tfMeta.swing;

  return callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
    system: `You are a quantitative trading analyst. Timeframe: ${tf.label}. Focus: ${tf.focus}
[UPGRADE]/[INSIDER/FUND]=bullish. [DOWNGRADE]/[SHORT ATTACK]=bearish.
Use ATR stops for price targets. Consider S/R levels as natural targets/stops.
If SMA200 dist >10%, price is extended — factor mean reversion into thesis.
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
  const taCtx       = buildTAContext(ta, ticker, calendar, expiry);
  const chainCtx    = buildChainContext(chain);
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
  const ep = calcEarningsProximity(calendar, ticker, expiry);

  return callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1500, temperature: 0,
    system: `You are an expert options trader.
RULES: 1)Down>1%=PUT IV spiked. 2)Up>1%=CALL IV spiked. 3)IV>80%=expensive. 4)IV<20%=cheap. 5)Wide spread=avoid. 6)Unusual vol=smart money. 7)RSI>70+CALL=contradiction. 8)RSI<30+PUT=contradiction. 9)StochRSI OB+CALL=risky. 10)StochRSI OS+PUT=risky. 11)MACD contradicts=address. 12)BB NEAR_UPPER+CALL=risky. 13)BB NEAR_LOWER+PUT=risky. 14)Near resistance<2%=CALL reward limited. 15)Near support<2%=PUT reward limited. 16)ATR HIGH=wide stops. 17)Earnings before expiry=IV crush risk. 18)SMA200 dist>10%=extended. 19)Delta-adjusted sizing. 20)NEUTRAL is valid. 21)Exact prices only.
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
${ep ? `EARNINGS: ${ep.daysToEarnings}d away | Before expiry: ${ep.earningsBeforeExpiry} | ${ep.risk} | ${ep.advice}` : ''}
Price Signal: ${priceSignal?.signal} ${priceSignal?.confidence}% | Macro: ${priceSignal?.macroImpact} | Global: ${priceSignal?.globalMarketTrend}
FUNDAMENTALS: Rec=${fundamentals?.recommendationKey?.toUpperCase()} | Target=$${fundamentals?.targetMeanPrice}
${hasUpgrade ? '🟢 UPGRADE' : ''}${hasDowngrade ? '🔴 DOWNGRADE' : ''}${hasTarget ? '📊 TARGET' : ''}${hasFund ? '🏦 INSTITUTIONAL' : ''}${hasShort ? '⚠ SHORT ATTACK' : ''}
NEWS: ${categorized.slice(0, 6).join(' | ')}
CALLS: ${calls.map(c => `$${c.strike}|b$${c.bid}|a$${c.ask}|m$${c.mid}|IV${c.iv}%|d${c.delta}|g${c.gamma}|OI${c.oi}|vol${c.volume}|sprd${c.spreadPct}%${c.unusualVolume ? '🔥' : ''}${c.wideSpread ? '⚠' : ''}`).join(' ')}
PUTS:  ${puts.map(p => `$${p.strike}|b$${p.bid}|a$${p.ask}|m$${p.mid}|IV${p.iv}%|d${p.delta}|g${p.gamma}|OI${p.oi}|vol${p.volume}|sprd${p.spreadPct}%${p.unusualVolume ? '🔥' : ''}${p.wideSpread ? '⚠' : ''}`).join(' ')}
${macroCtx}
Return JSON: {"recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,"reasoning":"MUST address: IV pct (${chain?.ivPercentile}%), skew (${chain?.ivSkewLabel}), RSI (${ta?.rsi14}), StochRSI (${ta?.stochRSI?.signal}), MACD (${ta?.macd?.cross}), BB (${ta?.bb?.position}), S/R proximity (res $${ta?.sr?.nearestResistance} ${ta?.sr?.distToResistance}% away, sup $${ta?.sr?.nearestSupport} ${ta?.sr?.distToSupport}% away), ATR (${ta?.atr?.volatility}), earnings (${ep ? ep.risk : 'none'}), unusual vol, intraday move","ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string","positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string","bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop}. ATR stop: $${ta?.atr?.atr1Stop}","thesis":"string","delta":"string","iv":"string"},"bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop}. ATR stop: $${ta?.atr?.shortStop}","thesis":"string","delta":"string","iv":"string"}}`
    }]
  });
}