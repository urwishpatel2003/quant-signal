import { useState } from 'react';

const STEPS = [
  {
    id: 'options', label: '1. Options Tab', icon: '🎯', title: 'How to Use the Options Tab',
    content: [
      { heading: 'Step 1 – Enter a Ticker', text: 'Type any stock symbol (e.g. AAPL, TSLA, SPY) in the top left input and press Enter or click FIND OPTIONS PLAYS. The AI will scan the stock across 6 stages: price, technicals, options chain, fundamentals, news, and global macro.', tip: 'Start with liquid, high-volume tickers like SPY, QQQ, AAPL, NVDA for the most accurate options data.' },
      { heading: 'Step 2 – Read the AI Recommendation', text: "The large header will say LONG CALLS or LONG PUTS with a confidence percentage. This is the AI's directional bias based on technicals, macro, news, and options flow combined. The reasoning paragraph explains why.", tip: 'Higher confidence (75%+) means more signals are aligned. Below 60% means mixed signals — be cautious.' },
      { heading: 'Step 3 – Select an Expiry', text: 'The expiry buttons at the top show available option expiration dates. Click any date to re-run the AI analysis for that expiry. Shorter expiries (0-7 days) are riskier but cheaper. Longer expiries give the trade more time to work.', tip: 'Avoid 0DTE (same day expiry) as a beginner — theta decay is extreme and losses happen fast.' },
      { heading: 'Step 4 – Choose CALL or PUT', text: "Click the CALL card or PUT card to select your side. The Trade Setup, Risk/Reward, P&L Simulator and Checklist will all update to reflect whichever contract you selected.", tip: 'The AI recommends one side but always shows both — you can override and explore the other side.' },
    ],
  },
  {
    id: 'contracts', label: '2. Contract Cards', icon: '📋', title: 'How to Read the Contract Cards',
    content: [
      { heading: 'Strike Price', text: 'The large number at the top (e.g. $670 CALL) is the strike price — the price the stock needs to reach for your option to have intrinsic value. For a CALL you want the stock to go ABOVE the strike. For a PUT you want it to go BELOW.', tip: 'ATM (at-the-money) strikes closest to the current price are the most balanced — not too cheap, not too expensive.' },
      { heading: 'BID / MID / ASK', text: 'BID is what buyers will pay. ASK is what sellers want. MID is the midpoint. Always try to fill at the MID price — put in a limit order at the mid, not a market order.', tip: 'Never use a market order for options. Always use a limit order at or near the mid price to avoid overpaying.' },
      { heading: 'Delta (Δ)', text: 'Delta shows how much the option price moves for every $1 move in the stock. A delta of 0.50 means if the stock goes up $1, your call goes up $0.50. Higher delta = more sensitive to price moves.', tip: 'Beginners should stick to deltas between 0.30 and 0.70 — not too far out of the money.' },
      { heading: 'IV (Implied Volatility)', text: 'IV shows how expensive the option is. High IV means the market expects a big move — options are pricier. Low IV means options are cheap. As a buyer you want LOW IV so you pay less premium.', tip: 'Check the IV ENVIRONMENT badge in the recommendation header. LOW IV is ideal for buying options.' },
      { heading: 'Entry & Exit Rules', text: "The ENTRY row tells you the exact stock price condition to enter the trade. The EXIT RULE shows the exact premium price to sell at for profit, and the exact stop loss price to cut losses.", tip: "Set price alerts on your broker app at the entry price so you don't miss the trigger." },
    ],
  },
  {
    id: 'simulator', label: '3. P&L Simulator', icon: '🎮', title: 'How to Use the P&L Simulator',
    content: [
      { heading: 'What It Does', text: 'The P&L Simulator lets you drag a slider to any stock price and see your estimated profit or loss before you place the trade. It automatically loads the active contract (CALL or PUT) you selected.', tip: 'Always simulate your trade BEFORE entering. Know your numbers before you risk real money.' },
      { heading: 'How to Use It', text: 'Drag the slider left (stock falls) or right (stock rises). The display shows: the simulated stock price, estimated contract value, your total P&L in dollars, and the percentage gain or loss on your investment.', tip: 'The slider range is ±10% of the current stock price in $0.50 steps — realistic intraday and swing move scenarios.' },
      { heading: 'Break-Even Price', text: 'The BREAK-EVEN box shows the exact stock price at which your option starts making money. For a CALL: strike + premium paid. For a PUT: strike - premium paid.', tip: 'If the stock is already past break-even when you enter, you have a buffer. If not, the stock needs to move before you profit.' },
      { heading: 'Reading the Numbers', text: 'Green numbers = profit. Red numbers = loss. The % shown is your return on the total premium invested. A 100% gain means your option doubled. A -50% means you hit the stop loss level.', tip: 'Aim to exit at 50-100% gain. Never let a winner turn into a full loss — set a mental stop at -40% to -50%.' },
    ],
  },
  {
    id: 'checklist', label: '4. Trade Checklist', icon: '✅', title: 'How to Use the Trade Checklist',
    content: [
      { heading: 'What It Does', text: 'The Trade Checklist scores your trade setup out of 7 criteria before you enter. It gives a GO, CAUTION, or NO-GO verdict with a score percentage. Each check is pass/fail with an explanation.', tip: 'Aim for at least 5/7 checks passing (GO verdict) before entering a trade.' },
      { heading: 'The 7 Checks Explained', text: '1. Trend aligned — SMA20 vs SMA50 direction matches your trade. 2. RSI not in danger zone — not overbought for calls, not oversold for puts. 3. Price signal confirms — BUY signal for calls, SELL for puts. 4. Volume confirms — above average volume supports the move. 5. Macro supports — bearish macro for puts, bullish for calls. 6. Earnings risk — no upcoming earnings that could crush IV. 7. IV environment — low IV for calls, high IV for puts.', tip: "A NO-GO doesn't mean don't trade — it means be smaller and tighter with your stop loss." },
      { heading: 'GO vs CAUTION vs NO-GO', text: 'GO (green, 70%+): Most signals aligned, reasonable to enter full size. CAUTION (yellow, 50-69%): Mixed signals, consider half size or wait for confirmation. NO-GO (red, below 50%): Too many signals against you, skip this trade.', tip: 'The checklist updates automatically when you switch between CALL and PUT cards.' },
    ],
  },
  {
    id: 'journal', label: '5. Trade Journal', icon: '📓', title: 'How to Log Trades in the Journal',
    content: [
      { heading: 'Why Log Trades?', text: 'The journal tracks every trade you take and calculates your win rate, total P&L, average win and average loss. Over time this shows you your real performance — not just the wins you remember.', tip: 'Most traders overestimate their win rate by 20-30% because they forget their losses. The journal keeps you honest.' },
      { heading: 'Logging a Trade', text: 'Click "+ LOG TRADE", fill in the ticker, strike, expiry, entry price, number of contracts, and your reason for taking the trade. You can leave exit blank if the trade is still open.', tip: 'Always fill in the NOTES field — write WHY you took the trade. This is the most valuable field for learning.' },
      { heading: 'Closing a Trade', text: 'When you exit a trade, find it in the history and type your exit price in the exit field. The journal will auto-calculate your P&L, % gain/loss, and mark it as WIN or LOSS.', tip: "Update your exit price the same day you close — don't let open trades pile up without exits." },
      { heading: 'Reading Your Stats', text: 'The stats bar at the top shows: total trades, closed trades, win rate %, total P&L, average win size, and average loss size. A healthy edge means your average win is larger than your average loss even if win rate is below 50%.', tip: 'A 40% win rate with 2:1 reward/risk is profitable. A 60% win rate with 1:2 reward/risk loses money.' },
    ],
  },
  {
    id: 'indicators', label: '6. RSI / SMA / Volume', icon: '📊', title: 'What RSI, SMA, and Volume Mean',
    content: [
      { heading: 'RSI – Relative Strength Index', text: "RSI measures momentum on a scale of 0-100. Above 70 = overbought (stock may pull back, avoid calls). Below 30 = oversold (stock may bounce, avoid puts). Between 30-70 = neutral, momentum is healthy.", tip: "RSI is most useful as a WARNING signal. Overbought doesn't mean sell immediately — it means be cautious buying calls at these levels." },
      { heading: 'SMA 20 – 20 Day Moving Average', text: 'The average closing price over the last 20 trading days. Price above SMA20 = short term bullish. Price below SMA20 = short term bearish. When price crosses SMA20 it often signals a short term trend change.', tip: 'SMA20 acts as dynamic support/resistance. Price bouncing off SMA20 is often a good entry for calls.' },
      { heading: 'SMA 50 – 50 Day Moving Average', text: 'The average over 50 days — a medium term trend indicator. SMA20 above SMA50 = BULLISH trend. SMA20 below SMA50 = BEARISH trend. This is the TREND signal shown in the sidebar.', tip: 'The most reliable options plays happen when price, SMA20, and SMA50 all agree on direction.' },
      { heading: 'Volume', text: 'Volume shows how many shares traded today vs the 20-day average. The ratio (e.g. 1.5x) means 50% more volume than normal. HIGH volume confirms a price move is real. LOW volume means the move may reverse.', tip: 'Always check volume when entering. A breakout on 0.5x volume is a trap. A breakout on 2x+ volume is the real move.' },
    ],
  },
  {
    id: 'glossary', label: '7. Options Glossary', icon: '📖', title: 'Options Terms Glossary',
    content: [
      { heading: 'Call Option', text: "A contract that gives you the RIGHT to BUY 100 shares at the strike price before expiry. You profit when the stock goes UP. Maximum loss is the premium you paid.", tip: "Think of a call like a deposit on a house — you lock in the right to buy at today's price even if it goes up." },
      { heading: 'Put Option', text: "A contract that gives you the RIGHT to SELL 100 shares at the strike price before expiry. You profit when the stock goes DOWN. Maximum loss is the premium you paid.", tip: "Think of a put like insurance on a stock — it pays out if the stock falls below the strike price." },
      { heading: 'Premium', text: 'The price you pay per share to buy an option. Since each contract covers 100 shares, a $2.00 premium costs $200 per contract. This is your maximum possible loss.', tip: 'Never risk more than 1-2% of your total account on a single options trade.' },
      { heading: 'Theta (Time Decay)', text: "Options lose value every day just from time passing — this is called theta decay. The closer to expiry, the faster the decay. A $2.00 option expiring in 2 days loses value much faster than one expiring in 30 days.", tip: "This is why 0DTE options are so dangerous for beginners — you're racing against the clock every minute." },
      { heading: 'IV Crush', text: 'After a major event (earnings, Fed announcement), implied volatility drops sharply. This makes options cheaper — but if you already own them, their value drops even if the stock moved your way.', tip: 'Never buy options the day before earnings unless you are intentionally trading the event.' },
      { heading: 'ATM / ITM / OTM', text: 'ATM (at-the-money) = strike near current price. ITM (in-the-money) = call strike below price or put strike above price — has intrinsic value. OTM (out-of-the-money) = call strike above price or put strike below — needs a big move to profit.', tip: 'Beginners should stick to ATM or slightly ITM options — they move more reliably with the stock.' },
      { heading: 'Open Interest (OI)', text: 'The number of outstanding contracts at a strike price. High OI means the strike is heavily traded and liquid — easier to buy and sell at fair prices. Low OI means wide spreads and difficulty exiting.', tip: 'Only trade strikes with OI above 100. The AI already filters for this automatically.' },
    ],
  },
];

export default function HelpTab() {
  const [activeStep, setActiveStep] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const step = STEPS[activeStep];

  const goTo = (i) => { setActiveStep(i); setMenuOpen(false); };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, marginBottom: 4 }}>HELP & GUIDE</div>
        <div style={{ fontSize: 12, color: '#556' }}>Learn how to use QuAInt Signal step by step</div>
      </div>

      {/* ── Mobile section picker ── */}
      <div className="show-mobile" style={{ marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => setMenuOpen(o => !o)}
          style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>
          <span>{step.icon} {step.label}</span>
          <span>{menuOpen ? '▲' : '▼'}</span>
        </button>
        {menuOpen && (
          <div style={{ background: '#0f0f18', border: '1px solid #1e1e2e', borderRadius: 4, marginTop: 4 }}>
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => goTo(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', background: activeStep === i ? '#ffaa0011' : 'transparent',
                  border: 'none', borderBottom: '1px solid #1a1a26',
                  color: activeStep === i ? '#ffaa00' : '#556', cursor: 'pointer', textAlign: 'left' }}>
                <span>{s.icon}</span>
                <span style={{ fontSize: 11 }}>{s.label}</span>
              </button>
            ))}
          </div>
        )}
        {/* Mobile progress */}
        <div style={{ marginTop: 8 }}>
          <div className="bar-bg">
            <div className="bar-fill" style={{ width: `${((activeStep + 1) / STEPS.length) * 100}%`, background: '#ffaa00' }} />
          </div>
          <div style={{ fontSize: 10, color: '#556', marginTop: 4 }}>{activeStep + 1} of {STEPS.length} sections</div>
        </div>
      </div>

      <div className="help-layout">

        {/* ── Desktop sidebar ── */}
        <div className="hide-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setActiveStep(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', background: activeStep === i ? '#ffaa0011' : '#0f0f18',
                border: `1px solid ${activeStep === i ? '#ffaa00' : '#1e1e2e'}`,
                borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                color: activeStep === i ? '#ffaa00' : '#556', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span style={{ fontSize: 11, fontWeight: activeStep === i ? 600 : 400 }}>{s.label}</span>
            </button>
          ))}

          <div style={{ marginTop: 12, padding: '10px 14px', background: '#0f0f18', border: '1px solid #1e1e2e', borderRadius: 4 }}>
            <div style={{ fontSize: 9, color: '#445', marginBottom: 6 }}>YOUR PROGRESS</div>
            <div className="bar-bg">
              <div className="bar-fill" style={{ width: `${((activeStep + 1) / STEPS.length) * 100}%`, background: '#ffaa00' }} />
            </div>
            <div style={{ fontSize: 10, color: '#556', marginTop: 4 }}>{activeStep + 1} of {STEPS.length} sections</div>
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ borderColor: '#ffaa0033', padding: '20px 24px' }}>
            <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 8 }}>
              {step.icon} SECTION {activeStep + 1} OF {STEPS.length}
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(22px, 4vw, 32px)', marginBottom: 16, color: '#ffaa00' }}>
              {step.title}
            </div>

            {step.content.map((c, i) => (
              <div key={i} style={{ marginBottom: 20 }}>
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
                <div style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.8, marginBottom: 10 }}>{c.text}</div>
                <div style={{ display: 'flex', gap: 10, background: '#070710',
                  border: '1px solid #ffaa0022', borderLeft: '3px solid #ffaa00',
                  padding: '8px 12px', borderRadius: 2 }}>
                  <span style={{ fontSize: 14 }}>💡</span>
                  <div style={{ fontSize: 11, color: '#ffaa0099', lineHeight: 1.6 }}>{c.tip}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Prev / Next */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <button className="btn" disabled={activeStep === 0}
              onClick={() => setActiveStep(a => a - 1)}
              style={{ opacity: activeStep === 0 ? 0.3 : 1 }}>
              ← PREV
            </button>
            <div style={{ fontSize: 11, color: '#334', textAlign: 'center' }}>{step.label}</div>
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
              <div style={{ fontSize: 12, color: '#667' }}>
                You've completed the guide. Head to the OPTIONS tab to find your first trade.
              </div>
              <div style={{ fontSize: 10, color: '#334', marginTop: 8 }}>
                ⚠ Remember: this is not financial advice. Always trade with money you can afford to lose.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}