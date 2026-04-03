import { useState } from 'react';

const STEPS = [
  {
    id: 'market', label: 'US & India', icon: '🌏', title: 'US & India Market Support',
    content: [
      { heading: 'Switching Between Markets', text: 'Use the 🇺🇸 US / 🇮🇳 IN toggle in the header to switch between US stocks and NSE India. The app auto-detects your market on first visit based on your timezone — Indian users (IST) default to India. Your preference is saved for future visits.', tip: 'You can switch markets at any time. Each market has its own separate watchlist so your US and India stocks don\'t get mixed up.' },
      { heading: 'NSE India Coverage', text: 'QuAInt Signal covers the full Nifty 50 index — India\'s top 50 stocks by market cap. The Scanner tab shows live Nifty 500 movers (gainers, losers, volume). Search any NSE ticker — from large caps like RELIANCE, TCS, INFY to mid-caps like PERSISTENT, COFORGE, DEEPAKNITR.', tip: 'All prices for Indian stocks are shown in ₹ (INR). Options are not available for Indian stocks — only stock scan signals.' },
      { heading: 'India-Specific AI Analysis', text: 'When scanning Indian stocks, the AI incorporates India-specific macro factors: RBI monetary policy, FII/DII (Foreign/Domestic Institutional Investor) flows, INR/USD strength, Union Budget impact, GST data, and SEBI regulations. The thesis describes the company in NSE context.', tip: 'The macro ticker bar shows 🇮🇳 NIFTY, SENSEX, Gold, Crude Oil, USD/INR, and VIX when in India mode.' },
      { heading: 'India Watchlist', text: 'Add any NSE ticker to your India watchlist (e.g. RELIANCE, BAJFINANCE, TITAN). Background AI analysis runs automatically and shows long-term BUY/SELL/HOLD ratings. Free tier: 5 Indian stocks in watchlist. Pro: unlimited.', tip: 'India watchlist and US watchlist are completely separate. Switching to India shows only your Indian stocks, switching to US shows only your US stocks.' },
    ],
  },
  {
    id: 'scanner', label: 'Scanner', icon: '📡', title: 'How to Use the Stock Scanner',
    content: [
      { heading: 'Step 1 — Search a Ticker', text: 'Type any stock symbol or company name. For US: e.g. "AAPL", "NVDA", "Tesla". For India: e.g. "RELIANCE", "TCS", "Infosys". A dropdown shows matching tickers. Click one or press Enter to select.', tip: 'For Indian stocks, use the NSE ticker symbol (e.g. BAJAJ-AUTO, M&M, HDFCBANK). The search suggests from the full Nifty 50 list.' },
      { heading: 'Step 2 — Choose a Timeframe', text: 'Select from 4 timeframes: Short Term (1-5 days), Swing Trade (1-4 weeks), Position Trade (1-3 months), or Long Term (6-12 months). Each uses different indicators, price history, target rules, and AI focus.', tip: 'Short Term uses ATR targets and momentum signals. Long Term uses analyst consensus price targets and fundamental drivers. Choose based on how long you plan to hold.' },
      { heading: 'Step 3 — Run the Scan', text: 'Click RUN SCAN. The AI analyzes price action, RSI, MACD, moving averages, ATR, Bollinger Bands, support/resistance, fundamentals, news, and global macro — then generates a BUY, SELL, or HOLD signal with confidence %.', tip: 'Higher confidence (75%+) means more signals are aligned. The thesis combines company context, fundamental driver, and technical setup — not just technicals.' },
      { heading: 'Step 4 — Read the Results', text: 'Price & Decision shows: entry price, target, stop loss, signal confidence, macro metrics, and AI thesis. Signal Overview shows an auto-generated technical reading plus bull/bear factors. Fundamentals & Technicals shows all indicators. News shows recent headlines.', tip: 'For US stocks, use the ⚡ OPTIONS button after a scan to run options analysis on the same ticker.' },
    ],
  },
  {
    id: 'timeframes', label: 'Timeframes', icon: '⏱', title: 'Understanding the 4 Timeframes',
    content: [
      { heading: 'Short Term (1-5 days)', text: 'Uses last 10 days of price data. Key signals: RSI, StochRSI, volume spikes, intraday momentum, news catalysts. Target = 1x ATR above entry. Stop = 1x ATR below entry. Bull/bear factors focus on momentum and news.', tip: 'Best for active traders who monitor positions daily. High risk — use small position sizes.' },
      { heading: 'Swing Trade (1-4 weeks)', text: 'Uses last 20 days of price data. Key signals: MACD cross, SMA20/50 alignment, Bollinger Band position, support/resistance. Target = nearest resistance or 2x ATR. Stop = nearest support or 1x ATR.', tip: 'Most balanced timeframe for most traders. The AI uses both technical and fundamental signals equally.' },
      { heading: 'Position Trade (1-3 months)', text: 'Uses last 30 days of price data. Key signals: SMA50/200 trend, MACD, fundamentals quality, macro tailwinds. Target = analyst price target or 2x ATR. Stop = below SMA50 or 2x ATR.', tip: 'Good for investors who review positions weekly. Fundamental quality matters more here than for shorter timeframes.' },
      { heading: 'Long Term (6-12 months)', text: 'Uses last 52 weeks of data. Key signals: SMA200, analyst consensus, P/E ratio, ROE, earnings growth, macro cycle. Target = analyst consensus price. Stop = below SMA200 or major support. Options P/C ratio is excluded — irrelevant at this horizon.', tip: 'For long term, the thesis focuses on business quality, competitive moat, and valuation rather than chart patterns.' },
    ],
  },
  {
    id: 'options', label: 'Options Plays', icon: '⚡', title: 'How to Use the Options Tab (US Only)',
    content: [
      { heading: 'Step 1 — Enter a Ticker', text: 'Options are available for US stocks only. Type any US stock symbol and click FIND OPTIONS PLAYS. The AI runs through 5 stages: price data, options chain, fundamentals, news, and combined AI analysis.', tip: 'You can jump straight here from the Scanner tab using the ⚡ OPTIONS button after a US scan.' },
      { heading: 'Step 2 — Read the AI Recommendation', text: 'The header shows LONG CALLS or LONG PUTS with a confidence %. This is the directional bias based on technicals, macro, news, and options flow. The reasoning explains the key signals driving the recommendation.', tip: 'Confidence 75%+ means strong signal. Below 60% means mixed — consider waiting for confirmation.' },
      { heading: 'Step 3 — Select an Expiry', text: 'Click any expiry date to re-run analysis for that expiry. Shorter expiries are riskier but cheaper. Longer expiries give the trade more time to work but cost more premium.', tip: 'Avoid 0DTE as a beginner — theta decay is extreme and losses happen very fast.' },
      { heading: 'Step 4 — Choose CALL or PUT', text: 'Click the CALL or PUT card to select your side. The Trade Checklist, P&L Simulator, and Trade Setup all update to reflect the selected contract.', tip: 'The AI recommends one side but always shows both — you can override and explore the other direction.' },
    ],
  },
  {
    id: 'contracts', label: 'Contract Cards', icon: '📋', title: 'How to Read the Contract Cards',
    content: [
      { heading: 'Strike Price', text: 'The large number (e.g. $670 CALL) is the strike price — the price the stock needs to reach for your option to have intrinsic value. For a CALL you want the stock to go ABOVE the strike. For a PUT you want it to go BELOW.', tip: 'ATM (at-the-money) strikes closest to the current price are the most balanced — not too cheap, not too expensive.' },
      { heading: 'BID / MID / ASK', text: 'BID is what buyers will pay. ASK is what sellers want. MID is the midpoint. Always try to fill at the MID price using a limit order — never use a market order for options.', tip: 'Always use a limit order at or near the mid price to avoid overpaying on the spread.' },
      { heading: 'Delta (Δ)', text: 'Delta shows how much the option price moves for every $1 move in the stock. A delta of 0.50 means if the stock goes up $1, your call goes up $0.50. Higher delta = more sensitive to price moves.', tip: 'Stick to deltas between 0.30 and 0.70 as a beginner — not too far out of the money.' },
      { heading: 'IV (Implied Volatility)', text: 'IV shows how expensive the option is. High IV = market expects a big move, options are pricier. Low IV = options are cheap. As a buyer you want LOW IV so you pay less premium.', tip: 'Check the IV ENVIRONMENT badge in the recommendation header. LOW IV is ideal for buying options.' },
    ],
  },
  {
    id: 'checklist', label: 'Trade Checklist', icon: '✅', title: 'How to Use the Trade Checklist',
    content: [
      { heading: 'What It Does', text: 'The Trade Checklist scores your setup out of 7 criteria before you enter. It gives a GO, CAUTION, or NO-GO verdict. Each check is pass/fail with an explanation of what it\'s measuring.', tip: 'Aim for at least 5/7 checks passing (GO verdict) before entering a trade.' },
      { heading: 'The 7 Checks Explained', text: '1. Trend aligned — SMA direction matches your trade. 2. RSI not in danger zone — not overbought for calls, not oversold for puts. 3. Price signal confirms — BUY for calls, SELL for puts. 4. Volume confirms — above average volume. 5. Macro supports — bullish macro for calls. 6. Earnings risk — no upcoming earnings. 7. IV environment — low IV for buying options.', tip: 'A NO-GO doesn\'t mean skip the trade — it means size down and tighten your stop loss.' },
      { heading: 'GO vs CAUTION vs NO-GO', text: 'GO (green, 70%+): Most signals aligned, reasonable to enter full size. CAUTION (yellow, 50-69%): Mixed signals, consider half size or wait. NO-GO (red, below 50%): Too many signals against you, skip or size very small.', tip: 'The checklist updates automatically when you switch between CALL and PUT cards.' },
    ],
  },
  {
    id: 'invest', label: 'India Invest', icon: '🇮🇳', title: 'India Invest Hub (Pro)',
    content: [
      { heading: 'ETF Scanner', text: 'Browse 28+ NSE-listed ETFs across 4 categories — Index (NIFTYBEES, JUNIORBEES), Sectoral (BANKBEES, ITBEES, PHARMABEES), Commodity (GOLDBEES, SILVERETF), and Debt (LIQUIDBEES). Live prices from NSE. Click any ETF to run a full AI scan with BUY/SELL/HOLD signal.', tip: 'NIFTYBEES and JUNIORBEES are the most liquid ETFs for beginners — they track Nifty 50 and Nifty Next 50 respectively with very low tracking error.' },
      { heading: 'SIP Planner', text: 'Two modes: SIP Calculator shows maturity value, total invested, wealth gain, and return % for any monthly amount × years × expected return combination. SIP vs Lump Sum compares both strategies side-by-side for the same total investment amount.', tip: 'Historical average of Nifty 50 is ~12% annual returns over long periods. Use 10-12% as a conservative estimate for index ETFs.' },
      { heading: 'AI Portfolio Recommender', text: 'Answer 4 questions about your investment horizon, risk tolerance, goal, and monthly budget. The AI generates a risk profile (Conservative/Moderate/Aggressive) and recommends a specific allocation across NSE ETFs and mutual funds with exact percentages and reasoning.', tip: 'For most investors under 40 with a 7+ year horizon, the AI will recommend 50-60% in Nifty index ETFs as the core holding.' },
      { heading: 'My SIPs Tracker', text: 'Add your active SIPs by name, amount, start date, and frequency. The tracker automatically calculates months elapsed, total amount invested, and shows a portfolio summary. Data is saved locally in your browser.', tip: 'Add all your SIPs including mutual funds by name (e.g. "Parag Parikh Flexi Cap") even if they are not NSE ETFs — the tracker works for any SIP.' },
      { heading: 'Mutual Fund Explorer', text: 'Live NAV data for 10 popular Indian mutual funds via MFAPI.in. Filter by category: Index, Large Cap, Flexi Cap, Mid Cap, Small Cap, Debt, Liquid. Shows current NAV, last updated date, and scheme code for reference.', tip: 'India Invest is a Pro-only feature available at ₹249/month. The SIP calculator and ETF list are specific to India mode only.' },
    ],
  },
  {
    id: 'watchlist', label: 'Watchlist', icon: '👁', title: 'How to Use the Watchlist',
    content: [
      { heading: 'Adding Stocks', text: 'Type any US ticker or NSE India ticker in the add box and press + ADD. For India mode, type NSE symbols like RELIANCE, TCS, INFY. For US mode, type US tickers like AAPL, NVDA. Free tier: 5 per market. Pro: unlimited.', tip: 'The watchlist is separate for US and India. Switch market using the header toggle to see the relevant list.' },
      { heading: 'Background AI Analysis', text: 'Each ticker in the watchlist gets automatically scanned with a long-term (6-12 month) AI analysis. This runs in the background with an 800ms stagger between tickers. The BUY/SELL/HOLD badge with confidence % updates once the scan completes.', tip: 'Click any watchlist item to expand it — you\'ll see the full AI thesis, bull/bear factors, technicals, and recent news.' },
      { heading: 'Price Updates', text: 'Prices refresh every 60 seconds. US prices come from Tradier (real-time during market hours). India prices come from NSE via the stock-nse-india data feed during NSE hours (9:15 AM – 3:30 PM IST).', tip: 'The ↻ REFRESH button manually refreshes prices and re-triggers background scans.' },
      { heading: 'Options Shortcut', text: 'The ⚡ button on each US watchlist item opens the Options tab pre-loaded with that ticker. Not available for Indian stocks as NSE options analysis is not yet supported.', tip: 'Use the watchlist as your daily monitoring dashboard — check it each morning to see which of your tracked stocks have changed signals.' },
    ],
  },
  {
    id: 'indicators', label: 'Indicators', icon: '📊', title: 'What RSI, MACD, ATR and SMAs Mean',
    content: [
      { heading: 'RSI — Relative Strength Index', text: 'RSI measures momentum on a scale of 0-100. Above 70 = overbought (avoid calls). Below 30 = oversold (avoid puts). Between 30-70 = neutral. QuAInt also uses StochRSI with thresholds of 90/10 for extreme signals.', tip: 'RSI is most useful as a WARNING signal — overbought doesn\'t mean sell immediately, it means be cautious buying calls.' },
      { heading: 'MACD — Moving Average Convergence Divergence', text: 'MACD shows trend momentum. A BULLISH CROSS (MACD line crossing above signal line) is a buy signal. A BEARISH CROSS is a sell signal. Used in swing and position timeframes.', tip: 'MACD crosses are most reliable when confirmed by volume and price above SMA50.' },
      { heading: 'SMA — Simple Moving Averages', text: 'SMA20 = short term trend (20-day average). SMA50 = medium term trend. SMA200 = long term trend. SMA20 above SMA50 = BULLISH. SMA20 below SMA50 = BEARISH. For long term, SMA50 vs SMA200 determines the golden/death cross.', tip: 'The most reliable signals happen when price, SMA20, SMA50, and MACD all agree on direction.' },
      { heading: 'ATR — Average True Range', text: 'ATR measures daily price volatility. Used to set precise stop losses and price targets. 1x ATR stop = tight, 2x ATR stop = wider. HIGH ATR = volatile stock, size down. LOW ATR = quiet stock, options may be cheap.', tip: 'ATR-based stops are much smarter than round numbers. They adapt to each stock\'s actual volatility.' },
    ],
  },
  {
    id: 'glossary', label: 'Glossary', icon: '📖', title: 'Options & India Terms Glossary',
    content: [
      { heading: 'Call Option', text: 'A contract that gives you the RIGHT to BUY 100 shares at the strike price before expiry. You profit when the stock goes UP. Maximum loss is the premium you paid. US stocks only on QuAInt Signal.', tip: 'Think of a call like a deposit — you lock in the right to buy at today\'s price even if it goes up.' },
      { heading: 'Put Option', text: 'A contract that gives you the RIGHT to SELL 100 shares at the strike price before expiry. You profit when the stock goes DOWN. Maximum loss is the premium you paid.', tip: 'Think of a put like insurance — it pays out if the stock falls below the strike price.' },
      { heading: 'FII / DII (India)', text: 'FII = Foreign Institutional Investors (foreign funds buying/selling Indian stocks). DII = Domestic Institutional Investors (Indian mutual funds, insurance companies). FII selling is bearish for Indian markets. FII buying is bullish.', tip: 'The AI factors FII/DII flow trends into Indian stock analysis — heavy FII outflows increase the bear case.' },
      { heading: 'RBI (India)', text: 'Reserve Bank of India — India\'s central bank. RBI rate decisions (like US Fed) directly impact Indian stocks. Rate cuts are bullish for markets. Rate hikes are bearish. The AI includes RBI policy in the macro context for Indian stock analysis.', tip: 'Monitor RBI monetary policy committee (MPC) meeting dates the same way US traders watch Fed meetings.' },
      { heading: 'Nifty 50', text: 'India\'s benchmark stock index — the top 50 companies by market cap on NSE. Similar to the S&P 500 in the US. QuAInt Signal tracks all 50 Nifty stocks for movers, quotes, and signals.', tip: 'NIFTY and SENSEX are both Indian indices — NIFTY tracks 50 stocks on NSE, SENSEX tracks 30 stocks on BSE.' },
      { heading: 'IV Crush', text: 'After a major event (earnings, Fed/RBI announcement), implied volatility drops sharply making options cheaper — but if you already own them, their value drops even if the stock moved your way.', tip: 'Never buy options the day before earnings unless you are intentionally trading the event.' },
    ],
  },
];

export default function HelpTab() {
  const [activeStep, setActiveStep] = useState(0);
  const step = STEPS[activeStep];

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, marginBottom: 4 }}>HELP & GUIDE</div>
        <div style={{ fontSize: 12, color: '#99aacc' }}>Learn how to use QuAInt Signal — US stocks, NSE India & options</div>
      </div>

      {/* ── Section tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'none' }}>
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => setActiveStep(i)} className="btn-sm"
            style={{
              color:       activeStep === i ? '#ffaa00' : '#99aacc',
              borderColor: activeStep === i ? '#ffaa00' : '#2a2a3e',
              background:  activeStep === i ? '#ffaa0011' : '#1a1a2e',
              whiteSpace: 'nowrap', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', fontSize: 12,
            }}>
            <span>{s.icon}</span><span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── Progress bar ── */}
      <div style={{ marginBottom: 20 }}>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${((activeStep + 1) / STEPS.length) * 100}%`, background: '#ffaa00', transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 10, color: '#8899bb', marginTop: 4 }}>
          {activeStep + 1} of {STEPS.length} — {step.label}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card fade-in" style={{ borderColor: '#ffaa0033', padding: '20px 24px' }}>
          <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 8 }}>
            {step.icon} SECTION {activeStep + 1} OF {STEPS.length}
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(22px, 4vw, 32px)', marginBottom: 20, color: '#ffaa00' }}>
            {step.title}
          </div>

          {step.content.map((c, i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#c8c8d0',
                marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e1e2e',
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#ffaa00', fontSize: 11, fontWeight: 400,
                  background: '#ffaa0011', border: '1px solid #ffaa0033',
                  padding: '1px 8px', borderRadius: 2 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {c.heading}
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 10 }}>{c.text}</div>
              <div style={{ display: 'flex', gap: 10, background: '#070710',
                border: '1px solid #ffaa0022', borderLeft: '3px solid #ffaa00',
                padding: '10px 14px', borderRadius: 2 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
                <div style={{ fontSize: 12, color: '#ffaa0099', lineHeight: 1.6 }}>{c.tip}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Prev / Next ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button className="btn" disabled={activeStep === 0}
            onClick={() => setActiveStep(a => a - 1)}
            style={{ opacity: activeStep === 0 ? 0.3 : 1 }}>← PREV</button>
          <div style={{ fontSize: 11, color: '#7788aa', textAlign: 'center' }}>{step.label}</div>
          <button className="btn" disabled={activeStep === STEPS.length - 1}
            onClick={() => setActiveStep(a => a + 1)}
            style={{ opacity: activeStep === STEPS.length - 1 ? 0.3 : 1 }}>NEXT →</button>
        </div>

        {activeStep === STEPS.length - 1 && (
          <div className="card" style={{ textAlign: 'center', padding: 24, borderColor: '#00ff8833' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>🎉</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#00ff88', marginBottom: 8 }}>
              YOU'RE READY TO TRADE
            </div>
            <div style={{ fontSize: 12, color: '#aabbcc' }}>
              You've completed the guide. Head to the SCANNER tab and choose your market — 🇺🇸 US or 🇮🇳 India.
            </div>
            <div style={{ fontSize: 10, color: '#7788aa', marginTop: 8 }}>
              ⚠ Remember: this is not financial advice. Always trade with money you can afford to lose.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}