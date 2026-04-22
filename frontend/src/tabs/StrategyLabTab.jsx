import { useState } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

const SIGNAL_COLORS = {
  BUY:     '#00ff88',
  SELL:    '#ff4444',
  WATCH:   '#ffaa00',
  NEUTRAL: '#7788aa',
  MIXED:   '#ffaa00',
  AVOID:   '#ff4444',
  CASH:    '#7788aa',
  HOLD:    '#7788aa',
  INSUFFICIENT_DATA: '#3a3a5a',
};

const STRATEGY_META = {
  dualMomentum:     { name: 'Dual Momentum',          icon: '🔄', author: 'Antonacci (2012)'      },
  rsi2Reversion:    { name: 'RSI(2) Mean Reversion',  icon: '📉', author: 'Connors Research'      },
  bbSqueeze:        { name: 'BB Squeeze Breakout',     icon: '🔥', author: 'Carter (2005)'         },
  peadDrift:        { name: 'Post-Earnings Drift',     icon: '📊', author: 'Bernard & Thomas (1989)'},
  fiftyTwoWeekHigh: { name: '52-Week High Momentum',   icon: '🏔️', author: 'George & Hwang (2004)' },
};

function SignalBadge({ signal }) {
  const color = SIGNAL_COLORS[signal] || '#7788aa';
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
      color, background: `${color}18`, border: `1px solid ${color}44`,
      borderRadius: 3, padding: '2px 8px',
    }}>{signal}</span>
  );
}

function ConfidenceBar({ confidence, signal }) {
  const color = SIGNAL_COLORS[signal] || '#7788aa';
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em' }}>CONFIDENCE</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{confidence}%</span>
      </div>
      <div style={{ background: '#1a1a2e', borderRadius: 2, height: 4 }}>
        <div style={{ width: `${confidence}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function StrategyCard({ stratKey, data }) {
  const [expanded, setExpanded] = useState(false);
  const meta  = STRATEGY_META[stratKey] || { name: stratKey, icon: '📈', author: '' };
  const color = SIGNAL_COLORS[data.signal] || '#7788aa';

  if (data.signal === 'INSUFFICIENT_DATA') {
    return (
      <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, padding: '14px 16px', opacity: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{meta.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0' }}>{meta.name}</div>
              <div style={{ fontSize: 10, color: '#556677', marginTop: 1 }}>{meta.author}</div>
            </div>
          </div>
          <span style={{ fontSize: 11, color: '#556677' }}>Insufficient data</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#0f0f1a', border: `1px solid ${color}22`,
      borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
      transition: 'border-color 0.2s',
    }} onClick={() => setExpanded(e => !e)}>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{meta.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0' }}>{meta.name}</div>
              <div style={{ fontSize: 10, color: '#556677', marginTop: 1 }}>{meta.author}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <SignalBadge signal={data.signal} />
            <div style={{ fontSize: 10, color: '#556677', marginTop: 4 }}>{data.timeframe}</div>
          </div>
        </div>
        <ConfidenceBar confidence={data.confidence} signal={data.signal} />
        <div style={{ fontSize: 12, color: '#b0c0dd', marginTop: 10, lineHeight: 1.6 }}>
          {data.reasoning}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #1a1a2e', padding: '12px 16px', background: '#07070e' }}>
          <div style={{ fontSize: 10, color: '#556677', letterSpacing: '0.12em', marginBottom: 8 }}>SIGNAL DETAILS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(data.details || {}).map(([k, v]) => (
              v !== null && v !== undefined ? (
                <div key={k} style={{ background: '#0f0f1a', border: '1px solid #2a2a40', borderRadius: 4, padding: '4px 10px' }}>
                  <span style={{ fontSize: 9, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k.replace(/([A-Z])/g,' $1').trim()} </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#c8d8f0' }}>
                    {typeof v === 'boolean' ? (v ? '✓' : '✗') : v}
                  </span>
                </div>
              ) : null
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: '#3a4a5a', fontStyle: 'italic' }}>
            📚 {data.academic}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StrategyLabTab({ market = 'US' }) {
  const [ticker,   setTicker]   = useState('');
  const [input,    setInput]    = useState('');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const run = async () => {
    const t = input.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res  = await fetch(`${BASE}/strategy/${t}?market=${market}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json); setTicker(t);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const aggColor = data ? (SIGNAL_COLORS[data.aggregate?.overallSignal] || '#7788aa') : '#ffaa00';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

      {/* Header */}
      <div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#ffaa00', letterSpacing: '0.08em' }}>
          ⚗️ STRATEGY LAB
        </div>
        <div style={{ fontSize: 'var(--fs-lg)', color: '#99aacc', marginTop: 2 }}>
          5 academic algo strategies — run on any {market === 'INDIA' ? 'NSE' : 'US'} ticker
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder={market === 'INDIA' ? 'Enter NSE symbol e.g. RELIANCE' : 'Enter ticker e.g. AAPL'}
          style={{
            flex: 1, background: '#0f0f1a', border: '1px solid #2a2a40',
            borderRadius: 6, padding: '10px 14px', color: '#e8e8f0',
            fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button onClick={run} disabled={loading} style={{
          padding: '10px 20px', background: '#ffaa0022', border: '1px solid #ffaa0044',
          borderRadius: 6, color: '#ffaa00', fontFamily: 'inherit', fontSize: 13,
          fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          letterSpacing: '0.08em', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? 'RUNNING...' : 'RUN STRATEGIES'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: '#ff4444', background: '#ff444411', border: '1px solid #ff444433', borderRadius: 4, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {/* Strategy descriptions (before results) */}
      {!data && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {Object.entries(STRATEGY_META).map(([key, meta]) => (
            <div key={key} style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{meta.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e8e8f0', marginBottom: 3 }}>{meta.name}</div>
              <div style={{ fontSize: 10, color: '#556677' }}>{meta.author}</div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Aggregate */}
          <div style={{
            background: '#0f0f1a', border: `1px solid ${aggColor}33`,
            borderRadius: 8, padding: '16px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#ffaa00', letterSpacing: '0.08em' }}>
                {ticker} — AGGREGATE SIGNAL
              </div>
              <div style={{ fontSize: 12, color: '#7788aa', marginTop: 3 }}>
                {data.aggregate.bullish} bullish · {data.aggregate.bearish} bearish · {data.aggregate.neutral} neutral · avg confidence {data.aggregate.avgConfidence}%
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: aggColor, letterSpacing: '0.05em' }}>
                {data.aggregate.overallSignal}
              </div>
            </div>
          </div>

          {/* Individual strategies */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(data.strategies).map(([key, strategy]) => (
              <StrategyCard key={key} stratKey={key} data={strategy} />
            ))}
          </div>

          <div style={{ fontSize: 11, color: '#3a4a5a', textAlign: 'center', lineHeight: 1.7 }}>
            Click any strategy card to expand signal details · Academic sources cited for each strategy<br/>
            These are systematic rules-based signals — not financial advice
          </div>
        </>
      )}
    </div>
  );
}