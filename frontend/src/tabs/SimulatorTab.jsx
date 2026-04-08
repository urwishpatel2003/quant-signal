import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

import ShareModal from '../components/ShareModal';

const BASE = import.meta.env.VITE_API_BASE;

function fmtCurrency(n, sym = '$', isInr = false) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  let s;
  if (isInr) {
    if (abs >= 1e7)  s = `${(abs / 1e7).toFixed(2)} Cr`;
    else if (abs >= 1e5) s = `${(abs / 1e5).toFixed(2)} L`;
    else s = abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  } else {
    s = abs >= 1000
      ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : abs.toFixed(2);
  }
  return `${n < 0 ? '-' : ''}${sym}${s}`;
}

function PnlBadge({ value, pct, size = 'sm', currency = '$', isInr = false }) {
  if (value == null) return <span style={{ color: '#99aabb' }}>—</span>;
  const pos  = value >= 0;
  const col  = pos ? '#00ff88' : '#ff4444';
  const bg   = pos ? '#00ff8811' : '#ff444411';
  const bdr  = pos ? '#00ff8833' : '#ff444433';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, border: `1px solid ${bdr}`, borderRadius: 4,
      padding: size === 'lg' ? '4px 10px' : '2px 7px',
      fontSize: size === 'lg' ? 14 : 12, fontWeight: 700, color: col,
    }}>
      {pos ? '▲' : '▼'} {fmtCurrency(Math.abs(value), currency, isInr)}
      {pct != null && <span style={{ fontSize: size === 'lg' ? 12 : 10, opacity: 0.8 }}>({pct > 0 ? '+' : ''}{pct.toFixed(2)}%)</span>}
    </span>
  );
}

function StatCard({ label, value, sub, color = '#e8e8f0', border }) {
  return (
    <div style={{
      background: '#0f0f1a', border: `1px solid ${border || '#2a2a40'}`,
      borderRadius: 6, padding: '12px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 15, color: '#99aabb', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 16, color: '#d0dff0', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function SimulatorTab({ market = 'US' }) {
  const { user, isLoaded } = useUser();
  const currency       = market === 'INDIA' ? '₹' : '$';
  const isInr          = market === 'INDIA';
  const startingBal    = isInr ? 1000000 : 10000;
  const startingLabel  = isInr ? '₹10,00,000' : '$10,000';

  const [account,    setAccount]    = useState(null);
  const [positions,  setPositions]  = useState([]);
  const [prices,       setPrices]       = useState({});
  const [priceUpdatedAt, setPriceUpdatedAt] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('open'); // open | closed | stats
  const [resetting,    setResetting]    = useState(false);
  const [resetError,   setResetError]   = useState('');
  const [showShare,    setShowShare]    = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    if (!isLoaded || !user?.id) { setLoading(false); return; }
    // Clear stale state immediately on market switch
    setAccount(null);
    setPositions([]);
    setPrices({});
    setError('');
    setLoading(true);

    let cancelled = false;
    const fetchData = async () => {
      try {
        const [simRes, priceRes] = await Promise.all([
          fetch(`${BASE}/sim/${user.id}?market=${market}`).then(r => r.json()),
          fetch(`${BASE}/sim/${user.id}/prices?market=${market}`).then(r => r.json()),
        ]);
        if (cancelled) return;
        setAccount(simRes.account || null);
        setPositions(simRes.positions || []);
        setPrices(priceRes || {}); setPriceUpdatedAt(new Date());
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    // Refresh prices every 60s
    const interval = setInterval(() => {
      if (!cancelled)
        fetch(`${BASE}/sim/${user.id}/prices?market=${market}`)
          .then(r => r.json()).then(d => { if (!cancelled) { setPrices(d); setPriceUpdatedAt(new Date()); } })
          .catch(() => {});
    }, 60000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [isLoaded, user?.id, market]);



  const handleReset = async () => {
    if (!window.confirm(`Reset ${market} simulator? All positions will be deleted and balance reset to ${startingLabel}.`)) return;
    setResetting(true);
    await fetch(`${BASE}/sim/${user.id}/reset?market=${market}`, { method: 'POST' });
    setResetting(false);
    // Trigger re-fetch by toggling a reload state
    setLoading(true);
    fetch(`${BASE}/sim/${user.id}?market=${market}`).then(r=>r.json()).then(d=>{ setAccount(d.account); setPositions(d.positions||[]); setLoading(false); }).catch(()=>setLoading(false));
  };

  const openPositions   = positions.filter(p => p.status === 'OPEN');
  const closedPositions = positions.filter(p => p.status === 'CLOSED');

  // Compute stats
  const totalRealizedPnl  = closedPositions.reduce((s, p) => s + (p.realized_pnl || 0), 0);
  const wins              = closedPositions.filter(p => (p.realized_pnl || 0) > 0).length;
  const winRate           = closedPositions.length ? Math.round(wins / closedPositions.length * 100) : null;
  const avgWin            = wins ? closedPositions.filter(p => p.realized_pnl > 0).reduce((s, p) => s + p.realized_pct, 0) / wins : null;
  const losses            = closedPositions.filter(p => (p.realized_pnl || 0) < 0).length;
  const avgLoss           = losses ? closedPositions.filter(p => p.realized_pnl < 0).reduce((s, p) => s + p.realized_pct, 0) / losses : null;

  // Unrealized P&L across open positions
  // For each open position, compute current market value
  // Unrealized P&L — stocks and options
  const unrealizedPnl = openPositions.reduce((sum, p) => {
    if (p.position_type === 'OPTION') {
      const optPrice = prices[`OPT:${p.id}`];
      const cur      = optPrice?.mid;
      if (!cur || !p.premium) return sum;
      return sum + (cur - p.premium) * p.contracts * 100;
    }
    const cur = prices[p.ticker];
    if (!cur || cur === p.entry_price) return sum;
    const pnl = p.direction === 'LONG'
      ? (cur - p.entry_price) * p.quantity
      : (p.entry_price - cur) * p.quantity;
    return sum + pnl;
  }, 0);

  // Realized P&L from closed trades
  const realizedPnl = closedPositions.reduce((s, p) => s + (p.realized_pnl || 0), 0);

  // Total equity = starting balance + realized pnl + unrealized pnl
  // This way margin reservation doesn't show as a loss
  const totalEquity  = account ? account.starting_balance + realizedPnl + unrealizedPnl : 0;
  const totalReturn    = realizedPnl + unrealizedPnl;
  const totalReturnPct = account ? (totalReturn / account.starting_balance * 100) : 0;

  // High-confidence signals accuracy
  const highConfSignals = closedPositions.filter(p => (p.confidence || 0) >= 75);
  const highConfWins    = highConfSignals.filter(p => (p.realized_pnl || 0) > 0).length;
  const highConfRate    = highConfSignals.length ? Math.round(highConfWins / highConfSignals.length * 100) : null;

  if (!isLoaded || loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#d0dff0', fontSize: 17 }}>
      Loading simulator...
    </div>
  );

  if (!user) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#d0dff0', fontSize: 17 }}>
      Sign in to use the simulator
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#aa66ff', letterSpacing: '0.08em' }}>
            {market === 'INDIA' ? '🇮🇳' : '🇺🇸'} SIGNAL SIMULATOR
          </div>
          <div style={{ fontSize: 17, color: '#b0c4dc', marginTop: 2 }}>
            {`${market === 'INDIA' ? '🇮🇳 NSE India' : '🇺🇸 US Market'} · Virtual paper trading · ${startingLabel} starting balance`}
          </div>
        </div>
        {(() => {
          const resetCount  = account?.reset_count || 0;
          const hasReset    = resetCount >= 1;
          const lastReset   = account?.last_reset;
          return (
            <div style={{ position: 'relative' }}>
              <button
                onClick={handleReset}
                disabled={resetting || hasReset}
                title={hasReset ? 'Reset already used — results are permanent' : 'One-time reset (cannot be undone)'}
                style={{
                  padding: '6px 14px', fontSize: 16, cursor: hasReset ? 'not-allowed' : 'pointer',
                  borderRadius: 4, fontFamily: 'inherit', letterSpacing: '0.08em',
                  border: `1px solid ${hasReset ? '#2a2a3e' : '#ff444433'}`,
                  background: hasReset ? '#0a0a14' : '#ff444411',
                  color: hasReset ? '#2a2a3e' : '#ff444488',
                  opacity: resetting ? 0.5 : 1,
                }}>
                {resetting ? 'RESETTING...' : hasReset ? '↺ RESET USED' : '↺ RESET (1×)'}
              </button>
              {lastReset && (
                <div style={{ fontSize: 14, color: '#667799', textAlign: 'center', marginTop: 2 }}>
                  Reset on {new Date(lastReset).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        })()}
        <button onClick={() => setShowShare(true)} style={{
          padding: '6px 14px', fontSize: 16, cursor: 'pointer', borderRadius: 4,
          border: '1px solid #ffaa0033', background: '#ffaa0011', color: '#ffaa00',
          fontFamily: 'inherit', letterSpacing: '0.08em',
        }}>
          📤 SHARE
        </button>
      </div>

      {resetError && (
        <div style={{ fontSize: 15, color: '#ff4444bb', background: '#ff444411', border: '1px solid #ff444433', borderRadius: 4, padding: '8px 12px' }}>
          {resetError}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 15, color: '#ff4444', background: '#ff444411', border: '1px solid #ff444433', borderRadius: 4, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {/* ── Account summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        <StatCard
          label="CASH BALANCE"
          value={fmtCurrency(account?.balance, currency, isInr)}
          sub="Available to trade"
          border="#aa66ff33"
          color="#aa66ff"
        />
        <StatCard
          label="TOTAL EQUITY"
          value={fmtCurrency(totalEquity, currency, isInr)}
          sub={`${openPositions.length} open position${openPositions.length !== 1 ? 's' : ''}`}
          color="#e8e8f0"
          border="#2a2a40"
        />
        <StatCard
          label="TOTAL RETURN"
          value={`${totalReturn >= 0 ? '+' : ''}${fmtCurrency(totalReturn, currency, isInr)}`}
          sub={`${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%`}
          color={totalReturn >= 0 ? '#00ff88' : '#ff4444'}
          border={totalReturn >= 0 ? '#00ff8833' : '#ff444433'}
        />
        <StatCard
          label="UNREALIZED P&L"
          value={prices && Object.keys(prices).length ? `${unrealizedPnl >= 0 ? '+' : ''}${fmtCurrency(unrealizedPnl, currency, isInr)}` : 'Loading...'}
          sub={priceUpdatedAt ? `Updated ${priceUpdatedAt.toLocaleTimeString()}` : 'Fetching prices'}
          color={unrealizedPnl >= 0 ? '#00ff8888' : '#ff444488'}
          border="#2a2a40"
        />
        <StatCard
          label="WIN RATE"
          value={winRate != null ? `${winRate}%` : '—'}
          sub={`${wins}W · ${losses}L`}
          color={winRate != null ? (winRate >= 50 ? '#00ff88' : '#ff4444') : '#7788aa'}
          border="#2a2a40"
        />
        {highConfRate != null && (
          <StatCard
            label="75%+ CONF RATE"
            value={`${highConfRate}%`}
            sub={`${highConfSignals.length} trades`}
            color={highConfRate >= 60 ? '#00ff88' : '#ffaa00'}
            border="#ffaa0033"
          />
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #2a2a3e', paddingBottom: 0 }}>
        {[
          { key: 'open',   label: `OPEN (${openPositions.length})`   },
          { key: 'closed', label: `CLOSED (${closedPositions.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 14px', fontSize: 15, fontFamily: 'inherit', fontWeight: 700,
            letterSpacing: '0.1em', color: tab === t.key ? '#aa66ff' : '#556677',
            borderBottom: `2px solid ${tab === t.key ? '#aa66ff' : 'transparent'}`,
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Open Positions ── */}
      {tab === 'open' && (
        <div>
          {openPositions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#b0c4dc', fontSize: 17 }}>
              No open positions · Run a scan and click <strong style={{ color: '#aa66ff' }}>📊 SIMULATE</strong>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {openPositions.map(pos => {
                const cur     = prices[pos.ticker];
                const pnl     = cur != null
                  ? (pos.direction === 'LONG' ? (cur - pos.entry_price) : (pos.entry_price - cur)) * pos.quantity
                  : null;
                const pct     = cur != null
                  ? (pos.direction === 'LONG'
                      ? (cur - pos.entry_price) / pos.entry_price
                      : (pos.entry_price - cur) / pos.entry_price) * 100
                  : null;
                const isPos   = (pnl ?? 0) >= 0;
                const sym     = pos.market === 'INDIA' ? '₹' : '$';
                const hitTarget = pos.price_target && cur && (pos.direction === 'LONG' ? cur >= pos.price_target : cur <= pos.price_target);
                const hitStop   = pos.stop_loss   && cur && (pos.direction === 'LONG' ? cur <= pos.stop_loss   : cur >= pos.stop_loss);

                return (
                  <div key={pos.id} style={{
                    background: '#0f0f1a',
                    border: `1px solid ${hitTarget ? '#00ff8844' : hitStop ? '#ff444444' : '#2a2a40'}`,
                    borderRadius: 8, padding: '14px 16px',
                  }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#e8e8f0' }}>{pos.ticker}</span>
                          {pos.position_type === 'OPTION' ? (
                            <span style={{
                              fontSize: 16, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                              background: pos.option_type === 'CALL' ? '#00ff8811' : '#ff444411',
                              border: `1px solid ${pos.option_type === 'CALL' ? '#00ff8833' : '#ff444433'}`,
                              color: pos.option_type === 'CALL' ? '#00ff88' : '#ff4444',
                            }}>{pos.option_type} ${pos.strike} {pos.expiry}</span>
                          ) : (
                            <span style={{
                              fontSize: 16, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                              background: pos.direction === 'LONG' ? '#00ff8811' : '#ff444411',
                              border: `1px solid ${pos.direction === 'LONG' ? '#00ff8833' : '#ff444433'}`,
                              color: pos.direction === 'LONG' ? '#00ff88' : '#ff4444',
                            }}>{pos.direction}</span>
                          )}
                          {pos.signal && (
                            <span style={{ fontSize: 16, color: '#d0dff0' }}>
                              {pos.signal} · {pos.confidence}% conf
                            </span>
                          )}
                          {hitTarget && <span style={{ fontSize: 16, color: '#00ff88', fontWeight: 700 }}>🎯 TARGET HIT</span>}
                          {hitStop   && <span style={{ fontSize: 16, color: '#ff4444', fontWeight: 700 }}>⚠ STOP HIT</span>}
                        </div>
                        <div style={{ fontSize: 16, color: '#b0c4dc', marginTop: 2 }}>
                          {pos.position_type === 'OPTION'
                          ? `${pos.contracts} contract${pos.contracts > 1 ? 's' : ''} · premium ${sym}${pos.premium?.toFixed(2)}/sh · expires ${pos.expiry}`
                          : `${pos.quantity} shares · entered ${sym}${pos.entry_price.toFixed(2)} · ${new Date(pos.opened_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <PnlBadge value={pnl} pct={pct} size="lg" currency={currency} isInr={isInr} />
                    </div>

                    {/* Price bar */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      {[
                        ...(pos.position_type === 'OPTION' ? [
                          { label: 'PREMIUM NOW', value: cur ? `${sym}${cur.toFixed(2)}` : '—', color: isPos ? '#00ff88' : '#ff4444' },
                          { label: 'ENTRY PREM',  value: `${sym}${pos.premium?.toFixed(2)}`, color: '#d0dff0' },
                          { label: 'BREAK EVEN',  value: pos.option_type === 'CALL'
                              ? `${sym}${(pos.strike + pos.premium).toFixed(2)}`
                              : `${sym}${(pos.strike - pos.premium).toFixed(2)}`, color: '#ffaa00cc' },
                          { label: 'MAX LOSS',    value: `${sym}${(pos.premium * pos.contracts * 100).toFixed(2)}`, color: '#ff444477' },
                        ] : [
                          { label: 'CURRENT', value: cur ? `${sym}${cur.toFixed(2)}` : '—', color: isPos ? '#00ff88' : '#ff4444' },
                          { label: 'ENTRY',   value: `${sym}${pos.entry_price.toFixed(2)}`, color: '#d0dff0' },
                          { label: 'TARGET',  value: pos.price_target ? `${sym}${parseFloat(pos.price_target).toFixed(2)}` : '—', color: '#00ff8877' },
                          { label: 'STOP',    value: pos.stop_loss    ? `${sym}${parseFloat(pos.stop_loss).toFixed(2)}` : '—',    color: '#ff444477' },
                        ]),
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: '#0a0a14', borderRadius: 5, padding: '6px 10px', minWidth: 70 }}>
                          <div style={{ fontSize: 15, color: '#99aabb', letterSpacing: '0.1em', marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Auto-close status */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0 0' }}>
                      {hitTarget ? (
                        <div style={{ fontSize: 17, color: '#00ff88', background: '#00ff8811',
                          border: '1px solid #00ff8833', borderRadius: 5, padding: '6px 12px', flex: 1, textAlign: 'center' }}>
                          🎯 TARGET REACHED — Auto-closing next check
                        </div>
                      ) : hitStop ? (
                        <div style={{ fontSize: 17, color: '#ff4444', background: '#ff444411',
                          border: '1px solid #ff444433', borderRadius: 5, padding: '6px 12px', flex: 1, textAlign: 'center' }}>
                          ⚠ STOP HIT — Auto-closing next check
                        </div>
                      ) : (
                        <div style={{ fontSize: 16, color: '#99aabb', flex: 1 }}>
                          ⏱ Auto-closes when target or stop is hit · Checks every 60s
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Closed Positions ── */}
      {tab === 'closed' && (
        <div>
          {closedPositions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#b0c4dc', fontSize: 17 }}>
              No closed positions yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {closedPositions.map(pos => {
                const sym   = pos.market === 'INDIA' ? '₹' : '$';
                const isPos = (pos.realized_pnl || 0) >= 0;
                return (
                  <div key={pos.id} style={{
                    background: '#0f0f1a',
                    border: `1px solid ${isPos ? '#00ff8822' : '#ff444422'}`,
                    borderRadius: 8, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{ minWidth: 60 }}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#e8e8f0' }}>{pos.ticker}</div>
                      <div style={{ fontSize: 15, color: pos.direction === 'LONG' ? '#00ff8866' : '#ff444466' }}>{pos.direction}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontSize: 17, color: '#d0dff0' }}>
                        {sym}{pos.entry_price.toFixed(2)} → {sym}{pos.exit_price?.toFixed(2)} · {pos.quantity} shares
                      </div>
                      <div style={{ fontSize: 16, color: '#99aabb', marginTop: 2 }}>
                        {new Date(pos.opened_at).toLocaleDateString()} → {new Date(pos.closed_at).toLocaleDateString()}
                        {pos.exit_reason && pos.exit_reason !== 'MANUAL' && (
                          <span style={{ marginLeft: 6, color: pos.exit_reason === 'TARGET' ? '#00ff8866' : '#ff444466' }}>
                            ({pos.exit_reason})
                          </span>
                        )}
                      </div>
                    </div>
                    {pos.signal && (
                      <div style={{ fontSize: 16, color: '#b0c4dc' }}>
                        {pos.signal} {pos.confidence}%
                      </div>
                    )}
                    <PnlBadge value={pos.realized_pnl} pct={pos.realized_pct} currency={sym} isInr={pos.market === 'INDIA'} />
                  </div>
                );
              })}

              {/* Summary row */}
              <div style={{
                background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6,
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
              }}>
                <div style={{ fontSize: 17, color: '#b0c4dc' }}>
                  {closedPositions.length} trades · {wins} wins · {losses} losses
                  {avgWin  != null && ` · Avg win: +${avgWin.toFixed(1)}%`}
                  {avgLoss != null && ` · Avg loss: ${avgLoss.toFixed(1)}%`}
                </div>
                <PnlBadge value={totalRealizedPnl} size="lg" currency={currency} isInr={isInr} />
              </div>
            </div>
          )}
        </div>
      )}



      {/* Share Modal */}
      {showShare && (
        <ShareModal
          type="simulator"
          data={{
            market,
            totalReturn,
            totalReturnPct,
            winRate,
            wins,
            losses,
            totalTrades:     closedPositions.length,
            highConfRate,
            highConfCount:   highConfSignals.length,
            startingBalance: account?.starting_balance,
            currentEquity:   totalEquity,
            topTrades:       closedPositions
              .sort((a, b) => Math.abs(b.realized_pct) - Math.abs(a.realized_pct))
              .slice(0, 3),
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      <div style={{ fontSize: 16, color: '#667799', textAlign: 'center', marginTop: 8 }}>
        {`${startingLabel} starting balance · ${isInr ? 'NSE India' : 'US Market'} · No real money involved`}
        {openPositions.some(p => p.direction === 'SHORT') && (
          <span style={{ display: 'block', marginTop: 2 }}>
            SHORT positions don't tie up cash · P&L updates when prices load
          </span>
        )}
      </div>
    </div>
  );
}