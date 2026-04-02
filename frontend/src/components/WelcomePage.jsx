import { useEffect, useState } from 'react';

const FEATURES = [
  { icon: '📡', title: 'AI Stock Scanner',     desc: 'Scan any US or Indian NSE stock for BUY/SELL/HOLD signals with RSI, MACD, SMA, volume, and institutional flow analysis across 4 timeframes.', tab: 'scanner',  color: '#ffaa00' },
  { icon: '⚡', title: 'AI Options Plays',     desc: 'Get exact entry price, exit price, and stop loss for CALL and PUT options — US markets only. Powered by Claude AI with global macro context.', tab: 'options',  color: '#00ff88' },
  { icon: '🌍', title: 'Global Macro',         desc: 'Live bond yields, Asia/Europe markets, VIX, DXY, Nifty 50, gold, and oil — all factored into every recommendation so you trade with the market.', tab: 'markets',  color: '#4488ff' },
  { icon: '👁',  title: 'Watchlist',           desc: 'Track your favourite US or Indian stocks with background AI analysis. Each ticker gets a long-term BUY/SELL/HOLD rating updated automatically.', tab: 'watchlist', color: '#aa44ff' },
  { icon: '📐', title: 'Options Models',       desc: 'Black-Scholes pricer, IV calculator, Greeks dashboard, volatility surface, and strategy backtester — all the tools pros use, simplified.', tab: 'options',   color: '#ff8844' },
  { icon: '❓', title: 'Help & Guide',         desc: 'New to investing? Step-by-step interactive guide covering everything from reading charts to understanding options contracts.', tab: 'help',      color: '#ff4488' },
];

const STATS = [
  { value: '50+',   label: 'Nifty 50 Stocks Tracked' },
  { value: '4',     label: 'Timeframes Supported'    },
  { value: '2',     label: 'Markets — US & India'    },
  { value: 'FREE',  label: 'To Start — No Card Needed' },
];

export default function WelcomePage({ onEnter, onNavigate }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => { setVisible(true); }, []);

  const handleNavigate = (tab) => { onNavigate(tab); onEnter(); };

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}>

      {/* ── Hero ── */}
      <div className="welcome-hero">
        <div style={{ display: 'inline-block', fontSize: 10, letterSpacing: '0.3em',
          color: '#ffaa0088', border: '1px solid #ffaa0033', padding: '4px 16px', marginBottom: 24, borderRadius: 2 }}>
          AI-POWERED INVESTING INTELLIGENCE · US & INDIA
        </div>

        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(48px, 10vw, 120px)',
          lineHeight: 0.9, letterSpacing: '0.05em', marginBottom: 24 }}>
          <span style={{ color: '#ffaa00' }}>QU</span>
          <span style={{ color: '#00ff88' }}>AI</span>
          <span style={{ color: '#ffaa00' }}>NT</span>
          <br />
          <span style={{ color: '#ffaa00' }}>SIGNAL</span>
        </div>

        <div style={{ fontSize: 'clamp(14px, 2vw, 20px)', color: '#8899aa', marginBottom: 12, fontWeight: 300 }}>
          Your AI investing buddy — US stocks, NSE India & options
        </div>
        <div style={{ fontSize: 13, color: '#99aacc', maxWidth: 580, margin: '0 auto 32px', lineHeight: 1.8 }}>
          Real-time AI signals · Global macro context · Exact entry & exit prices · Options analysis · Nifty 50 coverage · Risk management
        </div>

        {/* Market badges */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 4, padding: '6px 14px', fontSize: 12, color: '#c8d8f0' }}>
            🇺🇸 <span>US Stocks & Options</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a2e', border: '1px solid #ff9a0033', borderRadius: 4, padding: '6px 14px', fontSize: 12, color: '#ff9a00' }}>
            🇮🇳 <span>NSE India — Nifty 50</span>
          </div>
        </div>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 48 }}>
          <button className="btn" onClick={onEnter}
            style={{ fontSize: 14, padding: '14px 40px', background: '#ffaa0022', borderColor: '#ffaa00', color: '#ffaa00' }}>
            ENTER APP →
          </button>
          <button className="btn" onClick={() => handleNavigate('help')}
            style={{ fontSize: 14, padding: '14px 40px' }}>
            HOW IT WORKS
          </button>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#ffaa00', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: '0.1em', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Value props ── */}
      <div style={{ padding: '0 40px 40px', maxWidth: 960, margin: '0 auto', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.3em', marginBottom: 24 }}>WHY QUAINT SIGNAL</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { icon: '🤖', title: 'Claude AI Engine',      desc: "Powered by Anthropic's Claude Sonnet — analyzes technicals, fundamentals, macro, and news simultaneously for both US and Indian markets." },
            { icon: '🇮🇳', title: 'NSE India Coverage',   desc: 'Full Nifty 50 coverage with INR pricing, Indian macro context (RBI, FII flows, Budget), and NSE-specific news analysis.' },
            { icon: '📊', title: 'Stocks + Options',      desc: 'BUY/SELL/HOLD signals for US & Indian stocks AND exact options plays (US only) with entry price, exit price, and stop loss.' },
            { icon: '🎯', title: 'Exact & Actionable',    desc: 'No vague signals. Every recommendation includes exact target, stop loss, AI thesis with company context, and bull/bear factors.' },
          ].map((v, i) => (
            <div key={i} style={{ background: '#0f0f18', border: '1px solid #1e1e2e', padding: '20px 16px', borderRadius: 4 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{v.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffaa00', marginBottom: 6 }}>{v.title}</div>
              <div style={{ fontSize: 11, color: '#99aacc', lineHeight: 1.6 }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <div className="welcome-features">
        <div style={{ textAlign: 'center', fontSize: 10, color: '#ffaa0066', letterSpacing: '0.3em', marginBottom: 24 }}>WHAT YOU GET</div>
        <div className="welcome-features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} onClick={() => handleNavigate(f.tab)}
              style={{ padding: '20px', background: '#0f0f18', border: `1px solid ${f.color}22`,
                borderTop: `3px solid ${f.color}`, borderRadius: 4, cursor: 'pointer', transition: 'background 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#141420'}
              onMouseLeave={e => e.currentTarget.style.background = '#0f0f18'}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: f.color, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: '#99aacc', lineHeight: 1.6, marginBottom: 12 }}>{f.desc}</div>
              <div style={{ fontSize: 10, color: f.color + '88' }}>OPEN {f.title.toUpperCase()} →</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <div style={{ padding: '60px 40px', maxWidth: 960, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', fontSize: 10, color: '#ffaa0066', letterSpacing: '0.3em', marginBottom: 32 }}>HOW IT WORKS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
          {[
            { step: '01', title: 'Choose Your Market',     desc: 'Toggle between 🇺🇸 US and 🇮🇳 India using the market selector. The app auto-detects your region on first visit.' },
            { step: '02', title: 'Search Any Ticker',      desc: 'Type any US stock symbol or NSE India ticker (e.g. RELIANCE, TCS, INFY). Predictive search finds the exact ticker instantly.' },
            { step: '03', title: 'AI Analyzes Everything', desc: 'Claude AI scans technicals, fundamentals, news, and 15+ global markets. For India: includes RBI rates, FII flows, and Indian macro context.' },
            { step: '04', title: 'Get Exact Signals',      desc: 'Receive a BUY/SELL/HOLD signal with exact entry, target, stop loss, AI thesis combining company context + fundamentals + technicals.' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: '#ffaa0033', flexShrink: 0, lineHeight: 1 }}>{s.step}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#c8c8d0', marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: '#99aacc', lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pricing ── */}
      <div style={{ padding: '40px', maxWidth: 960, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', fontSize: 10, color: '#ffaa0066', letterSpacing: '0.3em', marginBottom: 24 }}>PRICING</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {/* Free */}
          <div style={{ background: '#0f0f18', border: '1px solid #2a2a3e', borderRadius: 6, padding: '24px' }}>
            <div style={{ fontSize: 11, color: '#7788aa', letterSpacing: '0.15em', marginBottom: 8 }}>FREE TIER</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: '#e8e8f0', lineHeight: 1, marginBottom: 4 }}>$0</div>
            <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 20 }}>Forever free</div>
            {['5 stock scans / day', '3 options analyses / day', '5 watchlist items per market', 'All 4 timeframes', 'US & India markets'].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#b0c0dd', padding: '5px 0' }}>
                <span style={{ color: '#00ff88' }}>✓</span>{f}
              </div>
            ))}
          </div>
          {/* Pro USD */}
          <div style={{ background: '#0f0f18', border: '1px solid #ffaa0044', borderTop: '3px solid #ffaa00', borderRadius: 6, padding: '24px' }}>
            <div style={{ fontSize: 11, color: '#ffaa00', letterSpacing: '0.15em', marginBottom: 8 }}>PRO — US / GLOBAL</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: '#ffaa00', lineHeight: 1, marginBottom: 4 }}>$5<span style={{ fontSize: 20 }}>/mo</span></div>
            <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 20 }}>Billed monthly</div>
            {['Unlimited scans & options', 'Unlimited watchlist', 'All 4 timeframes', 'US & India markets', 'Priority AI processing'].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#b0c0dd', padding: '5px 0' }}>
                <span style={{ color: '#ffaa00' }}>✓</span>{f}
              </div>
            ))}
            <button className="btn" onClick={onEnter} style={{ width: '100%', marginTop: 16, fontSize: 12 }}>GET PRO →</button>
          </div>
          {/* Pro INR */}
          <div style={{ background: '#0f0f18', border: '1px solid #ff9a0044', borderTop: '3px solid #ff9a00', borderRadius: 6, padding: '24px' }}>
            <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.15em', marginBottom: 8 }}>PRO — INDIA 🇮🇳</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: '#ff9a00', lineHeight: 1, marginBottom: 4 }}>₹249<span style={{ fontSize: 20 }}>/mo</span></div>
            <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 20 }}>Billed monthly · INR</div>
            {['Unlimited scans', 'Unlimited watchlist', 'Full Nifty 50 coverage', 'Indian macro context', 'RBI / FII / Budget analysis'].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#b0c0dd', padding: '5px 0' }}>
                <span style={{ color: '#ff9a00' }}>✓</span>{f}
              </div>
            ))}
            <button className="btn" onClick={onEnter} style={{ width: '100%', marginTop: 16, fontSize: 12, borderColor: '#ff9a00', color: '#ff9a00' }}>GET PRO INDIA →</button>
          </div>
        </div>
      </div>

      {/* ── About ── */}
      <div className="welcome-about">
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', fontSize: 10, color: '#ffaa0066', letterSpacing: '0.3em', marginBottom: 32 }}>ABOUT</div>
          <div className="welcome-about-grid">
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(24px, 4vw, 36px)',
                color: '#ffaa00', lineHeight: 1.1, marginBottom: 16 }}>
                YOUR AI INVESTING<br />BUDDY
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                QuAInt Signal is an AI-powered investing platform built on Claude AI by Anthropic.
                It covers both US stocks & options and NSE India (Nifty 50), analyzing any ticker
                using technical indicators (RSI, MACD, SMA20/50/200, ATR, Bollinger Bands), company
                fundamentals, news sentiment, and global macro conditions.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                For Indian stocks, the AI incorporates RBI monetary policy, FII/DII flows, INR/USD
                strength, Budget impact, and SEBI regulations into every signal. Prices are shown
                in ₹ and the market auto-detects based on your timezone.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                Every recommendation includes exact entry price, price target, and stop loss —
                not vague directional bias. The AI thesis combines company context, fundamental
                drivers, and technical setup for each timeframe.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8 }}>
                Free tier: 5 scans + 3 options analyses per day, 5 watchlist items per market.
                Pro: unlimited everything. US Pro at $5/mo · India Pro at ₹249/mo.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: '🤖', label: 'AI Engine',       value: 'Claude Sonnet by Anthropic',      color: '#00ff88' },
                { icon: '🇮🇳', label: 'India Data',     value: 'NSE India API + Yahoo Finance',   color: '#ff9a00' },
                { icon: '📈', label: 'Options Data',    value: 'Tradier — Real-time US chains',   color: '#ffaa00' },
                { icon: '📊', label: 'Stock History',   value: 'Tradier + NSE — OHLCV + quotes', color: '#4488ff' },
                { icon: '🌍', label: 'Macro Data',      value: 'Polygon — 15+ global markets',   color: '#ff8844' },
                { icon: '💰', label: 'Pricing',         value: 'Free · $5/mo US · ₹249/mo India', color: '#00ff88' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14,
                  background: '#0f0f18', border: `1px solid ${item.color}22`,
                  padding: '12px 16px', borderRadius: 4, borderLeft: `3px solid ${item.color}` }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 9, color: '#8899bb', letterSpacing: '0.1em', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: '#c8c8d0', fontWeight: 500 }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Disclaimer + footer ── */}
      <div style={{ padding: '24px 20px', borderTop: '1px solid #1a1a2e', textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: '#2a2a3e', maxWidth: 700, margin: '0 auto', lineHeight: 1.8 }}>
          ⚠ RISK DISCLAIMER: QuAInt Signal is an educational and analytical tool only. Nothing on this
          platform constitutes financial advice, investment advice, or a recommendation to buy or sell
          any security. Trading involves significant risk and is not suitable for all investors.
          Always do your own research and consult a licensed financial advisor before trading.
        </div>
        <div style={{ fontSize: 10, color: '#1e1e2e', marginTop: 12 }}>
          © {new Date().getFullYear()} QuAInt Signal ·
          <span style={{ marginLeft: 8 }}>Free to start · US Pro $5/mo · India Pro ₹249/mo</span>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}