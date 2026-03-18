import { useEffect, useState } from 'react';

const FEATURES = [
  { icon: '⚡', title: 'AI Options Plays',    desc: 'Get exact entry price, exit price, and stop loss for CALL and PUT options — powered by Claude AI with global macro context.', tab: 'options',  color: '#00ff88' },
  { icon: '📡', title: 'Stock Scanner',       desc: 'Scan any ticker for BUY/SELL/HOLD signals with RSI, SMA, volume, and institutional flow analysis. Know when to buy and when to stay out.', tab: 'scanner',  color: '#ffaa00' },
  { icon: '🌍', title: 'Global Macro',        desc: 'Live bond yields, Asia/Europe markets, VIX, DXY, gold, and oil — all factored into every recommendation so you trade with the market, not against it.', tab: 'markets',  color: '#4488ff' },
  { icon: '📐', title: 'Options Models',      desc: 'Black-Scholes pricer, IV calculator, Greeks dashboard, volatility surface, and strategy backtester — all the tools pros use, simplified.', tab: 'models',   color: '#ff8844' },
  { icon: '✅', title: 'Trade Checklist',     desc: 'AI-powered GO/NO-GO verdict before every trade. 7 checks including trend, RSI, macro, IV, and earnings risk — never trade blind again.', tab: 'options',  color: '#aa44ff' },
  { icon: '❓', title: 'Help & Guide',        desc: 'New to investing? Step-by-step interactive guide covering everything from reading charts to understanding options contracts.', tab: 'help',     color: '#ff4488' },
];

const STATS = [
  { value: '15+',  label: 'Global Markets Tracked' },
  { value: '4',    label: 'Timeframes Supported'    },
  { value: '7',    label: 'Trade Checklist Points'  },
  { value: '$15',  label: 'Pro Plan Per Month'       },
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
          AI-POWERED INVESTING INTELLIGENCE
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
          Your AI investing buddy — stocks, options & global markets
        </div>
        <div style={{ fontSize: 13, color: '#99aacc', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.8 }}>
          Real-time AI signals · Global macro context · Exact entry & exit prices · Options analysis · Risk management
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
            { icon: '🤖', title: 'Claude AI Engine',    desc: 'Powered by Anthropic\'s Claude Sonnet — the same AI used by leading hedge funds and research institutions.' },
            { icon: '📊', title: 'Stocks + Options',    desc: 'BUY/SELL/HOLD signals for stocks AND exact options plays with entry price, exit price, and stop loss.' },
            { icon: '🌍', title: '15+ Global Markets',  desc: 'Every signal factors in Nikkei, Hang Seng, DAX, FTSE, bonds, VIX, DXY, gold, and oil before recommending.' },
            { icon: '🎯', title: 'Exact & Actionable',  desc: 'No vague signals. Every recommendation includes exact strike, premium, entry timing, and exit rules.' },
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
            { step: '01', title: 'Search Any Ticker',     desc: 'Type any US stock symbol or company name. Our predictive search finds the exact ticker instantly.' },
            { step: '02', title: 'AI Analyzes Everything', desc: 'Claude AI scans technicals, options flow, fundamentals, news, and 15+ global markets simultaneously.' },
            { step: '03', title: 'Get Exact Signals',      desc: 'Receive a BUY/SELL/HOLD signal with exact entry price, price target, stop loss, and AI thesis.' },
            { step: '04', title: 'Trade With Confidence',  desc: 'Use the trade checklist for GO/NO-GO verdict, then simulate P&L before placing any trade.' },
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
                Our system analyzes any US stock or options contract using technical indicators
                (RSI, SMA20, SMA50, SMA200, volume), real-time options flow data, company
                fundamentals, news sentiment, and global macro conditions across 15+ markets.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                Every recommendation includes the exact entry price, price target, and stop loss —
                not vague directional bias. The AI factors in bond yields, yield curve shape,
                VIX fear index, DXY dollar strength, gold, oil, and international markets
                across Asia and Europe before generating any signal.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                Options analysis uses real-time chain data with Black-Scholes pricing,
                implied volatility ranking, Greeks dashboard (Delta, Gamma, Theta, Vega, Rho),
                and a 7-point trade checklist that gives a GO or NO-GO verdict before every trade.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8 }}>
                Free tier includes 10 stock scans and 5 options analyses per day.
                Pro plan at $15/month provides unlimited access to all features
                including all 4 timeframes and priority AI processing.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: '🤖', label: 'AI Engine',      value: 'Claude Sonnet by Anthropic',    color: '#00ff88' },
                { icon: '📈', label: 'Options Data',   value: 'Tradier — Real-time chains',    color: '#ffaa00' },
                { icon: '📊', label: 'Stock History',  value: 'Tradier — OHLCV + quotes',      color: '#4488ff' },
                { icon: '🌍', label: 'Macro Data',     value: 'Polygon — 15+ global markets',  color: '#ff8844' },
                { icon: '🔒', label: 'Your Privacy',   value: 'No data sold — ever',           color: '#aa44ff' },
                { icon: '💰', label: 'Pricing',        value: 'Free tier · Pro $15/mo',        color: '#00ff88' },
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
          You may lose your entire investment. Always do your own research and consult a licensed
          financial advisor before trading.
        </div>
        <div style={{ fontSize: 10, color: '#1e1e2e', marginTop: 12 }}>
          © {new Date().getFullYear()} QuAInt Signal · Built with Claude AI · 
          <span style={{ marginLeft: 8 }}>Free to start · Pro at $15/mo</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}