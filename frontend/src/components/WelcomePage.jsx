import { useEffect, useState } from 'react';


const FEATURES = [
  { icon: '⚡', title: 'AI Options Plays',    desc: 'Get exact entry price, exit price, and stop loss for CALL and PUT options — powered by Claude AI with global macro context.', tab: 'options',  color: '#00ff88' },
  { icon: '📡', title: 'Stock Scanner',       desc: 'Scan any ticker for BUY/SELL/HOLD signals with RSI, SMA, volume, and institutional flow analysis. Know when to buy and when to stay out.', tab: 'scanner',  color: '#ffaa00' },
  { icon: '🌍', title: 'Global Macro',        desc: 'Live bond yields, Asia/Europe markets, VIX, DXY, gold, and oil — all factored into every recommendation so you trade with the market, not against it.', tab: 'markets',  color: '#4488ff' },
  { icon: '📐', title: 'Options Models',      desc: 'Black-Scholes pricer, IV calculator, Greeks dashboard, volatility surface, and strategy backtester — all the tools pros use, simplified.', tab: 'models',   color: '#ff8844' },
  { icon: '✅', title: 'Trade Checklist',     desc: 'AI-powered GO/NO-GO verdict before every trade. 7 checks including trend, RSI, macro, IV, and earnings risk — never trade blind again.', tab: 'options',  color: '#aa44ff' },
  { icon: '❓', title: 'Help & Guide',        desc: 'New to investing? Step-by-step interactive guide covering everything from reading charts to understanding options contracts.', tab: 'help',     color: '#ff4488' },
];

export default function WelcomePage({ onEnter, onNavigate }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const interval = setInterval(() => setTickIdx(i => (i + 1) % TICKERS.length), 1800);
    return () => clearInterval(interval);
  }, []);

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
        <div style={{ fontSize: 13, color: '#556', maxWidth: 540, margin: '0 auto 40px', lineHeight: 1.8 }}>
          Real-time AI signals · Global macro context · Exact entry & exit prices · Options analysis · Risk management
        </div>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
          <button className="btn" onClick={onEnter}
            style={{ fontSize: 14, padding: '14px 40px', background: '#ffaa0022', borderColor: '#ffaa00', color: '#ffaa00' }}>
            ENTER APP →
          </button>
          <button className="btn" onClick={() => handleNavigate('help')}
            style={{ fontSize: 14, padding: '14px 40px' }}>
            HOW IT WORKS
          </button>
        </div>

        {/* Live ticker spotlight */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12,
          background: '#0f0f18', border: '1px solid #1e1e2e', padding: '10px 20px', borderRadius: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88',
            boxShadow: '0 0 8px #00ff88', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 11, color: '#445' }}>LIVE</span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#ffaa00',
            transition: 'all 0.3s', minWidth: 60 }}>{TICKERS[tickIdx].sym}</span>
          <span style={{ fontSize: 13, color: TICKERS[tickIdx].up ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
            ${TICKERS[tickIdx].price} {TICKERS[tickIdx].up ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* ── Value props ── */}
      <div style={{ padding: '0 40px 40px', maxWidth: 900, margin: '0 auto', width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { icon: '🤖', title: 'AI-Powered',       desc: 'Claude AI analyzes technicals, macro, and options flow together' },
            { icon: '📊', title: 'Stocks + Options',  desc: 'BUY/SELL signals for stocks AND exact options plays with entry/exit' },
            { icon: '🌍', title: 'Global Context',    desc: 'Every signal factors in bonds, VIX, Asia/Europe markets and more' },
            { icon: '🎯', title: 'Actionable',        desc: 'No vague signals — exact strike, premium, entry price, stop loss' },
          ].map((v, i) => (
            <div key={i} style={{ background: '#0f0f18', border: '1px solid #1e1e2e', padding: '20px 16px', borderRadius: 4 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{v.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffaa00', marginBottom: 6 }}>{v.title}</div>
              <div style={{ fontSize: 11, color: '#556', lineHeight: 1.6 }}>{v.desc}</div>
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
              <div style={{ fontSize: 11, color: '#556', lineHeight: 1.6, marginBottom: 12 }}>{f.desc}</div>
              <div style={{ fontSize: 10, color: f.color + '88' }}>OPEN {f.title.toUpperCase()} →</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── About Us ── */}
      <div className="welcome-about">
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', fontSize: 10, color: '#ffaa0066', letterSpacing: '0.3em', marginBottom: 32 }}>ABOUT</div>
          <div className="welcome-about-grid">
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(24px, 4vw, 36px)',
                color: '#ffaa00', lineHeight: 1.1, marginBottom: 16 }}>
                YOUR AI INVESTING<br />BUDDY
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                QuAInt Signal was built out of frustration with expensive, complex trading tools
                that assume you already know everything. We wanted something that combines
                institutional-level analysis with plain English explanations anyone can follow.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                Whether you're scanning stocks for swing trades or looking for the best options play,
                every recommendation includes the exact entry price, exit price, and stop loss —
                no vague "the stock looks bullish" nonsense. Just clear, actionable intelligence
                backed by AI analysis of technicals, global macro, and real-time options flow.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8 }}>
                Whether you're placing your first trade or your thousandth, QuAInt Signal
                gives you the same data institutional desks use — without the six-figure subscription.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: '🤖', label: 'AI Engine',      value: 'Claude Sonnet by Anthropic',   color: '#00ff88' },
                { icon: '📈', label: 'Options Data',   value: 'Tradier — Real-time chains',   color: '#ffaa00' },
                { icon: '📊', label: 'Stock History',  value: 'Tradier — OHLCV + quotes',     color: '#4488ff' },
                { icon: '🌍', label: 'Macro Data',     value: 'Polygon — Global ETF proxies', color: '#ff8844' },
                { icon: '🔒', label: 'Your Privacy',   value: 'No accounts required — free',  color: '#aa44ff' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14,
                  background: '#0f0f18', border: `1px solid ${item.color}22`,
                  padding: '12px 16px', borderRadius: 4, borderLeft: `3px solid ${item.color}` }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.1em', marginBottom: 2 }}>{item.label}</div>
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
          © {new Date().getFullYear()} QuAInt Signal · Built with Claude AI
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}