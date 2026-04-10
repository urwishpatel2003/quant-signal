import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';

const BASE = import.meta.env.VITE_API_BASE;

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt  = n => n == null ? '—' : Number(n).toLocaleString('en-US');
const fmtD = n => n == null ? '—' : `$${Number(n).toLocaleString('en-US')}`;
const fmtM = n => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtPct = n => n == null ? '—' : `${n}%`;

const RISK_COLORS = {
  Conservative: '#4488ff', Moderate: '#ffaa00',
  Aggressive: '#ff8844', 'Very Aggressive': '#ff4444',
};
const ASSET_COLORS = {
  'US Equity': '#ffaa00', 'International Equity': '#4488ff',
  'Bonds': '#00ff88', 'Real Estate': '#aa44ff',
  'Commodities': '#ff8844', 'Cash': '#556677',
};
const ACCOUNT_COLORS = {
  '401k': '#ffaa00', 'Roth IRA': '#00ff88', 'Traditional IRA': '#4488ff',
  'HSA': '#aa44ff', 'Taxable Brokerage': '#ff8844', '529': '#ff4444',
};

function Pill({ label, color = '#ffaa00', small }) {
  return (
    <span style={{
      display: 'inline-block', padding: small ? '1px 6px' : '2px 10px',
      borderRadius: 4, fontSize: small ? 'var(--fs-xs)' : 'var(--fs-sm)',
      background: color + '18', border: `1px solid ${color}44`,
      color, fontWeight: 700, letterSpacing: '0.04em',
    }}>{label}</span>
  );
}

function Section({ title, children, accent = '#ffaa00' }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: "'Bebas Neue',sans-serif", fontSize: 'var(--fs-lg)', color: accent,
        letterSpacing: '.12em', marginBottom: 10, paddingBottom: 6,
        borderBottom: `1px solid ${accent}22`,
      }}>{title}</div>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color = '#c8d8f0', accent }) {
  return (
    <div style={{
      background: '#0c0c18', borderRadius: 6, padding: '10px 12px',
      border: `1px solid ${accent ? accent + '33' : '#1a1a2e'}`,
      borderTop: accent ? `2px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0', letterSpacing: '.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--fs-xs)', color: '#b0c0dd', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function AllocationBar({ allocation }) {
  const items = [
    { key: 'usEquity',            label: 'US Equity',     color: ASSET_COLORS['US Equity'] },
    { key: 'internationalEquity', label: 'Intl',          color: ASSET_COLORS['International Equity'] },
    { key: 'bonds',               label: 'Bonds',         color: ASSET_COLORS['Bonds'] },
    { key: 'realEstate',          label: 'REIT',          color: ASSET_COLORS['Real Estate'] },
    { key: 'commodities',         label: 'Commodities',   color: ASSET_COLORS['Commodities'] },
    { key: 'cash',                label: 'Cash',          color: ASSET_COLORS['Cash'] },
  ].filter(i => (allocation[i.key] || 0) > 0);

  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
        {items.map(i => (
          <div key={i.key} style={{ width: `${allocation[i.key]}%`, background: i.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map(i => (
          <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-xs)', color: '#c8d8f0' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: i.color, flexShrink: 0 }} />
            {i.label} {allocation[i.key]}%
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldingCard({ h, currency = '$' }) {
  const [open, setOpen] = useState(false);
  const acColor = ACCOUNT_COLORS[h.accountPlacement] || '#ffaa00';
  const asColor = ASSET_COLORS[h.assetClass] || '#8899bb';

  return (
    <div style={{
      background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8,
      overflow: 'hidden', marginBottom: 8,
    }}>
      {/* Row */}
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        cursor: 'pointer',
      }}>
        {/* Ticker + name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'var(--fs-lg)', color: '#ffaa00' }}>{h.ticker}</span>
            <Pill label={h.type} color={asColor} small />
            <Pill label={h.accountPlacement} color={acColor} small />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: '#b0c0dd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
        </div>
        {/* Allocation + amount */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, fontWeight: 700, color: '#ffaa00' }}>{h.allocation}%</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: '#b0c0dd' }}>{fmtM(h.monthlyAmount)}/mo</div>
        </div>
        <div style={{ color: '#7788aa', fontSize: 12, flexShrink: 0 }}>{open ? '▲' : '▼'}</div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #12121e' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, margin: '12px 0' }}>
            <StatCard label="EXP RATIO"   value={h.expenseRatio}  color="#c8d8f0" />
            <StatCard label="EST RETURN"  value={h.expectedReturn} color="#00ff88" />
            <StatCard label="DIV YIELD"   value={h.dividendYield}  color="#4488ff" />
            <StatCard label="ASSET CLASS" value={h.assetClass?.replace(' Equity','')} color={asColor} />
          </div>
          <div style={{ fontSize: 'var(--fs-body)', color: '#c8d8f0', lineHeight: 1.6, marginBottom: 10 }}>
            {h.rationale}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#00ff88', letterSpacing: '.08em', marginBottom: 4 }}>PROS</div>
              {h.pros?.map((p, i) => (
                <div key={i} style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0', marginBottom: 2 }}>✓ {p}</div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#ff4444', letterSpacing: '.08em', marginBottom: 4 }}>CONS</div>
              {h.cons?.map((c, i) => (
                <div key={i} style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0', marginBottom: 2 }}>⚠ {c}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RetirementChart({ proj }) {
  if (!proj) return null;
  const years = proj.retirementAge - proj.currentAge;
  const milestones = [0.25, 0.5, 0.75, 1].map(pct => ({
    year: Math.round(years * pct),
    age: Math.round(proj.currentAge + years * pct),
    balance: Math.round(proj.projectedBalance * pct * pct), // rough quadratic growth
  }));
  milestones[milestones.length - 1].balance = proj.projectedBalance;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <StatCard label="PROJECTED BALANCE" value={fmtD(proj.projectedBalance)} color="#00ff88" accent="#00ff88" />
        <StatCard label="MONTHLY INCOME" value={fmtD(proj.monthlyRetirementIncome)} color="#ffaa00" />
        <StatCard label="SOC SECURITY EST" value={fmtD(proj.socialSecurityEstimate)} color="#4488ff" />
        <StatCard label="TOTAL/MONTH" value={fmtD(proj.totalMonthlyInRetirement)} color="#c8d8f0" />
      </div>
      {/* Progress bar timeline */}
      <div style={{ position: 'relative', height: 48, background: '#0c0c18', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: '100%', background: 'linear-gradient(90deg, #ffaa0022, #00ff8833)',
          borderRadius: 6,
        }} />
        {milestones.map((m, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${(m.year / years) * 100}%`,
            top: 0, bottom: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 1, height: '100%', background: '#ffffff11', position: 'absolute' }} />
            <div style={{ fontSize: 9, color: '#c8d8f0', whiteSpace: 'nowrap', zIndex: 1 }}>Age {m.age}</div>
            <div style={{ fontSize: 10, color: '#b0c0dd', fontWeight: 700, zIndex: 1 }}>
              {m.balance >= 1000000 ? `$${(m.balance/1000000).toFixed(1)}M` : `$${Math.round(m.balance/1000)}k`}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: '#b0c0dd' }}>
        Assumes {proj.assumedReturn} annual return · Retirement at age {proj.retirementAge} · Contributions of {fmtD(proj.monthlyContribution)}/month
      </div>
    </div>
  );
}

// ── Chat Component ─────────────────────────────────────────────────────────────
function ChatIntake({ monthlyBudget, payFrequency = 'monthly', onComplete }) {
  const GREETING = `Hi! I'm Max, your US portfolio advisor. I'll ask you a few quick questions to build your personalized investment plan.\n\nLet's start — how old are you, and are you employed (W-2), self-employed, or retired?`;

  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [started, setStarted]     = useState(false);
  const [retrying, setRetrying]   = useState(false);
  const bottomRef                 = useRef(null);

  const scroll = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);

  const callAPI = useCallback(async (history, attempt = 1) => {
    const res = await fetch(`${BASE}/api/us-portfolio/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, monthlyBudget, payFrequency }),
    });
    const data = await res.json();
    if (data.error) {
      // Retry on overload up to 3 times with backoff
      if ((data.error.includes('overload') || data.error.includes('529') || res.status === 529) && attempt < 3) {
        setRetrying(true);
        await new Promise(r => setTimeout(r, 2000 * attempt));
        setRetrying(false);
        return callAPI(history, attempt + 1);
      }
      throw new Error(data.error);
    }
    return data;
  }, [monthlyBudget, payFrequency]);

  const send = useCallback(async (history) => {
    setLoading(true);
    try {
      const data    = await callAPI(history);
      const updated = [...history, { role: 'assistant', content: data.message }];
      setMessages(updated);
      scroll();
      if (data.done) setTimeout(() => onComplete(updated), 600);
    } catch (e) {
      const msg = e.message?.toLowerCase().includes('overload')
        ? "Max is busy right now — the AI is overloaded. Please wait a moment and try again."
        : `Something went wrong: ${e.message}`;
      setMessages(m => [...m, { role: 'assistant', content: msg }]);
    } finally {
      setLoading(false);
    }
  }, [callAPI, onComplete]);

  const start = useCallback(() => {
    setStarted(true);
    // Show hardcoded greeting instantly — no API call needed for the opener
    const initialHistory = [
      { role: 'user',      content: 'Hi, I want to start investing and building wealth.' },
      { role: 'assistant', content: GREETING },
    ];
    setMessages(initialHistory);
    scroll();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    const updated = [...messages, { role: 'user', content: userMsg }];
    setMessages(updated);
    setInput('');
    scroll();
    await send(updated);
  };

  if (!started) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🇺🇸</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#ffaa00', letterSpacing: '.1em', marginBottom: 8 }}>
          MEET MAX — YOUR US PORTFOLIO ADVISOR
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', color: '#b0c0dd', lineHeight: 1.7, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
          Max will ask you a few questions about your financial situation, goals, and risk tolerance — then generate a detailed personalized portfolio with ETF picks, account strategy, tax optimization, and retirement projections.
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: '#b0c0dd', marginBottom: 20 }}>
          Monthly investment budget: <strong style={{ color: '#ffaa00' }}>{fmtD(monthlyBudget)}/month</strong>
        </div>
        <button onClick={start} style={{
          background: '#ffaa00', color: '#07070e', border: 'none',
          padding: '12px 32px', borderRadius: 6, cursor: 'pointer',
          fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: '.1em',
        }}>START INTAKE</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '60vh', minHeight: 400 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {m.role === 'assistant' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ffaa0022', border: '1px solid #ffaa0044', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginRight: 8, flexShrink: 0 }}>M</div>
            )}
            <div style={{
              maxWidth: '78%', padding: '10px 14px', borderRadius: 12,
              background: m.role === 'user' ? '#ffaa0022' : '#0f0f1a',
              border: `1px solid ${m.role === 'user' ? '#ffaa0044' : '#1a1a2e'}`,
              fontSize: 'var(--fs-body)', color: '#c8d8f0', lineHeight: 1.6,
              borderBottomRightRadius: m.role === 'user' ? 4 : 12,
              borderBottomLeftRadius: m.role === 'assistant' ? 4 : 12,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ffaa0022', border: '1px solid #ffaa0044', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>M</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffaa00', opacity: 0.6,
                    animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
                ))}
              </div>
              {retrying && <div style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0' }}>Retrying — API busy...</div>}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {/* Input */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid #1a1a2e' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Type your answer..."
          disabled={loading}
          style={{
            flex: 1, background: '#0f0f1a', border: '1px solid #2a2a3e',
            borderRadius: 6, padding: '10px 14px', color: '#e8e8f0',
            fontSize: 'var(--fs-sm)', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()} style={{
          background: '#ffaa00', color: '#07070e', border: 'none',
          borderRadius: 6, padding: '10px 18px', cursor: 'pointer',
          fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, flexShrink: 0,
          opacity: loading || !input.trim() ? 0.4 : 1,
        }}>SEND</button>
      </div>
    </div>
  );
}

// ── Portfolio Result ───────────────────────────────────────────────────────────
function PortfolioResult({ result, monthlyBudget, onReset, saved }) {
  const p = result;
  if (!p) return null;
  const riskColor = RISK_COLORS[p.investorProfile?.riskLabel] || '#ffaa00';

  return (
    <div>
      {/* Header */}
      <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#ffaa00', letterSpacing: '.1em', marginBottom: 4 }}>
              YOUR US PORTFOLIO
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={p.investorProfile?.riskLabel} color={riskColor} />
              <Pill label={p.investorProfile?.goal} color="#4488ff" />
              <Pill label={p.investorProfile?.horizon} color="#8899bb" />
              <Pill label={`Tax: ${p.investorProfile?.taxBracket}`} color="#aa44ff" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saved && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', color: '#00ff8899' }}>
                <span>✓</span> Auto-saved
              </div>
            )}
            <button onClick={onReset} style={{
              padding: '7px 14px', background: 'transparent', border: '1px solid #ff444433',
              color: '#ff444488', borderRadius: 5, cursor: 'pointer', fontSize: 'var(--fs-xs)',
              fontFamily: 'inherit',
            }}>↺ START OVER</button>
          </div>
        </div>
        <div style={{ fontSize: 'var(--fs-body)', color: '#c8d8f0', lineHeight: 1.7 }}>{p.summary}</div>
      </div>

      {/* Key Stats */}
      <Section title="📊 PORTFOLIO OVERVIEW">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <StatCard label="MONTHLY INVEST" value={fmtD(monthlyBudget)} color="#ffaa00" accent="#ffaa00" />
          <StatCard label="EXP ANNUAL RETURN" value={p.riskAssessment?.expectedAnnualReturn} color="#00ff88" accent="#00ff8844" />
          <StatCard label="MAX DRAWDOWN" value={p.riskAssessment?.maxDrawdown} color="#ff4444" />
          <StatCard label="VOLATILITY" value={p.riskAssessment?.volatility} color="#4488ff" />
        </div>
        <AllocationBar allocation={p.assetAllocation || {}} />
      </Section>

      {/* Account Strategy */}
      {p.accountPlan?.length > 0 && (
        <Section title="🏦 ACCOUNT STRATEGY">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.accountPlan.sort((a, b) => a.priority - b.priority).map((ac, i) => {
              const color = ACCOUNT_COLORS[ac.accountType] || '#ffaa00';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#0a0a14', border: `1px solid ${color}22`, borderRadius: 7,
                  padding: '10px 14px',
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', background: color + '22',
                    border: `1px solid ${color}44`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 11, fontWeight: 700, color, flexShrink: 0,
                  }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'var(--fs-lg)', color }}>{ac.accountType}</span>
                      <Pill label={ac.taxBenefit} color={color} small />
                      {ac.annualLimit && <span style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0' }}>limit: {fmtD(ac.annualLimit)}/yr</span>}
                    </div>
                    <div style={{ fontSize: 'var(--fs-sm)', color: '#b0c0dd' }}>{ac.rationale}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color }}>{fmtD(ac.monthlyContribution)}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: '#b0c0dd' }}>per month</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Holdings */}
      {p.holdings?.length > 0 && (
        <Section title="📈 HOLDINGS — TAP TO EXPAND">
          {p.holdings.map((h, i) => <HoldingCard key={i} h={h} />)}
        </Section>
      )}

      {/* Retirement Projection */}
      {p.retirementProjection && (
        <Section title="🎯 RETIREMENT PROJECTION" accent="#00ff88">
          <RetirementChart proj={p.retirementProjection} />
        </Section>
      )}

      {/* Tax Strategy */}
      {p.taxStrategy && (
        <Section title="💰 TAX OPTIMIZATION STRATEGY" accent="#aa44ff">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Account Placement', text: p.taxStrategy.accountPlacementStrategy },
              { label: 'Tax-Loss Harvesting', text: p.taxStrategy.taxLossHarvesting },
              { label: 'Roth Conversion', text: p.taxStrategy.rothConversion },
              { label: 'Capital Gains', text: p.taxStrategy.capitalGains },
            ].filter(t => t.text).map((t, i) => (
              <div key={i} style={{ background: '#0a0a14', border: '1px solid #aa44ff22', borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#aa44ff', letterSpacing: '.08em', marginBottom: 4 }}>{t.label.toUpperCase()}</div>
                <div style={{ fontSize: 'var(--fs-body)', color: '#c8d8f0', lineHeight: 1.6 }}>{t.text}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Monthly Plan */}
      {p.monthlyPlan?.breakdown?.length > 0 && (
        <Section title="📅 MONTHLY INVESTMENT PLAN">
          <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, overflow: 'hidden' }}>
            {p.monthlyPlan.breakdown.map((row, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderBottom: i < p.monthlyPlan.breakdown.length - 1 ? '1px solid #12121e' : 'none',
                background: i % 2 === 0 ? '#0c0c18' : 'transparent',
              }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'var(--fs-lg)', color: '#ffaa00', flexShrink: 0, width: 70 }}>{row.ticker}</div>
                <div style={{ flex: 1, fontSize: 'var(--fs-xs)', color: '#b0c0dd' }}>{row.account}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0', flexShrink: 0 }}>{row.frequency}</div>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#ffaa00', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>{fmtD(row.amount)}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderTop: '2px solid #1a1a2e', background: '#0c0c18' }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: '#b0c0dd', fontWeight: 700 }}>TOTAL</span>
              <span style={{ fontSize: 'var(--fs-sm)', color: '#ffaa00', fontWeight: 700 }}>{fmtD(p.monthlyPlan.total)}/month</span>
            </div>
          </div>
        </Section>
      )}

      {/* Rebalancing */}
      {p.rebalancing && (
        <Section title="⚖️ REBALANCING STRATEGY">
          <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, padding: '14px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <Pill label={p.rebalancing.frequency} color="#ffaa00" />
              <Pill label={p.rebalancing.method} color="#4488ff" />
            </div>
            <div style={{ fontSize: 'var(--fs-body)', color: '#c8d8f0', lineHeight: 1.7 }}>{p.rebalancing.instructions}</div>
          </div>
        </Section>
      )}

      {/* Emergency Fund */}
      {p.emergencyFund && (
        <Section title="🛡️ EMERGENCY FUND">
          <div style={{ background: '#0a0a14', border: `1px solid ${p.emergencyFund.status === 'Adequate' ? '#00ff8822' : '#ff444422'}`, borderRadius: 8, padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Pill label={p.emergencyFund.status} color={p.emergencyFund.status === 'Adequate' ? '#00ff88' : p.emergencyFund.status === 'Needs building' ? '#ffaa00' : '#ff4444'} />
              {p.emergencyFund.targetAmount && <span style={{ fontSize: 'var(--fs-sm)', color: '#c8d8f0' }}>Target: {fmtD(p.emergencyFund.targetAmount)}</span>}
            </div>
            <div style={{ fontSize: 'var(--fs-body)', color: '#c8d8f0', lineHeight: 1.6 }}>{p.emergencyFund.recommendation}</div>
          </div>
        </Section>
      )}

      {/* Milestones */}
      {p.milestones?.length > 0 && (
        <Section title="🏁 MILESTONES">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.milestones.map((m, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 6, padding: '10px 14px',
              }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ffaa0018', border: '1px solid #ffaa0033', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#ffaa00', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-sm)', color: '#c8d8f0', fontWeight: 600 }}>{m.goal}</div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0' }}>{m.timeframe}</div>
                </div>
                {m.amount > 0 && <div style={{ fontSize: 'var(--fs-sm)', color: '#00ff88', fontWeight: 700 }}>{fmtD(m.amount)}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Red Flags */}
      {p.redFlags?.length > 0 && (
        <Section title="⚠️ RISKS & CONSIDERATIONS" accent="#ff4444">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.redFlags.map((f, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, padding: '10px 14px',
                background: '#ff444408', border: '1px solid #ff444422', borderRadius: 6,
                fontSize: 'var(--fs-body)', color: '#c8d8f0', lineHeight: 1.5,
              }}>
                <span style={{ color: '#ff4444', flexShrink: 0 }}>⚠</span> {f}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Next Steps */}
      {p.nextSteps?.length > 0 && (
        <Section title="✅ NEXT STEPS" accent="#00ff88">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.nextSteps.map((s, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, padding: '10px 14px',
                background: '#00ff8806', border: '1px solid #00ff8820', borderRadius: 6,
                fontSize: 'var(--fs-body)', color: '#c8d8f0', lineHeight: 1.5,
              }}>
                <span style={{ color: '#00ff88', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span> {s}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Disclaimer */}
      <div style={{ marginTop: 20, padding: '12px 14px', background: '#0a0a0f', border: '1px solid #1a1a2e', borderRadius: 6, fontSize: 'var(--fs-xs)', color: '#b0c0dd', lineHeight: 1.6 }}>
        ⚠ This is AI-generated financial analysis for educational purposes only. Not SEC-registered financial advice. Past performance does not guarantee future results. Consult a licensed CFP or RIA before making investment decisions.
      </div>
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────────
export default function USInvestTab() {
  const { user } = useUser();
  const userId   = user?.id;

  const [stage,         setStage]         = useState('budget');   // budget | chat | generating | result
  const [monthlyBudget, setMonthlyBudget] = useState(500);
  const [payFrequency,  setPayFrequency]  = useState('monthly'); // weekly|biweekly|monthly
  const [chatHistory,   setChatHistory]   = useState([]);
  const [result,        setResult]        = useState(null);
  const [generating,    setGenerating]    = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState('');
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);

  // Load saved portfolio
  useEffect(() => {
    if (!userId) return;
    fetch(`${BASE}/us-portfolio/${userId}`)
      .then(r => r.json())
      .then(d => {
        if (d.portfolio?.result) {
          setResult(d.portfolio.result);
          setMonthlyBudget(d.portfolio.monthlyBudget || 500);
                setPayFrequency(d.portfolio.payFrequency || 'monthly');
          setStage('result');
          setSaved(true);
        }
        setPortfolioLoaded(true);
      })
      .catch(() => setPortfolioLoaded(true));
  }, [userId]);

  const handleChatComplete = useCallback(async (history) => {
    setChatHistory(history);
    setStage('generating');
    setGenerating(true);
    setError('');
    try {
      const res  = await fetch(`${BASE}/api/us-portfolio/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, monthlyBudget }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setStage('result');
      // Auto-save immediately after generation
      if (userId) {
        fetch(`${BASE}/us-portfolio/${userId}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portfolio: { result: data, monthlyBudget, payFrequency, savedAt: new Date().toISOString() } }),
        }).then(() => setSaved(true)).catch(() => {});
      }
    } catch (e) {
      setError(e.message);
      setStage('chat');
    } finally {
      setGenerating(false);
    }
  }, [monthlyBudget, payFrequency, userId]);

  const handleReset = async () => {
    if (userId) {
      await fetch(`${BASE}/us-portfolio/${userId}`, { method: 'DELETE' }).catch(() => {});
    }
    setResult(null);
    setChatHistory([]);
    setStage('budget');
    setSaved(false);
    setError('');
  };

  if (!portfolioLoaded) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#c8d8f0', fontSize: 'var(--fs-sm)' }}>
        Loading your portfolio...
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Tab header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#ffaa00', letterSpacing: '.1em' }}>
          🇺🇸 US INVEST
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0' }}>
          AI portfolio advisor · ETFs · 401k · Roth IRA · Tax optimization
        </div>
      </div>

      {/* Stage: Budget */}
      {stage === 'budget' && (() => {
        // Convert per-paycheck amount to monthly
        const toMonthly = (amt, freq) => {
          if (freq === 'weekly')    return Math.round(amt * 52 / 12);
          if (freq === 'biweekly')  return Math.round(amt * 26 / 12);
          return amt;
        };
        const fromMonthly = (amt, freq) => {
          if (freq === 'weekly')    return Math.round(amt * 12 / 52);
          if (freq === 'biweekly')  return Math.round(amt * 12 / 26);
          return amt;
        };
        const freqLabel = { weekly: 'week', biweekly: 'paycheck', monthly: 'month' };
        const QUICK_MONTHLY = [100, 250, 500, 1000, 2000];
        const paycheckAmt = fromMonthly(monthlyBudget, payFrequency);

        return (
        <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 10, padding: '24px 20px' }}>
          {/* Step 1: Pay frequency */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'var(--fs-lg)', color: '#ffaa00', letterSpacing: '.1em', marginBottom: 6 }}>
              STEP 1 — HOW OFTEN DO YOU GET PAID?
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', color: '#c8d8f0', marginBottom: 12 }}>
              We'll calculate your per-paycheck investment so it aligns with your cash flow.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { key: 'weekly',   label: 'Weekly',    sub: '52×/year' },
                { key: 'biweekly', label: 'Bi-weekly', sub: '26×/year' },
                { key: 'monthly',  label: 'Monthly',   sub: '12×/year' },
              ].map(f => (
                <button key={f.key} onClick={() => setPayFrequency(f.key)} style={{
                  flex: 1, padding: '12px 8px', borderRadius: 7, cursor: 'pointer',
                  background: payFrequency === f.key ? '#ffaa0018' : '#0f0f1a',
                  border: `2px solid ${payFrequency === f.key ? '#ffaa00' : '#1a1a2e'}`,
                  color: payFrequency === f.key ? '#ffaa00' : '#556677',
                  textAlign: 'center',
                }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: '.06em' }}>{f.label}</div>
                  <div style={{ fontSize: 'var(--fs-xs)', marginTop: 2 }}>{f.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Amount per paycheck */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'var(--fs-lg)', color: '#ffaa00', letterSpacing: '.1em', marginBottom: 6 }}>
              STEP 2 — HOW MUCH PER {freqLabel[payFrequency].toUpperCase()}?
            </div>
            {/* Quick picks — shown in per-paycheck amounts */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {QUICK_MONTHLY.map(monthly => {
                const display = fromMonthly(monthly, payFrequency);
                const isActive = monthlyBudget === monthly;
                return (
                  <button key={monthly} onClick={() => setMonthlyBudget(monthly)} style={{
                    padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: "'Bebas Neue',sans-serif", fontSize: 14,
                    background: isActive ? '#ffaa00' : '#0f0f1a',
                    color: isActive ? '#07070e' : '#8899bb',
                    border: `1px solid ${isActive ? '#ffaa00' : '#2a2a3e'}`,
                    textAlign: 'center',
                  }}>
                    <div>${display.toLocaleString()}</div>
                    <div style={{ fontSize: 9, opacity: 0.7 }}>/{freqLabel[payFrequency]}</div>
                  </button>
                );
              })}
            </div>
            {/* Custom input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: '#ffaa00', fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, flexShrink: 0 }}>$</span>
              <input
                type="number" min="10" max="50000"
                value={paycheckAmt}
                onChange={e => setMonthlyBudget(toMonthly(Number(e.target.value), payFrequency))}
                style={{
                  flex: 1, background: '#0f0f1a', border: '1px solid #2a2a3e',
                  borderRadius: 6, padding: '10px 14px', color: '#ffaa00',
                  fontSize: 'var(--fs-lg)', outline: 'none', fontFamily: "'JetBrains Mono',monospace",
                }}
              />
              <span style={{ color: '#c8d8f0', fontSize: 'var(--fs-xs)', flexShrink: 0 }}>/{freqLabel[payFrequency]}</span>
            </div>
          </div>

          {/* Summary card */}
          {monthlyBudget >= 50 && (
            <div style={{ background: '#0f0f1a', border: '1px solid #ffaa0022', borderRadius: 8, padding: '14px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#ffaa00', letterSpacing: '.1em' }}>YOUR INVESTMENT PLAN</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                <div style={{ textAlign: 'center', padding: '10px 8px', background: '#0a0a14', borderRadius: 6 }}>
                  <div style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0', marginBottom: 3 }}>PER {freqLabel[payFrequency].toUpperCase()}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-lg)', color: '#ffaa00', fontWeight: 700 }}>${paycheckAmt.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 8px', background: '#0a0a14', borderRadius: 6 }}>
                  <div style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0', marginBottom: 3 }}>PER MONTH</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-lg)', color: '#c8d8f0', fontWeight: 700 }}>${monthlyBudget.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 8px', background: '#0a0a14', borderRadius: 6 }}>
                  <div style={{ fontSize: 'var(--fs-xs)', color: '#c8d8f0', marginBottom: 3 }}>PER YEAR</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-lg)', color: '#00ff88', fontWeight: 700 }}>${(monthlyBudget * 12).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {[
                  { icon: '📊', text: 'Personalized ETF picks' },
                  { icon: '🏦', text: '401k / Roth IRA strategy' },
                  { icon: '💰', text: 'Tax optimization' },
                  { icon: '🎯', text: 'Retirement projections' },
                  { icon: '⚖️', text: 'Rebalancing schedule' },
                  { icon: '🛡️', text: 'Emergency fund analysis' },
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-xs)', color: '#c8d8f0' }}>
                    <span>{f.icon}</span>{f.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setStage('chat')} disabled={!monthlyBudget || monthlyBudget < 50} style={{
            width: '100%', background: '#ffaa00', color: '#07070e', border: 'none',
            padding: '14px', borderRadius: 8, cursor: 'pointer',
            fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: '.1em',
            opacity: !monthlyBudget || monthlyBudget < 50 ? 0.4 : 1,
          }}>TALK TO MAX →</button>
        </div>
        );
      })()}

      {/* Stage: Chat */}
      {stage === 'chat' && (
        <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 10, padding: '16px 16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #1a1a2e' }}>
            <div>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#ffaa00' }}>MAX — US ADVISOR</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: '#b0c0dd', marginLeft: 10 }}>Budget: {fmtD(monthlyBudget)}/mo · Paid {payFrequency}</span>
            </div>
            <button onClick={() => setStage('budget')} style={{ background: 'none', border: 'none', color: '#b0c0dd', cursor: 'pointer', fontSize: 'var(--fs-xs)' }}>← Change budget</button>
          </div>
          {error && <div style={{ color: '#ff4444', fontSize: 'var(--fs-xs)', marginBottom: 10 }}>{error}</div>}
          <ChatIntake monthlyBudget={monthlyBudget} payFrequency={payFrequency} onComplete={handleChatComplete} />
        </div>
      )}

      {/* Stage: Generating */}
      {stage === 'generating' && (
        <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 10, padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #ffaa0022', borderTop: '3px solid #ffaa00', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#ffaa00', letterSpacing: '.1em', marginBottom: 8 }}>
            BUILDING YOUR PORTFOLIO
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: '#c8d8f0', lineHeight: 1.7 }}>
            Analyzing your profile · Selecting optimal ETFs<br />
            Running retirement projections · Optimizing for taxes...
          </div>
        </div>
      )}

      {/* Stage: Result */}
      {stage === 'result' && result && (
        <PortfolioResult
          result={result}
          monthlyBudget={monthlyBudget}
          onReset={handleReset}
          saved={saved}
        />
      )}
    </div>
  );
}