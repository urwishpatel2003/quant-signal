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

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Accordion wrapper — matches app style ─────────────────────────────────────
function AccordionCard({ title, subtitle, icon, isOpen, onToggle, accent = '#ff9a00', children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 8 }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', cursor: 'pointer',
          background: isOpen ? '#0f0f1a' : 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#0d0d18'; }}
        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = isOpen ? '#0f0f1a' : 'transparent'; }}
      >
        <div style={{ fontSize: 22, flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18,
            color: isOpen ? accent : '#c8d8f0', letterSpacing: '0.05em', lineHeight: 1.2 }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: '#556677', marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        <div style={{ fontSize: 12, color: isOpen ? accent : '#3a3a5e', flexShrink: 0 }}>
          {isOpen ? '▲' : '▼'}
        </div>
      </div>
      {/* Content */}
      {isOpen && (
        <div style={{ padding: '4px 18px 20px', borderTop: '1px solid #1e1e30' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Tool: SIP Calculator ──────────────────────────────────────────────────────
function SIPCalculator() {
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
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: '#99aacc' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ff9a00' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => setValue(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#ff9a00' }} />
    </div>
  );

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['sip', 'SIP Calculator'], ['compare', 'SIP vs Lump Sum']].map(([k, l]) => (
          <button key={k} className="btn-sm" onClick={() => setView(k)} style={{
            color: view === k ? '#ff9a00' : '#99aacc',
            borderColor: view === k ? '#ff9a00' : '#2a2a3e',
            background: view === k ? '#ff9a0011' : '#1a1a2e',
          }}>{l}</button>
        ))}
      </div>

      {view === 'sip' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <Slider label="Monthly SIP" value={monthly} setValue={setMonthly} min={500} max={100000} step={500} display={fmtRs(monthly)} />
            <Slider label="Duration" value={years} setValue={setYears} min={1} max={30} step={1} display={`${years} years`} />
            <Slider label="Expected Return" value={rate} setValue={setRate} min={4} max={25} step={0.5} display={`${rate}%`} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'MATURITY VALUE', value: fmtRs(maturity), color: '#00ff88', large: true },
              { label: 'TOTAL INVESTED', value: fmtRs(invested), color: '#e8e8f0' },
              { label: 'WEALTH GAIN',    value: fmtRs(gain),     color: '#ff9a00' },
              { label: 'RETURNS',        value: `${((gain / invested) * 100).toFixed(1)}%`, color: '#4488ff' },
            ].map((item, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', padding: '10px 14px', borderColor: item.color + '33' }}>
                <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.15em', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: item.large ? 24 : 17, fontWeight: 700, color: item.color,
                  fontFamily: item.large ? "'Bebas Neue',sans-serif" : 'inherit' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'compare' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <Slider label="Total Investment" value={lumpSum} setValue={setLumpSum} min={10000} max={10000000} step={10000} display={fmtRs(lumpSum)} />
            <Slider label="Duration" value={years} setValue={setYears} min={1} max={30} step={1} display={`${years} yrs`} />
            <Slider label="Expected Return" value={rate} setValue={setRate} min={4} max={25} step={0.5} display={`${rate}%`} />
          </div>
          {[
            { label: 'LUMP SUM',         color: '#4488ff', maturity: lsMaturity, invested: lumpSum },
            { label: 'SIP (same total)', color: '#00ff88', maturity: sipTotal,   invested: lumpSum },
          ].map((col, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, color: col.color, letterSpacing: '0.15em', textAlign: 'center' }}>{col.label}</div>
              {[
                { label: 'MATURITY', value: fmtRs(col.maturity),                  color: col.color, large: true },
                { label: 'INVESTED', value: fmtRs(col.invested),                  color: '#e8e8f0' },
                { label: 'GAIN',     value: fmtRs(col.maturity - col.invested),   color: col.color },
              ].map((item, j) => (
                <div key={j} className="card" style={{ textAlign: 'center', padding: '8px', borderColor: item.color + '33' }}>
                  <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: item.large ? 20 : 13, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#445', marginTop: 14, textAlign: 'center' }}>
        Returns are estimated. Past performance does not indicate future results.
      </div>
    </div>
  );
}

// ── Tool: AI Portfolio Recommender ────────────────────────────────────────────
function AIPortfolioRecommender({ sipAmount, setSipAmount }) {
  const [answers,   setAnswers]   = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult,  setAiResult]  = useState(null);
  const [step,      setStep]      = useState(0);
  const [error,     setError]     = useState('');

  const handleAnswer = (idx, score) => { const next = [...answers]; next[idx] = score; setAnswers(next); };
  const allAnswered   = answers.length === RISK_QUESTIONS.length && answers.every(a => a != null);
  const totalScore    = answers.reduce((a, b) => a + (b || 0), 0);
  const riskProfile   = allAnswered ? getRiskProfile(totalScore) : null;
  const allocation    = allAnswered ? getPortfolioAllocation(totalScore) : null;

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

  if (step === 1 && aiResult) return (
    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button className="btn-sm" onClick={() => { setStep(0); setAiResult(null); setAnswers([]); }}
        style={{ alignSelf: 'flex-start' }}>RETAKE QUIZ</button>
      <div className="card" style={{ borderColor: '#00ff8833' }}>
        <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 8 }}>AI RECOMMENDATION</div>
        <div style={{ fontSize: 13, color: '#b0c0dd', lineHeight: 1.8 }}>{aiResult.summary}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {aiResult.topPicks?.map((pick, i) => (
          <div key={i} className="card" style={{ borderColor: '#ff9a0033' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Pill label={pick.type} color={pick.type === 'ETF' ? '#ff9a00' : '#4488ff'} />
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#ff9a00' }}>{pick.allocation}%</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0', marginBottom: 4 }}>{pick.name}</div>
            {pick.symbol && <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 6 }}>{pick.symbol}</div>}
            <div style={{ fontSize: 11, color: '#99aacc', lineHeight: 1.6 }}>{pick.reason}</div>
          </div>
        ))}
      </div>
      {aiResult.monthlyPlan && (
        <div className="card">
          <div style={{ fontSize: 11, color: '#ff9a00', marginBottom: 10 }}>MONTHLY SIP BREAKDOWN</div>
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
          <div style={{ fontSize: 12, color: '#b0c0dd', lineHeight: 1.8, fontStyle: 'italic' }}>{aiResult.advice}</div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ marginBottom: 20, padding: '12px 16px', background: '#0a0a14', borderRadius: 4, border: '1px solid #1a1a2e' }}>
        <div style={{ fontSize: 12, color: '#99aacc', marginBottom: 8 }}>Monthly SIP budget</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="range" min={500} max={100000} step={500} value={sipAmount}
            onChange={e => setSipAmount(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#ff9a00' }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#ff9a00', minWidth: 80 }}>{fmtRs(sipAmount)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {RISK_QUESTIONS.map((q, qi) => (
          <div key={qi} className="card">
            <div style={{ fontSize: 13, fontWeight: 600, color: '#c8d8f0', marginBottom: 10 }}>
              <span style={{ color: '#ff9a00', marginRight: 8 }}>{qi + 1}.</span>{q.q}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {q.options.map((opt, oi) => (
                <button key={oi} onClick={() => handleAnswer(qi, opt.score)} style={{
                  padding: '9px 12px', textAlign: 'left', fontSize: 12,
                  background: answers[qi] === opt.score ? '#ff9a0022' : '#0a0a14',
                  border: `1px solid ${answers[qi] === opt.score ? '#ff9a00' : '#2a2a3e'}`,
                  color: answers[qi] === opt.score ? '#ff9a00' : '#b0c0dd',
                  cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit',
                }}>{opt.label}</button>
              ))}
            </div>
          </div>
        ))}
        {allAnswered && (
          <div className="card" style={{ borderColor: riskProfile.color + '44', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 6 }}>YOUR RISK PROFILE</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: riskProfile.color, marginBottom: 4 }}>{riskProfile.label}</div>
            <div style={{ fontSize: 12, color: '#7788aa', marginBottom: 16 }}>Expected return: ~{riskProfile.expected}%</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
              {Object.entries(allocation).map(([k, v]) => (
                <div key={k} style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 4, padding: '6px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: riskProfile.color }}>{v}%</div>
                  <div style={{ fontSize: 10, color: '#7788aa' }}>{k}</div>
                </div>
              ))}
            </div>
            {error && <div style={{ fontSize: 12, color: '#ff4444', marginBottom: 10 }}>{error}</div>}
            <button className="btn" onClick={getAIRecommendation} disabled={aiLoading}>
              {aiLoading ? 'GENERATING...' : 'GET AI PORTFOLIO RECOMMENDATION'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool: SIP Tracker ─────────────────────────────────────────────────────────
function SIPTracker() {
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
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#7788aa' }}>{sips.length} active SIP{sips.length !== 1 ? 's' : ''}</div>
        <button className="btn-sm" onClick={() => setAdding(!adding)}
          style={{ color: '#00ff88', borderColor: '#00ff8844' }}>
          {adding ? 'CANCEL' : '+ ADD SIP'}
        </button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 14, borderColor: '#00ff8833' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            {[
              { label: 'NAME',       key: 'name',      type: 'text',   ph: 'e.g. NIFTYBEES' },
              { label: 'AMOUNT (₹)', key: 'amount',    type: 'number', ph: '5000'           },
              { label: 'START DATE', key: 'startDate', type: 'date',   ph: ''               },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 4 }}>{f.label}</div>
                <input className="input" type={f.type} placeholder={f.ph}
                  value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 4 }}>FREQ</div>
              <select className="input" value={form.frequency}
                onChange={e => setForm({ ...form, frequency: e.target.value })}>
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
            }}>ADD</button>
          </div>
        </div>
      )}

      {sips.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#445' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 13 }}>No SIPs tracked yet. Click + ADD SIP to start.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 6 }}>
            {[
              { l: 'MONTHLY',    v: fmtRs(sips.reduce((a, s) => a + s.amount, 0)),                       c: '#ff9a00' },
              { l: 'INVESTED',   v: fmtRs(sips.reduce((a, s) => a + getStats(s).invested, 0)),           c: '#4488ff' },
              { l: 'ACTIVE SIPs', v: sips.length,                                                         c: '#00ff88' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', padding: '10px', borderColor: s.c + '33' }}>
                <div style={{ fontSize: 9, color: '#7788aa', marginBottom: 3 }}>{s.l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
          {sips.map(sip => {
            const { months, invested } = getStats(sip);
            return (
              <div key={sip.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0' }}>{sip.name}</div>
                  <div style={{ fontSize: 11, color: '#7788aa' }}>{sip.frequency}</div>
                </div>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                  {[
                    { l: 'MONTHLY',  v: fmtRs(sip.amount), c: '#ff9a00' },
                    { l: 'INVESTED', v: fmtRs(invested),   c: '#4488ff' },
                    { l: 'MONTHS',   v: months,             c: '#b0c0dd' },
                  ].map((x, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#7788aa' }}>{x.l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: x.c }}>{x.v}</div>
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

// ── Tool: ETF Scanner ─────────────────────────────────────────────────────────
function ETFScanner({ onScan }) {
  const [category, setCategory] = useState('INDEX');

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {Object.keys(ETF_UNIVERSE).map(cat => (
          <button key={cat} className="btn-sm" onClick={() => setCategory(cat)} style={{
            color:       category === cat ? '#ff9a00' : '#99aacc',
            borderColor: category === cat ? '#ff9a00' : '#2a2a3e',
            background:  category === cat ? '#ff9a0011' : '#1a1a2e',
          }}>{cat}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
        {ETF_UNIVERSE[category].map(etf => (
          <ETFCard key={etf.symbol} etf={etf} onScan={onScan} />
        ))}
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
      padding: '12px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
      onClick={() => onScan(etf.symbol)}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#ff9a0066'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a40'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#fff' }}>{etf.symbol}</div>
          <div style={{ fontSize: 10, color: '#7788aa' }}>{etf.name}</div>
        </div>
        {loading ? <div style={{ fontSize: 10, color: '#445' }}>—</div> : price?.price ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f0' }}>{fmtRs(price.price)}</div>
            <div style={{ fontSize: 11, color: isUp ? '#00ff88' : '#ff4444' }}>
              {isUp ? '+' : ''}{(price.changePct || 0).toFixed(2)}%
            </div>
          </div>
        ) : <div style={{ fontSize: 10, color: '#445' }}>N/A</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, color: '#445' }}>Tracks: {etf.tracking}</div>
        <div style={{ fontSize: 9, color: '#ff9a0077' }}>SCAN →</div>
      </div>
    </div>
  );
}

// ── Tool: Mutual Fund Explorer ────────────────────────────────────────────────
function MFExplorer() {
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
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c} className="btn-sm" onClick={() => setFilter(c)} style={{
            color:       filter === c ? '#4488ff' : '#99aacc',
            borderColor: filter === c ? '#4488ff' : '#2a2a3e',
            background:  filter === c ? '#4488ff11' : '#1a1a2e',
          }}>{c}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
        {filtered.map(mf => {
          const nav = navData[mf.schemeCode];
          return (
            <div key={mf.schemeCode} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1, marginRight: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0', lineHeight: 1.4, marginBottom: 6 }}>{mf.name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Pill label={mf.category} color="#4488ff" />
                    <Pill label={mf.risk} color={mf.risk === 'Low' ? '#00ff88' : mf.risk === 'High' ? '#ff4444' : '#ffaa00'} />
                  </div>
                </div>
                {loading ? <div style={{ fontSize: 10, color: '#445' }}>—</div> : nav?.nav ? (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f0' }}>{fmtRs(nav.nav)}</div>
                    <div style={{ fontSize: 10, color: '#556677' }}>{nav.date}</div>
                  </div>
                ) : <div style={{ fontSize: 10, color: '#445' }}>N/A</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: '#445', marginTop: 10, textAlign: 'center' }}>
        NAV from MFAPI.in · Updated daily · Not investment advice
      </div>
    </div>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'sip',       icon: '🔄', label: 'SIP Planner',  desc: 'Calculate SIP returns and compare with lump sum investment'    },
  { id: 'portfolio', icon: '🤖', label: 'AI Portfolio', desc: 'Personalised ETF allocation based on your risk profile'        },
  { id: 'tracker',   icon: '📊', label: 'My SIPs',      desc: 'Track your active SIPs and monitor total invested'             },
  { id: 'etfs',      icon: '📈', label: 'ETFs',         desc: 'Browse 28+ NSE ETFs with live prices — click to scan'         },
  { id: 'mf',        icon: '🏦', label: 'Mutual Funds', desc: 'Explore popular mutual funds with live NAV data'               },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function IndiaInvestTab({ onScanTicker }) {
  const [openTab,     setOpenTab]     = useState(null);
  const [sipAmount,   setSipAmount]   = useState(10000);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { plan } = useUsage();
  const isPro = plan === 'pro';

  const toggle = (id) => setOpenTab(prev => prev === id ? null : id);

  return (
    <div>
      {showUpgrade && <UpgradeModal type="scan" onClose={() => setShowUpgrade(false)} />}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#ff9a00', marginBottom: 4 }}>INVEST</div>
        <div style={{ fontSize: 12, color: '#7788aa' }}>SIP Planner · AI Portfolio · ETFs · Mutual Funds · India only</div>
      </div>

      {!isPro ? (
        // ── Upgrade wall ──────────────────────────────────────────────────────
        <div style={{ background: '#0f0f1a', border: '1px solid #ff9a0044',
          borderTop: '3px solid #ff9a00', borderRadius: 6, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#ff9a00', marginBottom: 10 }}>PRO FEATURE</div>
          <div style={{ fontSize: 13, color: '#99aacc', lineHeight: 1.8, maxWidth: 440, margin: '0 auto 24px' }}>
            Invest gives you SIP planning tools, AI portfolio recommendations, ETF signals, and mutual fund NAV data.
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: '#ff9a00', marginBottom: 4 }}>
            ₹249<span style={{ fontSize: 20 }}>/mo</span>
          </div>
          <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 24 }}>No credit card required · 30 days free</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380, margin: '0 auto 28px', textAlign: 'left' }}>
            {['SIP calculator with SIP vs Lump Sum', 'AI portfolio recommender', 'Track active SIPs', 'NSE ETF scanner with live prices', 'Mutual fund NAV explorer'].map((f, i) => (
              <div key={i} style={{ fontSize: 13, color: '#b0c0dd', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#ff9a00', flexShrink: 0 }}>✓</span>{f}
              </div>
            ))}
          </div>
          <button className="btn" onClick={() => setShowUpgrade(true)}
            style={{ fontSize: 14, padding: '14px 48px', background: '#ff9a0022', borderColor: '#ff9a00', color: '#ff9a00' }}>
            START FREE MONTH →
          </button>
        </div>
      ) : (
        // ── Accordion tabs ────────────────────────────────────────────────────
        <div>
          {TABS.map(tab => (
            <AccordionCard
              key={tab.id}
              icon={tab.icon}
              title={tab.label}
              subtitle={tab.desc}
              isOpen={openTab === tab.id}
              onToggle={() => toggle(tab.id)}
              accent="#ff9a00"
            >
              {tab.id === 'sip'       && <SIPCalculator />}
              {tab.id === 'portfolio' && <AIPortfolioRecommender sipAmount={sipAmount} setSipAmount={setSipAmount} />}
              {tab.id === 'tracker'   && <SIPTracker />}
              {tab.id === 'etfs'      && <ETFScanner onScan={onScanTicker} />}
              {tab.id === 'mf'        && <MFExplorer />}
            </AccordionCard>
          ))}
          <div style={{ fontSize: 10, color: '#2a2a3e', marginTop: 20, textAlign: 'center' }}>
            Not financial advice. Investments subject to market risk.
          </div>
        </div>
      )}
    </div>
  );
}