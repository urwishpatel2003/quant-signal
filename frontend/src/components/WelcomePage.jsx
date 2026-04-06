import { useEffect, useState } from 'react';

const FEATURES_US = [
  {
    icon: '📡', color: '#ffaa00', title: 'AI Stock Scanner',
    desc: 'BUY/SELL/HOLD signals for any US stock. 9-factor deterministic engine scores momentum, trend, RSI, MACD, volume, revenue growth, earnings quality, analyst consensus, and macro — then Claude writes the thesis.',
    points: ['Deterministic signal engine — not AI guessing', 'Short Term to Long Term with different factor weights', 'Confidence calibrated from actual factor scores'],
  },
  {
    icon: '⚡', color: '#00ff88', title: 'Options Analysis',
    desc: 'Exact strike, expiry, entry, target and stop for CALL and PUT options. Real-time chain data with Black-Scholes pricing, Greeks, and IV surface.',
    points: ['Exact contract recommendations', 'P&L simulator before you trade', 'Put/call ratio & sentiment overlay'],
  },
  {
    icon: '🏦', color: '#4488ff', title: 'Institutional Intelligence',
    desc: 'Short interest %, days to cover, insider net buying/selling (90-day), institutional ownership direction — all factored into the signal score.',
    points: ['Short squeeze detection (>20% float)', 'Insider cluster buy/sell signals', 'Top 5 institutional holders with direction'],
  },
  {
    icon: '📊', color: '#aa44ff', title: 'Earnings Quality',
    desc: 'FCF vs reported earnings, accruals ratio, ROIC, 5-year revenue & EPS growth — the factors that actually predict long-term returns.',
    points: ['EPS beat/miss streak tracking', 'FCF margin & accruals ratio', '5Y revenue + EPS growth trend'],
  },
  {
    icon: '🌐', color: '#ff8844', title: 'Market Regime Detection',
    desc: '5-signal regime engine: SPY 200d trend, VIX level & direction, 10/30/90d momentum, QQQ vs IWM breadth, sector rotation — all updating signal confidence dynamically.',
    points: ['STRONG_BULL → STRONG_BEAR scale', 'RSI logic flips in bear markets', 'BUY confidence capped in downtrends'],
  },
  {
    icon: '📈', color: '#ff4488', title: 'Signal Accuracy Tracker',
    desc: 'Every scan is saved with entry price and timeframe. Outcomes checked automatically when the timeframe elapses — WIN/LOSS/SCRATCH tracked against real price movement.',
    points: ['Automatic outcome tracking', 'Win rate by signal type (BUY/SELL/HOLD)', 'High-confidence accuracy tracked separately'],
  },
];

const FEATURES_INDIA = [
  {
    icon: '🇮🇳', color: '#ff9a00', title: 'NSE India Scanner',
    desc: 'Full Nifty 500 coverage with INR pricing. FII/DII net buying, promoter holding changes, delivery % vs total volume — all factored into the signal score.',
    points: ['Promoter holding & QoQ change', 'Delivery % conviction signal', 'FII/DII daily net buying in ₹Cr'],
  },
  {
    icon: '📊', color: '#ffcc00', title: 'India Markets Dashboard',
    desc: 'Live Nifty 50, Bank Nifty, IT, Pharma, Auto, FMCG indices. USD/INR, gold in ₹/gram, Brent crude, India 10Y bond yield — all in one view.',
    points: ['10 sector indices with % change', 'Gold ₹/gram + Brent crude', 'USD/INR with intraday change'],
  },
  {
    icon: '🔄', color: '#00ccff', title: 'SIP Planner',
    desc: 'SIP vs lump sum comparison with step-up SIP calculator. Project corpus over 5/10/20 years with inflation-adjusted real returns.',
    points: ['Step-up SIP with annual increase %', 'SIP vs lump sum head-to-head', 'Inflation-adjusted real corpus'],
  },
  {
    icon: '🤖', color: '#aa44ff', title: 'AI Portfolio Recommender',
    desc: 'Tell the AI your age, goal, risk tolerance and horizon. Get a personalized allocation across large cap, mid cap, small cap, debt, and gold.',
    points: ['Goal-based asset allocation', 'Risk profile questionnaire', 'Mutual fund category recommendations'],
  },
  {
    icon: '📋', color: '#44ffaa', title: 'Mutual Fund Explorer',
    desc: 'Search 10,000+ Indian mutual funds by name or AMC. Live NAV, 1Y/3Y/5Y returns, direct plan tracking and category comparison.',
    points: ['Live NAV from MFAPI', '10,000+ funds searchable', 'Direct vs regular plan tracking'],
  },
  {
    icon: '📌', color: '#ff6644', title: 'NSE India Movers',
    desc: 'Live gainers, losers and high-volume stocks from Nifty 50 + Next 50 + Midcap 50 — 120+ stocks scanned every 5 minutes.',
    points: ['120+ stocks across 3 indices', 'Gainers, losers, volume leaders', 'One-click scan from any mover'],
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Choose Market',  desc: 'Toggle 🇺🇸 US or 🇮🇳 India. Auto-detects IST for Indian users. Separate watchlists, signals and macro data per market.' },
  { step: '02', title: 'Pick a Ticker', desc: 'Type any US stock (AAPL, NVDA) or NSE symbol (RELIANCE, INFY). The movers dashboard shows top ideas without typing anything.' },
  { step: '03', title: 'Set Timeframe', desc: 'Short Term (5 days), Swing (4 weeks), Position (3 months), Long Term (1 year). Factor weights shift — fundamentals dominate long-term, technicals dominate short-term.' },
  { step: '04', title: 'Get Signal',    desc: 'BUY/SELL/HOLD with confidence %, exact entry, ATR-based target and stop, thesis, bull/bear factors, risk level and market regime context.' },
];

const TECH_STACK = [
  { icon: '⚙️',  label: 'Signal Engine',       value: '9-factor deterministic model + 5-signal regime detector', color: '#00ff88' },
  { icon: '📈',  label: 'US Price / Options',   value: 'Tradier — real-time quotes + options chain',             color: '#ffaa00' },
  { icon: '🇮🇳', label: 'India Data',           value: 'NSE India API + Yahoo Finance + NSE Bhav Copy fallback', color: '#ff9a00' },
  { icon: '🏦',  label: 'Fundamentals',         value: 'Finnhub XBRL + FMP + Polygon reference data',           color: '#4488ff' },
  { icon: '🌍',  label: 'Macro / FX',           value: 'Exchange Rate API (USD/INR) + Tradier GLD/USO',         color: '#ff8844' },
  { icon: '🤖',  label: 'AI Thesis',            value: 'Claude Sonnet — thesis only, signal is deterministic',  color: '#aa44ff' },
  { icon: '🔒',  label: 'Privacy & Caching',    value: 'No data sold · Supabase persistent cache layer',        color: '#44aaff' },
];

const PRICING = [
  {
    label: 'FREE', color: '#7788aa', price: '$0', sub: 'Forever free',
    features: ['5 stock scans / day', '3 options analyses / day', '5 watchlist items', 'All 4 timeframes', 'US & India markets', 'Signal accuracy tracker'],
  },
  {
    label: 'PRO — US 🇺🇸', color: '#ffaa00', price: '$5', sub: '/mo · No commitment',
    features: ['Unlimited scans & options', 'Unlimited watchlist', 'Institutional + insider data', 'Earnings quality scoring', 'Market regime detection', 'First month FREE'],
  },
  {
    label: 'PRO — INDIA 🇮🇳', color: '#ff9a00', price: '₹249', sub: '/mo · No commitment',
    features: ['Unlimited scans & watchlist', 'Full Nifty 500 coverage', 'SIP Planner + step-up calc', 'AI portfolio recommender', '10,000+ mutual funds', 'First month FREE'],
  },
];

export default function WelcomePage({ onEnter, onNavigate }) {
  const [visible,       setVisible]       = useState(false);
  const [activeMarket,  setActiveMarket]  = useState('US');

  useEffect(() => { setVisible(true); }, []);
  const go = (tab) => { onNavigate(tab); onEnter(); };

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', flexDirection: 'column', opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .wc-section { padding: clamp(40px,6vw,80px) clamp(16px,5vw,60px); max-width: 1200px; margin: 0 auto; width: 100%; box-sizing: border-box; }
        .wc-grid-2  { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .wc-grid-3  { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .wc-grid-4  { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .wc-feat-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media(min-width:640px) { .wc-grid-2{grid-template-columns:1fr 1fr} .wc-grid-3{grid-template-columns:1fr 1fr} .wc-feat-grid{grid-template-columns:1fr 1fr} }
        @media(min-width:900px) { .wc-grid-3{grid-template-columns:1fr 1fr 1fr} .wc-grid-4{grid-template-columns:repeat(4,1fr)} .wc-feat-grid{grid-template-columns:1fr 1fr 1fr} }
        .feat-card { transition: background 0.2s, transform 0.2s; cursor: pointer; animation: fadeUp 0.4s ease forwards; }
        .feat-card:hover { background: #141422 !important; transform: translateY(-3px); }
        .wc-cta { transition: opacity 0.2s, transform 0.1s; }
        .wc-cta:hover { opacity: 0.85; transform: translateY(-1px); }
        .wc-label { font-size: clamp(9px,1vw,11px); letter-spacing: 0.25em; color: #ffaa0066; margin-bottom: clamp(16px,3vw,28px); text-transform: uppercase; text-align: center; }
      `}</style>

      {/* HERO */}
      <div style={{ padding: 'clamp(48px,8vw,100px) clamp(16px,5vw,60px) clamp(32px,5vw,60px)', textAlign: 'center', maxWidth: 1000, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'inline-block', fontSize: 'clamp(9px,1vw,11px)', letterSpacing: '0.3em', color: '#ffaa0088', border: '1px solid #ffaa0033', padding: '5px 18px', marginBottom: 'clamp(20px,4vw,32px)', borderRadius: 2 }}>
          QUANTITATIVE MARKET INTELLIGENCE · US & INDIA
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(56px,12vw,130px)', lineHeight: 0.88, letterSpacing: '0.04em', marginBottom: 'clamp(16px,3vw,28px)' }}>
          <span style={{ color: '#ffaa00' }}>QU</span><span style={{ color: '#00ff88' }}>AI</span><span style={{ color: '#ffaa00' }}>NT</span>
          <br /><span style={{ color: '#ffaa00' }}>SIGNAL</span>
        </div>
        <div style={{ fontSize: 'clamp(14px,2vw,20px)', color: '#8899aa', marginBottom: 8, fontWeight: 300 }}>
          Deterministic signal engine · US stocks & options · NSE India Nifty 500
        </div>
        <div style={{ fontSize: 'clamp(12px,1.3vw,15px)', color: '#556677', maxWidth: 640, margin: '0 auto', lineHeight: 1.85, marginBottom: 'clamp(24px,4vw,40px)' }}>
          9-factor quant model · Institutional data · Market regime detection · Signal accuracy tracking
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 'clamp(28px,4vw,40px)' }}>
          <button className="wc-cta" onClick={onEnter} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 'clamp(12px,1.3vw,15px)', padding: 'clamp(12px,1.5vw,16px) clamp(28px,4vw,48px)', background: '#ffaa0022', border: '1px solid #ffaa00', color: '#ffaa00', cursor: 'pointer', borderRadius: 3, letterSpacing: '0.1em', fontWeight: 700 }}>
            GET STARTED FREE →
          </button>
          <button className="wc-cta" onClick={() => go('help')} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 'clamp(12px,1.3vw,15px)', padding: 'clamp(12px,1.5vw,16px) clamp(28px,4vw,48px)', background: 'transparent', border: '1px solid #2a2a3e', color: '#b0c0dd', cursor: 'pointer', borderRadius: 3, letterSpacing: '0.1em' }}>
            HOW IT WORKS
          </button>
        </div>
        <div style={{ background: '#00ff8808', border: '1px solid #00ff8822', borderRadius: 6, padding: '12px 16px', marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#00ff88', marginBottom: 3 }}>🎉 FIRST MONTH FREE — NO CREDIT CARD REQUIRED</div>
          <div style={{ fontSize: 11, color: '#556677' }}>30 days free for new subscribers. Add payment before trial ends to continue.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {[
            { value: '5,000+', label: 'US Stocks',        color: '#ffaa00' },
            { value: '500+',   label: 'NSE India',         color: '#ff9a00' },
            { value: '9',      label: 'Signal Factors',    color: '#00ff88' },
            { value: '4',      label: 'Timeframes',        color: '#4488ff' },
            { value: '5',      label: 'Regime Signals',    color: '#aa44ff' },
            { value: '∞',      label: 'Accuracy Tracked',  color: '#ff8844' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#0c0c18', border: `1px solid ${s.color}22`, borderTop: `2px solid ${s.color}55`, borderRadius: 6, padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#556677', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <div style={{ background: '#0a0a14', borderTop: '1px solid #1a1a2e', borderBottom: '1px solid #1a1a2e' }}>
        <div className="wc-section">
          <div className="wc-label">WHAT YOU GET</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'clamp(20px,3vw,36px)' }}>
            <div style={{ display: 'flex', border: '1px solid #2a2a3e', borderRadius: 6, overflow: 'hidden' }}>
              {[['US', '🇺🇸 US FEATURES', '#ffaa00'], ['INDIA', '🇮🇳 INDIA FEATURES', '#ff9a00']].map(([key, label, accent]) => (
                <button key={key} onClick={() => setActiveMarket(key)} style={{ padding: 'clamp(10px,1.5vw,14px) clamp(20px,3vw,40px)', background: activeMarket === key ? accent + '22' : 'transparent', border: 'none', borderRight: key === 'US' ? '1px solid #2a2a3e' : 'none', color: activeMarket === key ? accent : '#556677', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontSize: 'clamp(11px,1.2vw,13px)', letterSpacing: '0.1em', fontWeight: 700, transition: 'all 0.2s' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="wc-feat-grid">
            {(activeMarket === 'US' ? FEATURES_US : FEATURES_INDIA).map((f, i) => (
              <div key={`${activeMarket}-${i}`} className="feat-card" onClick={onEnter} style={{ padding: 'clamp(18px,2.5vw,28px)', background: '#0f0f1a', border: `1px solid ${f.color}22`, borderTop: `3px solid ${f.color}`, borderRadius: 6, animationDelay: `${i * 60}ms` }}>
                <div style={{ fontSize: 'clamp(24px,3vw,34px)', marginBottom: 10 }}>{f.icon}</div>
                <div style={{ fontSize: 'clamp(13px,1.4vw,15px)', fontWeight: 700, color: f.color, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 'clamp(11px,1.1vw,13px)', color: '#99aacc', lineHeight: 1.75, marginBottom: 12 }}>{f.desc}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {f.points.map((p, j) => (
                    <div key={j} style={{ fontSize: 'clamp(10px,1vw,12px)', color: '#7788aa', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                      <span style={{ color: f.color, flexShrink: 0, marginTop: 1 }}>›</span>{p}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div>
        <div className="wc-section">
          <div className="wc-label">HOW IT WORKS</div>
          <div className="wc-grid-4">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(36px,5vw,60px)', color: '#ffaa0022', flexShrink: 0, lineHeight: 1 }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: 'clamp(12px,1.3vw,15px)', fontWeight: 700, color: '#c8c8d0', marginBottom: 8 }}>{s.title}</div>
                  <div style={{ fontSize: 'clamp(11px,1.1vw,13px)', color: '#99aacc', lineHeight: 1.7 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SIGNAL ENGINE */}
      <div style={{ background: '#0a0a14', borderTop: '1px solid #1a1a2e', borderBottom: '1px solid #1a1a2e' }}>
        <div className="wc-section">
          <div className="wc-label">THE SIGNAL ENGINE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            {[
              { factor: 'Momentum',          weight: 'Short 25% / Long 7%',  desc: 'Timeframe-scaled price returns',           color: '#ffaa00' },
              { factor: 'Trend',             weight: 'Short 18% / Long 4%',  desc: 'SMA20/50/200 alignment',                   color: '#ff8844' },
              { factor: 'RSI',               weight: 'Regime-aware logic',    desc: 'Flips direction in bear markets',          color: '#ff4488' },
              { factor: 'MACD',              weight: 'Cross + trend signal',  desc: 'Bullish/bearish cross',                    color: '#aa44ff' },
              { factor: 'Revenue Growth',    weight: 'Short 5% / Long 25%',  desc: 'QoQ for short, YoY for long term',         color: '#4488ff' },
              { factor: 'Earnings Quality',  weight: 'Short 3% / Long 18%',  desc: 'NI, EPS, ROE, beat/miss streak',           color: '#44aaff' },
              { factor: 'Analyst Consensus', weight: 'Short 4% / Long 18%',  desc: 'Rec key + price target upside',            color: '#00ccff' },
              { factor: 'Macro / Enhanced',  weight: 'Short 8% / Long 12%',  desc: 'Regime, bonds, institutional, FII/DII',    color: '#00ff88' },
              { factor: 'News Catalyst',     weight: 'Severity + recency',    desc: 'Upgrade/downgrade, earnings, short attack',color: '#44ff88' },
            ].map((f, i) => (
              <div key={i} style={{ background: '#0f0f1a', border: `1px solid ${f.color}22`, borderLeft: `3px solid ${f.color}`, borderRadius: 4, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: f.color, marginBottom: 3 }}>{f.factor}</div>
                <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 4 }}>{f.weight}</div>
                <div style={{ fontSize: 11, color: '#556677', lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#0f0f1a', border: '1px solid #00ff8822', borderRadius: 6, fontSize: 12, color: '#7788aa', textAlign: 'center', lineHeight: 1.8 }}>
            Score −1 to +1 per factor &nbsp;·&nbsp;
            <span style={{ color: '#00ff88' }}>+0.15 = BUY</span> &nbsp;·&nbsp;
            <span style={{ color: '#ff4444' }}>−0.15 = SELL</span> &nbsp;·&nbsp;
            <span style={{ color: '#7788aa' }}>else HOLD</span> &nbsp;·&nbsp;
            <span style={{ color: '#c8d8f0' }}>Confidence 45–95% from score magnitude</span>
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div>
        <div className="wc-section">
          <div className="wc-label">PRICING</div>
          <div className="wc-grid-3">
            {PRICING.map((p, i) => (
              <div key={i} style={{ background: '#0f0f1a', borderRadius: 6, padding: 'clamp(20px,3vw,32px)', border: `1px solid ${p.color}33`, borderTop: `3px solid ${p.color}` }}>
                <div style={{ fontSize: 10, color: p.color, letterSpacing: '0.15em', marginBottom: 10 }}>{p.label}</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(36px,5vw,52px)', color: p.color, lineHeight: 1, marginBottom: 4 }}>{p.price}</div>
                <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 20 }}>{p.sub}</div>
                {p.features.map((f, j) => (
                  <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'clamp(11px,1.1vw,13px)', color: '#b0c0dd', padding: '5px 0', borderBottom: '1px solid #1a1a2a' }}>
                    <span style={{ color: p.color }}>✓</span>{f}
                  </div>
                ))}
                <button className="wc-cta" onClick={onEnter} style={{ width: '100%', marginTop: 20, fontFamily: "'IBM Plex Mono',monospace", fontSize: 'clamp(11px,1.1vw,13px)', letterSpacing: '0.1em', padding: 'clamp(10px,1.2vw,14px)', background: p.color + '18', border: `1px solid ${p.color}`, color: p.color, cursor: 'pointer', borderRadius: 3, fontWeight: 700 }}>
                  {i === 0 ? 'GET STARTED FREE →' : 'START FREE TRIAL →'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ABOUT */}
      <div style={{ background: '#0a0a14', borderTop: '1px solid #1a1a2e' }}>
        <div className="wc-section">
          <div className="wc-label">ABOUT</div>
          <div className="wc-grid-2" style={{ alignItems: 'start', gap: 'clamp(24px,4vw,60px)' }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(28px,4vw,44px)', color: '#ffaa00', lineHeight: 1.05, marginBottom: 20 }}>
                BUILT DIFFERENT.<br />SIGNALS THAT MEAN SOMETHING.
              </div>
              {[
                "QuAInt Signal is not another AI chatbot that guesses a signal. Every BUY/SELL/HOLD comes from a deterministic 9-factor scoring engine — momentum, trend, RSI (regime-aware), MACD, volume, revenue growth, earnings quality, analyst consensus, and macro. Claude writes the thesis explaining the signal; the engine sets it.",
                "For US stocks, the engine pulls institutional ownership direction, insider net buying/selling (90-day), short interest %, FCF yield, ROIC, and 5-year growth trends. A 5-signal market regime detector — SPY 200d trend, VIX level, momentum, QQQ vs IWM breadth, and sector rotation — adjusts confidence on every scan.",
                "For Indian stocks, FII/DII net buying, promoter holding changes, and delivery % vs total volume are scored as dedicated factors. The India Invest tab adds SIP planning with step-up calculator, AI portfolio allocation based on your risk profile, and search across 10,000+ mutual funds — a complete toolkit for Indian retail investors.",
              ].map((t, i) => (
                <p key={i} style={{ fontSize: 'clamp(12px,1.2vw,14px)', color: '#8899aa', lineHeight: 1.9, marginBottom: 16, marginTop: 0 }}>{t}</p>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {TECH_STACK.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#0f0f1a', border: `1px solid ${item.color}22`, padding: 'clamp(10px,1.5vw,16px) clamp(12px,2vw,18px)', borderRadius: 4, borderLeft: `3px solid ${item.color}` }}>
                  <span style={{ fontSize: 'clamp(18px,2vw,22px)' }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 'clamp(8px,0.8vw,10px)', color: '#8899bb', letterSpacing: '0.1em', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 'clamp(11px,1.1vw,13px)', color: '#c8c8d0', fontWeight: 500 }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: '1px solid #1a1a2e', padding: 'clamp(20px,3vw,32px) clamp(16px,5vw,60px)', textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(10px,0.9vw,11px)', color: '#2a2a3e', maxWidth: 800, margin: '0 auto', lineHeight: 1.8 }}>
          ⚠ RISK DISCLAIMER: QuAInt Signal is an educational and analytical tool only. Nothing constitutes financial advice or a recommendation to buy or sell any security. Trading involves significant risk. Always consult a licensed financial advisor.
        </div>
        <div style={{ fontSize: 10, color: '#1e1e2e', marginTop: 10 }}>
          © {new Date().getFullYear()} QuAInt Signal · Free to start · US Pro $5/mo · India Pro ₹249/mo
        </div>
      </div>
    </div>
  );
}