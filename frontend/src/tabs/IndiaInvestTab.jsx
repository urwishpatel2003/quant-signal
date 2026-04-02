import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';

const BASE = import.meta.env.VITE_API_BASE;

// ── NSE ETF Universe ──────────────────────────────────────────────────────────
const ETF_UNIVERSE = {
  INDEX: [
    { symbol: 'NIFTYBEES',   name: 'Nippon Nifty BeES',         tracking: 'Nifty 50'        },
    { symbol: 'JUNIORBEES',  name: 'Nippon Junior BeES',        tracking: 'Nifty Next 50'   },
    { symbol: 'SETFNN50',    name: 'SBI Nifty Next 50 ETF',     tracking: 'Nifty Next 50'   },
    { symbol: 'MOM100',      name: 'Nippon Nifty 100 ETF',      tracking: 'Nifty 100'       },
    { symbol: 'MIDCAPETF',   name: 'SBI Nifty Midcap ETF',      tracking: 'Nifty Midcap'    },
    { symbol: 'MAFSETF',     name: 'Mirae Nifty 200 ETF',       tracking: 'Nifty 200'       },
    { symbol: 'SENSEXETF',   name: 'SBI Sensex ETF',            tracking: 'BSE Sensex'      },
    { symbol: 'ICICINIFTY',  name: 'ICICI Nifty ETF',           tracking: 'Nifty 50'        },
  ],
  SECTORAL: [
    { symbol: 'BANKBEES',    name: 'Nippon Bank BeES',          tracking: 'Nifty Bank'      },
    { symbol: 'ITBEES',      name: 'Nippon IT BeES',            tracking: 'Nifty IT'        },
    { symbol: 'PHARMABEES',  name: 'Nippon Pharma BeES',        tracking: 'Nifty Pharma'    },
    { symbol: 'INFRABEES',   name: 'Nippon Infra BeES',         tracking: 'Nifty Infra'     },
    { symbol: 'PSUBNKBEES',  name: 'Nippon PSU Bank BeES',      tracking: 'Nifty PSU Bank'  },
    { symbol: 'AUTOBEES',    name: 'Nippon Auto BeES',          tracking: 'Nifty Auto'      },
    { symbol: 'FMCGBEES',    name: 'Nippon FMCG BeES',          tracking: 'Nifty FMCG'     },
    { symbol: 'CONSUMBEES',  name: 'Nippon Consumption BeES',   tracking: 'Nifty Consumption'},
  ],
  COMMODITY: [
    { symbol: 'GOLDBEES',    name: 'Nippon Gold BeES',          tracking: 'Gold'            },
    { symbol: 'SILVERETF',   name: 'ICICI Silver ETF',          tracking: 'Silver'          },
    { symbol: 'SETFGOLD',    name: 'SBI Gold ETF',              tracking: 'Gold'            },
    { symbol: 'HDFCGOLD',    name: 'HDFC Gold ETF',             tracking: 'Gold'            },
  ],
  DEBT: [
    { symbol: 'LIQUIDBEES',  name: 'Nippon Liquid BeES',        tracking: 'Overnight Rate'  },
    { symbol: 'LIQUIDETF',   name: 'HDFC Liquid ETF',           tracking: 'Overnight Rate'  },
    { symbol: 'CPSEETF',     name: 'Nippon CPSE ETF',           tracking: 'Nifty CPSE'     },
  ],
};

// ── Popular Mutual Funds (via MFAPI) ─────────────────────────────────────────
const MF_LIST = [
  { schemeCode: '120503', name: 'UTI Nifty 50 Index Fund',           category: 'Index',    risk: 'Moderate' },
  { schemeCode: '120465', name: 'HDFC Index Fund Nifty 50',          category: 'Index',    risk: 'Moderate' },
  { schemeCode: '125494', name: 'SBI Nifty Index Fund',              category: 'Index',    risk: 'Moderate' },
  { schemeCode: '147622', name: 'Mirae Asset Large Cap Fund',        category: 'Large Cap', risk: 'Moderate' },
  { schemeCode: '119598', name: 'Axis Bluechip Fund',                category: 'Large Cap', risk: 'Moderate' },
  { schemeCode: '100356', name: 'Parag Parikh Flexi Cap Fund',       category: 'Flexi Cap', risk: 'Moderate' },
  { schemeCode: '135781', name: 'SBI Small Cap Fund',                category: 'Small Cap', risk: 'High'     },
  { schemeCode: '120828', name: 'HDFC Mid-Cap Opportunities',        category: 'Mid Cap',   risk: 'High'     },
  { schemeCode: '125497', name: 'SBI Magnum Gilt Fund',              category: 'Debt',      risk: 'Low'      },
  { schemeCode: '119756', name: 'HDFC Liquid Fund',                  category: 'Liquid',    risk: 'Low'      },
];

// ── SIP Calculator ────────────────────────────────────────────────────────────
function sipMaturity(monthly, years, annualRate) {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

function lumpSumMaturity(amount, years, annualRate) {
  return amount * Math.pow(1 + annualRate / 100, years);
}

function fmt(n) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

// ── Risk Profile Questions ────────────────────────────────────────────────────
const RISK_QUESTIONS = [
  {
    q: 'What is your investment horizon?',
    options: [
      { label: '< 1 year',    score: 1 },
      { label: '1–3 years',   score: 2 },
      { label: '3–7 years',   score: 3 },
      { label: '7+ years',    score: 4 },
    ],
  },
  {
    q: 'How would you react if your portfolio fell 20% in a month?',
    options: [
      { label: 'Sell everything',       score: 1 },
      { label: 'Sell some, stay calm',  score: 2 },
      { label: 'Hold and wait',         score: 3 },
      { label: 'Buy more — opportunity', score: 4 },
    ],
  },
  {
    q: 'What is your primary investment goal?',
    options: [
      { label: 'Capital preservation',  score: 1 },
      { label: 'Regular income',        score: 2 },
      { label: 'Balanced growth',       score: 3 },
      { label: 'Maximum growth',        score: 4 },
    ],
  },
  {
    q: 'Monthly investable surplus?',
    options: [
      { label: '< ₹5,000',          score: 1 },
      { label: '₹5,000–₹25,000',    score: 2 },
      { label: '₹25,000–₹1,00,000', score: 3 },
      { label: '> ₹1,00,000',       score: 4 },
    ],
  },
];

function getRiskProfile(score) {
  if (score <= 6)  return { label: 'Conservative', color: '#4488ff', expected: 8 };
  if (score <= 10) return { label: 'Moderate',     color: '#ffaa00', expected: 11 };
  if (score <= 13) return { label: 'Aggressive',   color: '#ff8844', expected: 14 };
  return            { label: 'Very Aggressive',    color: '#ff4444', expected: 17 };
}

function getPortfolioAllocation(score) {
  if (score <= 6)  return { 'Liquid/Debt ETF': 50, 'Nifty 50 Index': 30, 'Gold ETF': 20 };
  if (score <= 10) return { 'Nifty 50 Index': 50, 'Midcap/Next50': 20, 'Gold ETF': 20, 'Liquid ETF': 10 };
  if (score <= 13) return { 'Nifty 50 Index': 40, 'Midcap/Next50': 30, 'Sectoral ETF': 20, 'Gold ETF': 10 };
  return                  { 'Nifty 50 Index': 30, 'Midcap/Next50': 35, 'Sectoral ETF': 25, 'Gold ETF': 10 };
}

// ── Components ────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#ffaa00', letterSpacing: '0.05em' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: '#7788aa', marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function Pill({ label, color }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, border: `1px solid ${color}44`,
      color, background: color + '11', letterSpacing: '0.1em' }}>{label}</span>
  );
}

// ── ETF Card ─────────────────────────────────────────────────────────────────
function ETFCard({ etf, onScan }) {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/india/quote/${etf.symbol}`)
      .then(r => r.json())
      .then(d => { setPrice(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [etf.symbol]);

  const changePct = price?.changePct;
  const isUp = changePct >= 0;

  return (
    <div style={{ background: '#0f0f1a', border: '1px solid #2a2a40', borderRadius: 6,
      padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
      onClick={() => onScan(etf.symbol)}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#ffaa0066'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a40'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, color: '#fff', letterSpacing: '0.05em' }}>{etf.symbol}</div>
          <div style={{ fontSize: 11, color: '#7788aa', marginTop: 1 }}>{etf.name}</div>
        </div>
        {loading ? (
          <div style={{ fontSize: 11, color: '#445', animation: 'pulse 1s infinite' }}>—</div>
        ) : price?.price ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f0' }}>₹{price.price?.toFixed(2)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isUp ? '#00ff88' : '#ff4444' }}>
              {isUp ? '▲' : '▼'}{Math.abs(changePct)?.toFixed(2)}%
            </div>
          </div>
        ) : <div style={{ fontSize: 11, color: '#445' }}>N/A</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#556677' }}>Tracks: {etf.tracking}</div>
        <div style={{ fontSize: 10, color: '#ffaa0088', letterSpacing: '0.1em' }}>SCAN →</div>
      </div>
    </div>
  );
}

// ── SIP Calculator ────────────────────────────────────────────────────────────
function SIPCalculator() {
  const [monthly,  setMonthly]  = useState(10000);
  const [years,    setYears]    = useState(10);
  const [rate,     setRate]     = useState(12);
  const [lumpSum,  setLumpSum]  = useState(100000);
  const [view,     setView]     = useState('sip'); // 'sip' | 'compare'

  const maturity   = sipMaturity(monthly, years, rate);
  const invested   = monthly * years * 12;
  const gain       = maturity - invested;
  const lsMaturity = lumpSumMaturity(lumpSum, years, rate);
  const lsGain     = lsMaturity - lumpSum;
  const sipTotal   = sipMaturity(lumpSum / (years * 12), years, rate);

  const SliderRow = ({ label, value, setValue, min, max, step, display }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: '#99aacc' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ffaa00' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => setValue(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#ffaa00' }} />
    </div>
  );

  return (
    <div>
      {/* Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['sip', 'SIP Calculator'], ['compare', 'SIP vs Lump Sum']].map(([k, l]) => (
          <button key={k} className="btn-sm" onClick={() => setView(k)} style={{
            color: view === k ? '#ffaa00' : '#99aacc',
            borderColor: view === k ? '#ffaa00' : '#2a2a3e',
            background: view === k ? '#ffaa0011' : '#1a1a2e',
          }}>{l}</button>
        ))}
      </div>

      {view === 'sip' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Inputs */}
          <div className="card">
            <div style={{ fontSize: 11, color: '#ffaa00', letterSpacing: '0.15em', marginBottom: 16 }}>INPUTS</div>
            <SliderRow label="Monthly SIP Amount" value={monthly} setValue={setMonthly}
              min={500} max={100000} step={500} display={`₹${monthly.toLocaleString('en-IN')}`} />
            <SliderRow label="Investment Duration" value={years} setValue={setYears}
              min={1} max={30} step={1} display={`${years} years`} />
            <SliderRow label="Expected Annual Return" value={rate} setValue={setRate}
              min={4} max={25} step={0.5} display={`${rate}%`} />
          </div>

          {/* Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'MATURITY VALUE',  value: fmt(maturity), color: '#00ff88', large: true },
              { label: 'TOTAL INVESTED',  value: fmt(invested),  color: '#e8e8f0' },
              { label: 'WEALTH GAIN',     value: fmt(gain),      color: '#ffaa00' },
              { label: 'RETURNS',         value: `${((gain / invested) * 100).toFixed(1)}%`, color: '#4488ff' },
            ].map((item, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', borderColor: item.color + '33' }}>
                <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.15em', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: item.large ? 28 : 20, fontWeight: 700, color: item.color,
                  fontFamily: item.large ? "'Bebas Neue',sans-serif" : 'inherit' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'compare' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {/* Inputs */}
          <div className="card">
            <div style={{ fontSize: 11, color: '#ffaa00', letterSpacing: '0.15em', marginBottom: 16 }}>INPUTS</div>
            <SliderRow label="Total Investment" value={lumpSum} setValue={setLumpSum}
              min={10000} max={10000000} step={10000} display={fmt(lumpSum)} />
            <SliderRow label="Duration" value={years} setValue={setYears}
              min={1} max={30} step={1} display={`${years} yrs`} />
            <SliderRow label="Expected Return" value={rate} setValue={setRate}
              min={4} max={25} step={0.5} display={`${rate}%`} />
          </div>

          {/* Lump Sum */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#4488ff', letterSpacing: '0.15em', marginBottom: 4, textAlign: 'center' }}>LUMP SUM</div>
            {[
              { label: 'MATURITY', value: fmt(lsMaturity), color: '#4488ff', large: true },
              { label: 'INVESTED', value: fmt(lumpSum),    color: '#e8e8f0' },
              { label: 'GAIN',     value: fmt(lsGain),     color: '#4488ff' },
              { label: 'CAGR',     value: `${rate}%`,      color: '#7788aa' },
            ].map((item, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', borderColor: item.color + '33' }}>
                <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: item.large ? 24 : 16, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* SIP equivalent */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#00ff88', letterSpacing: '0.15em', marginBottom: 4, textAlign: 'center' }}>SIP (same total)</div>
            {[
              { label: 'MATURITY', value: fmt(sipTotal),   color: '#00ff88', large: true },
              { label: 'INVESTED', value: fmt(lumpSum),    color: '#e8e8f0' },
              { label: 'GAIN',     value: fmt(sipTotal - lumpSum), color: '#00ff88' },
              { label: 'PER MO',   value: `₹${Math.round(lumpSum / (years * 12)).toLocaleString('en-IN')}`, color: '#7788aa' },
            ].map((item, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', borderColor: item.color + '33' }}>
                <div style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: item.large ? 24 : 16, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      <div style={{ fontSize: 11, color: '#445', marginTop: 16, textAlign: 'center' }}>
        ⚠ Returns are estimated and not guaranteed. Past performance does not indicate future results.
      </div>
    </div>
  );
}

// ── Risk Profile & AI Portfolio ───────────────────────────────────────────────
function AIPortfolioRecommender({ sipAmount }) {
  const [answers,   setAnswers]   = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult,  setAiResult]  = useState(null);
  const [step,      setStep]      = useState(0); // 0=quiz, 1=result

  const handleAnswer = (idx, score) => {
    const newAnswers = [...answers];
    newAnswers[idx] = score;
    setAnswers(newAnswers);
    if (idx < RISK_QUESTIONS.length - 1) {
      setTimeout(() => document.getElementById(`q${idx+1}`)?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const totalScore    = answers.reduce((a, b) => a + (b || 0), 0);
  const allAnswered   = answers.length === RISK_QUESTIONS.length && answers.every(a => a != null);
  const riskProfile   = allAnswered ? getRiskProfile(totalScore) : null;
  const allocation    = allAnswered ? getPortfolioAllocation(totalScore) : null;

  const getAIRecommendation = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are an Indian investment advisor specializing in ETFs and mutual funds. 
Give practical, specific SIP recommendations for Indian retail investors.
Return ONLY JSON: {"summary":"string","topPicks":[{"name":"string","type":"ETF|MF","symbol":"string","allocation":number,"reason":"string"}],"monthlyPlan":{"total":number,"breakdown":[{"instrument":"string","amount":number}]},"advice":"string"}`,
          messages: [{
            role: 'user',
            content: `Risk profile: ${riskProfile?.label} (score ${totalScore}/16)
Monthly SIP budget: ₹${sipAmount?.toLocaleString('en-IN') || '10,000'}
Investment horizon: ${answers[0] === 1 ? '<1yr' : answers[0] === 2 ? '1-3yrs' : answers[0] === 3 ? '3-7yrs' : '7+yrs'}
Market reaction: ${answers[1] === 1 ? 'panic sell' : answers[1] === 2 ? 'partial sell' : answers[1] === 3 ? 'hold' : 'buy more'}
Goal: ${answers[2] === 1 ? 'capital preservation' : answers[2] === 2 ? 'regular income' : answers[2] === 3 ? 'balanced growth' : 'maximum growth'}
Suggest 3-5 specific NSE ETFs or Indian mutual funds with exact allocation percentages. Focus on low-cost index ETFs and diversification.`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      setAiResult(JSON.parse(clean));
      setStep(1);
    } catch (e) {
      console.error(e);
    }
    setAiLoading(false);
  };

  return (
    <div>
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {RISK_QUESTIONS.map((q, qi) => (
            <div key={qi} id={`q${qi}`} className="card">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#c8d8f0', marginBottom: 12 }}>
                <span style={{ color: '#ffaa00', marginRight: 8 }}>{qi + 1}.</span>{q.q}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {q.options.map((opt, oi) => (
                  <button key={oi} onClick={() => handleAnswer(qi, opt.score)} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: 12,
                    background: answers[qi] === opt.score ? '#ffaa0022' : '#0a0a14',
                    border: `1px solid ${answers[qi] === opt.score ? '#ffaa00' : '#2a2a3e'}`,
                    color: answers[qi] === opt.score ? '#ffaa00' : '#b0c0dd',
                    cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}>{opt.label}</button>
                ))}
              </div>
            </div>
          ))}

          {allAnswered && (
            <div className="card" style={{ borderColor: riskProfile.color + '44', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#7788aa', letterSpacing: '0.15em', marginBottom: 8 }}>YOUR RISK PROFILE</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: riskProfile.color, marginBottom: 4 }}>
                {riskProfile.label}
              </div>
              <div style={{ fontSize: 12, color: '#7788aa', marginBottom: 20 }}>
                Expected annual return: ~{riskProfile.expected}% (historical estimate)
              </div>

              {/* Suggested allocation */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
                {Object.entries(allocation).map(([k, v]) => (
                  <div key={k} style={{ background: '#1a1a2e', border: '1px solid #2a2a3e',
                    borderRadius: 4, padding: '8px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: riskProfile.color }}>{v}%</div>
                    <div style={{ fontSize: 10, color: '#7788aa' }}>{k}</div>
                  </div>
                ))}
              </div>

              <button className="btn" onClick={getAIRecommendation} disabled={aiLoading}>
                {aiLoading ? 'GENERATING...' : 'GET AI PORTFOLIO RECOMMENDATION →'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 1 && aiResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button className="btn-sm" onClick={() => { setStep(0); setAiResult(null); }}
            style={{ alignSelf: 'flex-start' }}>← RETAKE QUIZ</button>

          <div className="card" style={{ borderColor: '#00ff8833' }}>
            <div style={{ fontSize: 11, color: '#00ff88', letterSpacing: '0.15em', marginBottom: 10 }}>AI RECOMMENDATION</div>
            <div style={{ fontSize: 13, color: '#b0c0dd', lineHeight: 1.8 }}>{aiResult.summary}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {aiResult.topPicks?.map((pick, i) => (
              <div key={i} className="card" style={{ borderColor: '#ffaa0033' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Pill label={pick.type} color={pick.type === 'ETF' ? '#ffaa00' : '#4488ff'} />
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#ffaa00' }}>
                    {pick.allocation}%
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0', marginBottom: 4 }}>{pick.name}</div>
                {pick.symbol && <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 6 }}>{pick.symbol}</div>}
                <div style={{ fontSize: 11, color: '#99aacc', lineHeight: 1.6 }}>{pick.reason}</div>
              </div>
            ))}
          </div>

          {aiResult.monthlyPlan && (
            <div className="card">
              <div style={{ fontSize: 11, color: '#ffaa00', letterSpacing: '0.15em', marginBottom: 12 }}>
                MONTHLY SIP BREAKDOWN — {fmt(aiResult.monthlyPlan.total)}
              </div>
              {aiResult.monthlyPlan.breakdown?.map((b, i) => (
                <div key={i} className="kv">
                  <span className="kv-key">{b.instrument}</span>
                  <span className="kv-value" style={{ color: '#ffaa00' }}>{fmt(b.amount)}/mo</span>
                </div>
              ))}
            </div>
          )}

          {aiResult.advice && (
            <div className="card" style={{ borderLeft: '3px solid #ffaa0055' }}>
              <div style={{ fontSize: 12, color: '#b0c0dd', lineHeight: 1.8, fontStyle: 'italic' }}>
                {aiResult.advice}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── My SIPs Tracker ───────────────────────────────────────────────────────────
function SIPTracker() {
  const [sips, setSips] = useState(() => {
    try { return JSON.parse(localStorage.getItem('quaint_sips') || '[]'); } catch { return []; }
  });
  const [form, setForm] = useState({ name: '', amount: '', startDate: '', frequency: 'monthly' });
  const [adding, setAdding] = useState(false);

  const save = (updated) => {
    setSips(updated);
    localStorage.setItem('quaint_sips', JSON.stringify(updated));
  };

  const addSIP = () => {
    if (!form.name || !form.amount || !form.startDate) return;
    save([...sips, { ...form, id: Date.now(), amount: Number(form.amount) }]);
    setForm({ name: '', amount: '', startDate: '', frequency: 'monthly' });
    setAdding(false);
  };

  const removeSIP = (id) => save(sips.filter(s => s.id !== id));

  const getStats = (sip) => {
    const start   = new Date(sip.startDate);
    const now     = new Date();
    const months  = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth());
    const invested = sip.amount * months;
    return { months, invested };
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#7788aa' }}>{sips.length} active SIP{sips.length !== 1 ? 's' : ''}</div>
        <button className="btn-sm" onClick={() => setAdding(!adding)}
          style={{ color: '#00ff88', borderColor: '#00ff8844' }}>
          {adding ? 'CANCEL' : '+ ADD SIP'}
        </button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16, borderColor: '#00ff8833' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 4 }}>FUND/ETF NAME</div>
              <input className="input" placeholder="e.g. NIFTYBEES"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 4 }}>MONTHLY AMOUNT (₹)</div>
              <input className="input" type="number" placeholder="5000"
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 4 }}>START DATE</div>
              <input className="input" type="date"
                value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 4 }}>FREQUENCY</div>
              <select className="input" value={form.frequency}
                onChange={e => setForm({ ...form, frequency: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <button className="btn" onClick={addSIP}>ADD</button>
          </div>
        </div>
      )}

      {sips.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#445' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 13 }}>No SIPs tracked yet. Add your first SIP above.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 8 }}>
            {[
              { label: 'TOTAL MONTHLY', value: fmt(sips.reduce((a, s) => a + s.amount, 0)), color: '#ffaa00' },
              { label: 'TOTAL INVESTED', value: fmt(sips.reduce((a, s) => a + getStats(s).invested, 0)), color: '#4488ff' },
              { label: 'ACTIVE SIPs', value: sips.length, color: '#00ff88' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', borderColor: s.color + '33' }}>
                <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.15em', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {sips.map(sip => {
            const { months, invested } = getStats(sip);
            return (
              <div key={sip.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0' }}>{sip.name}</div>
                  <div style={{ fontSize: 11, color: '#7788aa', marginTop: 2 }}>
                    {sip.frequency} · since {new Date(sip.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.1em' }}>MONTHLY</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#ffaa00' }}>{fmt(sip.amount)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.1em' }}>INVESTED</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#4488ff' }}>{fmt(invested)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#7788aa', letterSpacing: '0.1em' }}>MONTHS</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#b0c0dd' }}>{months}</div>
                  </div>
                  <button className="btn-sm btn-danger" onClick={() => removeSIP(sip.id)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mutual Fund Explorer ──────────────────────────────────────────────────────
function MFExplorer() {
  const [navData,  setNavData]  = useState({});
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('All');

  useEffect(() => {
    const fetchNAVs = async () => {
      const results = {};
      await Promise.allSettled(
        MF_LIST.slice(0, 6).map(async mf => {
          try {
            const res  = await fetch(`https://api.mfapi.in/mf/${mf.schemeCode}/latest`);
            const data = await res.json();
            results[mf.schemeCode] = {
              nav:  parseFloat(data.data?.[0]?.nav),
              date: data.data?.[0]?.date,
            };
          } catch {}
        })
      );
      setNavData(results);
      setLoading(false);
    };
    fetchNAVs();
  }, []);

  const categories = ['All', ...new Set(MF_LIST.map(m => m.category))];
  const filtered   = filter === 'All' ? MF_LIST : MF_LIST.filter(m => m.category === filter);

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c} className="btn-sm" onClick={() => setFilter(c)} style={{
            color:       filter === c ? '#4488ff' : '#99aacc',
            borderColor: filter === c ? '#4488ff' : '#2a2a3e',
            background:  filter === c ? '#4488ff11' : '#1a1a2e',
          }}>{c}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {filtered.map(mf => {
          const nav = navData[mf.schemeCode];
          return (
            <div key={mf.schemeCode} className="card" style={{ borderColor: '#1e1e30' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, marginRight: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0', lineHeight: 1.4, marginBottom: 6 }}>{mf.name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Pill label={mf.category} color="#4488ff" />
                    <Pill label={mf.risk}     color={mf.risk === 'Low' ? '#00ff88' : mf.risk === 'High' ? '#ff4444' : '#ffaa00'} />
                  </div>
                </div>
                {loading ? (
                  <div style={{ fontSize: 11, color: '#445', animation: 'pulse 1s infinite' }}>—</div>
                ) : nav?.nav ? (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f0' }}>₹{nav.nav.toFixed(2)}</div>
                    <div style={{ fontSize: 10, color: '#556677', marginTop: 2 }}>NAV · {nav.date}</div>
                  </div>
                ) : <div style={{ fontSize: 11, color: '#445' }}>N/A</div>}
              </div>
              <div style={{ fontSize: 10, color: '#556677', marginTop: 6 }}>
                Code: {mf.schemeCode} · <a href={`https://www.mfapi.in/mf/${mf.schemeCode}`}
                  target="_blank" rel="noreferrer"
                  style={{ color: '#4488ff88', textDecoration: 'none' }}>View history</a>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: '#445', marginTop: 12, textAlign: 'center' }}>
        NAV data from MFAPI.in · Updated daily · Not investment advice
      </div>
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { id: 'etfs',      label: '📈 ETFs',         },
  { id: 'sip',       label: '🔄 SIP Planner',  },
  { id: 'portfolio', label: '🤖 AI Portfolio', },
  { id: 'tracker',   label: '📊 My SIPs',      },
  { id: 'mf',        label: '🏦 Mutual Funds', },
];

export default function IndiaInvestTab({ onScanTicker }) {
  const [activeSubTab, setActiveSubTab] = useState('etfs');
  const [etfCategory,  setEtfCategory]  = useState('INDEX');
  const [sipAmount,    setSipAmount]    = useState(10000);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🇮🇳</span>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#ff9a00' }}>
            INDIA INVEST
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#7788aa' }}>
          ETFs · SIP Planner · AI Portfolio Recommender · Mutual Funds
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, overflowX: 'auto',
        paddingBottom: 4, scrollbarWidth: 'none', borderBottom: '1px solid #1e1e2e' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveSubTab(t.id)} className="btn-sm" style={{
            color:       activeSubTab === t.id ? '#ff9a00' : '#99aacc',
            borderColor: activeSubTab === t.id ? '#ff9a00' : '#2a2a3e',
            background:  activeSubTab === t.id ? '#ff9a0011' : '#1a1a2e',
            whiteSpace: 'nowrap', flexShrink: 0, padding: '9px 16px', fontSize: 12,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ETFs */}
      {activeSubTab === 'etfs' && (
        <div>
          <SectionHeader title="NSE ETFs" subtitle="Live prices · Click any ETF to run an AI scan" />
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {Object.keys(ETF_UNIVERSE).map(cat => (
              <button key={cat} className="btn-sm" onClick={() => setEtfCategory(cat)} style={{
                color:       etfCategory === cat ? '#ff9a00' : '#99aacc',
                borderColor: etfCategory === cat ? '#ff9a00' : '#2a2a3e',
                background:  etfCategory === cat ? '#ff9a0011' : '#1a1a2e',
              }}>{cat}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {ETF_UNIVERSE[etfCategory].map(etf => (
              <ETFCard key={etf.symbol} etf={etf} onScan={onScanTicker} />
            ))}
          </div>
        </div>
      )}

      {/* SIP Planner */}
      {activeSubTab === 'sip' && (
        <div>
          <SectionHeader title="SIP Planner" subtitle="Calculate returns · Compare SIP vs Lump Sum" />
          <SIPCalculator />
        </div>
      )}

      {/* AI Portfolio */}
      {activeSubTab === 'portfolio' && (
        <div>
          <SectionHeader title="AI Portfolio Recommender"
            subtitle="Answer 4 questions · Get a personalized ETF & MF allocation" />
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#99aacc', marginBottom: 6 }}>Your monthly SIP budget</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={500} max={100000} step={500} value={sipAmount}
                onChange={e => setSipAmount(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#ff9a00' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#ff9a00', minWidth: 80 }}>
                ₹{sipAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          <AIPortfolioRecommender sipAmount={sipAmount} />
        </div>
      )}

      {/* My SIPs Tracker */}
      {activeSubTab === 'tracker' && (
        <div>
          <SectionHeader title="My SIPs" subtitle="Track your active SIPs and monitor total invested amount" />
          <SIPTracker />
        </div>
      )}

      {/* Mutual Funds */}
      {activeSubTab === 'mf' && (
        <div>
          <SectionHeader title="Mutual Fund Explorer"
            subtitle="Live NAV data · Popular index funds and ETFs for SIP" />
          <MFExplorer />
        </div>
      )}
    </div>
  );
}