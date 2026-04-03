import { useState, useEffect } from 'react';
import { useUsage } from '../hooks/useUsage';
import UpgradeModal from '../components/UpgradeModal';

const BASE = import.meta.env.VITE_API_BASE;

// ── ETF Universe ──────────────────────────────────────────────────────────────
const ETF_UNIVERSE = {
  INDEX: [
    { symbol: 'NIFTYBEES',  name: 'Nippon Nifty BeES',     tracking: 'Nifty 50'       },
    { symbol: 'JUNIORBEES', name: 'Nippon Junior BeES',    tracking: 'Nifty Next 50'  },
    { symbol: 'SETFNN50',   name: 'SBI Nifty Next 50 ETF', tracking: 'Nifty Next 50'  },
    { symbol: 'MOM100',     name: 'Nippon Nifty 100 ETF',  tracking: 'Nifty 100'      },
    { symbol: 'MIDCAPETF',  name: 'SBI Nifty Midcap ETF',  tracking: 'Nifty Midcap'   },
    { symbol: 'SENSEXETF',  name: 'SBI Sensex ETF',        tracking: 'BSE Sensex'     },
    { symbol: 'ICICINIFTY', name: 'ICICI Nifty ETF',       tracking: 'Nifty 50'       },
  ],
  SECTORAL: [
    { symbol: 'BANKBEES',   name: 'Nippon Bank BeES',      tracking: 'Nifty Bank'     },
    { symbol: 'ITBEES',     name: 'Nippon IT BeES',        tracking: 'Nifty IT'       },
    { symbol: 'PHARMABEES', name: 'Nippon Pharma BeES',    tracking: 'Nifty Pharma'   },
    { symbol: 'INFRABEES',  name: 'Nippon Infra BeES',     tracking: 'Nifty Infra'    },
    { symbol: 'PSUBNKBEES', name: 'Nippon PSU Bank BeES',  tracking: 'Nifty PSU Bank' },
    { symbol: 'AUTOBEES',   name: 'Nippon Auto BeES',      tracking: 'Nifty Auto'     },
    { symbol: 'FMCGBEES',   name: 'Nippon FMCG BeES',      tracking: 'Nifty FMCG'    },
  ],
  COMMODITY: [
    { symbol: 'GOLDBEES',   name: 'Nippon Gold BeES',      tracking: 'Gold'           },
    { symbol: 'SILVERETF',  name: 'ICICI Silver ETF',      tracking: 'Silver'         },
    { symbol: 'SETFGOLD',   name: 'SBI Gold ETF',          tracking: 'Gold'           },
    { symbol: 'HDFCGOLD',   name: 'HDFC Gold ETF',         tracking: 'Gold'           },
  ],
  DEBT: [
    { symbol: 'LIQUIDBEES', name: 'Nippon Liquid BeES',    tracking: 'Overnight Rate' },
    { symbol: 'LIQUIDETF',  name: 'HDFC Liquid ETF',       tracking: 'Overnight Rate' },
    { symbol: 'CPSEETF',    name: 'Nippon CPSE ETF',       tracking: 'Nifty CPSE'    },
  ],
};

// ── Mutual Funds ──────────────────────────────────────────────────────────────
const MF_LIST = [
  { schemeCode: '120503', name: 'UTI Nifty 50 Index Fund',       category: 'Index',    risk: 'Moderate' },
  { schemeCode: '120465', name: 'HDFC Index Fund Nifty 50',      category: 'Index',    risk: 'Moderate' },
  { schemeCode: '125494', name: 'SBI Nifty Index Fund',          category: 'Index',    risk: 'Moderate' },
  { schemeCode: '147622', name: 'Mirae Asset Large Cap Fund',    category: 'Large Cap', risk: 'Moderate' },
  { schemeCode: '119598', name: 'Axis Bluechip Fund',            category: 'Large Cap', risk: 'Moderate' },
  { schemeCode: '100356', name: 'Parag Parikh Flexi Cap Fund',   category: 'Flexi Cap', risk: 'Moderate' },
  { schemeCode: '135781', name: 'SBI Small Cap Fund',            category: 'Small Cap', risk: 'High'     },
  { schemeCode: '120828', name: 'HDFC Mid-Cap Opportunities',    category: 'Mid Cap',   risk: 'High'     },
  { schemeCode: '125497', name: 'SBI Magnum Gilt Fund',          category: 'Debt',      risk: 'Low'      },
  { schemeCode: '119756', name: 'HDFC Liquid Fund',              category: 'Liquid',    risk: 'Low'      },
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
        ← INVEST
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: '#99aacc' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ff9a00' }}>{display}</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.15em', marginBottom: 20 }}>INPUTS</div>
            <Slider label="Monthly SIP Amount" value={monthly} setValue={setMonthly} min={500} max={100000} step={500} display={fmtRs(monthly)} />
            <Slider label="Investment Duration" value={years}   setValue={setYears}   min={1}   max={30}     step={1}   display={`${years} years`} />
            <Slider label="Expected Annual Return" value={rate} setValue={setRate}    min={4}   max={25}     step={0.5} display={`${rate}%`} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.15em', marginBottom: 20 }}>INPUTS</div>
            <Slider label="Total Investment" value={lumpSum} setValue={setLumpSum} min={10000} max={10000000} step={10000} display={fmtRs(lumpSum)} />
            <Slider label="Duration"         value={years}   setValue={setYears}   min={1}     max={30}       step={1}     display={`${years} yrs`} />
            <Slider label="Expected Return"  value={rate}    setValue={setRate}    min={4}     max={25}       step={0.5}   display={`${rate}%`} />
          </div>
          {[
            { label: 'LUMP SUM',         color: '#4488ff', maturity: lsMaturity, invested: lumpSum },
            { label: 'SIP (same total)', color: '#00ff88', maturity: sipTotal,   invested: lumpSum },
          ].map((col, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 10, color: col.color, letterSpacing: '0.15em', textAlign: 'center', marginBottom: 4 }}>{col.label}</div>
              {[
                { label: 'MATURITY', value: fmtRs(col.maturity),              color: col.color, large: true },
                { label: 'INVESTED', value: fmtRs(col.invested),              color: '#e8e8f0' },
                { label: 'GAIN',     value: fmtRs(col.maturity - col.invested), color: col.color },
              ].map((item, j) => (
                <div key={j} className="card" style={{ textAlign: 'center', borderColor: item.color + '33' }}>
                  <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: item.large ? 28 : 18, fontWeight: 700, color: item.color,
                    fontFamily: item.large ? "'Bebas Neue',sans-serif" : 'inherit' }}>{item.value}</div>
                </div>
              ))}
            </div>
          ))}
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
    } catch (e) { setError(e.message); }
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
            style={{ alignSelf: 'flex-start' }}>RETAKE QUIZ</button>
          <div className="card" style={{ borderColor: '#00ff8833' }}>
            <div style={{ fontSize: 11, color: '#00ff88', letterSpacing: '0.12em', marginBottom: 10 }}>AI RECOMMENDATION</div>
            <div style={{ fontSize: 13, color: '#b0c0dd', lineHeight: 1.8 }}>{aiResult.summary}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {aiResult.topPicks?.map((pick, i) => (
              <div key={i} className="card" style={{ borderColor: '#ff9a0033' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Pill label={pick.type} color={pick.type === 'ETF' ? '#ff9a00' : '#4488ff'} />
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#ff9a00' }}>{pick.allocation}%</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0', marginBottom: 4 }}>{pick.name}</div>
                {pick.symbol && <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 8 }}>{pick.symbol}</div>}
                <div style={{ fontSize: 12, color: '#99aacc', lineHeight: 1.7 }}>{pick.reason}</div>
              </div>
            ))}
          </div>
          {aiResult.monthlyPlan && (
            <div className="card">
              <div style={{ fontSize: 11, color: '#ff9a00', letterSpacing: '0.12em', marginBottom: 14 }}>MONTHLY SIP BREAKDOWN — {fmtRs(aiResult.monthlyPlan.total)}</div>
              {aiResult.monthlyPlan.breakdown?.map((b, i) => (
                <div key={i} className="kv">
                  <span className="kv-key">{b.instrument}</span>
                  <span className="kv-value" style={{ color: '#ff9a00' }}>{fmtRs(b.amount)}/mo</span>
                </div>
              ))}
            </div>
          )}
          {aiResult.advice && (
            <div className="card" style={{ borderLeft: '3px solid #ff9a0055' }}>
              <div style={{ fontSize: 13, color: '#b0c0dd', lineHeight: 1.8, fontStyle: 'italic' }}>{aiResult.advice}</div>
            </div>
          )}
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
                {error && <div style={{ fontSize: 12, color: '#ff4444', marginBottom: 12 }}>{error}</div>}
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

// ── Page: My SIPs ─────────────────────────────────────────────────────────────
function SIPTrackerPage({ onBack }) {
  const [sips,   setSips]   = useState(() => { try { return JSON.parse(localStorage.getItem('quaint_sips') || '[]'); } catch { return []; } });
  const [form,   setForm]   = useState({ name: '', amount: '', startDate: '', frequency: 'monthly' });
  const [adding, setAdding] = useState(false);

  const save = (u) => { setSips(u); localStorage.setItem('quaint_sips', JSON.stringify(u)); };
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
        <div className="card" style={{ marginBottom: 20, borderColor: '#00ff8833' }}>
          <div style={{ fontSize: 11, color: '#00ff88', letterSpacing: '0.15em', marginBottom: 16 }}>NEW SIP</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            {[
              { label: 'FUND / ETF NAME', key: 'name',      type: 'text',   ph: 'e.g. NIFTYBEES or UTI Nifty 50' },
              { label: 'AMOUNT (₹)',      key: 'amount',    type: 'number', ph: '5000'                            },
              { label: 'START DATE',      key: 'startDate', type: 'date',   ph: ''                                },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 6 }}>{f.label}</div>
                <input className="input" type={f.type} placeholder={f.ph}
                  value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 6 }}>FREQUENCY</div>
              <select className="input" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <button className="btn" onClick={() => {
              if (!form.name || !form.amount || !form.startDate) return;
              save([...sips, { ...form, id: Date.now(), amount: Number(form.amount) }]);
              setForm({ name: '', amount: '', startDate: '', frequency: 'monthly' });
              setAdding(false);
            }}>ADD SIP</button>
          </div>
        </div>
      )}

      {sips.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#445' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 15, color: '#556', marginBottom: 8 }}>No SIPs tracked yet</div>
          <div style={{ fontSize: 13, color: '#445' }}>Click + ADD SIP to start tracking your investments.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 8 }}>
            {[
              { l: 'TOTAL MONTHLY',  v: fmtRs(sips.reduce((a, s) => a + s.amount, 0)),                     c: '#ff9a00' },
              { l: 'TOTAL INVESTED', v: fmtRs(sips.reduce((a, s) => a + getStats(s).invested, 0)),         c: '#4488ff' },
              { l: 'ACTIVE SIPs',    v: sips.length,                                                         c: '#00ff88' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', borderColor: s.c + '33' }}>
                <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.15em', marginBottom: 6 }}>{s.l}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
          {sips.map(sip => {
            const { months, invested } = getStats(sip);
            return (
              <div key={sip.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8f0' }}>{sip.name}</div>
                  <div style={{ fontSize: 11, color: '#7788aa', marginTop: 3 }}>
                    {sip.frequency} · since {new Date(sip.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  {[
                    { l: 'MONTHLY',  v: fmtRs(sip.amount), c: '#ff9a00' },
                    { l: 'INVESTED', v: fmtRs(invested),   c: '#4488ff' },
                    { l: 'MONTHS',   v: months,             c: '#b0c0dd' },
                  ].map((x, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.1em' }}>{x.l}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: x.c }}>{x.v}</div>
                    </div>
                  ))}
                  <button className="btn-sm btn-danger"
                    onClick={() => save(sips.filter(s => s.id !== sip.id))}>✕</button>
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
    Promise.allSettled(MF_LIST.slice(0, 6).map(async mf => {
      try {
        const res  = await fetch(`https://api.mfapi.in/mf/${mf.schemeCode}/latest`);
        const data = await res.json();
        setNavData(prev => ({ ...prev, [mf.schemeCode]: { nav: parseFloat(data.data?.[0]?.nav), date: data.data?.[0]?.date } }));
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