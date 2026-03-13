import { useEffect, useState } from 'react';

const TICKERS = [
  { sym: 'SPY',   price: '669.42', up: true  },
  { sym: 'AAPL',  price: '189.30', up: false },
  { sym: 'NVDA',  price: '875.20', up: true  },
  { sym: 'TSLA',  price: '242.10', up: false },
  { sym: 'QQQ',   price: '445.80', up: true  },
  { sym: 'MSFT',  price: '415.60', up: true  },
  { sym: 'AMZN',  price: '198.40', up: false },
  { sym: 'META',  price: '523.10', up: true  },
  { sym: 'GOOGL', price: '171.90', up: false },
  { sym: 'AMD',   price: '162.30', up: true  },
];

const FEATURES = [
  {
    icon: '🎯',
    title: 'AI Options Plays',
    desc: 'Get exact entry price, exit price, and stop loss for CALL and PUT options — powered by Claude AI with global macro context.',
    tab: 'options',
    color: '#00ff88',
  },
  {
    icon: '📡',
    title: 'Market Scanner',
    desc: 'Scan any ticker for BUY/SELL/HOLD signals with RSI, SMA, volume, and institutional flow analysis.',
    tab: 'scanner',
    color: '#ffaa00',
  },
  {
    icon: '🌍',
    title: 'Global Macro',
    desc: 'Live bond yields, Asia/Europe markets, VIX, DXY, gold, and oil — all factored into every trade recommendation.',
    tab: 'markets',
    color: '#4488ff',
  },
  {
    icon: '📓',
    title: 'Trade Journal',
    desc: 'Log every trade, track your win rate, P&L, and average win vs loss. Know your real performance.',
    tab: 'journal',
    color: '#ff8844',
  },
  {
    icon: '✅',
    title: 'Trade Checklist',
    desc: 'AI-powered GO/NO-GO verdict before every trade. 7 checks including trend, RSI, macro, IV, and earnings risk.',
    tab: 'options',
    color: '#aa44ff',
  },
  {
    icon: '❓',
    title: 'Help & Guide',
    desc: 'New to options? Step-by-step interactive guide covering everything from reading contracts to using the P&L simulator.',
    tab: 'help',
    color: '#ff4488',
  },
];

const STEPS = [
  { title: 'Enter a Ticker',     desc: 'Type any stock symbol in the Options tab and click FIND OPTIONS PLAYS.' },
  { title: 'Review AI Analysis', desc: 'Get exact entry/exit prices, macro context, and a GO/NO-GO checklist.' },
  { title: 'Trade & Track',      desc: 'Execute your trade, log it in the Journal, and track your performance over time.' },
];

export default function WelcomePage({ onEnter, onNavigate }) {
  const [tickIdx, setTickIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const interval = setInterval(() => {
      setTickIdx(i => (i + 1) % TICKERS.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const handleNavigate = (tab) => {
    onNavigate(tab);
    onEnter();
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#08080f',
      display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease',
    }}>

      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', padding: '80px 40px 60px', flex: '0 0 auto' }}>
        <div style={{
          display: 'inline-block', fontSize: 10, letterSpacing: '0.3em',
          color: '#ffaa0088', border: '1px solid #ffaa0033',
          padding: '4px 16px', marginBottom: 24, borderRadius: 2,
        }}>
          AI-POWERED OPTIONS TRADING
        </div>

        <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(60px, 10vw, 120px)',
            lineHeight: 0.9, letterSpacing: '0.05em',
            marginBottom: 24,
            }}>
                <span style={{ color: '#ffaa00' }}>QU</span>
                <span style={{ color: '#00ff88' }}>AI</span>
                <span style={{ color: '#ffaa00' }}>NT</span>
                <br />
                <span style={{ color: '#ffaa00' }}>SIGNAL</span>
                </div>
        <div style={{ fontSize: 18, color: '#8899aa', marginBottom: 12, fontWeight: 300 }}>
          Institutional-grade options analysis for every trader
        </div>
        <div style={{ fontSize: 13, color: '#556', maxWidth: 500, margin: '0 auto 48px', lineHeight: 1.8 }}>
          Real-time AI signals · Global macro context · Exact entry & exit prices · Trade journaling
        </div>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 48 }}>
          <button
            className="btn"
            onClick={onEnter}
            style={{ fontSize: 14, padding: '14px 40px', background: '#ffaa0022', borderColor: '#ffaa00', color: '#ffaa00' }}>
            ENTER APP →
          </button>
          <button
            className="btn"
            onClick={() => handleNavigate('help')}
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

      {/* ── How it works ── */}
      <div style={{ padding: '0 40px 60px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', fontSize: 10, color: '#ffaa0066',
          letterSpacing: '0.3em', marginBottom: 24 }}>HOW IT WORKS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '24px 20px',
              background: '#0f0f18', border: '1px solid #1e1e2e', borderRadius: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#c8c8d0', marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: '#556', lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature highlights ── */}
      <div style={{ padding: '0 40px 60px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', fontSize: 10, color: '#ffaa0066',
          letterSpacing: '0.3em', marginBottom: 24 }}>FEATURES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              onClick={() => handleNavigate(f.tab)}
              style={{
                padding: '20px', background: '#0f0f18',
                border: `1px solid ${f.color}22`,
                borderTop: `3px solid ${f.color}`,
                borderRadius: 4, cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#141420'}
              onMouseLeave={e => e.currentTarget.style.background = '#0f0f18'}
            >
              <div style={{ fontSize: 24, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: f.color, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: '#556', lineHeight: 1.6, marginBottom: 12 }}>{f.desc}</div>
              <div style={{ fontSize: 10, color: f.color + '88' }}>OPEN {f.title.toUpperCase()} →</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── About Us ── */}
      <div style={{ padding: '60px 40px', background: '#0a0a14', borderTop: '1px solid #1e1e2e' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', fontSize: 10, color: '#ffaa0066',
            letterSpacing: '0.3em', marginBottom: 32 }}>ABOUT US</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36,
                color: '#ffaa00', lineHeight: 1.1, marginBottom: 16 }}>
                BUILT FOR TRADERS<br />BY TRADERS
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                Quant Signal was built out of frustration with expensive, complex trading tools
                that assume you already know everything. We wanted something that combines
                institutional-level analysis with plain English explanations anyone can follow.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8, marginBottom: 16 }}>
                Every recommendation includes the exact entry price, exit price, and stop loss —
                no vague "the stock looks bullish" nonsense. Just clear, actionable plays backed
                by AI analysis of technicals, global macro, and real-time options flow.
              </div>
              <div style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.8 }}>
                Whether you're placing your first options trade or your thousandth, Quant Signal
                gives you the same data institutional desks use — without the six-figure subscription.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: '🤖', label: 'AI Engine',    value: 'Claude Sonnet by Anthropic',      color: '#00ff88' },
                { icon: '📈', label: 'Options Data', value: 'Tradier — Real-time chains',       color: '#ffaa00' },
                { icon: '📊', label: 'Market Data',  value: 'Yahoo Finance — Live quotes',      color: '#4488ff' },
                { icon: '🌍', label: 'Macro Data',   value: 'Global bonds, FX, commodities',    color: '#ff8844' },
                { icon: '🔒', label: 'Your Data',    value: 'Journal stored locally — private', color: '#aa44ff' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: '#0f0f18', border: `1px solid ${item.color}22`,
                  padding: '12px 16px', borderRadius: 4,
                  borderLeft: `3px solid ${item.color}`,
                }}>
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

      {/* ── Risk disclaimer + footer ── */}
      <div style={{ padding: '24px 40px', borderTop: '1px solid #1a1a2e', textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: '#2a2a3e', maxWidth: 700, margin: '0 auto', lineHeight: 1.8 }}>
          ⚠ RISK DISCLAIMER: Quant Signal is an educational and analytical tool only. Nothing on this
          platform constitutes financial advice, investment advice, or a recommendation to buy or sell
          any security. Options trading involves significant risk and is not suitable for all investors.
          You may lose your entire investment. Always do your own research and consult a licensed
          financial advisor before trading.
        </div>
        <div style={{ fontSize: 10, color: '#1e1e2e', marginTop: 12 }}>
          © {new Date().getFullYear()} Quant Signal · Built with Claude AI
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}