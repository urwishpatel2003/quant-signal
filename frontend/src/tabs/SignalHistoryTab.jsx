import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

const BASE = import.meta.env.VITE_API_BASE;

function fmtPct(n) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function OutcomeBadge({ result }) {
  if (!result || result === 'PENDING') return (
    <span style={{ fontSize: 10, color: '#556677', background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 3, padding: '2px 7px' }}>PENDING</span>
  );
  const map = { WIN: ['#00ff88', '#00ff8811', '#00ff8833'], LOSS: ['#ff4444', '#ff444411', '#ff444433'], SCRATCH: ['#ffaa00', '#ffaa0011', '#ffaa0033'] };
  const [col, bg, bdr] = map[result] || map.SCRATCH;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: col, background: bg, border: `1px solid ${bdr}`, borderRadius: 3, padding: '2px 7px' }}>{result}</span>
  );
}

function StatBox({ label, value, sub, color = '#e8e8f0', border = '#2a2a40' }) {
  return (
    <div style={{ background: '#0f0f1a', border: `1px solid ${border}`, borderRadius: 6, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#7788aa', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function SignalHistoryTab({ market = 'US' }) {
  const { user, isLoaded } = useUser();
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [checking,   setChecking]   = useState(false);
  const [filter,     setFilter]     = useState('ALL'); // ALL | BUY | SELL | HOLD
  const [error,      setError]      = useState('');

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${BASE}/signal-history/${user.id}?all=true`);
      const json = await res.json();
      setData(json);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const checkOutcomes = async () => {
    if (!user?.id) return;
    setChecking(true);
    try {
      const res  = await fetch(`${BASE}/signal-history/${user.id}/check-outcomes`, { method: 'POST' });
      const json = await res.json();
      if (json.checked > 0) await load(); // reload if any updated
    } catch {}
    setChecking(false);
  };

  // Reload when tab becomes visible + auto-refresh every 30s
  useEffect(() => {
    if (!isLoaded || !user?.id) { setLoading(false); return; }
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [isLoaded, user?.id, market]);

  if (!isLoaded || loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#7788aa', fontSize: 13 }}>Loading signal history...</div>
  );
  if (!user) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#7788aa', fontSize: 13 }}>Sign in to view signal history</div>
  );

  const stats   = data?.stats || {};
  const signals = (data?.signals || []).filter(s => filter === 'ALL' || s.signal === filter);

  const sigColor = (s) => s === 'BUY' ? '#00ff88' : s === 'SELL' ? '#ff4444' : '#ffaa00';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#ffaa00', letterSpacing: '0.08em' }}>
            📈 SIGNAL ACCURACY
          </div>
          <div style={{ fontSize: 11, color: '#556677', marginTop: 2 }}>
            {market === 'INDIA' ? '🇮🇳 NSE India' : '🇺🇸 US Market'} · Every scan saved automatically
          </div>
        </div>
        <button onClick={checkOutcomes} disabled={checking} style={{
          padding: '6px 14px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
          border: '1px solid #ffaa0033', background: '#ffaa0011', color: '#ffaa00',
          fontFamily: 'inherit', letterSpacing: '0.08em', opacity: checking ? 0.6 : 1,
        }}>
          {checking ? 'CHECKING...' : '↻ CHECK OUTCOMES'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#ff4444', background: '#ff444411', border: '1px solid #ff444433', borderRadius: 4, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {/* Stats grid — show even when pending */}
      {(stats.total > 0 || stats.pending > 0) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          <StatBox label="TOTAL SCANS"     value={stats.total + (stats.pending||0)} sub={`${stats.pending||0} pending`} color="#e8e8f0" />
          <StatBox label="WIN RATE"        value={stats.winRate != null ? `${stats.winRate}%` : '—'} sub={`${stats.wins||0}W · ${stats.losses||0}L`} color={stats.winRate >= 50 ? '#00ff88' : '#ff4444'} border={stats.winRate >= 50 ? '#00ff8833' : '#ff444433'} />
          <StatBox label="AVG RETURN"      value={fmtPct(stats.avgOutcomePct)} color={(stats.avgOutcomePct||0) >= 0 ? '#00ff88' : '#ff4444'} />
          <StatBox label="70%+ CONF RATE"  value={stats.highConfWinRate != null ? `${stats.highConfWinRate}%` : '—'} sub={`${stats.highConfTotal} trades`} color={stats.highConfWinRate >= 60 ? '#00ff88' : '#ffaa00'} border="#ffaa0033" />
          {stats.bySignal?.BUY?.total > 0 && (
            <StatBox label="BUY ACCURACY"  value={`${Math.round(stats.bySignal.BUY.wins / stats.bySignal.BUY.total * 100)}%`} sub={`${stats.bySignal.BUY.total} signals`} color="#00ff88" border="#00ff8833" />
          )}
          {stats.bySignal?.SELL?.total > 0 && (
            <StatBox label="SELL ACCURACY" value={`${Math.round(stats.bySignal.SELL.wins / stats.bySignal.SELL.total * 100)}%`} sub={`${stats.bySignal.SELL.total} signals`} color="#ff4444" border="#ff444433" />
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#556677', fontSize: 13 }}>
          No resolved signals yet — run scans and check outcomes after the timeframe elapses
        </div>
      )}

      {/* How it works */}
      {stats.pending > 0 && (
        <div style={{ background: '#ffaa0011', border: '1px solid #ffaa0022', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: '#7788aa' }}>
          ⏳ <strong style={{ color: '#ffaa00' }}>{stats.pending} pending signals</strong> — outcomes are checked after the signal's timeframe elapses (5 days for short-term, 4 weeks for swing, etc). Click ↻ CHECK OUTCOMES to update.
        </div>
      )}

      {/* Filter */}
      {(data?.signals?.length > 0) && (
        <div style={{ display: 'flex', gap: 8 }}>
          {['ALL', 'BUY', 'SELL', 'HOLD'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
              border: `1px solid ${filter === f ? sigColor(f) || '#ffaa00' : '#2a2a3e'}`,
              background: filter === f ? `${sigColor(f) || '#ffaa00'}11` : '#0a0a14',
              color: filter === f ? (sigColor(f) || '#ffaa00') : '#556677',
            }}>{f}</button>
          ))}
          <span style={{ fontSize: 11, color: '#445', marginLeft: 'auto', alignSelf: 'center' }}>{signals.length} signals</span>
        </div>
      )}

      {/* Signal list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#556677', fontSize: 13 }}>
            No signals yet · Run a scan to start tracking accuracy
          </div>
        ) : signals.map(s => (
          <div key={s.id} style={{
            background: '#0f0f1a',
            border: `1px solid ${s.outcome_result === 'WIN' ? '#00ff8822' : s.outcome_result === 'LOSS' ? '#ff444422' : '#2a2a40'}`,
            borderRadius: 8, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            {/* Ticker + signal */}
            <div style={{ minWidth: 80 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#e8e8f0' }}>{s.ticker}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: sigColor(s.signal) }}>{s.signal} · {s.confidence}%</div>
            </div>

            {/* Prices */}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 11, color: '#7788aa' }}>
                Entry: {market === 'INDIA' ? '₹' : '$'}{s.price_at_signal?.toFixed(2)}
                {s.price_target && ` · Target: ${market === 'INDIA' ? '₹' : '$'}${parseFloat(s.price_target).toFixed(2)}`}
              </div>
              <div style={{ fontSize: 10, color: '#445', marginTop: 2 }}>
                {s.timeframe} · {new Date(s.created_at).toLocaleDateString()}
              </div>
            </div>

            {/* Outcome */}
            <div style={{ textAlign: 'right' }}>
              <OutcomeBadge result={s.outcome_result} />
              {s.outcome_pct != null && (
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: s.outcome_pct >= 0 ? '#00ff88' : '#ff4444' }}>
                  {fmtPct(s.outcome_pct)}
                </div>
              )}
              {s.outcome_price && (
                <div style={{ fontSize: 10, color: '#445' }}>
                  Exit: {market === 'INDIA' ? '₹' : '$'}{s.outcome_price?.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#2a2a3e', textAlign: 'center', marginTop: 8 }}>
        WIN = signal direction correct by &gt;2% · LOSS = wrong by &gt;2% · SCRATCH = within 2%
      </div>
    </div>
  );
}