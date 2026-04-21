import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

const BASE = import.meta.env.VITE_API_BASE;

function fmtPct(n) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function OutcomeBadge({ result, livePct }) {
  if (!result || result === 'PENDING') {
    if (livePct != null) {
      const winning = livePct > 0;
      const col = winning ? '#00ff88' : '#ff4444';
      const bg  = winning ? '#00ff8811' : '#ff444411';
      const bdr = winning ? '#00ff8833' : '#ff444433';
      return (
        <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: col, background: bg, border: `1px solid ${bdr}`, borderRadius: 3, padding: '2px 7px' }}>
          {winning ? '▲ WINNING' : '▼ LOSING'}
        </span>
      );
    }
    return (
      <span style={{ fontSize: 'var(--fs-body)', color: '#99aacc', background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 3, padding: '2px 7px' }}>PENDING</span>
    );
  }
  const map = { WIN: ['#00ff88', '#00ff8811', '#00ff8833'], LOSS: ['#ff4444', '#ff444411', '#ff444433'], SCRATCH: ['#ffaa00', '#ffaa0011', '#ffaa0033'] };
  const [col, bg, bdr] = map[result] || map.SCRATCH;
  return (
    <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: col, background: bg, border: `1px solid ${bdr}`, borderRadius: 3, padding: '2px 7px' }}>{result}</span>
  );
}

function StatBox({ label, value, sub, color = '#e8e8f0', border = '#2a2a40' }) {
  return (
    <div style={{ background: '#0f0f1a', border: `1px solid ${border}`, borderRadius: 6, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--fs-md)', color: '#99aacc', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--fs-body)', color: '#c8d8f0', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function SignalHistoryTab({ market = 'US' }) {
  const { user, isLoaded } = useUser();
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [checking,   setChecking]   = useState(false);
  const [resolving,  setResolving]  = useState({});
  const [filter,     setFilter]     = useState('ALL');
  const [error,      setError]      = useState('');
  const [livePrices, setLivePrices] = useState({}); // ticker → current price

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${BASE}/signal-history/${user.id}?market=${market}`);
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
      if (json.checked > 0) await load();
    } catch {}
    setChecking(false);
  };

  const forceResolve = async (signalId) => {
    if (!user?.id) return;
    setResolving(r => ({ ...r, [signalId]: true }));
    try {
      const res  = await fetch(`${BASE}/signal-history/${user.id}/resolve/${signalId}`, { method: 'POST' });
      const json = await res.json();
      if (json.result) await load();
    } catch {}
    setResolving(r => { const n = { ...r }; delete n[signalId]; return n; });
  };

  // Fetch live prices for pending stock signals
 const fetchLivePrices = async (signals) => {
  const pending = (signals || []).filter(s =>
    s.outcome_result === 'PENDING' &&
    (!s.signal_type || s.signal_type === 'STOCK') &&
    s.ticker
  );
  if (!pending.length) return;

  const tickers = [...new Set(pending.map(s => s.ticker))];
  try {
    if (market === 'INDIA') {
      const results = await Promise.allSettled(
        tickers.map(t => fetch(`${BASE}/india/quote/${t}`).then(r => r.json()))
      );
      const prices = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.price) prices[tickers[i]] = r.value.price;
      });
      setLivePrices(prices);
    } else {
      // Fetch each ticker individually — handles closed market via prevclose fallback
      const results = await Promise.allSettled(
        tickers.map(t =>
          fetch(`${BASE}/tradier/quote/${t}`)
            .then(r => r.json())
            .then(d => {
              const q = d?.quotes?.quote;
              // Use last, fallback to prevclose when market closed
              const price = q?.last || q?.prevclose || q?.close || null;
              return { ticker: t, price };
            })
        )
      );
      const prices = {};
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value?.price) {
          prices[r.value.ticker] = r.value.price;
        }
      });
      setLivePrices(prices);
    }
  } catch (e) {
    console.warn('[livePrices] failed:', e.message);
  }
};
  useEffect(() => {
    if (!isLoaded || !user?.id) { setLoading(false); return; }
    load().then(() => checkOutcomes());
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(load, 30000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [isLoaded, user?.id, market]);

  // Fetch live prices whenever signals load
  useEffect(() => {
    if (data?.signals) fetchLivePrices(data.signals);
  }, [data?.signals?.length]);

  if (!isLoaded || loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#c8d8f0', fontSize: 'var(--fs-lg)' }}>Loading signal history...</div>
  );
  if (!user) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#c8d8f0', fontSize: 'var(--fs-lg)' }}>Sign in to view signal history</div>
  );

  const stats   = data?.stats || {};
  const signals = (data?.signals || []).filter(s => filter === 'ALL' || s.signal === filter);
  const sigColor = (s) => s === 'BUY' ? '#00ff88' : s === 'SELL' ? '#ff4444' : '#ffaa00';

  // ── Stock-only stats (exclude options) ──────────────────────────────────────
  const optTotal   = (stats.options?.total   || 0) + (stats.options?.pending || 0);
  const optWins    =  stats.options?.wins    || 0;
  const optLosses  =  stats.options?.losses  || 0;

  const stockTotal   = (stats.total   || 0) + (stats.pending || 0) - optTotal;
  const stockPending = (stats.pending || 0) - (stats.options?.pending || 0);
  const stockWins    = (stats.wins    || 0) - optWins;
  const stockLosses  = (stats.losses  || 0) - optLosses;
  const stockResolved = stockWins + stockLosses + (stats.scratches || 0);
  const stockWinRate  = stockResolved > 0
    ? Math.round(stockWins / stockResolved * 100)
    : stats.winRate ?? null;

  // ── Include pending signals in live stats ─────────────────────────────────
  // Calculate live P&L for pending stock signals
  const allStockSignals = (data?.signals || []).filter(s => !s.signal_type || s.signal_type === 'STOCK');
  const pendingStockSignals = allStockSignals.filter(s => s.outcome_result === 'PENDING');

  const livePendingPcts = pendingStockSignals.map(s => {
    const cur = livePrices[s.ticker];
    if (!cur || !s.price_at_signal) return null;
    const pct = (cur - s.price_at_signal) / s.price_at_signal * 100;
    // Invert for SELL signals — profit when price goes down
    return s.signal === 'SELL' ? -pct : pct;
  }).filter(p => p != null);

  const pendingWinning = livePendingPcts.filter(p => p > 2).length;
  const pendingLosing  = livePendingPcts.filter(p => p < -2).length;
  const pendingScratch = livePendingPcts.filter(p => Math.abs(p) <= 2).length;

  // All-in avg return including live pending
  const resolvedPcts  = allStockSignals
    .filter(s => s.outcome_result !== 'PENDING' && s.outcome_pct != null)
    .map(s => s.outcome_pct);
  const allPcts       = [...resolvedPcts, ...livePendingPcts];
  const allAvgReturn  = allPcts.length
    ? parseFloat((allPcts.reduce((a, b) => a + b, 0) / allPcts.length).toFixed(1))
    : stats.avgOutcomePct ?? null;

  // All-in win rate including live pending
  const totalWithPending = stockResolved;
  const winsWithPending  = stockWins;
  const allWinRate = stockResolved > 0
    ? Math.round(stockWins / stockResolved * 100)
    : null;

  const hasStockStats = stockTotal > 0 || stockPending > 0;

  // Helper: get live pct for a single pending signal
  const getLivePct = (s) => {
    if (s.outcome_result !== 'PENDING') return null;
    if (s.signal_type === 'OPTION') return null;
    const cur = livePrices[s.ticker];
    if (!cur || !s.price_at_signal) return null;
    const rawPct = (cur - s.price_at_signal) / s.price_at_signal * 100;
    return s.signal === 'SELL' ? -rawPct : rawPct;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#ffaa00', letterSpacing: '0.08em' }}>
            📈 SIGNAL ACCURACY
          </div>
          <div style={{ fontSize: 'var(--fs-lg)', color: '#99aacc', marginTop: 2 }}>
            {market === 'INDIA' ? '🇮🇳 NSE India' : '🇺🇸 US Market'} · Every scan saved automatically
          </div>
        </div>
        <button onClick={checkOutcomes} disabled={checking} style={{
          padding: '6px 14px', fontSize: 'var(--fs-body)', cursor: 'pointer', borderRadius: 4,
          border: '1px solid #ffaa0033', background: '#ffaa0011', color: '#ffaa00',
          fontFamily: 'inherit', letterSpacing: '0.08em', opacity: checking ? 0.6 : 1,
        }}>
          {checking ? 'CHECKING...' : '↻ CHECK OUTCOMES'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 'var(--fs-md)', color: '#ff4444', background: '#ff444411', border: '1px solid #ff444433', borderRadius: 4, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {/* ── Stock signal stats ── */}
      {hasStockStats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          <StatBox
            label="STOCK SCANS"
            value={stockTotal}
            sub={`${stockPending} pending`}
            color="#e8e8f0"
          />
          <StatBox
            label="WIN RATE"
            value={allWinRate != null ? `${allWinRate}%` : '—'}
            sub={`${winsWithPending}W · ${(stockLosses + pendingLosing)}L · ${pendingWinning + pendingScratch} live`}
            color={allWinRate >= 50 ? '#00ff88' : '#ff4444'}
            border={allWinRate >= 50 ? '#00ff8833' : '#ff444433'}
          />
          <StatBox
            label="AVG RETURN"
            value={fmtPct(allAvgReturn)}
            sub={allPcts.length > resolvedPcts.length ? `incl. ${livePendingPcts.length} live` : null}
            color={(allAvgReturn || 0) >= 0 ? '#00ff88' : '#ff4444'}
          />
          <StatBox
            label="70%+ CONF RATE"
            value={stats.highConfWinRate != null ? `${stats.highConfWinRate}%` : '—'}
            sub={`${stats.highConfTotal || 0} trades`}
            color={stats.highConfWinRate >= 60 ? '#00ff88' : '#ffaa00'}
            border="#ffaa0033"
          />
          {stats.bySignal?.BUY?.total > 0 && (
            <StatBox
              label="BUY ACCURACY"
              value={`${Math.round(stats.bySignal.BUY.wins / stats.bySignal.BUY.total * 100)}%`}
              sub={`${stats.bySignal.BUY.total} signals`}
              color="#00ff88"
              border="#00ff8833"
            />
          )}
          {stats.bySignal?.SELL?.total > 0 && (
            <StatBox
              label="SELL ACCURACY"
              value={`${Math.round(stats.bySignal.SELL.wins / stats.bySignal.SELL.total * 100)}%`}
              sub={`${stats.bySignal.SELL.total} signals`}
              color="#ff4444"
              border="#ff444433"
            />
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#99aacc', fontSize: 'var(--fs-lg)' }}>
          No resolved signals yet — run scans and check outcomes after the timeframe elapses
        </div>
      )}

      {/* ── Live pending summary ── */}
      {livePendingPcts.length > 0 && (
        <div style={{ background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--fs-sm)', color: '#99aacc', letterSpacing: '.1em' }}>📡 LIVE POSITIONS</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ color: '#00ff88', fontWeight: 700 }}>▲ {pendingWinning} winning</span>
            <span style={{ color: '#ff4444', fontWeight: 700 }}>▼ {pendingLosing} losing</span>
            {pendingScratch > 0 && <span style={{ color: '#ffaa00' }}>{pendingScratch} flat</span>}
          </div>
          <div style={{ marginLeft: 'auto', fontWeight: 700, color: (livePendingPcts.reduce((a,b)=>a+b,0)/livePendingPcts.length) >= 0 ? '#00ff88' : '#ff4444' }}>
            Avg live: {fmtPct(parseFloat((livePendingPcts.reduce((a,b)=>a+b,0)/livePendingPcts.length).toFixed(1)))}
          </div>
        </div>
      )}

      {/* ── Options stats ── */}
      {stats.options?.total > 0 && (
        <div style={{ background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 'var(--fs-sm)', color: '#ffaa0088', letterSpacing: '.15em', marginBottom: 12 }}>⚡ OPTIONS SIGNAL ACCURACY</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 10 }}>
            <StatBox label="OPTIONS TOTAL" value={stats.options.total + (stats.options.pending || 0)} sub={`${stats.options.pending || 0} pending`} color="#ffaa00" />
            <StatBox label="WIN RATE" value={stats.options.winRate != null ? `${stats.options.winRate}%` : '—'} sub={`${stats.options.wins || 0}W · ${(stats.options.total - stats.options.wins) || 0}L`} color={stats.options.winRate >= 50 ? '#00ff88' : '#ff4444'} />
            <StatBox label="AVG P&L" value={stats.options.avgPnl != null ? `${stats.options.avgPnl > 0 ? '+' : ''}${stats.options.avgPnl}%` : '—'} color={(stats.options.avgPnl || 0) >= 0 ? '#00ff88' : '#ff4444'} />
            {stats.options.byType?.CALL?.total > 0 && (
              <StatBox label="CALL ACCURACY" value={`${Math.round(stats.options.byType.CALL.wins / stats.options.byType.CALL.total * 100)}%`} sub={`${stats.options.byType.CALL.total} calls · avg ${stats.options.byType.CALL.avgPnl > 0 ? '+' : ''}${stats.options.byType.CALL.avgPnl}%`} color="#00ff88" border="#00ff8833" />
            )}
            {stats.options.byType?.PUT?.total > 0 && (
              <StatBox label="PUT ACCURACY" value={`${Math.round(stats.options.byType.PUT.wins / stats.options.byType.PUT.total * 100)}%`} sub={`${stats.options.byType.PUT.total} puts · avg ${stats.options.byType.PUT.avgPnl > 0 ? '+' : ''}${stats.options.byType.PUT.avgPnl}%`} color="#ff4444" border="#ff444433" />
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#556677', lineHeight: 1.7 }}>
            Options P&L is calculated at expiry using intrinsic value: <span style={{ color: '#c8d8f0' }}>WIN = option profitable · LOSS = expired below breakeven</span>
          </div>
        </div>
      )}

      {/* Pending notice */}
      {stockPending > 0 && (
        <div style={{ background: '#ffaa0011', border: '1px solid #ffaa0022', borderRadius: 6, padding: '10px 14px', fontSize: 'var(--fs-lg)', color: '#c8d8f0' }}>
          ⏳ <strong style={{ color: '#ffaa00' }}>{stockPending} pending signals</strong> — outcomes checked after timeframe elapses (5d short-term, 4w swing). Live P&L shown below for open positions.
        </div>
      )}

      {/* Filter */}
      {(data?.signals?.length > 0) && (
        <div style={{ display: 'flex', gap: 8 }}>
          {['ALL', 'BUY', 'SELL', 'HOLD'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 'var(--fs-lg)', fontWeight: 700,
              border: `1px solid ${filter === f ? sigColor(f) || '#ffaa00' : '#2a2a3e'}`,
              background: filter === f ? `${sigColor(f) || '#ffaa00'}11` : '#0a0a14',
              color: filter === f ? (sigColor(f) || '#ffaa00') : '#556677',
            }}>{f}</button>
          ))}
          <span style={{ fontSize: 'var(--fs-lg)', color: '#99aacc', marginLeft: 'auto', alignSelf: 'center' }}>{signals.length} signals</span>
        </div>
      )}

      {/* Signal list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#99aacc', fontSize: 'var(--fs-lg)' }}>
            No signals yet · Run a scan to start tracking accuracy
          </div>
        ) : signals.map(s => {
          const livePct  = getLivePct(s);
          const isPending = s.outcome_result === 'PENDING';
          const livePrice = isPending && livePrices[s.ticker];
          const borderColor = isPending
            ? livePct != null
              ? livePct > 2 ? '#00ff8822' : livePct < -2 ? '#ff444422' : '#ffaa0022'
              : '#2a2a40'
            : s.outcome_result === 'WIN' ? '#00ff8822'
            : s.outcome_result === 'LOSS' ? '#ff444422'
            : '#2a2a40';

          return (
            <div key={s.id} style={{
              background: '#0f0f1a',
              border: `1px solid ${borderColor}`,
              borderRadius: 8, padding: '12px 14px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              {/* Left: ticker + signal */}
              <div style={{ flexShrink: 0, width: 88 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#e8e8f0' }}>{s.ticker}</div>
                  {s.signal_type === 'OPTION' && (
                    <span style={{ fontSize: 'var(--fs-xs)', background: s.option_type === 'CALL' ? '#00ff8822' : '#ff444422', color: s.option_type === 'CALL' ? '#00ff88' : '#ff4444', border: `1px solid ${s.option_type === 'CALL' ? '#00ff8844' : '#ff444444'}`, padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                      {s.option_type}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: sigColor(s.signal) }}>{s.signal} · {s.confidence}%</div>
              </div>

              {/* Middle: prices + details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', color: '#c8d8f0' }}>
                  Entry: {market === 'INDIA' ? '₹' : '$'}{s.price_at_signal?.toFixed(2)}
                  {livePrice ? (
                    <span style={{ color: livePct >= 0 ? '#00ff88' : '#ff4444', marginLeft: 6 }}>
                      → {market === 'INDIA' ? '₹' : '$'}{parseFloat(livePrice).toFixed(2)}
                    </span>
                  ) : s.price_target ? (
                    <span style={{ color: '#556677' }}> · Target: {market === 'INDIA' ? '₹' : '$'}{parseFloat(s.price_target).toFixed(2)}</span>
                  ) : null}
                </div>
                {s.signal_type === 'OPTION' && s.strike && (
                  <div style={{ fontSize: 'var(--fs-xs)', color: '#8899bb', marginTop: 1 }}>
                    {`$${s.strike} · exp ${s.expiry?.slice(5)} · entry $${s.entry_premium}`}
                  </div>
                )}
                <div style={{ fontSize: 'var(--fs-xs)', color: '#99aacc', marginTop: 2 }}>
                  {s.timeframe} · {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Right: outcome + P&L */}
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <OutcomeBadge result={s.outcome_result} livePct={livePct} />

                {/* Live P&L for pending */}
                {isPending && livePct != null && (
                  <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, marginTop: 4, color: livePct >= 0 ? '#00ff88' : '#ff4444' }}>
                    {fmtPct(livePct)}
                  </div>
                )}

                {/* Force resolve button for expired options */}
                {isPending && s.signal_type === 'OPTION' && s.expiry && (() => {
                  const etNow     = new Date(Date.now() - 4 * 3600 * 1000);
                  const todayET   = etNow.toISOString().split('T')[0];
                  const etHour    = etNow.getUTCHours();
                  const isExpired = s.expiry < todayET || (s.expiry === todayET && etHour >= 16);
                  if (!isExpired) return null;
                  return (
                    <button
                      onClick={() => forceResolve(s.id)}
                      disabled={resolving[s.id]}
                      style={{ fontSize: 'var(--fs-xs)', color: '#ffaa00', background: '#ffaa0011',
                        border: '1px solid #ffaa0044', borderRadius: 3, padding: '2px 8px',
                        cursor: 'pointer', fontFamily: 'inherit', opacity: resolving[s.id] ? 0.5 : 1, marginTop: 4 }}>
                      {resolving[s.id] ? '...' : '↻ RESOLVE'}
                    </button>
                  );
                })()}

                {/* Resolved P&L */}
                {!isPending && s.outcome_pct != null && (
                  <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, marginTop: 4, color: s.outcome_pct >= 0 ? '#00ff88' : '#ff4444' }}>
                    {fmtPct(s.outcome_pct)}
                  </div>
                )}
                {!isPending && s.outcome_price && (
                  <div style={{ fontSize: 'var(--fs-body)', color: '#99aacc' }}>
                    Exit: {market === 'INDIA' ? '₹' : '$'}{s.outcome_price?.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 'var(--fs-body)', color: '#99aacc', textAlign: 'center', marginTop: 8 }}>
        WIN = signal direction correct by &gt;2% · LOSS = wrong by &gt;2% · SCRATCH = within 2% · Live P&L shown for open positions
      </div>
    </div>
  );
}