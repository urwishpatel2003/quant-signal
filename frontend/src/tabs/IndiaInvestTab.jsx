import { useState, useEffect, useRef } from 'react';
import { useUsage } from '../hooks/useUsage';
import { useUser } from '@clerk/clerk-react';
import UpgradeModal from '../components/UpgradeModal';

const BASE = import.meta.env.VITE_API_BASE;

// ── ETF Universe ──────────────────────────────────────────────────────────────
const ETF_UNIVERSE = {
  INDEX: [
    { symbol: 'NIFTYBEES',    name: 'Nippon Nifty BeES',         tracking: 'Nifty 50'       },
    { symbol: 'JUNIORBEES',   name: 'Nippon Junior BeES',        tracking: 'Nifty Next 50'  },
    { symbol: 'SETFNN50',     name: 'SBI Nifty Next 50 ETF',     tracking: 'Nifty Next 50'  },
    { symbol: 'NV20IETF',     name: 'Nippon Nifty 100 ETF',      tracking: 'Nifty 100'      },
    { symbol: 'MAFSETF',      name: 'Mirae Asset Nifty 50 ETF',  tracking: 'Nifty 50'       },
    { symbol: 'SETFNIF50',    name: 'SBI Nifty 50 ETF',          tracking: 'Nifty 50'       },
    { symbol: 'HNGSNGBEES',   name: 'Nippon Hang Seng BeES',     tracking: 'Hang Seng'      },
  ],
  SECTORAL: [
    { symbol: 'BANKBEES',     name: 'Nippon Bank BeES',          tracking: 'Nifty Bank'     },
    { symbol: 'ITBEES',       name: 'Nippon IT BeES',            tracking: 'Nifty IT'       },
    { symbol: 'PHARMABEES',   name: 'Nippon Pharma BeES',        tracking: 'Nifty Pharma'   },
    { symbol: 'INFRABEES',    name: 'Nippon Infra BeES',         tracking: 'Nifty Infra'    },
    { symbol: 'PSUBNKBEES',   name: 'Nippon PSU Bank BeES',      tracking: 'Nifty PSU Bank' },
    { symbol: 'AUTOBEES',     name: 'Nippon Auto BeES',          tracking: 'Nifty Auto'     },
    { symbol: 'FMCGBEES',     name: 'Nippon FMCG BeES',          tracking: 'Nifty FMCG'    },
  ],
  COMMODITY: [
    { symbol: 'GOLDBEES',     name: 'Nippon Gold BeES',          tracking: 'Gold'           },
    { symbol: 'SILVERIETF',   name: 'ICICI Silver ETF',          tracking: 'Silver'         },
    { symbol: 'SETFGOLD',     name: 'SBI Gold ETF',              tracking: 'Gold'           },
    { symbol: 'HDFCGOLD',     name: 'HDFC Gold ETF',             tracking: 'Gold'           },
  ],
  DEBT: [
    { symbol: 'LIQUIDBEES',   name: 'Nippon Liquid BeES',        tracking: 'Overnight Rate' },
    { symbol: 'LIQUIDETF',    name: 'HDFC Liquid ETF',           tracking: 'Overnight Rate' },
    { symbol: 'CPSEETF',      name: 'Nippon CPSE ETF',           tracking: 'Nifty CPSE'    },
  ],
};

// ── Mutual Funds ──────────────────────────────────────────────────────────────
const MF_LIST = [
  { schemeCode: '120503', name: 'UTI Nifty 50 Index Fund Direct',          category: 'Index',    risk: 'Moderate' },
  { schemeCode: '120465', name: 'HDFC Nifty 50 Index Fund Direct',         category: 'Index',    risk: 'Moderate' },
  { schemeCode: '125494', name: 'SBI Nifty Index Fund Direct',             category: 'Index',    risk: 'Moderate' },
  { schemeCode: '119598', name: 'Mirae Asset Large Cap Fund Direct',       category: 'Large Cap', risk: 'Moderate' },
  { schemeCode: '120837', name: 'Axis Bluechip Fund Direct',               category: 'Large Cap', risk: 'Moderate' },
  { schemeCode: '122639', name: 'Parag Parikh Flexi Cap Fund Direct',      category: 'Flexi Cap', risk: 'Moderate' },
  { schemeCode: '125354', name: 'SBI Small Cap Fund Direct',               category: 'Small Cap', risk: 'High'     },
  { schemeCode: '118577', name: 'HDFC Mid-Cap Opportunities Direct',       category: 'Mid Cap',   risk: 'High'     },
  { schemeCode: '119760', name: 'Nippon India Liquid Fund Direct',         category: 'Liquid',    risk: 'Low'      },
  { schemeCode: '119775', name: 'ICICI Pru Short Term Fund Direct',        category: 'Debt',      risk: 'Low'      },
];

// ── Risk quiz ─────────────────────────────────────────────────────────────────
const RISK_QUESTIONS = [
  { q: 'What is your investment horizon?', options: [{ label: '< 1 year', score: 1 }, { label: '1-3 years', score: 2 }, { label: '3-7 years', score: 3 }, { label: '7+ years', score: 4 }] },
  { q: 'How would you react if your portfolio fell 20%?', options: [{ label: 'Sell everything', score: 1 }, { label: 'Sell some, stay calm', score: 2 }, { label: 'Hold and wait', score: 3 }, { label: 'Buy more — opportunity', score: 4 }] },
  { q: 'What is your primary investment goal?', options: [{ label: 'Capital preservation', score: 1 }, { label: 'Regular income', score: 2 }, { label: 'Balanced growth', score: 3 }, { label: 'Maximum growth', score: 4 }] },
  { q: 'Monthly investable surplus?', options: [{ label: '< 5,000', score: 1 }, { label: '5k-25k', score: 2 }, { label: '25k-1L', score: 3 }, { label: '> 1L', score: 4 }] },
];

function getRiskProfile(score) {
  if (score <= 6)  return { label: 'Conservative',    color: '#4488ff', expected: 8  };
  if (score <= 10) return { label: 'Moderate',        color: '#ffaa00', expected: 11 };
  if (score <= 13) return { label: 'Aggressive',      color: '#ff8844', expected: 14 };
  return                  { label: 'Very Aggressive', color: '#ff4444', expected: 17 };
}

function getPortfolioAllocation(score) {
  if (score <= 6)  return { 'Liquid/Debt ETF': 50, 'Nifty 50 Index': 30, 'Gold ETF': 20 };
  if (score <= 10) return { 'Nifty 50 Index': 50, 'Midcap/Next50': 20, 'Gold ETF': 20, 'Liquid ETF': 10 };
  if (score <= 13) return { 'Nifty 50 Index': 40, 'Midcap/Next50': 30, 'Sectoral ETF': 20, 'Gold ETF': 10 };
  return                  { 'Nifty 50 Index': 30, 'Midcap/Next50': 35, 'Sectoral ETF': 25, 'Gold ETF': 10 };
}

function sipMaturity(monthly, years, rate) {
  const r = rate / 100 / 12, n = years * 12;
  if (r === 0) return monthly * n;
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}
function lumpSumMaturity(amount, years, rate) {
  return amount * Math.pow(1 + rate / 100, years);
}
function fmt(n) {
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `${(n / 100000).toFixed(2)} L`;
  return Math.round(n).toLocaleString('en-IN');
}
function fmtRs(n) { return `₹${fmt(n)}`; }

function Pill({ label, color }) {
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, border: `1px solid ${color}44`, color, background: color + '11' }}>{label}</span>;
}

// ── Shared page header with back button ───────────────────────────────────────
function PageHeader({ icon, title, subtitle, onBack }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: '1px solid #2a2a40', color: '#b0c0dd',
          cursor: 'pointer', borderRadius: 4, padding: '7px 14px',
          fontSize: 12, fontFamily: 'inherit', letterSpacing: '0.08em',
          marginBottom: 20, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#ff9a0066'; e.currentTarget.style.color = '#ff9a00'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a40'; e.currentTarget.style.color = '#b0c0dd'; }}
      >
        ← BACK
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{icon}</span>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#ff9a00', lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: '#7788aa', marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Page: SIP Planner ─────────────────────────────────────────────────────────
function SIPPage({ onBack }) {
  const [monthly, setMonthly] = useState(10000);
  const [years,   setYears]   = useState(10);
  const [rate,    setRate]    = useState(12);
  const [lumpSum, setLumpSum] = useState(100000);
  const [view,    setView]    = useState('sip');

  const maturity   = sipMaturity(monthly, years, rate);
  const invested   = monthly * years * 12;
  const gain       = maturity - invested;
  const lsMaturity = lumpSumMaturity(lumpSum, years, rate);
  const sipTotal   = sipMaturity(lumpSum / (years * 12), years, rate);

  const Slider = ({ label, value, setValue, min, max, step, display }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 12, color: '#99aacc', flexShrink: 1 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ff9a00', flexShrink: 0 }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => setValue(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#ff9a00' }} />
    </div>
  );

  return (
    <div className="fade-in">
      <PageHeader icon="🔄" title="SIP Planner"
        subtitle="Calculate SIP returns and compare with lump sum investment"
        onBack={onBack} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[['sip', 'SIP Calculator'], ['compare', 'SIP vs Lump Sum']].map(([k, l]) => (
          <button key={k} className="btn-sm" onClick={() => setView(k)} style={{
            color: view === k ? '#ff9a00' : '#99aacc',
            borderColor: view === k ? '#ff9a00' : '#2a2a3e',
            background: view === k ? '#ff9a0011' : '#1a1a2e',
          }}>{l}</button>
        ))}
      </div>

      {view === 'sip' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.15em', marginBottom: 20 }}>INPUTS</div>
            <Slider label="Monthly SIP Amount" value={monthly} setValue={setMonthly} min={500} max={100000} step={500} display={fmtRs(monthly)} />
            <Slider label="Investment Duration" value={years}   setValue={setYears}   min={1}   max={30}     step={1}   display={`${years} years`} />
            <Slider label="Expected Annual Return" value={rate} setValue={setRate}    min={4}   max={25}     step={0.5} display={`${rate}%`} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'MATURITY VALUE', value: fmtRs(maturity), color: '#00ff88', large: true },
              { label: 'TOTAL INVESTED', value: fmtRs(invested), color: '#e8e8f0' },
              { label: 'WEALTH GAIN',    value: fmtRs(gain),     color: '#ff9a00' },
              { label: 'TOTAL RETURNS',  value: `${((gain / invested) * 100).toFixed(1)}%`, color: '#4488ff' },
            ].map((item, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', borderColor: item.color + '33' }}>
                <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.15em', marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: item.large ? 32 : 22, fontWeight: 700, color: item.color,
                  fontFamily: item.large ? "'Bebas Neue',sans-serif" : 'inherit' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'compare' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Inputs */}
          <div className="card">
            <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.15em', marginBottom: 20 }}>INPUTS</div>
            <Slider label="Total Investment" value={lumpSum} setValue={setLumpSum} min={10000} max={10000000} step={10000} display={fmtRs(lumpSum)} />
            <Slider label="Duration"         value={years}   setValue={setYears}   min={1}     max={30}       step={1}     display={`${years} yrs`} />
            <Slider label="Expected Return"  value={rate}    setValue={setRate}    min={4}     max={25}       step={0.5}   display={`${rate}%`} />
          </div>
          {/* Results — 2 cols side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: 'LUMP SUM',         color: '#4488ff', maturity: lsMaturity, invested: lumpSum },
              { label: 'SIP (same total)', color: '#00ff88', maturity: sipTotal,   invested: lumpSum },
            ].map((col, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 10, color: col.color, letterSpacing: '0.12em',
                  textAlign: 'center', padding: '6px 0',
                  borderBottom: `1px solid ${col.color}33`, marginBottom: 2 }}>{col.label}</div>
                {[
                  { label: 'MATURITY', value: fmtRs(col.maturity),                 color: col.color, large: true },
                  { label: 'INVESTED', value: fmtRs(col.invested),                 color: '#e8e8f0' },
                  { label: 'GAIN',     value: fmtRs(col.maturity - col.invested),  color: col.color },
                ].map((item, j) => (
                  <div key={j} className="card" style={{ textAlign: 'center', borderColor: item.color + '33', padding: '12px 10px' }}>
                    <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.12em', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: item.large ? 26 : 16, fontWeight: 700, color: item.color,
                      fontFamily: item.large ? "'Bebas Neue',sans-serif" : 'inherit' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#445', marginTop: 20, textAlign: 'center' }}>
        Returns are estimated. Past performance does not indicate future results.
      </div>
    </div>
  );
}

// ── Page: AI Portfolio ────────────────────────────────────────────────────────
function PortfolioPage({ onBack }) {
  const [sipAmount, setSipAmount] = useState(10000);
  const [answers,   setAnswers]   = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult,  setAiResult]  = useState(null);
  const [step,      setStep]      = useState(0);
  const [error,     setError]     = useState('');

  const handleAnswer = (idx, score) => { const next = [...answers]; next[idx] = score; setAnswers(next); };
  const allAnswered = answers.length === RISK_QUESTIONS.length && answers.every(a => a != null);
  const totalScore  = answers.reduce((a, b) => a + (b || 0), 0);
  const riskProfile = allAnswered ? getRiskProfile(totalScore) : null;
  const allocation  = allAnswered ? getPortfolioAllocation(totalScore) : null;

  const getAIRecommendation = async () => {
    setAiLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/api/analyze/portfolio`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riskProfile: riskProfile?.label, score: totalScore, sipAmount,
          horizon:  ['','< 1yr','1-3yrs','3-7yrs','7+yrs'][answers[0]],
          reaction: ['','panic sell','partial sell','hold','buy more'][answers[1]],
          goal:     ['','capital preservation','regular income','balanced growth','maximum growth'][answers[2]],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiResult(data); setStep(1);
    } catch (e) {
      console.error('[portfolio]', e);
      setError(e.message || 'Something went wrong. Please try again.');
    }
    setAiLoading(false);
  };

  return (
    <div className="fade-in">
      <PageHeader icon="🤖" title="AI Portfolio Recommender"
        subtitle="Answer 4 questions to get a personalised ETF and mutual fund allocation"
        onBack={onBack} />

      {step === 1 && aiResult ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button className="btn-sm" onClick={() => { setStep(0); setAiResult(null); setAnswers([]); }}
            style={{ alignSelf: 'flex-start' }}>← RETAKE QUIZ</button>

          {/* Summary + Risk Profile */}
          <div className="card" style={{ borderColor: '#ff9a0033' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.12em', marginBottom: 8 }}>AI PORTFOLIO RECOMMENDATION</div>
                <div style={{ fontSize: 13, color: '#b0c0dd', lineHeight: 1.8 }}>{aiResult.summary}</div>
              </div>
              {aiResult.riskAssessment && (
                <div style={{ background: '#0a0a14', borderRadius: 6, padding: '12px 16px', textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#ff9a00' }}>{aiResult.riskAssessment.label}</div>
                  <div style={{ fontSize: 11, color: '#00ff88', marginTop: 2 }}>{aiResult.riskAssessment.expectedReturn}</div>
                  <div style={{ fontSize: 10, color: '#7788aa', marginTop: 2 }}>Volatility: {aiResult.riskAssessment.volatility}</div>
                </div>
              )}
            </div>
            {aiResult.riskAssessment?.suitability && (
              <div style={{ fontSize: 12, color: '#7788aa', borderTop: '1px solid #1e1e2e', paddingTop: 10, fontStyle: 'italic' }}>
                {aiResult.riskAssessment.suitability}
              </div>
            )}
          </div>

          {/* Asset Allocation Bar */}
          {aiResult.assetAllocation && (
            <div className="card">
              <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.12em', marginBottom: 12 }}>ASSET ALLOCATION</div>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 10 }}>
                {[
                  { key: 'equity', color: '#00ff88' }, { key: 'debt', color: '#4488ff' },
                  { key: 'gold', color: '#ffaa00' },   { key: 'international', color: '#ff8844' },
                ].filter(a => aiResult.assetAllocation[a.key] > 0).map((a, i) => (
                  <div key={i} style={{ width: `${aiResult.assetAllocation[a.key]}%`, background: a.color }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { key: 'equity', color: '#00ff88', label: 'Equity' }, { key: 'debt', color: '#4488ff', label: 'Debt' },
                  { key: 'gold', color: '#ffaa00', label: 'Gold' },     { key: 'international', color: '#ff8844', label: 'Intl' },
                ].filter(a => aiResult.assetAllocation[a.key] > 0).map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: a.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#99aacc' }}>{a.label} {aiResult.assetAllocation[a.key]}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fund Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {aiResult.topPicks?.map((pick, i) => (
              <div key={i} className="card" style={{ borderColor: '#ff9a0022' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1, marginRight: 12 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <Pill label={pick.type} color={pick.type === 'ETF' ? '#ff9a00' : '#4488ff'} />
                      {pick.taxCategory && <Pill label={pick.taxCategory} color="#7788aa" />}
                      {pick.expenseRatio && <Pill label={`ER: ${pick.expenseRatio}`} color="#556677" />}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0', marginBottom: 2 }}>{pick.name}</div>
                    {pick.symbol && <div style={{ fontSize: 11, color: '#7788aa' }}>{pick.symbol}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#ff9a00', lineHeight: 1 }}>{pick.allocation}%</div>
                    {pick.amount && <div style={{ fontSize: 12, color: '#99aacc', marginTop: 2 }}>{fmtRs(pick.amount)}/mo</div>}
                    {pick.expectedReturn && <div style={{ fontSize: 11, color: '#00ff88', marginTop: 2 }}>{pick.expectedReturn}</div>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#b0c0dd', lineHeight: 1.7, marginBottom: pick.pros?.length > 0 || pick.cons?.length > 0 ? 10 : 0 }}>{pick.reason}</div>
                {(pick.pros?.length > 0 || pick.cons?.length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid #1e1e2e', paddingTop: 10 }}>
                    <div>{pick.pros?.map((p, j) => (
                      <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                        <span style={{ color: '#00ff88', fontSize: 10, flexShrink: 0, marginTop: 2 }}>✓</span>
                        <span style={{ fontSize: 11, color: '#7788aa' }}>{p}</span>
                      </div>
                    ))}</div>
                    <div>{pick.cons?.map((c, j) => (
                      <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                        <span style={{ color: '#ff4444', fontSize: 10, flexShrink: 0, marginTop: 2 }}>✗</span>
                        <span style={{ fontSize: 11, color: '#7788aa' }}>{c}</span>
                      </div>
                    ))}</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Monthly SIP Plan */}
          {aiResult.monthlyPlan && (
            <div className="card">
              <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.12em', marginBottom: 12 }}>
                MONTHLY SIP PLAN — {fmtRs(aiResult.monthlyPlan.total)}/mo
              </div>
              {aiResult.monthlyPlan.breakdown?.map((b, i) => (
                <div key={i} className="kv" style={{ paddingBottom: 8, marginBottom: 8, borderBottom: i < aiResult.monthlyPlan.breakdown.length - 1 ? '1px solid #1a1a2a' : 'none' }}>
                  <div>
                    <span className="kv-key">{b.instrument}</span>
                    {b.sipDate && <span style={{ fontSize: 10, color: '#445', marginLeft: 8 }}>on {b.sipDate}</span>}
                  </div>
                  <span className="kv-value" style={{ color: '#ff9a00' }}>{fmtRs(b.amount)}/mo</span>
                </div>
              ))}
            </div>
          )}

          {/* Tax Strategy + Rebalancing */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {aiResult.taxStrategy && (
              <div className="card" style={{ borderLeft: '3px solid #4488ff55' }}>
                <div style={{ fontSize: 10, color: '#4488ff', letterSpacing: '0.15em', marginBottom: 8 }}>TAX STRATEGY</div>
                <div style={{ fontSize: 12, color: '#99aacc', lineHeight: 1.7 }}>{aiResult.taxStrategy}</div>
              </div>
            )}
            {aiResult.rebalancing && (
              <div className="card" style={{ borderLeft: '3px solid #ffaa0055' }}>
                <div style={{ fontSize: 10, color: '#ffaa00', letterSpacing: '0.15em', marginBottom: 8 }}>REBALANCING</div>
                <div style={{ fontSize: 12, color: '#99aacc', lineHeight: 1.7 }}>{aiResult.rebalancing}</div>
              </div>
            )}
          </div>

          {/* Red Flags */}
          {aiResult.redFlags?.length > 0 && (
            <div className="card" style={{ borderColor: '#ff444433', borderLeft: '3px solid #ff4444' }}>
              <div style={{ fontSize: 10, color: '#ff4444', letterSpacing: '0.15em', marginBottom: 8 }}>⚠ RISKS TO BE AWARE OF</div>
              {aiResult.redFlags.map((flag, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: '#ff4444', fontSize: 11, flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 12, color: '#b0c0dd' }}>{flag}</span>
                </div>
              ))}
            </div>
          )}

          {/* Final Advice */}
          {aiResult.advice && (
            <div className="card" style={{ borderLeft: '3px solid #00ff8855', background: '#00ff8808' }}>
              <div style={{ fontSize: 10, color: '#00ff88', letterSpacing: '0.15em', marginBottom: 8 }}>NEXT STEPS</div>
              <div style={{ fontSize: 13, color: '#b0c0dd', lineHeight: 1.8 }}>{aiResult.advice}</div>
            </div>
          )}

          <div style={{ fontSize: 10, color: '#445', textAlign: 'center' }}>
            AI-generated recommendations only. Not SEBI-registered advice. Consult a financial advisor before investing.
          </div>
        </div>
      ) : (
        <div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: '#99aacc', marginBottom: 10 }}>Monthly SIP budget</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input type="range" min={500} max={100000} step={500} value={sipAmount}
                onChange={e => setSipAmount(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#ff9a00' }} />
              <span style={{ fontSize: 18, fontWeight: 700, color: '#ff9a00', minWidth: 90 }}>{fmtRs(sipAmount)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {RISK_QUESTIONS.map((q, qi) => (
              <div key={qi} className="card">
                <div style={{ fontSize: 14, fontWeight: 600, color: '#c8d8f0', marginBottom: 14 }}>
                  <span style={{ color: '#ff9a00', marginRight: 10 }}>{qi + 1}.</span>{q.q}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {q.options.map((opt, oi) => (
                    <button key={oi} onClick={() => handleAnswer(qi, opt.score)} style={{
                      padding: '11px 14px', textAlign: 'left', fontSize: 13,
                      background: answers[qi] === opt.score ? '#ff9a0022' : '#0a0a14',
                      border: `1px solid ${answers[qi] === opt.score ? '#ff9a00' : '#2a2a3e'}`,
                      color: answers[qi] === opt.score ? '#ff9a00' : '#b0c0dd',
                      cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit', transition: 'all 0.12s',
                    }}>{opt.label}</button>
                  ))}
                </div>
              </div>
            ))}
            {allAnswered && (
              <div className="card" style={{ borderColor: riskProfile.color + '44', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#7788aa', letterSpacing: '0.15em', marginBottom: 10 }}>YOUR RISK PROFILE</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: riskProfile.color, marginBottom: 6 }}>{riskProfile.label}</div>
                <div style={{ fontSize: 13, color: '#7788aa', marginBottom: 20 }}>Expected annual return: ~{riskProfile.expected}%</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 24 }}>
                  {Object.entries(allocation).map(([k, v]) => (
                    <div key={k} style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 4, padding: '10px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: riskProfile.color }}>{v}%</div>
                      <div style={{ fontSize: 11, color: '#7788aa', marginTop: 2 }}>{k}</div>
                    </div>
                  ))}
                </div>
                {error && (
                  <div style={{ fontSize: 13, color: '#ff4444', background: '#ff444411',
                    border: '1px solid #ff444433', borderRadius: 4, padding: '10px 14px', marginBottom: 12, lineHeight: 1.5 }}>
                    {error}
                  </div>
                )}
                <button className="btn" onClick={getAIRecommendation} disabled={aiLoading} style={{ fontSize: 14, padding: '12px 32px' }}>
                  {aiLoading ? 'GENERATING...' : 'GET AI PORTFOLIO RECOMMENDATION'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ── SIP autocomplete options ──────────────────────────────────────────────────
const SIP_OPTIONS = [
  // Index ETFs
  { label: 'NIFTYBEES — Nippon Nifty 50 BeES',     value: 'NIFTYBEES'  },
  { label: 'JUNIORBEES — Nippon Junior BeES',       value: 'JUNIORBEES' },
  { label: 'SETFNN50 — SBI Nifty Next 50 ETF',     value: 'SETFNN50'   },
  { label: 'SETFNIF50 — SBI Nifty 50 ETF',         value: 'SETFNIF50'  },
  { label: 'NV20IETF — Nippon Nifty 100 ETF',      value: 'NV20IETF'   },
  { label: 'MAFSETF — Mirae Asset Nifty 50 ETF',   value: 'MAFSETF'    },
  // Sectoral ETFs
  { label: 'BANKBEES — Nippon Bank BeES',           value: 'BANKBEES'   },
  { label: 'ITBEES — Nippon IT BeES',               value: 'ITBEES'     },
  { label: 'PHARMABEES — Nippon Pharma BeES',       value: 'PHARMABEES' },
  { label: 'INFRABEES — Nippon Infra BeES',         value: 'INFRABEES'  },
  { label: 'PSUBNKBEES — Nippon PSU Bank BeES',     value: 'PSUBNKBEES' },
  { label: 'AUTOBEES — Nippon Auto BeES',           value: 'AUTOBEES'   },
  { label: 'FMCGBEES — Nippon FMCG BeES',           value: 'FMCGBEES'   },
  // Commodity ETFs
  { label: 'GOLDBEES — Nippon Gold BeES',           value: 'GOLDBEES'   },
  { label: 'SILVERIETF — ICICI Silver ETF',         value: 'SILVERIETF' },
  { label: 'SETFGOLD — SBI Gold ETF',               value: 'SETFGOLD'   },
  { label: 'HDFCGOLD — HDFC Gold ETF',              value: 'HDFCGOLD'   },
  // Debt ETFs
  { label: 'LIQUIDBEES — Nippon Liquid BeES',       value: 'LIQUIDBEES' },
  { label: 'LIQUIDETF — HDFC Liquid ETF',           value: 'LIQUIDETF'  },
  { label: 'CPSEETF — Nippon CPSE ETF',             value: 'CPSEETF'    },
  // Mutual Funds
  { label: 'UTI Nifty 50 Index Fund Direct',        value: 'UTI Nifty 50 Index Fund Direct'        },
  { label: 'HDFC Nifty 50 Index Fund Direct',       value: 'HDFC Nifty 50 Index Fund Direct'       },
  { label: 'SBI Nifty Index Fund Direct',           value: 'SBI Nifty Index Fund Direct'           },
  { label: 'Mirae Asset Large Cap Fund Direct',     value: 'Mirae Asset Large Cap Fund Direct'     },
  { label: 'Axis Bluechip Fund Direct',             value: 'Axis Bluechip Fund Direct'             },
  { label: 'Parag Parikh Flexi Cap Fund Direct',    value: 'Parag Parikh Flexi Cap Fund Direct'    },
  { label: 'SBI Small Cap Fund Direct',             value: 'SBI Small Cap Fund Direct'             },
  { label: 'HDFC Mid-Cap Opportunities Direct',     value: 'HDFC Mid-Cap Opportunities Direct'     },
  { label: 'Nippon India Liquid Fund Direct',       value: 'Nippon India Liquid Fund Direct'       },
  { label: 'ICICI Pru Short Term Fund Direct',      value: 'ICICI Pru Short Term Fund Direct'      },
];


// ── iOS-style scroll wheel date picker ───────────────────────────────────────
function WheelColumn({ items, selectedIndex, onSelect, width = '33%' }) {
  const ref = useRef(null);
  const itemH = 44;

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = selectedIndex * itemH;
    }
  }, [selectedIndex]);

  const handleScroll = () => {
    if (!ref.current) return;
    const idx = Math.round(ref.current.scrollTop / itemH);
    if (idx !== selectedIndex && idx >= 0 && idx < items.length) {
      onSelect(idx);
    }
  };

  return (
    <div style={{ width, position: 'relative', overflow: 'hidden' }}>
      {/* Selection highlight */}
      <div style={{
        position: 'absolute', top: '50%', left: 4, right: 4,
        height: itemH, transform: 'translateY(-50%)',
        background: '#ff9a0018', border: '1px solid #ff9a0044',
        borderRadius: 8, pointerEvents: 'none', zIndex: 1,
      }} />
      {/* Fade top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 60,
        background: 'linear-gradient(to bottom, #0f0f1a, transparent)',
        pointerEvents: 'none', zIndex: 2,
      }} />
      {/* Fade bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
        background: 'linear-gradient(to top, #0f0f1a, transparent)',
        pointerEvents: 'none', zIndex: 2,
      }} />
      {/* Scroll container */}
      <div
        ref={ref}
        onScroll={handleScroll}
        style={{
          height: itemH * 5,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
          paddingTop: itemH * 2,
          paddingBottom: itemH * 2,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            onClick={() => {
              onSelect(i);
              if (ref.current) ref.current.scrollTo({ top: i * itemH, behavior: 'smooth' });
            }}
            style={{
              height: itemH,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              scrollSnapAlign: 'center',
              fontSize: i === selectedIndex ? 17 : 14,
              fontWeight: i === selectedIndex ? 700 : 400,
              color: i === selectedIndex ? '#ff9a00' : '#556677',
              cursor: 'pointer',
              transition: 'all 0.15s',
              userSelect: 'none',
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function DatePicker({ value, onChange }) {
  const now    = new Date();
  const curY   = now.getFullYear();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years  = Array.from({ length: 11 }, (_, i) => curY - 10 + i);

  const parsed = value ? value.split('-') : [String(curY), '01', '01'];
  const initY  = years.indexOf(Number(parsed[0]));
  const initM  = Number(parsed[1]) - 1;
  const initD  = Number(parsed[2]) - 1;

  const [yIdx, setYIdx] = useState(initY >= 0 ? initY : years.length - 1);
  const [mIdx, setMIdx] = useState(initM >= 0 ? initM : now.getMonth());
  const [dIdx, setDIdx] = useState(initD >= 0 ? initD : now.getDate() - 1);

  const selYear  = years[yIdx];
  const selMonth = mIdx + 1;
  const daysInM  = new Date(selYear, selMonth, 0).getDate();
  const days     = Array.from({ length: daysInM }, (_, i) => i + 1);

  // Clamp day index when month/year changes
  const safeDIdx = Math.min(dIdx, daysInM - 1);

  const emit = (y, m, d) => {
    const dd = String(d + 1).padStart(2, '0');
    const mm = String(m + 1).padStart(2, '0');
    onChange(`${years[y]}-${mm}-${dd}`);
  };

  const handleY = (i) => { setYIdx(i); emit(i, mIdx, safeDIdx); };
  const handleM = (i) => { setMIdx(i); emit(yIdx, i, safeDIdx); };
  const handleD = (i) => { setDIdx(i); emit(yIdx, mIdx, i); };

  return (
    <div style={{
      background: '#0f0f1a', border: '1px solid #2a2a40', borderRadius: 12,
      overflow: 'hidden', padding: '0 8px',
    }}>
      {/* Labels */}
      <div style={{ display: 'flex', padding: '10px 0 0', marginBottom: -4 }}>
        {[['DAY', '33%'], ['MONTH', '34%'], ['YEAR', '33%']].map(([l, w]) => (
          <div key={l} style={{ width: w, textAlign: 'center', fontSize: 9,
            color: '#445', letterSpacing: '0.15em' }}>{l}</div>
        ))}
      </div>
      {/* Wheels */}
      <div style={{ display: 'flex' }}>
        <WheelColumn
          items={days.map(d => String(d).padStart(2, '0'))}
          selectedIndex={safeDIdx}
          onSelect={handleD}
          width="33%"
        />
        <WheelColumn
          items={months}
          selectedIndex={mIdx}
          onSelect={handleM}
          width="34%"
        />
        <WheelColumn
          items={years.map(String)}
          selectedIndex={yIdx}
          onSelect={handleY}
          width="33%"
        />
      </div>
    </div>
  );
}

// ── SIP Form with autocomplete ────────────────────────────────────────────────
function SIPForm({ form, setForm, onAdd, onCancel, saving }) {
  const [query,       setQuery]       = useState(form.name || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop,    setShowDrop]    = useState(false);

  const handleSearch = (val) => {
    setQuery(val);
    setForm(f => ({ ...f, name: val }));
    if (val.length < 1) { setSuggestions([]); setShowDrop(false); return; }
    const q = val.toUpperCase();
    const matches = SIP_OPTIONS.filter(o =>
      o.value.toUpperCase().includes(q) || o.label.toUpperCase().includes(q)
    ).slice(0, 8);
    setSuggestions(matches);
    setShowDrop(matches.length > 0);
  };

  const selectOption = (opt) => {
    setQuery(opt.label);
    setForm(f => ({ ...f, name: opt.value }));
    setShowDrop(false);
  };

  return (
    <div className="card" style={{ marginBottom: 20, borderColor: '#00ff8833' }}>
      <div style={{ fontSize: 11, color: '#00ff88', letterSpacing: '0.15em', marginBottom: 16 }}>NEW SIP</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Autocomplete fund/ETF picker */}
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 6 }}>
            ETF OR MUTUAL FUND
          </div>
          <input
            className="input"
            type="text"
            placeholder="Search ETF or fund name..."
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onFocus={() => query.length > 0 && setSuggestions(
              SIP_OPTIONS.filter(o => o.label.toUpperCase().includes(query.toUpperCase())).slice(0, 8)
            ) || setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            autoComplete="off"
          />
          {showDrop && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: '#0f0f1a', border: '1px solid #ff9a0044', borderRadius: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)', maxHeight: 220, overflowY: 'auto',
            }}>
              {suggestions.map((opt, i) => (
                <div key={i}
                  onMouseDown={() => selectOption(opt)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                    borderBottom: i < suggestions.length - 1 ? '1px solid #1a1a2a' : 'none',
                    color: '#c8d8f0',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#ff9a0011'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ color: '#ff9a00', fontWeight: 700 }}>
                    {opt.value.length < 15 ? opt.value : ''}
                  </span>
                  {opt.value.length < 15 && <span style={{ color: '#556677' }}> — </span>}
                  <span style={{ color: opt.value.length >= 15 ? '#c8d8f0' : '#7788aa' }}>
                    {opt.value.length >= 15 ? opt.label : opt.label.split('—')[1]?.trim() || opt.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Amount */}
        <div>
          <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 6 }}>MONTHLY AMOUNT (₹)</div>
          <input className="input" type="number" placeholder="5000" min="100"
            value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>

        {/* Start date — iOS scroll wheel picker */}
        <div>
          <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 8 }}>SIP START DATE</div>
          <DatePicker value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} />
          {form.startDate && (
            <div style={{ fontSize: 11, color: '#ff9a00', textAlign: 'center', marginTop: 8 }}>
              {new Date(form.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>

        {/* Frequency */}
        <div>
          <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 6 }}>FREQUENCY</div>
          <select className="input" value={form.frequency}
            onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="btn-sm" onClick={onCancel}
            style={{ color: '#7788aa', borderColor: '#2a2a3e' }}>CANCEL</button>
          <button className="btn" onClick={onAdd} disabled={saving}>
            {saving ? 'SAVING...' : 'ADD SIP'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page: My SIPs ─────────────────────────────────────────────────────────────
function SIPTrackerPage({ onBack }) {
  const { user }  = useUser();
  const [sips,    setSips]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({ name: '', amount: '', startDate: '', frequency: 'monthly' });
  const [adding,  setAdding]  = useState(false);
  const [error,   setError]   = useState('');

  // Load SIPs from backend
  useEffect(() => {
    if (!user?.id) return;
    fetch(`${BASE}/sips/${user.id}`)
      .then(r => r.json())
      .then(data => {
        setSips((data || []).map(s => ({
          id: s.id, name: s.name, amount: s.amount,
          startDate: s.start_date, frequency: s.frequency,
        })));
        setLoading(false);
        // Migrate localStorage SIPs to backend on first load
        const local = JSON.parse(localStorage.getItem('quaint_sips') || '[]');
        if (local.length > 0) {
          Promise.all(local.map(sip =>
            fetch(`${BASE}/sips/${user.id}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: sip.name, amount: sip.amount, startDate: sip.startDate, frequency: sip.frequency }),
            })
          )).then(() => {
            localStorage.removeItem('quaint_sips');
            fetch(`${BASE}/sips/${user.id}`).then(r => r.json()).then(d =>
              setSips((d || []).map(s => ({ id: s.id, name: s.name, amount: s.amount, startDate: s.start_date, frequency: s.frequency })))
            );
          });
        }
      })
      .catch(() => setLoading(false));
  }, [user?.id]);

  const validate = () => {
    if (!form.name.trim())            return 'Please enter a fund name or ETF symbol.';
    const amt = Number(form.amount);
    if (!form.amount || isNaN(amt))   return 'Please enter a valid amount.';
    if (amt < 100)                    return 'Amount must be at least ₹100.';
    if (amt > 10000000)               return 'Amount cannot exceed ₹1 Crore.';
    if (!form.startDate)              return 'Please select a start date.';
    if (new Date(form.startDate) > new Date()) return 'Start date cannot be in the future.';
    return null;
  };

  const addSIP = async () => {
    if (!user?.id) return;
    const validationError = validate();
    if (validationError) return setError(validationError);
    setSaving(true); setError('');
    try {
      const res  = await fetch(`${BASE}/sips/${user.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), amount: Number(form.amount), startDate: form.startDate, frequency: form.frequency }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSips(prev => [{ id: data.id, name: data.name, amount: data.amount, startDate: data.start_date, frequency: data.frequency }, ...prev]);
      setForm({ name: '', amount: '', startDate: '', frequency: 'monthly' });
      setAdding(false);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const removeSIP = async (id) => {
    if (!user?.id) return;
    setSips(prev => prev.filter(s => s.id !== id));
    await fetch(`${BASE}/sips/${user.id}/${id}`, { method: 'DELETE' });
  };

  const getStats = (sip) => {
    const s = new Date(sip.startDate), n = new Date();
    const m = Math.max(0, (n.getFullYear() - s.getFullYear()) * 12 + n.getMonth() - s.getMonth());
    return { months: m, invested: sip.amount * m };
  };

  return (
    <div className="fade-in">
      <PageHeader icon="📊" title="My SIPs"
        subtitle="Track your active SIPs and monitor total invested amount"
        onBack={onBack} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: '#7788aa' }}>{sips.length} active SIP{sips.length !== 1 ? 's' : ''}</div>
        <button className="btn" onClick={() => setAdding(!adding)}
          style={{ color: '#00ff88', borderColor: '#00ff8844', background: '#00ff8811' }}>
          {adding ? 'CANCEL' : '+ ADD SIP'}
        </button>
      </div>

      {adding && (
        <SIPForm
          form={form} setForm={setForm}
          onAdd={addSIP} onCancel={() => setAdding(false)}
          saving={saving}
        />
      )}

      {error && (
        <div style={{ fontSize: 13, color: '#ff4444', background: '#ff444411',
          border: '1px solid #ff444433', borderRadius: 4, padding: '10px 14px', marginBottom: 14 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#445' }}>
          <div style={{ fontSize: 13 }}>Loading your SIPs...</div>
        </div>
      ) : sips.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#445' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 15, color: '#556', marginBottom: 8 }}>No SIPs tracked yet</div>
          <div style={{ fontSize: 13, color: '#445' }}>Click + ADD SIP to start tracking your investments.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 8 }}>
            {[
              { l: 'MONTHLY', v: fmtRs(sips.reduce((a, s) => a + s.amount, 0)),               c: '#ff9a00' },
              { l: 'INVESTED', v: fmtRs(sips.reduce((a, s) => a + getStats(s).invested, 0)),  c: '#4488ff' },
              { l: 'SIPs', v: sips.length,                                                      c: '#00ff88' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', borderColor: s.c + '33', padding: '12px 8px' }}>
                <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 6 }}>{s.l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
          {sips.map(sip => {
            const { months, invested } = getStats(sip);
            return (
              <div key={sip.id} className="card" style={{ padding: '14px 16px' }}>
                {/* Top row: name + remove */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8f0' }}>{sip.name}</div>
                    <div style={{ fontSize: 11, color: '#7788aa', marginTop: 3 }}>
                      {sip.frequency} · since {new Date(sip.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <button className="btn-sm btn-danger" onClick={() => removeSIP(sip.id)}>✕</button>
                </div>
                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { l: 'MONTHLY',  v: fmtRs(sip.amount), c: '#ff9a00' },
                    { l: 'INVESTED', v: fmtRs(invested),   c: '#4488ff' },
                    { l: 'MONTHS',   v: months,             c: '#b0c0dd' },
                  ].map((x, i) => (
                    <div key={i} style={{ background: '#0a0a14', borderRadius: 4, padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.08em', marginBottom: 4 }}>{x.l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: x.c }}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page: ETFs ────────────────────────────────────────────────────────────────
function ETFPage({ onBack, onScan }) {
  const [category, setCategory] = useState('INDEX');

  return (
    <div className="fade-in">
      <PageHeader icon="📈" title="NSE ETFs"
        subtitle="Live prices from NSE — click any ETF to run an AI scan"
        onBack={onBack} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.keys(ETF_UNIVERSE).map(cat => (
          <button key={cat} className="btn-sm" onClick={() => setCategory(cat)} style={{
            color:       category === cat ? '#ff9a00' : '#99aacc',
            borderColor: category === cat ? '#ff9a00' : '#2a2a3e',
            background:  category === cat ? '#ff9a0011' : '#1a1a2e',
          }}>{cat}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {ETF_UNIVERSE[category].map(etf => <ETFCard key={etf.symbol} etf={etf} onScan={onScan} />)}
      </div>
    </div>
  );
}

function ETFCard({ etf, onScan }) {
  const [price,   setPrice]   = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${BASE}/india/quote/${etf.symbol}`)
      .then(r => r.json())
      .then(d => { setPrice(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [etf.symbol]);
  const isUp = (price?.changePct || 0) >= 0;
  return (
    <div style={{ background: '#0f0f1a', border: '1px solid #2a2a40', borderRadius: 6,
      padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
      onClick={() => onScan(etf.symbol)}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#ff9a0066'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a40'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#fff' }}>{etf.symbol}</div>
          <div style={{ fontSize: 11, color: '#7788aa', marginTop: 2 }}>{etf.name}</div>
        </div>
        {loading ? <div style={{ fontSize: 11, color: '#445' }}>—</div> : price?.price ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f0' }}>{fmtRs(price.price)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isUp ? '#00ff88' : '#ff4444' }}>
              {isUp ? '+' : ''}{(price.changePct || 0).toFixed(2)}%
            </div>
          </div>
        ) : <div style={{ fontSize: 11, color: '#445' }}>N/A</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#445' }}>Tracks: {etf.tracking}</div>
        <div style={{ fontSize: 10, color: '#ff9a0077' }}>SCAN →</div>
      </div>
    </div>
  );
}

// ── Page: Mutual Funds ────────────────────────────────────────────────────────
function MFPage({ onBack }) {
  const [navData, setNavData] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('All');

  useEffect(() => {
    Promise.allSettled(MF_LIST.map(async mf => {
      try {
        const res  = await fetch(`${BASE}/mf/nav/${mf.schemeCode}`);
        const data = await res.json();
        if (data?.data?.[0]?.nav) {
          setNavData(prev => ({ ...prev, [mf.schemeCode]: {
            nav:  parseFloat(data.data[0].nav),
            date: data.data[0].date,
            name: data.meta?.scheme_name,
          }}));
        }
      } catch {}
    })).finally(() => setLoading(false));
  }, []);

  const categories = ['All', ...new Set(MF_LIST.map(m => m.category))];
  const filtered   = filter === 'All' ? MF_LIST : MF_LIST.filter(m => m.category === filter);

  return (
    <div className="fade-in">
      <PageHeader icon="🏦" title="Mutual Fund Explorer"
        subtitle="Live NAV data for popular Indian mutual funds via MFAPI.in"
        onBack={onBack} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c} className="btn-sm" onClick={() => setFilter(c)} style={{
            color:       filter === c ? '#4488ff' : '#99aacc',
            borderColor: filter === c ? '#4488ff' : '#2a2a3e',
            background:  filter === c ? '#4488ff11' : '#1a1a2e',
          }}>{c}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {filtered.map(mf => {
          const nav = navData[mf.schemeCode];
          return (
            <div key={mf.schemeCode} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, marginRight: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0', lineHeight: 1.4, marginBottom: 8 }}>{mf.name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Pill label={mf.category} color="#4488ff" />
                    <Pill label={mf.risk} color={mf.risk === 'Low' ? '#00ff88' : mf.risk === 'High' ? '#ff4444' : '#ffaa00'} />
                  </div>
                </div>
                {loading ? (
                  <div style={{ fontSize: 12, color: '#445', animation: 'pulse 1s infinite' }}>—</div>
                ) : nav?.nav ? (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e8f0' }}>{fmtRs(nav.nav)}</div>
                    <div style={{ fontSize: 10, color: '#556677', marginTop: 2 }}>NAV · {nav.date}</div>
                  </div>
                ) : <div style={{ fontSize: 12, color: '#445' }}>N/A</div>}
              </div>
              <div style={{ fontSize: 10, color: '#2a2a3e', marginTop: 10 }}>Scheme: {mf.schemeCode}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: '#445', marginTop: 16, textAlign: 'center' }}>
        NAV data from MFAPI.in · Updated daily · Not investment advice
      </div>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'sip',       icon: '🔄', label: 'SIP Planner',  desc: 'Calculate SIP returns · Compare with lump sum'            },
  { id: 'portfolio', icon: '🤖', label: 'AI Portfolio', desc: 'Risk quiz → personalised ETF & MF allocation'             },
  { id: 'tracker',   icon: '📊', label: 'My SIPs',      desc: 'Track active SIPs · Monitor total invested amount'        },
  { id: 'etfs',      icon: '📈', label: 'ETFs',         desc: '28+ NSE ETFs with live prices · Click to run AI scan'     },
  { id: 'mf',        icon: '🏦', label: 'Mutual Funds', desc: 'Live NAV data for popular index and sectoral funds'       },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function IndiaInvestTab({ onScanTicker }) {
  const [activePage,  setActivePage]  = useState(null); // null = overview
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { plan } = useUsage();
  const isPro = plan === 'pro';

  const goBack = () => setActivePage(null);

  // ── Overview — 5 full-width tab cards ──────────────────────────────────────
  const Overview = () => (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#ff9a00', marginBottom: 4 }}>INVEST</div>
        <div style={{ fontSize: 12, color: '#7788aa' }}>SIP Planner · AI Portfolio · ETFs · Mutual Funds · India only</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActivePage(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 16, width: '100%',
              background: '#0f0f1a', border: '1px solid #2a2a40',
              borderLeft: '3px solid #ff9a0055',
              borderRadius: 6, padding: '18px 20px', cursor: 'pointer',
              textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ff9a00'; e.currentTarget.style.background = '#ff9a0008'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a40'; e.currentTarget.style.background = '#0f0f1a'; e.currentTarget.style.borderLeftColor = '#ff9a0055'; }}
          >
            <span style={{ fontSize: 26, flexShrink: 0 }}>{tab.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#c8d8f0', letterSpacing: '0.05em', marginBottom: 3 }}>
                {tab.label}
              </div>
              <div style={{ fontSize: 12, color: '#556677' }}>{tab.desc}</div>
            </div>
            <div style={{ fontSize: 14, color: '#3a3a5e', flexShrink: 0 }}>›</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Upgrade wall ────────────────────────────────────────────────────────────
  const UpgradeWall = () => (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#ff9a00', marginBottom: 4 }}>INVEST</div>
        <div style={{ fontSize: 12, color: '#7788aa' }}>SIP Planner · AI Portfolio · ETFs · Mutual Funds · India only</div>
      </div>
      <div style={{ background: '#0f0f1a', border: '1px solid #ff9a0044', borderTop: '3px solid #ff9a00',
        borderRadius: 6, padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🔒</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: '#ff9a00', marginBottom: 12 }}>PRO FEATURE</div>
        <div style={{ fontSize: 13, color: '#99aacc', lineHeight: 1.8, maxWidth: 460, margin: '0 auto 24px' }}>
          Invest gives you SIP planning tools, AI portfolio recommendations, ETF signals, and mutual fund NAV data — all in one place.
        </div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 44, color: '#ff9a00', marginBottom: 4 }}>
          ₹249<span style={{ fontSize: 22 }}>/mo</span>
        </div>
        <div style={{ fontSize: 12, color: '#7788aa', marginBottom: 28 }}>No credit card required · First month free</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400, margin: '0 auto 32px', textAlign: 'left' }}>
          {['SIP calculator with SIP vs Lump Sum comparison', 'AI portfolio recommender based on your risk profile', 'Track all your active SIPs', 'NSE ETF scanner with live prices', 'Mutual fund NAV explorer'].map((f, i) => (
            <div key={i} style={{ fontSize: 13, color: '#b0c0dd', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#ff9a00', flexShrink: 0, fontSize: 14 }}>✓</span>{f}
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => setShowUpgrade(true)}
          style={{ fontSize: 14, padding: '14px 52px', background: '#ff9a0022', borderColor: '#ff9a00', color: '#ff9a00' }}>
          START FREE MONTH →
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {showUpgrade && <UpgradeModal type="scan" onClose={() => setShowUpgrade(false)} />}

      {!isPro ? <UpgradeWall /> : activePage === null  ? <Overview /> :
        activePage === 'sip'       ? <SIPPage       onBack={goBack} /> :
        activePage === 'portfolio' ? <PortfolioPage  onBack={goBack} /> :
        activePage === 'tracker'   ? <SIPTrackerPage onBack={goBack} /> :
        activePage === 'etfs'      ? <ETFPage        onBack={goBack} onScan={onScanTicker} /> :
        activePage === 'mf'        ? <MFPage         onBack={goBack} /> :
        <Overview />
      }

      {isPro && activePage && (
        <div style={{ fontSize: 10, color: '#2a2a3e', marginTop: 32, textAlign: 'center' }}>
          Not financial advice. Investments subject to market risk. Read all scheme documents carefully.
        </div>
      )}
    </div>
  );
}