import { useEffect, useState } from 'react';

const US_STATS = {
  free: [
    { value: '5,000+', label: 'US Stocks'             },
    { value: '5/day',  label: 'Stock Scans'           },
    { value: '3/day',  label: 'Options Analyses'      },
    { value: '5',      label: 'Watchlist Items'       },
    { value: '15+',    label: 'Global Markets'        },
  ],
  pro: [
    { value: '∞',      label: 'Unlimited Scans'       },
    { value: '∞',      label: 'Options Analyses'      },
    { value: '∞',      label: 'Watchlist Items'       },
    { value: '4',      label: 'Timeframes'            },
    { value: 'FREE',   label: 'No card required · $5 after' },
  ],
};

const INDIA_STATS = {
  free: [
    { value: '500+',   label: 'NSE Stocks'            },
    { value: '5/day',  label: 'Stock Scans'           },
    { value: '5',      label: 'Watchlist Items'       },
    { value: '28+',    label: 'NSE ETFs Visible'      },
  ],
  pro: [
    { value: '∞',      label: 'Unlimited Scans'       },
    { value: 'SIP',    label: 'Planner + Calculator'  },
    { value: 'AI',     label: 'Portfolio Recommender' },
    { value: 'MF',     label: 'Mutual Fund Explorer'  },
    { value: 'FREE',   label: 'No card required · ₹249 after' },
  ],
};

const FEATURES = [
  {
    icon: '📡', color: '#ffaa00', title: 'AI Stock Scanner',
    desc: 'BUY/SELL/HOLD signals for any US or NSE India stock. RSI, MACD, ATR, Bollinger Bands, S/R levels — all analyzed simultaneously across 4 timeframes.',
    points: ['4 timeframes with different logic', 'ATR-based stops & targets', 'Confidence % with bull/bear factors'],
    tab: 'scanner',
  },
  {
    icon: '⚡', color: '#00ff88', title: 'AI Options Plays',
    desc: 'Exact strike, expiry, entry price, exit price, and stop loss for CALL and PUT options on US stocks. Real-time chain data with Black-Scholes pricing.',
    points: ['Exact contract recommendations', 'Trade checklist GO/NO-GO', 'P&L simulator before you trade'],
    tab: 'options',
  },
  {
    icon: '🇮🇳', color: '#ff9a00', title: 'NSE India — Nifty 500',
    desc: '500+ Indian stocks with INR pricing. RBI policy, FII/DII flows, INR/USD, Budget, and SEBI context factored into every signal.',
    points: ['Nifty 100 movers dashboard', 'RBI & FII macro context', 'Full Nifty 500 search'],
    tab: 'scanner',
  },
  {
    icon: '🌍', color: '#4488ff', title: 'Global Macro Intelligence',
    desc: 'Live bond yields, Nifty, Sensex, VIX, DXY, gold, oil, and 15+ international markets factored into every recommendation.',
    points: ['Asia, Europe & US markets', 'Yield curve & VIX signals', 'India-specific macro ticker'],
    tab: 'markets',
  },
  {
    icon: '👁',  color: '#aa44ff', title: 'Smart Watchlist',
    desc: 'Track US and Indian stocks separately. Background analysis runs automatically — check your long-term thesis on any ticker.',
    points: ['Separate US & India lists', 'Auto long-term analysis', 'Price alerts & refresh'],
    tab: 'watchlist',
  },
  {
    icon: '🤖', color: '#ff4488', title: 'Intelligent Signal Engine',
    desc: "Timeframe-specific analysis — Short Term focuses on momentum and volume while Long Term uses fundamentals, earnings growth, and analyst consensus.",
    points: ['Company + fundamental thesis', 'India-aware macro context', 'Never purely technical signals'],
    tab: 'scanner',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Choose Your Market',     desc: 'Toggle 🇺🇸 US or 🇮🇳 India. Auto-detects IST timezone for Indian users. Separate watchlists, macros, and movers for each market.' },
  { step: '02', title: 'Search Any Ticker',      desc: 'Type any US stock or NSE India symbol — RELIANCE, TCS, INFY, AAPL, NVDA. 500+ Indian + 5,000+ US stocks covered.' },
  { step: '03', title: 'AI Analyzes Everything', desc: 'The signal engine processes technicals, fundamentals, news, and 15+ global markets in seconds. India mode adds RBI, FII flows, INR context.' },
  { step: '04', title: 'Get Exact Signals',      desc: 'BUY/SELL/HOLD with exact entry, target, stop loss sized by ATR. Signal thesis combines company context, fundamentals, and technical setup.' },
];

const TECH_STACK = [
  { icon: '⚙️',  label: 'Signal Engine',  value: 'Advanced LLM — Quantitative Logic', color: '#00ff88' },
  { icon: '🇮🇳', label: 'India Data',    value: 'NSE India API + MFAPI.in NAV',    color: '#ff9a00' },
  { icon: '📈', label: 'Options Data',   value: 'Tradier — Real-time US chains',   color: '#ffaa00' },
  { icon: '📊', label: 'Stock History',  value: 'Tradier + NSE — OHLCV + quotes', color: '#4488ff' },
  { icon: '🌍', label: 'Macro Data',     value: 'Polygon — 15+ global markets',   color: '#ff8844' },
  { icon: '🔒', label: 'Privacy',        value: 'No data sold — ever',            color: '#aa44ff' },
  { icon: '💰', label: 'Pricing',        value: 'Free · $5/mo US · ₹249/mo India', color: '#00ff88' },
];

const PRICING = [
  {
    label: 'FREE', color: '#7788aa', price: '$0', sub: 'Forever free',
    features: ['5 stock scans / day', '3 options analyses / day', '5 watchlist items per market', 'All 4 timeframes', 'US & India markets'],
    cta: 'GET STARTED',
  },
  {
    label: 'PRO — US', color: '#ffaa00', price: '$5', sub: '/mo · USD · No commitment',
    features: ['Unlimited scans & options', 'Unlimited watchlist', 'All 4 timeframes', 'US & India markets', 'Priority AI processing'],
    cta: 'GET US PRO',
  },
  {
    label: 'PRO — INDIA 🇮🇳', color: '#ff9a00', price: '₹249', sub: '/mo · INR · No commitment',
    features: ['Unlimited scans & watchlist', 'Full Nifty 500 coverage', 'India Invest tab — ETFs + SIP + MF', 'AI portfolio recommender', 'RBI/FII/Budget macro context'],
    cta: 'GET INDIA PRO',
  },
];

export default function WelcomePage({ onEnter, onNavigate }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => { setVisible(true); }, []);

  const go = (tab) => { onNavigate(tab); onEnter(); };

  return (
    <div style={{
      minHeight: '100vh', background: '#08080f',
      display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease',
      fontFamily: "'Inter', sans-serif",
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        .wc-section { padding: clamp(40px,6vw,80px) clamp(16px,5vw,60px); max-width: 1200px; margin: 0 auto; width: 100%; box-sizing: border-box; }
        .wc-grid-2 { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .wc-grid-3 { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .wc-grid-4 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .wc-feat-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media(min-width:640px) {
          .wc-grid-2 { grid-template-columns: 1fr 1fr; }
          .wc-grid-3 { grid-template-columns: 1fr 1fr; }
          .wc-feat-grid { grid-template-columns: 1fr 1fr; }
        }
        @media(min-width:900px) {
          .wc-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
          .wc-grid-4 { grid-template-columns: repeat(4,1fr); }
          .wc-feat-grid { grid-template-columns: 1fr 1fr 1fr; }
        }
        .wc-feat-card:hover { background: #141422 !important; transform: translateY(-2px); }
        .wc-feat-card { transition: background 0.2s, transform 0.2s; }
        .wc-cta:hover { opacity: 0.85; }
        .wc-label { font-size: clamp(9px,1vw,11px); letter-spacing: 0.25em; color: #ffaa0066; margin-bottom: clamp(16px,3vw,28px); text-transform: uppercase; }
      `}</style>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <div style={{ padding: 'clamp(48px,8vw,100px) clamp(16px,5vw,60px) clamp(32px,5vw,60px)', textAlign: 'center', maxWidth: 1000, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        <div style={{ display: 'inline-block', fontSize: 'clamp(9px,1vw,11px)', letterSpacing: '0.3em',
          color: '#ffaa0088', border: '1px solid #ffaa0033', padding: '5px 18px',
          marginBottom: 'clamp(20px,4vw,32px)', borderRadius: 2 }}>
          QUANTITATIVE MARKET INTELLIGENCE · US & INDIA
        </div>

        <div style={{ fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(56px,12vw,130px)', lineHeight: 0.88,
          letterSpacing: '0.04em', marginBottom: 'clamp(16px,3vw,28px)' }}>
          <span style={{ color: '#ffaa00' }}>QU</span>
          <span style={{ color: '#00ff88' }}>AI</span>
          <span style={{ color: '#ffaa00' }}>NT</span>
          <br />
          <span style={{ color: '#ffaa00' }}>SIGNAL</span>
        </div>

        <div style={{ fontSize: 'clamp(15px,2.2vw,22px)', color: '#8899aa', marginBottom: 10, fontWeight: 300 }}>
          Quantitative signals for US & Indian stocks — options for US markets
        </div>
        <div style={{ fontSize: 'clamp(12px,1.4vw,16px)', color: '#99aacc', maxWidth: 640, margin: '0 auto', lineHeight: 1.85, marginBottom: 'clamp(24px,4vw,40px)' }}>
          Real-time signals · Exact entry & exit · Global macro · Nifty 500 · US options analysis
        </div>

        {/* Market badges */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 'clamp(28px,4vw,44px)', flexWrap: 'wrap' }}>
          {[
            { flag: '🇺🇸', label: 'US Stocks & Options', color: '#2a2a3e', border: '#3a3a5e' },
            { flag: '🇮🇳', label: 'NSE India — Stocks Only', color: '#1a1408', border: '#ff9a0033' },
          ].map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7,
              background: b.color, border: `1px solid ${b.border}`,
              borderRadius: 4, padding: 'clamp(5px,1vw,8px) clamp(12px,2vw,18px)',
              fontSize: 'clamp(11px,1.2vw,13px)', color: '#c8d8f0' }}>
              {b.flag} <span>{b.label}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 'clamp(40px,6vw,64px)' }}>
          <button className="wc-cta" onClick={onEnter} style={{
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 'clamp(12px,1.3vw,15px)',
            padding: 'clamp(12px,1.5vw,16px) clamp(28px,4vw,48px)',
            background: '#ffaa0022', border: '1px solid #ffaa00', color: '#ffaa00',
            cursor: 'pointer', borderRadius: 3, letterSpacing: '0.1em', fontWeight: 700,
          }}>
            GET STARTED →
          </button>
          <button className="wc-cta" onClick={() => go('help')} style={{
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 'clamp(12px,1.3vw,15px)',
            padding: 'clamp(12px,1.5vw,16px) clamp(28px,4vw,48px)',
            background: 'transparent', border: '1px solid #2a2a3e', color: '#b0c0dd',
            cursor: 'pointer', borderRadius: 3, letterSpacing: '0.1em',
          }}>
            HOW IT WORKS
          </button>
        </div>

        {/* Promo Banner */}
        <div style={{
          background: '#00ff8808', border: '1px solid #00ff8833',
          borderRadius: 6, padding: '12px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#00ff88', marginBottom: 4 }}>
            🎉 FIRST MONTH FREE — NO CREDIT CARD REQUIRED
          </div>
          <div style={{ fontSize: 12, color: '#7788aa' }}>
            30 days free for new subscribers. Add payment details before trial ends to continue.
          </div>
        </div>

        {/* Stats bars — US and India with Free/Pro split */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, width: '100%' }}>
          {[
            { flag: '🇺🇸', label: 'US', accent: '#ffaa00', border: '#ffaa0033', stats: US_STATS },
            { flag: '🇮🇳', label: 'INDIA', accent: '#ff9a00', border: '#ff9a0033', stats: INDIA_STATS },
          ].map(({ flag, label, accent, border, stats }) => (
            <div key={label} style={{ background: '#0c0c18', border: `1px solid ${border}`,
              borderTop: `2px solid ${accent}55`, borderRadius: 6,
              padding: 'clamp(12px,2vw,20px)' }}>
              <div style={{ fontSize: 9, color: accent + '99', letterSpacing: '0.2em',
                textAlign: 'center', marginBottom: 14 }}>{flag} {label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
                {/* Free */}
                <div>
                  <div style={{ fontSize: 8, color: '#556677', letterSpacing: '0.15em',
                    marginBottom: 8, textAlign: 'center', borderBottom: '1px solid #1a1a2a', paddingBottom: 4 }}>
                    FREE
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {stats.free.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontFamily: "'Bebas Neue',sans-serif",
                          fontSize: 14, color: '#b0c0dd', minWidth: 36, lineHeight: 1, flexShrink: 0 }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: '#556677', lineHeight: 1.3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Pro */}
                <div style={{ borderLeft: `1px solid ${accent}22`, paddingLeft: 8 }}>
                  <div style={{ fontSize: 8, color: accent + 'aa', letterSpacing: '0.15em',
                    marginBottom: 8, textAlign: 'center', borderBottom: `1px solid ${accent}22`, paddingBottom: 4 }}>
                    PRO
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {stats.pro.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontFamily: "'Bebas Neue',sans-serif",
                          fontSize: 14, color: accent, minWidth: 36, lineHeight: 1, flexShrink: 0 }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: '#8899bb', lineHeight: 1.3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <div style={{ background: '#0a0a14', borderTop: '1px solid #1a1a2e', borderBottom: '1px solid #1a1a2e' }}>
        <div className="wc-section">
          <div className="wc-label" style={{ textAlign: 'center' }}>WHAT YOU GET</div>
          <div className="wc-feat-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="wc-feat-card" onClick={() => go(f.tab)} style={{
                padding: 'clamp(18px,2.5vw,28px)', background: '#0f0f1a',
                border: `1px solid ${f.color}22`, borderTop: `3px solid ${f.color}`,
                borderRadius: 6, cursor: 'pointer',
              }}>
                <div style={{ fontSize: 'clamp(26px,3vw,36px)', marginBottom: 10 }}>{f.icon}</div>
                <div style={{ fontSize: 'clamp(13px,1.4vw,16px)', fontWeight: 700, color: f.color, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 'clamp(11px,1.1vw,13px)', color: '#99aacc', lineHeight: 1.7, marginBottom: 12 }}>{f.desc}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {f.points.map((p, j) => (
                    <div key={j} style={{ fontSize: 'clamp(10px,1vw,12px)', color: '#7788aa', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ color: f.color, flexShrink: 0 }}>›</span>{p}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 'clamp(9px,0.9vw,11px)', color: f.color + '88', marginTop: 14, letterSpacing: '0.1em' }}>
                  OPEN {f.title.toUpperCase()} →
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <div>
        <div className="wc-section">
          <div className="wc-label" style={{ textAlign: 'center' }}>HOW IT WORKS</div>
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

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#0a0a14', borderTop: '1px solid #1a1a2e', borderBottom: '1px solid #1a1a2e' }}>
        <div className="wc-section">
          <div className="wc-label" style={{ textAlign: 'center' }}>PRICING</div>
          <div className="wc-grid-3">
            {PRICING.map((p, i) => (
              <div key={i} style={{
                background: '#0f0f1a', borderRadius: 6, padding: 'clamp(20px,3vw,32px)',
                border: `1px solid ${p.color}33`,
                borderTop: `3px solid ${p.color}`,
              }}>
                <div style={{ fontSize: 'clamp(10px,1vw,12px)', color: p.color, letterSpacing: '0.15em', marginBottom: 10 }}>{p.label}</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(36px,5vw,52px)', color: p.color, lineHeight: 1, marginBottom: 4 }}>{p.price}</div>
                <div style={{ fontSize: 'clamp(10px,1vw,12px)', color: '#7788aa', marginBottom: 20 }}>{p.sub}</div>
                {p.features.map((f, j) => (
                  <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'clamp(11px,1.1vw,13px)', color: '#b0c0dd', padding: '5px 0', borderBottom: '1px solid #1a1a2a' }}>
                    <span style={{ color: p.color }}>✓</span>{f}
                  </div>
                ))}
                <button className="wc-cta" onClick={onEnter} style={{
                  width: '100%', marginTop: 20,
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 'clamp(11px,1.1vw,13px)', letterSpacing: '0.1em',
                  padding: 'clamp(10px,1.2vw,14px)',
                  background: p.color + '18', border: `1px solid ${p.color}`,
                  color: p.color, cursor: 'pointer', borderRadius: 3, fontWeight: 700,
                }}>
                  {p.cta} →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ABOUT ────────────────────────────────────────────────────────────── */}
      <div>
        <div className="wc-section">
          <div className="wc-label" style={{ textAlign: 'center' }}>ABOUT</div>
          <div className="wc-grid-2" style={{ alignItems: 'start', gap: 'clamp(24px,4vw,60px)' }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif",
                fontSize: 'clamp(28px,4vw,44px)', color: '#ffaa00', lineHeight: 1.05, marginBottom: 20 }}>
                QUANTITATIVE SIGNALS<br />FOR US & INDIA
              </div>
              {[
                "QuAInt Signal is a quantitative investing platform covering US stocks & options and NSE India (Nifty 500). Every ticker is analyzed using RSI, MACD, SMA20/50/200, ATR, Bollinger Bands, support/resistance, company fundamentals, news sentiment, and global macro conditions.",
                "For Indian stocks, the engine incorporates RBI monetary policy, FII/DII flows, INR/USD strength, Budget impact, and SEBI regulations. The dedicated India Invest tab adds NSE ETF signals, a SIP planner (with SIP vs lump sum comparison), AI-powered portfolio allocation based on your risk profile, SIP tracker, and live mutual fund NAV data.",
                "Every signal includes exact entry, ATR-based target and stop, a thesis combining company context + fundamental driver + technical setup — with different logic per timeframe. Short term uses momentum; long term uses analyst consensus and fundamentals.",
              ].map((t, i) => (
                <p key={i} style={{ fontSize: 'clamp(12px,1.2vw,14px)', color: '#8899aa', lineHeight: 1.9, marginBottom: 16, marginTop: 0 }}>{t}</p>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {TECH_STACK.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14,
                  background: '#0f0f1a', border: `1px solid ${item.color}22`,
                  padding: 'clamp(10px,1.5vw,16px) clamp(12px,2vw,18px)',
                  borderRadius: 4, borderLeft: `3px solid ${item.color}` }}>
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

      {/* ── FOOTER DISCLAIMER ────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #1a1a2e', padding: 'clamp(20px,3vw,32px) clamp(16px,5vw,60px)', textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(10px,0.9vw,11px)', color: '#2a2a3e', maxWidth: 800, margin: '0 auto', lineHeight: 1.8 }}>
          ⚠ RISK DISCLAIMER: QuAInt Signal is an educational and analytical tool only. Nothing on this platform constitutes financial advice, investment advice, or a recommendation to buy or sell any security. Trading involves significant risk. Always consult a licensed financial advisor before trading.
        </div>
        <div style={{ fontSize: 'clamp(9px,0.9vw,11px)', color: '#1e1e2e', marginTop: 12 }}>
          © {new Date().getFullYear()} QuAInt Signal · Free to start · US Pro $5/mo · India Pro ₹249/mo
        </div>
      </div>
    </div>
  );
}