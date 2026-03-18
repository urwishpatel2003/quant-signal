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

function buildIntradayContext(ohlcv, quote) {
  const current   = quote?.last     || ohlcv?.current;
  const open      = quote?.open     || null;
  const prevClose = ohlcv?.prev     || quote?.prevClose || null;
  let ctx = '\n=== INTRADAY MOVE ===\n';
  if (current && prevClose) {
    const dayChangePct = ((current - prevClose) / prevClose * 100);
    const abs          = Math.abs(dayChangePct).toFixed(2);
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

  // MACD
  if (ta.macd) {
    ctx += `MACD: Line=${ta.macd.macdLine} | Signal=${ta.macd.signalLine} | Hist=${ta.macd.histogram} | ${ta.macd.trend} | ${ta.macd.cross}\n`;
    if (ta.macd.cross === 'BULLISH_CROSS') ctx += `✅ MACD BULLISH CROSS — momentum turning up\n`;
    if (ta.macd.cross === 'BEARISH_CROSS') ctx += `🔴 MACD BEARISH CROSS — momentum turning down\n`;
  }

  // Bollinger Bands
  if (ta.bb) {
    ctx += `BB: Upper=$${ta.bb.upper} | Mid=$${ta.bb.middle} | Lower=$${ta.bb.lower} | Width=${ta.bb.bWidth}% | %B=${ta.bb.bPct} | ${ta.bb.position}\n`;
    if (ta.bb.squeeze)                    ctx += `🔥 BB SQUEEZE — breakout likely soon\n`;
    if (ta.bb.position === 'NEAR_UPPER')  ctx += `NOTE: Price near BB upper band — slightly extended\n`;
    if (ta.bb.position === 'NEAR_LOWER')  ctx += `NOTE: Price near BB lower band — potential support\n`;
  }

  // ATR
  if (ta.atr) {
    ctx += `ATR(14): ${ta.atr.atr} (${ta.atr.atrPct}% of price) | Volatility=${ta.atr.volatility}\n`;
    ctx += `ATR STOPS: Long=$${ta.atr.atr1Stop} (1x) / $${ta.atr.atr2Stop} (2x) | Short=$${ta.atr.shortStop}\n`;
    ctx += `ATR TARGETS: 1x=$${ta.atr.atr1Target} | 2x=$${ta.atr.atr2Target}\n`;
    if (ta.atr.volatility === 'HIGH') ctx += `⚠ HIGH ATR — wide price swings, size down accordingly\n`;
    if (ta.atr.volatility === 'LOW')  ctx += `ℹ LOW ATR — tight range, options may be cheap\n`;
  }

  // Stochastic RSI — 90/10 thresholds, informational only
  if (ta.stochRSI) {
    ctx += `STOCH RSI: K=${ta.stochRSI.k} | D=${ta.stochRSI.d} | ${ta.stochRSI.signal}${ta.stochRSI.crossover ? ` | ${ta.stochRSI.crossover}` : ''}\n`;
    // Only flag at extreme 90/10 thresholds
    if (ta.stochRSI.signal === 'OVERBOUGHT') ctx += `⚠ STOCH RSI EXTREME OVERBOUGHT (K=${ta.stochRSI.k} >90) — strong mean reversion warning\n`;
    if (ta.stochRSI.signal === 'OVERSOLD')   ctx += `✅ STOCH RSI EXTREME OVERSOLD (K=${ta.stochRSI.k} <10) — strong bounce signal\n`;
    if (ta.stochRSI.crossover === 'BULLISH_CROSS') ctx += `✅ STOCH RSI BULLISH CROSS — short-term momentum turning up\n`;
    if (ta.stochRSI.crossover === 'BEARISH_CROSS') ctx += `🔴 STOCH RSI BEARISH CROSS — short-term momentum turning down\n`;
  }

  // Support & Resistance — 5% proximity threshold
  if (ta.sr) {
    ctx += `SUPPORT: ${ta.sr.supportLevels.map(s => `$${s}`).join(', ') || 'none'} | Nearest=$${ta.sr.nearestSupport} (${ta.sr.distToSupport}% below)\n`;
    ctx += `RESISTANCE: ${ta.sr.resistanceLevels.map(r => `$${r}`).join(', ') || 'none'} | Nearest=$${ta.sr.nearestResistance} (${ta.sr.distToResistance}% above)\n`;
    ctx += `S/R Ratio=${ta.sr.srRatio} | Period High=$${ta.sr.periodHigh} | Period Low=$${ta.sr.periodLow}\n`;
    // Only warn if within 5%
    if (ta.sr.distToResistance < 5)  ctx += `NOTE: Within 5% of resistance ($${ta.sr.nearestResistance}) — factor into CALL target\n`;
    if (ta.sr.distToSupport    < 5)  ctx += `NOTE: Within 5% of support ($${ta.sr.nearestSupport}) — factor into PUT target\n`;
    if (ta.sr.srRatio && ta.sr.srRatio > 2) ctx += `✅ GOOD LONG SETUP: ${ta.sr.distToResistance}% to resistance vs ${ta.sr.distToSupport}% to support\n`;
  }

  // SMA distances
  if (ta.priceVsSma20 != null)
    ctx += `SMA DIST: vs SMA20=${ta.priceVsSma20}% | vs SMA50=${ta.priceVsSma50 ?? 'N/A'}% | vs SMA200=${ta.priceVsSma200 ?? 'N/A'}%\n`;
  if (ta.priceVsSma200 && Math.abs(parseFloat(ta.priceVsSma200)) > 15)
    ctx += `⚠ Price ${ta.priceVsSma200}% from SMA200 — very extended, mean reversion risk\n`;

  // Earnings proximity
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
  // IV percentile — informational only, lower weight
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
    ctx += `SIGNALS: VIX=${vix?.current?.toFixed(2)} ${vix?.current > 25 ? '⚠ HIGH' : vix?.current > 20 ? 'ELEVATED' : 'CALM'} | DXY=${dxy?.current?.toFixed(2)} | Gold=$${gold?.current?.toFixed(2)} | Oil=$${oil?.current?.toFixed(2)}\n`;
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
  const ep = calcEarningsProximity(calendar, ticker, expiry);

  const tfMeta = {
    short:    { label: 'Short Term (1-5 days)',       indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}] | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
    swing:    { label: 'Swing Trade (1-4 weeks)',      indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} | MACD=${ta?.macd?.cross} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | ATR=${ta?.atr?.atr} | BB=${ta?.bb?.position} | Trend=${ta?.trendSignal}` },
    position: { label: 'Position Trade (1-3 months)',  indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
    longterm: { label: 'Long Term (6-12 months)',      indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
  };
  const tf = tfMeta[timeframeKey] || tfMeta.swing;

  const result = await callClaude({
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
    "reasoning":"Address the key signals: today's move, RSI, MACD, BB, S/R, ATR, earnings if any. Explain why the overall picture supports or doesn't support a directional bet.",
    "ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string",
    "positionSizing":"string","keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string",
    "bestCall":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${callContracts},"totalCost":0,"targetReturn":"Sell at $${callTarget} — profit $${((parseFloat(callTarget)-callMid)*100*callContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${callTarget} (100% gain). Stop: $${callStop} (50% loss). ATR stop: $${ta?.atr?.atr1Stop}","thesis":"string","delta":"string","iv":"string"},
    "bestPut":{"strike":0,"expiry":"${expiry}","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":${putContracts},"totalCost":0,"targetReturn":"Sell at $${putTarget} — profit $${((parseFloat(putTarget)-putMid)*100*putContracts).toFixed(0)}","maxLoss":0,"entryTiming":"string","exitRule":"Sell at $${putTarget} (100% gain). Stop: $${putStop} (50% loss). ATR stop: $${ta?.atr?.shortStop}","thesis":"string","delta":"string","iv":"string"}
  }
}
RULES: Exact bid/ask/mid only. Avoid wide-spread strikes. OI>50. Return JSON only.`
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
    short:    { label: 'Short Term (1-5 days)',       focus: 'momentum, RSI, StochRSI, volume, news.',               indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | StochRSI K=${ta?.stochRSI?.k} [${ta?.stochRSI?.signal}] | SMA20=$${ta?.sma20} | ATR=${ta?.atr?.atr} | Vol=${ta?.volumeSignal} (${ta?.volumeRatio}x)` },
    swing:    { label: 'Swing Trade (1-4 weeks)',      focus: 'trend, SMA20/50, MACD, BB, S/R, ATR stops.',           indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | BB=${ta?.bb?.position} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
    position: { label: 'Position Trade (1-3 months)',  focus: 'SMA50/200, fundamentals, ATR, macro.',                  indicators: `RSI=${ta?.rsi14} [${ta?.rsiSignal}] | MACD=${ta?.macd?.cross} | SMA50=$${ta?.sma50} | SMA200=$${ta?.sma200} | ATR=${ta?.atr?.atr} | Trend=${ta?.trendSignal}` },
    longterm: { label: 'Long Term (6-12 months)',      focus: 'fundamentals, macro cycle, analyst consensus.',         indicators: `RSI=${ta?.rsi14} | SMA200=$${ta?.sma200} | Trend=${ta?.trendSignal} | Target=$${fundamentals?.targetMeanPrice}` },
  };
  const tf = tfMeta[timeframeKey] || tfMeta.swing;

  return callClaude({
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
}