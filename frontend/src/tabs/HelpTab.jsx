import { useState } from 'react';

const STEPS = [
  {
    id: 'scanner', label: 'Scanner', icon: '📡', title: 'How to Use the Stock Scanner',
    content: [
      { heading: 'Step 1 — Search a Ticker', text: 'Type any stock symbol or company name in the search bar (e.g. "Apple" or "AAPL"). A dropdown will show matching tickers with company names. Click one or press Enter to select.', tip: 'Start with liquid, high-volume tickers like SPY, QQQ, AAPL, NVDA for the most accurate signals.' },
      { heading: 'Step 2 — Choose a Timeframe', text: 'Select from 4 timeframes: Short Term (1-5 days), Swing Trade (1-4 weeks), Position Trade (1-3 months), or Long Term (6-12 months). Each timeframe uses different technical indicators weighted differently.', tip: 'Swing Trade is the most balanced timeframe for most traders — it uses both SMA20/50 and macro context equally.' },
      { heading: 'Step 3 — Run the Scan', text: 'Click RUN SCAN. The AI will analyze price action, RSI, moving averages, volume, fundamentals, news flow, and global macro to generate a BUY, SELL, or HOLD signal with a confidence percentage.', tip: 'Higher confidence (75%+) means more signals are aligned. Below 60% means mixed signals — be cautious.' },
      { heading: 'Step 4 — Read the Results', text: 'The scan returns a signal card with entry price, target, stop loss, thesis, bull/bear factors, macro impact, and global market trend. The technical panel shows RSI, SMA20, SMA50, SMA200, and volume analysis.', tip: 'Use the ⚡ OPTIONS button after a scan to immediately run options analysis on the same ticker.' },
    ],
  },
  {
    id: 'options', label: 'Options Plays', icon: '⚡', title: 'How to Use the Options Tab',
    content: [
      { heading: 'Step 1 — Enter a Ticker', text: 'Type any stock symbol and click FIND OPTIONS PLAYS. The AI runs through 5 stages: price data, options chain, fundamentals, news, and a combined AI analysis — all in one optimized call.', tip: 'You can jump straight here from the Scanner tab using the ⚡ OPTIONS button after a scan.' },
      { heading: 'Step 2 — Read the AI Recommendation', text: "The large header shows LONG CALLS or LONG PUTS with a confidence percentage. This is the AI's directional bias based on technicals, macro, news, and options flow combined. The reasoning paragraph explains why.", tip: 'Higher confidence (75%+) means more signals are aligned. Below 60% means mixed signals — be cautious.' },
      { heading: 'Step 3 — Select an Expiry', text: 'The expiry buttons show available option expiration dates. Click any date to re-run the AI analysis for that expiry. Shorter expiries (0-7 days) are riskier but cheaper. Longer expiries give the trade more time to work.', tip: 'Avoid 0DTE (same day expiry) as a beginner — theta decay is extreme and losses happen fast.' },
      { heading: 'Step 4 — Choose CALL or PUT', text: 'Click the CALL card or PUT card to select your side. The Trade Checklist, P&L Simulator, and Trade Setup will all update to reflect whichever contract you selected.', tip: 'The AI recommends one side but always shows both — you can override and explore the other side.' },
    ],
  },
  {
    id: 'contracts', label: 'Contract Cards', icon: '📋', title: 'How to Read the Contract Cards',
    content: [
      { heading: 'Strike Price', text: 'The large number (e.g. $670 CALL) is the strike price — the price the stock needs to reach for your option to have intrinsic value. For a CALL you want the stock to go ABOVE the strike. For a PUT you want it to go BELOW.', tip: 'ATM (at-the-money) strikes closest to the current price are the most balanced — not too cheap, not too expensive.' },
      { heading: 'BID / MID / ASK', text: 'BID is what buyers will pay. ASK is what sellers want. MID is the midpoint. Always try to fill at the MID price — put in a limit order at the mid, not a market order.', tip: 'Never use a market order for options. Always use a limit order at or near the mid price to avoid overpaying.' },
      { heading: 'Delta (Δ)', text: 'Delta shows how much the option price moves for every $1 move in the stock. A delta of 0.50 means if the stock goes up $1, your call goes up $0.50. Higher delta = more sensitive to price moves.', tip: 'Beginners should stick to deltas between 0.30 and 0.70 — not too far out of the money.' },
      { heading: 'IV (Implied Volatility)', text: 'IV shows how expensive the option is. High IV means the market expects a big move — options are pricier. Low IV means options are cheap. As a buyer you want LOW IV so you pay less premium.', tip: 'Check the IV ENVIRONMENT badge in the recommendation header. LOW IV is ideal for buying options.' },
      { heading: 'Entry & Exit Rules', text: 'The ENTRY row tells you the exact stock price condition to enter the trade. The EXIT RULE shows the exact premium price to sell at for profit, and the exact stop loss price to cut losses.', tip: 'Set price alerts on your broker app at the entry price so you don\'t miss the trigger.' },
    ],
  },
  {
    id: 'checklist', label: 'Trade Checklist', icon: '✅', title: 'How to Use the Trade Checklist',
    content: [
      { heading: 'What It Does', text: 'The Trade Checklist scores your trade setup out of 7 criteria before you enter. It gives a GO, CAUTION, or NO-GO verdict with a score percentage. Each check is pass/fail with an explanation.', tip: 'Aim for at least 5/7 checks passing (GO verdict) before entering a trade.' },
      { heading: 'The 7 Checks Explained', text: '1. Trend aligned — SMA20 vs SMA50 direction matches your trade. 2. RSI not in danger zone — not overbought for calls, not oversold for puts. 3. Price signal confirms — BUY signal for calls, SELL for puts. 4. Volume confirms — above average volume supports the move. 5. Macro supports — bullish macro for calls, bearish for puts. 6. Earnings risk — no upcoming earnings that could crush IV. 7. IV environment — low IV for calls, high IV for puts.', tip: 'A NO-GO doesn\'t mean don\'t trade — it means be smaller and tighter with your stop loss.' },
      { heading: 'GO vs CAUTION vs NO-GO', text: 'GO (green, 70%+): Most signals aligned, reasonable to enter full size. CAUTION (yellow, 50-69%): Mixed signals, consider half size or wait for confirmation. NO-GO (red, below 50%): Too many signals against you, skip this trade.', tip: 'The checklist updates automatically when you switch between CALL and PUT cards.' },
    ],
  },
  {
    id: 'simulator', label: 'P&L Simulator', icon: '🎮', title: 'How to Use the P&L Simulator',
    content: [
      { heading: 'What It Does', text: 'The P&L Simulator lets you drag a slider to any stock price and see your estimated profit or loss before you place the trade. It automatically loads the active contract (CALL or PUT) you selected.', tip: 'Always simulate your trade BEFORE entering. Know your numbers before you risk real money.' },
      { heading: 'How to Use It', text: 'Drag the slider left (stock falls) or right (stock rises). The display shows: the simulated stock price, estimated contract value, your total P&L in dollars, and the percentage gain or loss on your investment.', tip: 'The slider range is ±10% of the current stock price — realistic intraday and swing move scenarios.' },
      { heading: 'Break-Even Price', text: 'The BREAK-EVEN box shows the exact stock price at which your option starts making money. For a CALL: strike + premium paid. For a PUT: strike - premium paid.', tip: 'If the stock is already past break-even when you enter, you have a buffer. If not, the stock needs to move before you profit.' },
      { heading: 'Reading the Numbers', text: 'Green numbers = profit. Red numbers = loss. The % shown is your return on the total premium invested. A 100% gain means your option doubled. A -50% means you hit the stop loss level.', tip: 'Aim to exit at 50-100% gain. Never let a winner turn into a full loss — set a mental stop at -40% to -50%.' },
    ],
  },
  {
    id: 'markets', label: 'Markets Tab', icon: '🌍', title: 'How to Use the Markets Tab',
    content: [
      { heading: 'What It Shows', text: 'The Markets tab gives you a live global macro dashboard — Asia/Europe market performance, US bond yields, yield curve status, VIX fear index, DXY dollar strength, gold, and oil prices.', tip: 'Check the Markets tab every morning before scanning — macro context dramatically improves signal quality.' },
      { heading: 'Bond Yields & Yield Curve', text: 'The 10Y-2Y yield curve spread tells you the macro regime. Normal (10Y > 2Y) = healthy economy. Inverted (2Y > 10Y) = recession risk. The curve status directly affects how the AI weights macro in its analysis.', tip: 'An inverted yield curve historically precedes recessions by 12-18 months. It doesn\'t mean sell everything — it means be cautious on long-term trades.' },
      { heading: 'VIX — Fear Index', text: 'VIX below 20 = calm market, good for buying options. VIX 20-30 = elevated fear, options are getting expensive. VIX above 30 = high fear, options are very expensive — selling premium becomes more attractive.', tip: 'The best time to buy calls is when VIX is low and trending down. The best time to buy puts is when VIX is low but the market is topping.' },
      { heading: 'Global Markets Impact', text: 'Asia markets (Nikkei, Hang Seng) close before US markets open. A big selloff in Asia often leads to a lower US open. Europe markets (DAX, FTSE, CAC) overlap with the US morning session and can confirm or contradict overnight moves.', tip: 'If Asia is down 2%+ and Europe follows, expect a risk-off US open — consider defensive setups or puts.' },
    ],
  },
  {
    id: 'indicators', label: 'RSI / SMA / Volume', icon: '📊', title: 'What RSI, SMA, and Volume Mean',
    content: [
      { heading: 'RSI — Relative Strength Index', text: 'RSI measures momentum on a scale of 0-100. Above 70 = overbought (stock may pull back, avoid calls). Below 30 = oversold (stock may bounce, avoid puts). Between 30-70 = neutral, momentum is healthy.', tip: 'RSI is most useful as a WARNING signal. Overbought doesn\'t mean sell immediately — it means be cautious buying calls at these levels.' },
      { heading: 'SMA 20 — 20 Day Moving Average', text: 'The average closing price over the last 20 trading days. Price above SMA20 = short term bullish. Price below SMA20 = short term bearish. When price crosses SMA20 it often signals a short term trend change.', tip: 'SMA20 acts as dynamic support/resistance. Price bouncing off SMA20 is often a good entry for calls.' },
      { heading: 'SMA 50 — 50 Day Moving Average', text: 'The average over 50 days — a medium term trend indicator. SMA20 above SMA50 = BULLISH trend. SMA20 below SMA50 = BEARISH trend. This is the TREND signal shown in the app.', tip: 'The most reliable options plays happen when price, SMA20, and SMA50 all agree on direction.' },
      { heading: 'Volume', text: 'Volume shows how many shares traded today vs the 20-day average. The ratio (e.g. 1.5x) means 50% more volume than normal. HIGH volume confirms a price move is real. LOW volume means the move may reverse.', tip: 'Always check volume when entering. A breakout on 0.5x volume is a trap. A breakout on 2x+ volume is the real move.' },
    ],
  },
  {
    id: 'glossary', label: 'Options Glossary', icon: '📖', title: 'Options Terms Glossary',
    content: [
      { heading: 'Call Option', text: 'A contract that gives you the RIGHT to BUY 100 shares at the strike price before expiry. You profit when the stock goes UP. Maximum loss is the premium you paid.', tip: 'Think of a call like a deposit on a house — you lock in the right to buy at today\'s price even if it goes up.' },
      { heading: 'Put Option', text: 'A contract that gives you the RIGHT to SELL 100 shares at the strike price before expiry. You profit when the stock goes DOWN. Maximum loss is the premium you paid.', tip: 'Think of a put like insurance on a stock — it pays out if the stock falls below the strike price.' },
      { heading: 'Premium', text: 'The price you pay per share to buy an option. Since each contract covers 100 shares, a $2.00 premium costs $200 per contract. This is your maximum possible loss.', tip: 'Never risk more than 1-2% of your total account on a single options trade.' },
      { heading: 'Theta (Time Decay)', text: 'Options lose value every day just from time passing — this is called theta decay. The closer to expiry, the faster the decay. A $2.00 option expiring in 2 days loses value much faster than one expiring in 30 days.', tip: 'This is why 0DTE options are so dangerous for beginners — you\'re racing against the clock every minute.' },
      { heading: 'IV Crush', text: 'After a major event (earnings, Fed announcement), implied volatility drops sharply. This makes options cheaper — but if you already own them, their value drops even if the stock moved your way.', tip: 'Never buy options the day before earnings unless you are intentionally trading the event.' },
      { heading: 'ATM / ITM / OTM', text: 'ATM (at-the-money) = strike near current price. ITM (in-the-money) = call strike below price or put strike above price — has intrinsic value. OTM (out-of-the-money) = call strike above price or put strike below — needs a big move to profit.', tip: 'Beginners should stick to ATM or slightly ITM options — they move more reliably with the stock.' },
      { heading: 'Open Interest (OI)', text: 'The number of outstanding contracts at a strike price. High OI means the strike is heavily traded and liquid — easier to buy and sell at fair prices. Low OI means wide spreads and difficulty exiting.', tip: 'Only trade strikes with OI above 100. The AI already filters for this automatically.' },
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
        <div style={{ fontSize: 12, color: '#99aacc' }}>Learn how to use QuAInt Signal step by step</div>
      </div>

      {/* ── Section tabs — horizontal scrollable ── */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 20,
        overflowX: 'auto', paddingBottom: 6,
        scrollbarWidth: 'none',
      }}>
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => setActiveStep(i)}
            className="btn-sm"
            style={{
              color:       activeStep === i ? '#ffaa00' : '#99aacc',
              borderColor: activeStep === i ? '#ffaa00' : '#2a2a3e',
              background:  activeStep === i ? '#ffaa0011' : '#1a1a2e',
              whiteSpace: 'nowrap', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', fontSize: 12,
            }}>
            <span>{s.icon}</span>
            <span>{s.label}</span>
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
            style={{ opacity: activeStep === 0 ? 0.3 : 1 }}>
            ← PREV
          </button>
          <div style={{ fontSize: 11, color: '#7788aa', textAlign: 'center' }}>{step.label}</div>
          <button className="btn" disabled={activeStep === STEPS.length - 1}
            onClick={() => setActiveStep(a => a + 1)}
            style={{ opacity: activeStep === STEPS.length - 1 ? 0.3 : 1 }}>
            NEXT →
          </button>
        </div>

        {activeStep === STEPS.length - 1 && (
          <div className="card" style={{ textAlign: 'center', padding: 24, borderColor: '#00ff8833' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>🎉</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#00ff88', marginBottom: 8 }}>
              YOU'RE READY TO TRADE
            </div>
            <div style={{ fontSize: 12, color: '#aabbcc' }}>
              You've completed the guide. Head to the SCANNER or OPTIONS tab to find your first trade.
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