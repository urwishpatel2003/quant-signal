import { isMarketClosed } from './tradier';

async function callClaude(payload) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), mode: 'cors', credentials: 'omit',
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

function categorizeNews(headlines) {
  return (headlines || []).map(n => {
    const t = n.title?.toLowerCase() || '';
    if (t.includes('upgrade') || t.includes('outperform') || t.includes('buy rating') || t.includes('overweight') || t.includes('initiated') || t.includes('initiates coverage'))
      return `[UPGRADE] ${n.title}`;
    if (t.includes('downgrade') || t.includes('underperform') || t.includes('sell rating') || t.includes('underweight') || t.includes('cuts to'))
      return `[DOWNGRADE] ${n.title}`;
    if (t.includes('price target') || t.includes('raises target') || t.includes('lowers target') || t.includes('pt raised') || t.includes('pt cut') || t.includes('target to $'))
      return `[ANALYST TARGET] ${n.title}`;
    if (t.includes('13f') || t.includes('insider') || t.includes('stake') || t.includes('position') || t.includes('holding') || t.includes('buffett') || t.includes('soros') || t.includes('ackman') || t.includes('bought shares') || t.includes('sold shares'))
      return `[INSIDER/FUND] ${n.title}`;
    if (t.includes('earnings') || t.includes('eps') || t.includes('revenue') || t.includes('beat') || t.includes('miss') || t.includes('guidance') || t.includes('outlook'))
      return `[EARNINGS] ${n.title}`;
    if (t.includes('fda') || t.includes('approval') || t.includes('approved') || t.includes('rejected') || t.includes('trial') || t.includes('lawsuit') || t.includes('sec') || t.includes('investigation') || t.includes('merger') || t.includes('acquisition'))
      return `[REGULATORY/EVENT] ${n.title}`;
    if (t.includes('short') || t.includes('short seller') || t.includes('hindenburg') || t.includes('citron'))
      return `[SHORT ATTACK] ${n.title}`;
    return `[NEWS] ${n.title}`;
  });
}

export function buildMacroContext(bonds, macroNews, intlMarkets, calendar) {
  let ctx = '\n=== GLOBAL MACRO CONTEXT ===\n';
  if (bonds) {
    ctx += `US BONDS:\n  10Y: ${bonds.tnx?.current?.toFixed(2)}% (${bonds.tnx?.changePct > 0 ? '+' : ''}${bonds.tnx?.changePct?.toFixed(2)}%)\n  2Y: ${bonds.irx?.current?.toFixed(2)}% | 30Y: ${bonds.tyx?.current?.toFixed(2)}%\n  Yield Curve (10Y-2Y): ${bonds.yieldCurve}% ${bonds.inverted ? '⚠ INVERTED' : ''}\n  TLT: $${bonds.tlt?.current?.toFixed(2)} (${bonds.tlt?.changePct?.toFixed(2)}%)\n`;
  }
  if (intlMarkets?.length) {
    const find = sym => intlMarkets.find(m => m.symbol === sym);
    const fmt  = (m, d = 0) => m?.current ? m.current.toLocaleString('en-US', { maximumFractionDigits: d }) : 'N/A';
    const pct  = m => m?.changePct != null ? `(${m.changePct > 0 ? '+' : ''}${m.changePct.toFixed(2)}%)` : '';
    ctx += `\nASIA MARKETS:\n  Nikkei 225: ${fmt(find('^N225'))} ${pct(find('^N225'))}\n  Hang Seng: ${fmt(find('^HSI'))} ${pct(find('^HSI'))}\n  Shanghai: ${fmt(find('000001.SS'), 2)} ${pct(find('000001.SS'))}\n  Sensex: ${fmt(find('^BSESN'))} ${pct(find('^BSESN'))}\n`;
    ctx += `\nEUROPE MARKETS:\n  DAX: ${fmt(find('^GDAXI'))} ${pct(find('^GDAXI'))}\n  FTSE 100: ${fmt(find('^FTSE'))} ${pct(find('^FTSE'))}\n  CAC 40: ${fmt(find('^FCHI'))} ${pct(find('^FCHI'))}\n`;
    const vix = find('^VIX'), dxy = find('DX-Y.NYB'), gold = find('GC=F'), oil = find('CL=F');
    ctx += `\nMARKET SIGNALS:\n  VIX: ${vix?.current?.toFixed(2)} ${vix?.current > 25 ? '⚠ HIGH FEAR' : vix?.current > 20 ? 'ELEVATED' : 'CALM'}\n  DXY: ${dxy?.current?.toFixed(2)} ${pct(dxy)}\n  Gold: $${gold?.current?.toFixed(2)} ${pct(gold)}\n  Oil: $${oil?.current?.toFixed(2)} ${pct(oil)}\n`;
  }
  if (calendar?.length) {
    ctx += `\nECONOMIC CALENDAR:\n`;
    calendar.slice(0, 6).forEach(e => { ctx += `  [${e.category?.split(' ').slice(0, 3).join(' ')}] ${e.title}\n`; });
  }
  if (macroNews?.length) {
    ctx += `\nGEOPOLITICAL & MACRO NEWS:\n`;
    macroNews.slice(0, 8).forEach(n => { ctx += `  [${n.topic?.split(' ').slice(0, 3).join(' ')}] ${n.title}\n`; });
  }
  return ctx;
}

export async function runPriceAnalysis(ticker, price, ohlcv, fundamentals, options, news, bonds, macroNews, intlMarkets, calendar, ta) {
  const macroCtx     = buildMacroContext(bonds, macroNews, intlMarkets, calendar);
  const categorized  = categorizeNews(news).slice(0, 10);
  const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
  const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
  const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));

  return callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1400,
    system: `You are a quantitative trading analyst with expertise in global macro, geopolitics, cross-market analysis, and institutional flow.
Consider how global markets (Asia, Europe), bond markets, VIX, USD, commodities, and economic calendar affect the stock.
Weight analyst upgrades/downgrades and institutional fund activity heavily — these often precede large moves.
[UPGRADE] and [INSIDER/FUND] tags are bullish signals. [DOWNGRADE] and [SHORT ATTACK] tags are bearish signals.
Return ONLY a JSON object:
{"signal":"BUY"|"SELL"|"HOLD","confidence":0-100,"priceTarget":number,"stopLoss":number,"timeframe":string,"thesis":string,"bullFactors":[str,str,str],"bearFactors":[str,str,str],"riskLevel":"LOW"|"MEDIUM"|"HIGH","sentimentScore":-100,"macroImpact":"BULLISH"|"BEARISH"|"NEUTRAL","bondSignal":"string","geopoliticalRisk":"LOW"|"MEDIUM"|"HIGH","globalMarketTrend":"RISK_ON"|"RISK_OFF"|"MIXED","calendarRisk":"string"}`,
    messages: [{
      role: 'user',
      content: `Analyze ${ticker} at $${price?.toFixed(2)}.
PRICE (last 5 closes): ${JSON.stringify(ohlcv?.close?.slice(-5))}
FUNDAMENTALS: P/E=${fundamentals?.pe}, Beta=${fundamentals?.beta}, Target=$${fundamentals?.targetMeanPrice}, Rec=${fundamentals?.recommendationKey}, Analysts=${fundamentals?.numberOfAnalystOpinions}
OPTIONS FLOW: P/C=${options?.putCallRatio?.toFixed(2)}, CallIV=${options?.avgCallIV}%, PutIV=${options?.avgPutIV}%
TECHNICAL ANALYSIS: RSI(14)=${ta?.rsi14} [${ta?.rsiSignal}] | SMA20=$${ta?.sma20} (${ta?.priceVsSma20}% from price) | SMA50=$${ta?.sma50} (${ta?.priceVsSma50}% from price) | Trend=${ta?.trendSignal} | Volume=${ta?.volumeSignal} (${ta?.volumeRatio}x avg)
ANALYST CONSENSUS: ${fundamentals?.recommendationKey?.toUpperCase()} | Mean Target: $${fundamentals?.targetMeanPrice} | # Analysts: ${fundamentals?.numberOfAnalystOpinions}
${hasUpgrade   ? '⚠ RECENT UPGRADE DETECTED — bullish analyst sentiment shift' : ''}
${hasDowngrade ? '⚠ RECENT DOWNGRADE DETECTED — bearish analyst sentiment shift' : ''}
${hasFund      ? '⚠ INSTITUTIONAL/FUND ACTIVITY DETECTED — smart money movement' : ''}

ANALYST & NEWS FLOW (weighted by type):
${categorized.join('\n')}
${macroCtx}
How do Asian/European market moves, yield curve shape, VIX, DXY, analyst actions, and upcoming calendar events specifically affect ${ticker}?
Return JSON only.`
    }]
  });
}

export async function runOptionsAnalysis(ticker, price, expiry, chain, fundamentals, news, priceSignal, bonds, macroNews, intlMarkets, calendar, ta) {
  const calls = chain?.topCalls?.slice(0, 6) || [];
  const puts  = chain?.topPuts?.slice(0,  6) || [];
  const hasValidCalls = calls.some(c => c.mid > 0.10 && Math.abs(c.strike - price) <= 20);
  const hasValidPuts  = puts.some( p => p.mid > 0.10 && Math.abs(p.strike - price) <= 20);
  const macroCtx = buildMacroContext(bonds, macroNews, intlMarkets, calendar);

  const categorized  = categorizeNews(news).slice(0, 10);
  const hasUpgrade   = categorized.some(n => n.startsWith('[UPGRADE]'));
  const hasDowngrade = categorized.some(n => n.startsWith('[DOWNGRADE]'));
  const hasTarget    = categorized.some(n => n.startsWith('[ANALYST TARGET]'));
  const hasFund      = categorized.some(n => n.startsWith('[INSIDER/FUND]'));
  const hasShort     = categorized.some(n => n.startsWith('[SHORT ATTACK]'));

  // Pre-calculate helper values for the prompt
  const callMid       = calls[0]?.mid || 0;
  const putMid        = puts[0]?.mid  || 0;
  const callContracts = Math.max(1, Math.floor(1500 / (callMid * 100)));
  const putContracts  = Math.max(1, Math.floor(1500 / (putMid  * 100)));
  const callStop      = (callMid * 0.50).toFixed(2);
  const callTarget    = (callMid * 2.00).toFixed(2);
  const putStop       = (putMid  * 0.50).toFixed(2);
  const putTarget     = (putMid  * 2.00).toFixed(2);

  return callClaude({
    model: 'claude-sonnet-4-20250514', max_tokens: 1600,
    system: `You are an expert options trader with deep knowledge of global macro, geopolitics, cross-market dynamics, and institutional flow.
Factor in Asian/European market trends, bond yields, VIX, USD, and economic calendar when recommending options plays.
Weight analyst actions heavily: [UPGRADE] boosts CALL conviction, [DOWNGRADE] boosts PUT conviction.
[ANALYST TARGET] raises/cuts shift price expectations — factor into priceTarget and entryTiming.
[INSIDER/FUND] buying = bullish, selling = bearish. [SHORT ATTACK] = strong bearish signal.
Use EXACT bid/ask/mid prices from the contracts provided. Never invent prices.
entryTiming and exitRule MUST contain SPECIFIC DOLLAR PRICES, not vague descriptions.
Return ONLY this JSON:
{"recommendation":"CALL"|"PUT"|"NEUTRAL","confidence":0-100,"reasoning":"string","ivRank":"LOW"|"MEDIUM"|"HIGH","ivComment":"string","macroSetup":"string","calendarWarning":"string","bestCall":{"strike":0,"expiry":"YYYY-MM-DD","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":0,"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"string","thesis":"string","delta":"string","iv":"string"},"bestPut":{"strike":0,"expiry":"YYYY-MM-DD","bid":0,"ask":0,"mid":0,"estimatedPremium":0,"maxContracts":0,"totalCost":0,"targetReturn":"string","maxLoss":0,"entryTiming":"string","exitRule":"string","thesis":"string","delta":"string","iv":"string"},"keyRisks":["","",""],"catalysts":["","",""],"macroRisks":["",""],"globalMarketRisk":"string","positionSizing":"string"}`,
    messages: [{
      role: 'user',
      content: `OPTIONS: ${ticker} @ $${price?.toFixed(2)} | Expiry: ${expiry}
Today: ${new Date().toLocaleDateString()} | Market: ${isMarketClosed() ? 'CLOSED' : 'OPEN'}
Price Signal: ${priceSignal?.signal} ${priceSignal?.confidence}% | Macro: ${priceSignal?.macroImpact} | Global: ${priceSignal?.globalMarketTrend}
TECHNICALS: RSI=${ta?.rsi14} [${ta?.rsiSignal}] | Trend=${ta?.trendSignal} | SMA20=$${ta?.sma20} | SMA50=$${ta?.sma50} | Volume=${ta?.volumeSignal} (${ta?.volumeRatio}x)
ANALYST CONSENSUS: ${fundamentals?.recommendationKey?.toUpperCase()} | Mean Target: $${fundamentals?.targetMeanPrice} | # Analysts: ${fundamentals?.numberOfAnalystOpinions}
${hasUpgrade   ? '🟢 RECENT UPGRADE — analyst sentiment turning bullish, factor into CALL conviction' : ''}
${hasDowngrade ? '🔴 RECENT DOWNGRADE — analyst sentiment turning bearish, factor into PUT conviction' : ''}
${hasTarget    ? '📊 ANALYST TARGET CHANGE — adjust expected price range accordingly' : ''}
${hasFund      ? '🏦 INSTITUTIONAL ACTIVITY — smart money movement detected' : ''}
${hasShort     ? '⚠ SHORT ATTACK DETECTED — elevated downside risk' : ''}

ANALYST & NEWS FLOW (weighted by type):
${categorized.join('\n')}

=== ATM CALLS (spot $${price?.toFixed(2)}) ===
${calls.map(c => `Strike=$${c.strike} | Bid=$${c.bid.toFixed(2)} | Ask=$${c.ask.toFixed(2)} | MID=$${c.mid.toFixed(2)} | IV=${c.iv}% | Delta=${c.delta} | OI=${c.oi}`).join('\n')}
${!hasValidCalls ? 'WARNING: No liquid ATM calls' : ''}

=== ATM PUTS (spot $${price?.toFixed(2)}) ===
${puts.map(p => `Strike=$${p.strike} | Bid=$${p.bid.toFixed(2)} | Ask=$${p.ask.toFixed(2)} | MID=$${p.mid.toFixed(2)} | IV=${p.iv}% | Delta=${p.delta} | OI=${p.oi}`).join('\n')}
${!hasValidPuts ? 'WARNING: No liquid ATM puts' : ''}
${macroCtx}

MANDATORY RULES:
1. Strike MUST be from contracts above, closest to $${price?.toFixed(2)}, OI > 50
2. bid/ask/mid MUST exactly match selected contract row
3. estimatedPremium = mid exactly
4. maxContracts = floor(1500/(mid*100)), min 1
5. totalCost = maxContracts * mid * 100
6. maxLoss = totalCost
7. expiry = exactly: ${expiry}
8. entryTiming MUST be a specific stock price trigger, e.g: "Buy if ${ticker} holds above $${price?.toFixed(2)} at market open" or "Enter when ${ticker} breaks above $${(price * 1.005).toFixed(2)}"
9. exitRule MUST contain exact premium prices: "Sell contract at $${callTarget} (100% gain). Stop loss: sell at $${callStop} (50% loss = -$${(parseFloat(callStop) * 100 * callContracts).toFixed(0)} total)"
10. targetReturn MUST be: "Sell at $${callTarget} per contract — total profit $${((parseFloat(callTarget) - callMid) * 100 * callContracts).toFixed(0)}"
11. Use the same exact price format for puts using their own mid prices
Return JSON only.`
    }]
  });
}