import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useUsage } from '../hooks/useUsage';
import UpgradeModal from '../components/UpgradeModal';

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
    <div>
      {showUpgrade && <UpgradeModal type="scan" onClose={() => setShowUpgrade(false)} />}

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

      {/* Pro gate — full upgrade wall */}
      {!isPro ? (
        <div style={{
          background: '#0f0f1a', border: '1px solid #ff9a0044',
          borderTop: '3px solid #ff9a00', borderRadius: 6,
          padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28,
            color: '#ff9a00', marginBottom: 10 }}>PRO FEATURE</div>
          <div style={{ fontSize: 13, color: '#99aacc', lineHeight: 1.8,
            maxWidth: 440, margin: '0 auto 24px' }}>
            India Invest gives you ETF signals, SIP planning tools, AI portfolio recommendations,
            and mutual fund NAV data — all in one place.
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40,
            color: '#ff9a00', marginBottom: 4 }}>
            ₹249<span style={{ fontSize: 20 }}>/mo</span>
          </div>
          <div style={{ fontSize: 11, color: '#7788aa', marginBottom: 24 }}>
            No commitment · Cancel anytime
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
            maxWidth: 380, margin: '0 auto 28px', textAlign: 'left' }}>
            {[
              '📈 NSE ETF scanner with live prices & AI signals',
              '🔄 SIP calculator + SIP vs Lump Sum comparison',
              '🤖 AI portfolio recommender based on risk profile',
              '📊 Track your active SIPs',
              '🏦 Mutual fund explorer with live NAV data',
            ].map((f, i) => (
              <div key={i} style={{ fontSize: 13, color: '#b0c0dd',
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#ff9a00', flexShrink: 0 }}>✓</span>{f}
              </div>
            ))}
          </div>
          <button className="btn" onClick={() => setShowUpgrade(true)}
            style={{ fontSize: 14, padding: '14px 48px',
              background: '#ff9a0022', borderColor: '#ff9a00', color: '#ff9a00' }}>
            UPGRADE TO INDIA PRO →
          </button>
        </div>
      ) : (
        <>
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

          <div style={{ fontSize: 10, color: '#2a2a3e', marginTop: 24, textAlign: 'center' }}>
            ⚠ Not financial advice. Investments are subject to market risk. Please read all scheme related documents carefully.
          </div>
        </>
      )}
    </div>
  );
}