import { useEffect, useState } from 'react';

export default function WelcomePage({ onEnter, onNavigate }) {
  const [visible,      setVisible]      = useState(false);
  const [activeMarket, setActiveMarket] = useState('US');

  useEffect(() => { setVisible(true); }, []);
  const go = (tab) => { onNavigate(tab); onEnter(); };

  const US_FEATURES = [
    { color:'#ffaa00', icon:'📡', title:'AI Stock Scanner',
      desc:'17-factor deterministic engine. Claude writes the thesis — the code sets the signal. No hallucinated BUY calls.',
      points:['Risk-adjusted momentum (paper §3.1)','3-MA cascade filter reduces false signals','Earnings proximity gate — HOLD near binary events'], tab:'scanner' },
    { color:'#00ff88', icon:'⚡', title:'Options Analysis',
      desc:'Exact strike, expiry, entry and stop for calls and puts. Real-time chain with IV surface and Black-Scholes pricing.',
      points:['IV rank scores put/call skew in signal','P&L simulator before you trade','GO/NO-GO trade checklist'], tab:'options' },
    { color:'#4488ff', icon:'🏦', title:'Institutional Intelligence',
      desc:'Short interest %, insider net buying, institutional ownership direction — all scored in the signal engine.',
      points:['Short squeeze flag (>20% float short)','Insider cluster buy/sell signal','Top 5 institutional holders + direction'], tab:'scanner' },
    { color:'#aa44ff', icon:'📊', title:'Earnings Quality',
      desc:'SUE (Standardized Unexpected Earnings) from academic research. Normalizes EPS surprise by historical std — finds real beats.',
      points:['SUE score from 8Q earnings history','FCF margin vs reported earnings','Debt trend + operating leverage'], tab:'scanner' },
    { color:'#ff8844', icon:'🌐', title:'Market Regime Detection',
      desc:'5-signal regime engine adjusts every signal confidence. RSI logic flips in bear markets. BUY capped in downtrends.',
      points:['STRONG_BULL → STRONG_BEAR scale','SPY 200d trend, VIX, breadth, sector rotation','Signal confidence dynamically adjusted'], tab:'markets' },
    { color:'#ff4488', icon:'📈', title:'Signal Accuracy Tracker',
      desc:'Every scan auto-saved. Outcomes checked when timeframe elapses. Your win rate, by signal type, compounding over time.',
      points:['WIN/LOSS/SCRATCH vs real price moves','High-confidence accuracy tracked separately','Your personal edge record, forever'], tab:'accuracy' },
    { color:'#00ccff', icon:'📉', title:'Paper Trading Simulator',
      desc:'Test your conviction before real money. Simulate entries on any signal with virtual positions, P&L tracking and stop-loss triggers.',
      points:['Virtual positions with full P&L','Options simulation with Greeks','Compare simulated vs actual outcomes'], tab:'simulator' },
    { color:'#44ffaa', icon:'👁', title:'Smart Watchlist',
      desc:'Track US stocks with background signal monitoring. Long-term thesis updated automatically — know when your thesis changes.',
      points:['Separate US & India watchlists','Auto long-term signal refresh','Price & signal change alerts'], tab:'watchlist' },
  ];

  const US_STATS = {
    free: [
      { value:'5,000+', label:'US Stocks'          },
      { value:'5/day',  label:'Stock Scans'         },
      { value:'3/day',  label:'Options Analyses'    },
      { value:'5',      label:'Watchlist Items'     },
      { value:'4',      label:'Timeframes'          },
    ],
    pro: [
      { value:'∞',    label:'Unlimited Scans'        },
      { value:'∞',    label:'Options Analyses'       },
      { value:'∞',    label:'Watchlist Items'        },
      { value:'FREE', label:'First month free · $5 after' },
    ],
  };

  const INDIA_FEATURES = [
    { color:'#ff9a00', icon:'🇮🇳', title:'NSE India Scanner',
      desc:'Full Nifty 500 with INR pricing. FII/DII flows, promoter holding changes and delivery % all scored in the signal.',
      points:['Promoter holding + QoQ change','Delivery % as conviction signal','FII/DII daily net buying in ₹Cr'], tab:'scanner' },
    { color:'#ffcc00', icon:'📊', title:'India Markets Dashboard',
      desc:'Nifty 50, Bank Nifty, IT, Pharma, Auto, FMCG. USD/INR, gold ₹/gram, Brent crude, India 10Y yield — live.',
      points:['10 sector indices with % change','Gold in ₹/gram + Brent crude','USD/INR with intraday direction'], tab:'markets' },
    { color:'#00ccff', icon:'🔄', title:'SIP Planner',
      desc:'Step-up SIP calculator with inflation-adjusted corpus. SIP vs lump sum head-to-head across 5/10/20 year horizons.',
      points:['Annual step-up % built in','Real vs nominal returns','SIP vs lump sum comparison'], tab:'simulator' },
    { color:'#aa44ff', icon:'🤖', title:'AI Portfolio Recommender',
      desc:'Tell the AI your age, goal and risk tolerance. Get a personalized allocation across large cap, mid cap, small cap, debt and gold.',
      points:['Goal-based asset allocation','Risk profile questionnaire','Mutual fund category recommendations'], tab:'scanner' },
    { color:'#44ffaa', icon:'📋', title:'Mutual Fund Explorer',
      desc:'10,000+ Indian mutual funds searchable by name or AMC. Live NAV, 1Y/3Y/5Y returns, direct vs regular plan.',
      points:['Live NAV from MFAPI','Category comparison','Direct plan tracking'], tab:'scanner' },
    { color:'#ff6644', icon:'📌', title:'NSE India Movers',
      desc:'120+ stocks from Nifty 50 + Next 50 + Midcap 50 scanned every 5 minutes. One tap to get a full signal on any mover.',
      points:['Gainers, losers, volume leaders','Circuit breaker proximity flagged','One-tap scan from any mover'], tab:'scanner' },
    { color:'#ff4488', icon:'📈', title:'Signal Accuracy Tracker',
      desc:'Every India scan auto-saved. Outcomes checked when timeframe elapses — WIN/LOSS/SCRATCH tracked in INR context.',
      points:['WIN/LOSS/SCRATCH vs NSE price moves','High-confidence accuracy separately','Your India edge record, forever'], tab:'accuracy' },
    { color:'#44aaff', icon:'👁', title:'India Watchlist',
      desc:'Separate watchlist for NSE stocks with automatic signal refresh. Track your long-term thesis on any Nifty 500 stock.',
      points:['Separate from US watchlist','Auto long-term analysis','FII/DII context on each holding'], tab:'watchlist' },
  ];

  const INDIA_STATS = {
    free: [
      { value:'500+',  label:'NSE Stocks'           },
      { value:'5/day', label:'Stock Scans'           },
      { value:'5',     label:'Watchlist Items'       },
      { value:'4',     label:'Timeframes'            },
    ],
    pro: [
      { value:'∞',    label:'Unlimited Scans'         },
      { value:'SIP',  label:'Planner + Calculator'    },
      { value:'AI',   label:'Portfolio Recommender'   },
      { value:'FREE', label:'First month free · ₹249 after' },
    ],
  };

  const ENGINE_FACTORS = [
    { color:'#ffaa00', name:'Momentum', badge:'§3.1', weight:'Short 20% · Long 6%',  desc:'Risk-adjusted Sharpe-like, blended 60/40 with raw' },
    { color:'#ff8844', name:'Trend',    badge:'§3.13',weight:'Short 15% · Long 3%',  desc:'3-MA cascade: price > SMA20 > SMA50 > SMA200' },
    { color:'#ff4488', name:'RSI',      badge:null,   weight:'Regime-aware logic',    desc:'Flips direction in bear regimes — not static' },
    { color:'#aa44ff', name:'StochRSI', badge:null,   weight:'Cross + level',         desc:'Bullish/bearish crossover ±0.4 bonus' },
    { color:'#4488ff', name:'Bollinger Bands', badge:null, weight:'%B + squeeze',    desc:'BB squeeze flags compression before breakout' },
    { color:'#00ccff', name:'ATR + Low Vol', badge:'§3.4', weight:'Volatility regime',desc:'ATR <1% = +0.2 low-vol anomaly score' },
    { color:'#00ff88', name:'S/R Proximity', badge:'§3.14',weight:'Within 1% = ±0.5',desc:'Pivot point support/resistance from prior OHLC' },
    { color:'#44ff88', name:'IBS + Volume',  badge:'§4.4', weight:'5-day average',    desc:'Internal Bar Strength: close position in range' },
    { color:'#ffcc00', name:'Revenue Growth',badge:null,   weight:'Short 5% · Long 22%',desc:'QoQ short term, YoY long — timeframe-scaled' },
    { color:'#ff9a00', name:'Earnings / SUE',badge:'§3.2', weight:'Short 3% · Long 17%',desc:'Surprise / historical std — finds real beats' },
    { color:'#ff6644', name:'IV Rank',        badge:null,  weight:'US only',           desc:'Put/call IV skew as fear indicator' },
    { color:'#cc44ff', name:'Sector Rel. Strength', badge:null, weight:'20d vs ETF',  desc:'Outperforming sector +0.6, under = -0.6' },
    { color:'#4488ff', name:'Analyst Consensus', badge:null, weight:'Short 4% · Long 17%', desc:'Rec key + PT upside, weighted by count' },
    { color:'#b0c4dc', name:'Macro / Regime', badge:null,  weight:'Short 8% · Long 10%',desc:'Bonds, regime, institutional, FII/DII' },
    { color:'#ff4444', name:'News Catalyst',  badge:null,  weight:'Severity × recency', desc:'Upgrade/downgrade/short attack with age decay' },
    { color:'#ff2244', name:'Earnings Gate',  badge:null,  weight:'≤2d = force HOLD',  desc:'≤5d caps confidence at 60% — binary event guard' },
    { color:'#a0b8cc', name:'Donchian Channel', badge:'§3.15', weight:'52W high/low', desc:'Within 5% of 52W high = breakout flag' },
  ];

  const PRICING = [
    { label:'FREE',          color:'#b0c4dc', price:'$0',   sub:'Forever free',           cta:'GET STARTED FREE',
      features:['5 stock scans / day','3 options analyses / day','5 watchlist items','All 4 timeframes','Signal accuracy tracker','US & India markets'] },
    { label:'PRO — US 🇺🇸', color:'#ffaa00', price:'$5',   sub:'/mo · No commitment',    cta:'START FREE TRIAL', popular:true,
      features:['Unlimited scans & options','Unlimited watchlist','Institutional + insider data','Earnings quality (SUE)','Market regime detection','First month FREE ✓'] },
    { label:'PRO — INDIA 🇮🇳',color:'#ff9a00',price:'₹249', sub:'/mo · No commitment',   cta:'START FREE TRIAL',
      features:['Unlimited scans & watchlist','Full Nifty 500 coverage','SIP planner + step-up calc','AI portfolio recommender','10,000+ mutual funds','First month FREE ✓'] },
  ];

  const LOOP_STEPS = [
    { num:'01', icon:'📡', title:'MORNING SCAN',   desc:'Open movers dashboard. 120+ stocks already ranked by move. One tap to get a full signal with thesis, entry and stops.', hook:'Takes 30 seconds. Gives you a thesis.' },
    { num:'02', icon:'📊', title:'SIGNAL SAVED',   desc:'Every scan auto-saved with entry price, timeframe and confidence. Your accuracy tab grows with each scan — no manual tracking.', hook:'Builds your personal edge record.' },
    { num:'03', icon:'🌐', title:'MACRO CHECK',     desc:'Markets tab shows regime (BULL/BEAR/NEUTRAL), VIX, sector rotation, Nifty indices, FII/DII flows — context before you trade.', hook:'Know if the wind is behind you.' },
    { num:'04', icon:'✅', title:'OUTCOME CHECK',   desc:'When your timeframe elapses, outcomes are checked automatically. WIN/LOSS/SCRATCH. Win rate updates. High-confidence tracked separately.', hook:'The only tool that grades itself.' },
  ];

  const stats = activeMarket === 'US' ? US_STATS : INDIA_STATS;
  const statsAccent = activeMarket === 'US' ? '#ffaa00' : '#ff9a00';
  const features = activeMarket === 'US' ? US_FEATURES : INDIA_FEATURES;

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', flexDirection:'column',
      opacity: visible ? 1 : 0, transition:'opacity 0.5s ease', fontFamily:"'Inter', sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .wc { padding: clamp(32px,4vw,56px) clamp(16px,3vw,32px); width:100%; box-sizing:border-box; }
        .wc-lbl { font-size:9px; letter-spacing:.25em; color:#ffaa00bb; text-align:center; margin-bottom:32px; font-family:"IBM Plex Mono",monospace; }
        .loop-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
        .feat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; }
        .engine-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px; }
        .pricing-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }
        .about-grid { display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:start; }
        .stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; width:100%; }
        .acc-grid { display:grid; grid-template-columns:1fr 1fr; gap:32px; align-items:center; }
        @media(max-width:640px){ .about-grid{grid-template-columns:1fr} .acc-grid{grid-template-columns:1fr} }
        .feat-card { transition:transform .2s,background .2s; cursor:pointer; }
        .feat-card:hover { transform:translateY(-3px); background:#141422 !important; }
        .wc-btn { transition:opacity .2s,transform .1s; }
        .wc-btn:hover { opacity:.82; transform:translateY(-1px); }
        .tog-btn { transition:all .2s; }
      `}</style>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <div style={{ padding:'clamp(40px,6vw,72px) clamp(16px,3vw,28px) clamp(28px,4vw,44px)',
        textAlign:'center', width:'100%', boxSizing:'border-box' }}>

        <div style={{ display:'inline-block', fontSize:'clamp(9px,1vw,10px)', letterSpacing:'.28em',
          color:'#ffaa00', border:'1px solid #ffaa0066', padding:'5px 16px',
          marginBottom:'clamp(20px,3vw,28px)', borderRadius:2, fontFamily:"'IBM Plex Mono',monospace",
          fontWeight:700 }}>
          QUANTITATIVE MARKET INTELLIGENCE · US & INDIA
        </div>

        <div style={{ fontFamily:"'Bebas Neue',sans-serif",
          fontSize:'clamp(54px,11vw,118px)', lineHeight:.88,
          letterSpacing:'.04em', marginBottom:'clamp(16px,2.5vw,24px)' }}>
          <span style={{ color:'#ffaa00' }}>QU</span>
          <span style={{ color:'#00ff88' }}>AI</span>
          <span style={{ color:'#ffaa00' }}>NT</span>
          <br />
          <span style={{ color:'#ffaa00' }}>SIGNAL</span>
        </div>

        <div style={{ fontSize:'clamp(13px,1.7vw,18px)', color:'#a0b8cc',
          lineHeight:1.85, margin:'0 0 28px', fontWeight:300 }}>
          The signal engine that tracks its own accuracy.<br />
          Every scan saved. Every outcome measured. Every edge compounding.
        </div>

        {/* MOAT BOX */}
        <div style={{ background:'#0c1a14', border:'1px solid #00ff8833',
          borderLeft:'3px solid #00ff88', borderRadius:6, padding:'18px 22px',
          margin:'0 0 32px', textAlign:'left' }}>
          <div style={{ fontSize:9, letterSpacing:'.2em', color:'#00ff88aa',
            fontFamily:"'IBM Plex Mono',monospace", marginBottom:8 }}>WHY THIS IS DIFFERENT</div>
          <div style={{ fontSize:'clamp(13px,1.5vw,16px)', color:'#00ff88', fontWeight:700,
            lineHeight:1.5, marginBottom:8 }}>
            Your signal accuracy improves the longer you use it.
          </div>
          <div style={{ fontSize:12, color:'#a0b8cc', lineHeight:1.75 }}>
            Every BUY/SELL/HOLD is saved with your entry price. When the timeframe elapses, the outcome is checked automatically — WIN, LOSS or SCRATCH. Over time you build a personal accuracy record no other tool gives you. That's your edge, compounding daily.
          </div>
        </div>

        {/* CTA */}
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:40 }}>
          <button className="wc-btn" onClick={onEnter} style={{
            fontFamily:"'IBM Plex Mono',monospace", fontSize:'clamp(12px,1.3vw,14px)',
            padding:'clamp(12px,1.5vw,15px) clamp(28px,4vw,44px)',
            background:'#ffaa0022', border:'1px solid #ffaa00', color:'#ffaa00',
            cursor:'pointer', borderRadius:3, letterSpacing:'.1em', fontWeight:700 }}>
            GET STARTED FREE →
          </button>
          <button className="wc-btn" onClick={() => go('help')} style={{
            fontFamily:"'IBM Plex Mono',monospace", fontSize:'clamp(12px,1.3vw,14px)',
            padding:'clamp(12px,1.5vw,15px) clamp(28px,4vw,44px)',
            background:'transparent', border:'1px solid #2a2a3e', color:'#b0c4dc',
            cursor:'pointer', borderRadius:3, letterSpacing:'.1em' }}>
            HOW IT WORKS
          </button>
        </div>

        {/* STATS */}
        <div className="stat-grid">
          {[
            { v:'5,000+', l:'US Stocks',       c:'#ffaa00' },
            { v:'500+',   l:'NSE India',         c:'#ff9a00' },
            { v:'17',     l:'Signal Factors',    c:'#00ff88' },
            { v:'4',      l:'Timeframes',         c:'#4488ff' },
            { v:'5',      l:'Regime Signals',    c:'#aa44ff' },
            { v:'∞',      l:'Accuracy Tracked',  c:'#ff4488' },
          ].map((s, i) => (
            <div key={i} style={{ background:'#0c0c18', border:`1px solid ${s.c}22`,
              borderTop:`2px solid ${s.c}55`, borderRadius:6, padding:'13px 8px', textAlign:'center' }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:s.c, lineHeight:1 }}>{s.v}</div>
              <div style={{ fontSize:10, color:'#a0b8cc', marginTop:4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DAILY HABIT LOOP ───────────────────────────────────────────────── */}
      <div style={{ background:'#0a0a14', borderTop:'1px solid #1a1a2e', borderBottom:'1px solid #1a1a2e' }}>
        <div className="wc">
          <div className="wc-lbl">THE DAILY HABIT LOOP</div>
          <div className="loop-grid">
            {LOOP_STEPS.map((s, i) => (
              <div key={i} style={{ background:'#0f0f1a', border:'1px solid #1a1a2e',
                borderRadius:6, padding:20, position:'relative' }}>
                <div style={{ position:'absolute', top:12, right:14, fontSize:38,
                  color:'#ffaa0012', fontFamily:"'Bebas Neue',sans-serif", lineHeight:1 }}>{s.num}</div>
                <div style={{ fontSize:18, marginBottom:10 }}>{s.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#ffaa00', marginBottom:6,
                  letterSpacing:'.06em', fontFamily:"'IBM Plex Mono',monospace" }}>{s.title}</div>
                <div style={{ fontSize:12, color:'#b0c4dc', lineHeight:1.75, marginBottom:10 }}>{s.desc}</div>
                <div style={{ fontSize:11, color:'#00ff88bb', paddingTop:10,
                  borderTop:'1px solid #1a1a2e', fontStyle:'italic' }}>→ {s.hook}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ACCURACY SECTION ───────────────────────────────────────────────── */}
      <div className="wc">
        <div className="wc-lbl">SIGNAL ACCURACY — YOUR PERSONAL EDGE</div>
        <div style={{ background:'#0c1a14', border:'1px solid #00ff8822', borderRadius:8, padding:'clamp(20px,3vw,32px)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, alignItems:'center' }}>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(28px,4vw,44px)',
                lineHeight:1.1, color:'#00ff88', marginBottom:16 }}>
                YOUR EDGE.<br />TRACKED AUTOMATICALLY.
              </div>
              <p style={{ fontSize:14, color:'#d0e0f0', lineHeight:1.85, margin:'0 0 14px' }}>
                Every BUY/SELL/HOLD you run is saved with your entry price and timeframe. When the timeframe elapses, the outcome is checked against the real price — WIN, LOSS or SCRATCH.
              </p>
              <p style={{ fontSize:13, color:'#a0b8cc', lineHeight:1.8, margin:0 }}>
                Over time your personal accuracy record builds. No other tool shows you whether your signals actually work. This one does — and the data is yours forever.
              </p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { l:'Every scan auto-saved',           v:'entry price + timeframe', c:'#00ff88' },
                { l:'Outcomes checked automatically',  v:'when timeframe elapses',  c:'#00ff88' },
                { l:'WIN / LOSS / SCRATCH',            v:'vs real price move',      c:'#ffaa00' },
                { l:'High-confidence signals',         v:'tracked separately',      c:'#4488ff' },
                { l:'Signal history',                  v:'stored forever',          c:'#aa44ff' },
              ].map((r, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'10px 14px', background:'#0f1a14', border:'1px solid #00ff8811', borderRadius:4 }}>
                  <span style={{ fontSize:12, color:'#c0d4e8' }}>{r.l}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:r.c }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <div style={{ background:'#0a0a14', borderTop:'1px solid #1a1a2e', borderBottom:'1px solid #1a1a2e' }}>
        <div className="wc">
          <div className="wc-lbl">WHAT YOU GET</div>

          {/* Market toggle */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:32 }}>
            <div style={{ display:'flex', border:'1px solid #2a2a3e', borderRadius:6, overflow:'hidden' }}>
              {[['US','🇺🇸 US FEATURES','#ffaa00'],['INDIA','🇮🇳 INDIA FEATURES','#ff9a00']].map(([key,label,accent]) => (
                <button key={key} className="tog-btn" onClick={() => setActiveMarket(key)} style={{
                  padding:'clamp(9px,1.3vw,12px) clamp(18px,3vw,36px)',
                  background: activeMarket===key ? accent+'1a' : 'transparent',
                  border:'none', borderRight: key==='US' ? '1px solid #2a2a3e' : 'none',
                  color: activeMarket===key ? accent : '#9ab0c8',
                  cursor:'pointer', fontFamily:"'IBM Plex Mono',monospace",
                  fontSize:'clamp(11px,1.2vw,13px)', letterSpacing:'.1em', fontWeight:700 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="feat-grid">
            {features.map((f, i) => (
              <div key={`${activeMarket}-${i}`} className="feat-card" onClick={() => go(f.tab)} style={{
                padding:'clamp(16px,2.5vw,24px)', background:'#0f0f1a',
                border:`1px solid ${f.color}22`, borderTop:`3px solid ${f.color}`,
                borderRadius:6, animation:`fadeUp 0.35s ease ${i*55}ms both` }}>
                <div style={{ fontSize:'clamp(22px,2.8vw,30px)', marginBottom:10 }}>{f.icon}</div>
                <div style={{ fontSize:'clamp(12px,1.3vw,14px)', fontWeight:700,
                  color:f.color, marginBottom:8, fontFamily:"'IBM Plex Mono',monospace",
                  letterSpacing:'.04em' }}>{f.title}</div>
                <div style={{ fontSize:'clamp(11px,1.1vw,13px)', color:'#d0dff0',
                  lineHeight:1.75, marginBottom:12 }}>{f.desc}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  {f.points.map((p, j) => (
                    <div key={j} style={{ fontSize:'clamp(10px,1vw,11px)', color:'#a0b8cc',
                      display:'flex', gap:7, alignItems:'flex-start' }}>
                      <span style={{ color:f.color, flexShrink:0, marginTop:1 }}>›</span><span style={{color:'#c0d0e4'}}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── SIGNAL ENGINE ──────────────────────────────────────────────────── */}
      <div className="wc">
        <div className="wc-lbl">THE SIGNAL ENGINE</div>
        <div style={{ textAlign:'center', fontSize:11, color:'#8aaabf', marginBottom:18 }}>
          Based on{' '}
          <span style={{ color:'#4488ff77' }}>151 Trading Strategies (Kakushadze & Serur, SSRN-3247865)</span>
          {' '}+ institutional quant research
        </div>
        <div className="engine-grid">
          {ENGINE_FACTORS.map((f, i) => (
            <div key={i} style={{ background:'#0f0f1a', borderLeft:`3px solid ${f.color}`,
              borderRadius:3, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:f.color, marginBottom:3,
                fontFamily:"'IBM Plex Mono',monospace" }}>
                {f.name}
                {f.badge && (
                  <span style={{ fontSize:9, letterSpacing:'.08em', color:'#4488ff77',
                    border:'1px solid #4488ff22', padding:'1px 6px', borderRadius:2,
                    marginLeft:6, verticalAlign:'middle' }}>{f.badge}</span>
                )}
              </div>
              <div style={{ fontSize:10, color:'#a0b8cc', marginBottom:3 }}>{f.weight}</div>
              <div style={{ fontSize:10, color:'#a0b8cc', lineHeight:1.4 }}>{f.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:14, textAlign:'center', fontSize:11, color:'#8aaabf' }}>
          Score −1 to +1 per factor &nbsp;·&nbsp;
          <span style={{ color:'#00ff88' }}>+0.15 = BUY</span> &nbsp;·&nbsp;
          <span style={{ color:'#ff4444' }}>−0.15 = SELL</span> &nbsp;·&nbsp;
          <span style={{ color:'#b0c4dc' }}>else HOLD</span> &nbsp;·&nbsp;
          <span style={{ color:'#c8d8f0' }}>Confidence 45–95%</span>
        </div>
      </div>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <div style={{ background:'#0a0a14', borderTop:'1px solid #1a1a2e', borderBottom:'1px solid #1a1a2e' }}>
        <div className="wc">
          <div className="wc-lbl">PRICING</div>
          <div className="pricing-grid">
            {PRICING.map((p, i) => (
              <div key={i} style={{ background:'#0f0f1a', borderRadius:6,
                padding:'clamp(18px,2.5vw,28px)',
                border:`1px solid ${p.color}33`, borderTop:`3px solid ${p.color}`,
                position:'relative' }}>
                {p.popular && (
                  <div style={{ position:'absolute', top:-1, left:'50%', transform:'translateX(-50%)',
                    background:p.color, color:'#08080f', fontSize:9, letterSpacing:'.15em',
                    padding:'3px 12px', borderRadius:'0 0 4px 4px', fontWeight:700,
                    fontFamily:"'IBM Plex Mono',monospace" }}>MOST POPULAR</div>
                )}
                <div style={{ fontSize:9, color:p.color, letterSpacing:'.18em',
                  marginBottom:10, marginTop: p.popular ? 14 : 0,
                  fontFamily:"'IBM Plex Mono',monospace" }}>{p.label}</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif",
                  fontSize:'clamp(34px,5vw,50px)', color:p.color, lineHeight:1, marginBottom:4 }}>{p.price}</div>
                <div style={{ fontSize:11, color:'#b0c4dc', marginBottom:20 }}>{p.sub}</div>
                {p.features.map((f, j) => (
                  <div key={j} style={{ display:'flex', gap:8, alignItems:'center',
                    fontSize:'clamp(12px,1.1vw,13px)', color: f.startsWith('First month') ? '#00ff88' : '#d0dff0',
                    padding:'6px 0', borderBottom:'1px solid #1a1a2a' }}>
                    <span style={{ color:p.color }}>✓</span>{f}
                  </div>
                ))}
                <button className="wc-btn" onClick={onEnter} style={{
                  width:'100%', marginTop:20, fontFamily:"'IBM Plex Mono',monospace",
                  fontSize:'clamp(11px,1.1vw,12px)', letterSpacing:'.1em',
                  padding:'clamp(10px,1.2vw,13px)',
                  background:`${p.color}18`, border:`1px solid ${p.color}`,
                  color:p.color, cursor:'pointer', borderRadius:3, fontWeight:700 }}>
                  {p.cta} →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ABOUT ──────────────────────────────────────────────────────────── */}
      <div className="wc">
        <div className="wc-lbl">ABOUT</div>
        <div className="about-grid">
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif",
              fontSize:'clamp(26px,3.8vw,42px)', color:'#ffaa00',
              lineHeight:1.08, marginBottom:20 }}>
              BUILT DIFFERENT.<br />SIGNALS THAT GRADE THEMSELVES.
            </div>
            {[
              "QuAInt Signal is not another AI chatbot that guesses a BUY. Every signal comes from a 17-factor deterministic scoring engine — momentum, trend, RSI, MACD, Bollinger Bands, volume, IBS, S/R levels, IV rank, sector relative strength, revenue growth, earnings quality (SUE), analyst consensus, macro regime, news catalyst, earnings gate and Donchian channel. Claude writes the thesis explaining it. The engine sets it.",
              "The signal factors are drawn from peer-reviewed academic research — specifically the Kakushadze & Serur \"151 Trading Strategies\" paper (SSRN-3247865) — combined with institutional quant methods. Risk-adjusted momentum, Internal Bar Strength, Standardized Unexpected Earnings, the 3-MA cascade filter and low-volatility anomaly are all implemented from the paper's formulas.",
              "For Indian stocks, FII/DII net buying, promoter holding changes, delivery % vs total volume and NSE circuit breaker proximity are scored as dedicated factors — not just mentioned in the thesis. The India Invest tab adds SIP planning, AI portfolio allocation and 10,000+ mutual fund search.",
            ].map((t, i) => (
              <p key={i} style={{ fontSize:'clamp(12px,1.2vw,13px)', color:'#b0c4dc',
                lineHeight:1.9, marginBottom:14, marginTop:0 }}>{t}</p>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { c:'#00ff88', l:'SIGNAL ENGINE',    v:'17-factor deterministic · 5-signal regime detector' },
              { c:'#ffaa00', l:'US PRICE/OPTIONS', v:'Tradier — real-time quotes + options chain' },
              { c:'#ff9a00', l:'INDIA DATA',       v:'NSE India API · Yahoo Finance · Bhav Copy fallback' },
              { c:'#4488ff', l:'FUNDAMENTALS',     v:'Finnhub XBRL · FMP · Polygon reference' },
              { c:'#ff8844', l:'MACRO / FX',       v:'Exchange Rate API · Tradier GLD/USO · Bond yields' },
              { c:'#aa44ff', l:'AI THESIS',        v:'Claude Sonnet — thesis only, not the signal' },
              { c:'#44aaff', l:'RESEARCH',         v:'151 Trading Strategies · SSRN-3247865' },
              { c:'#556677', l:'PRIVACY',          v:'No data sold · Supabase persistent cache' },
            ].map((item, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:14,
                background:'#0f0f1a', borderRadius:4, padding:'11px 16px',
                borderLeft:`3px solid ${item.c}` }}>
                <div>
                  <div style={{ fontSize:9, color:'#b0c4dc', letterSpacing:'.1em', marginBottom:2,
                    fontFamily:"'IBM Plex Mono',monospace" }}>{item.l}</div>
                  <div style={{ fontSize:13, color:'#d8e8f4' }}>{item.v}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <div style={{ borderTop:'1px solid #1a1a2e',
        padding:'clamp(18px,2.5vw,28px) clamp(16px,5vw,56px)', textAlign:'center' }}>
        <div style={{ fontSize:'clamp(11px,.9vw,12px)', color:'#8899aa',
          lineHeight:1.8 }}>
          ⚠ RISK DISCLAIMER: QuAInt Signal is an educational and analytical tool only. Nothing constitutes financial advice or a recommendation to buy or sell any security. Trading involves significant risk. Always consult a licensed financial advisor before trading.
        </div>
        <div style={{ fontSize:10, color:'#a0b8cc', marginTop:10 }}>
          © {new Date().getFullYear()} QuAInt Signal · Free to start · US Pro $5/mo · India Pro ₹249/mo
        </div>
      </div>
    </div>
  );
}