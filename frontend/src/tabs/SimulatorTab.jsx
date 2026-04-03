import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';

const BASE = import.meta.env.VITE_API_BASE;

function fmtCurrency(n, sym = '$') {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const s   = abs >= 1000
    ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : abs.toFixed(2);
  return `${n < 0 ? '-' : ''}${sym}${s}`;
}

function PnlBadge({ value, pct, size = 'sm' }) {
  if (value == null) return <span style={{ color: '#445' }}>—</span>;
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
      {pos ? '▲' : '▼'} {fmtCurrency(Math.abs(value))}
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
      <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#7788aa', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function CloseModal({ position, currentPrice, onConfirm, onClose }) {
  const currency   = position.market === 'INDIA' ? '₹' : '$';
  const [exitPrice, setExitPrice] = useState(currentPrice?.toFixed(2) || position.entry_price.toFixed(2));
  const [loading, setLoading]     = useState(false);
  const exit   = parseFloat(exitPrice) || 0;
  const pnl    = position.direction === 'LONG'
    ? (exit - position.entry_price) * position.quantity
    : (position.entry_price - exit) * position.quantity;
  const pct    = position.direction === 'LONG'
    ? ((exit - position.entry_price) / position.entry_price * 100)
    : ((position.entry_price - exit) / position.entry_price * 100);
  const isPos  = pnl >= 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: '#0f0f1a', border: '1px solid #aa66ff44',
        borderRadius: 10, padding: 24, width: '100%', maxWidth: 340,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#aa66ff', marginBottom: 16 }}>
          CLOSE POSITION — {position.ticker}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#445', letterSpacing: '0.1em', marginBottom: 8 }}>EXIT PRICE</div>
          <input type="number" value={exitPrice} onChange={e => setExitPrice(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6,
              color: '#e8e8f0', fontSize: 18, fontWeight: 700, fontFamily: 'inherit',
              padding: '10px 14px', textAlign: 'right',
            }} />
        </div>
        <div style={{ background: '#0a0a14', borderRadius: 6, padding: '12px 14px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#556677' }}>Entry</span>
            <span style={{ fontSize: 13, color: '#e8e8f0' }}>{currency}{position.entry_price.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#556677' }}>Exit</span>
            <span style={{ fontSize: 13, color: '#e8e8f0' }}>{currency}{exit.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #1a1a2a' }}>
            <span style={{ fontSize: 11, color: '#556677' }}>P&L</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: isPos ? '#00ff88' : '#ff4444' }}>
              {isPos ? '+' : ''}{currency}{pnl.toFixed(2)} ({pct > 0 ? '+' : ''}{pct.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 6, cursor: 'pointer',
            background: 'none', border: '1px solid #2a2a3e', color: '#556677', fontFamily: 'inherit', fontSize: 13,
          }}>CANCEL</button>
          <button onClick={async () => { setLoading(true); await onConfirm(exit, 'MANUAL'); setLoading(false); }}
            disabled={loading} style={{
              flex: 2, padding: '12px', borderRadius: 6, cursor: 'pointer',
              background: isPos ? '#00ff8822' : '#ff444422',
              border: `1px solid ${isPos ? '#00ff88' : '#ff4444'}`,
              color: isPos ? '#00ff88' : '#ff4444',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              opacity: loading ? 0.6 : 1,
            }}>
            {loading ? 'CLOSING...' : 'CONFIRM CLOSE'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SimulatorTab({ market = 'US' }) {
  const { user, isLoaded } = useUser();
  const currency = market === 'INDIA' ? '₹' : '$';

  const [account,    setAccount]    = useState(null);
  const [positions,  setPositions]  = useState([]);
  const [prices,     setPrices]     = useState({});
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('open'); // open | closed | stats
  const [closing,    setClosing]    = useState(null);  // position being closed
  const [resetting,  setResetting]  = useState(false);
  const [error,      setError]      = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [simRes, priceRes] = await Promise.all([
        fetch(`${BASE}/sim/${user.id}?market=${market}`).then(r => r.json()),
        fetch(`${BASE}/sim/${user.id}/prices?market=${market}`).then(r => r.json()),
      ]);
      setAccount(simRes.account);
      setPositions(simRes.positions || []);
      setPrices(priceRes || {});
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!isLoaded || !user?.id) { setLoading(false); return; }
    load();
    // Refresh prices every 60s
    const interval = setInterval(() => {
      fetch(`${BASE}/sim/${user.id}/prices?market=${market}`).then(r => r.json()).then(setPrices).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [isLoaded, user?.id]);

  const handleClose = async (position, exitPrice, reason) => {
    try {
      await fetch(`${BASE}/sim/${user.id}/close/${position.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitPrice, exitReason: reason }),
      });
      setClosing(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset simulator? All positions will be deleted and balance reset to $10,000.')) return;
    setResetting(true);
    await fetch(`${BASE}/sim/${user.id}/reset?market=${market}`, { method: 'POST' });
    setResetting(false);
    load();
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
  const unrealizedPnl = openPositions.reduce((sum, p) => {
    const cur = prices[p.ticker];
    if (!cur) return sum;
    const pnl = p.direction === 'LONG'
      ? (cur - p.entry_price) * p.quantity
      : (p.entry_price - cur) * p.quantity;
    return sum + pnl;
  }, 0);

  const totalEquity = account
    ? account.balance + openPositions.reduce((s, p) => s + (p.direction === 'LONG' ? p.notional : 0), 0) + unrealizedPnl
    : 0;
  const totalReturn = account ? totalEquity - account.starting_balance : 0;
  const totalReturnPct = account ? (totalReturn / account.starting_balance * 100) : 0;

  // High-confidence signals accuracy
  const highConfSignals = closedPositions.filter(p => (p.confidence || 0) >= 75);
  const highConfWins    = highConfSignals.filter(p => (p.realized_pnl || 0) > 0).length;
  const highConfRate    = highConfSignals.length ? Math.round(highConfWins / highConfSignals.length * 100) : null;

  if (!isLoaded || loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#7788aa', fontSize: 13 }}>
      Loading simulator...
    </div>
  );

  if (!user) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#7788aa', fontSize: 13 }}>
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
          <div style={{ fontSize: 11, color: '#556677', marginTop: 2 }}>
            `${market === 'INDIA' ? 'NSE India' : 'US Market'} · Virtual paper trading · $10,000 starting balance`
          </div>
        </div>
        <button onClick={handleReset} disabled={resetting} style={{
          padding: '6px 14px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
          border: '1px solid #ff444433', background: '#ff444411', color: '#ff444488',
          fontFamily: 'inherit', letterSpacing: '0.08em',
          opacity: resetting ? 0.5 : 1,
        }}>
          {resetting ? 'RESETTING...' : '↺ RESET'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#ff4444', background: '#ff444411', border: '1px solid #ff444433', borderRadius: 4, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {/* ── Account summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        <StatCard
          label="VIRTUAL CASH"
          value={fmtCurrency(account?.balance)}
          border="#aa66ff33"
          color="#aa66ff"
        />
        <StatCard
          label="TOTAL EQUITY"
          value={fmtCurrency(totalEquity)}
          color="#e8e8f0"
          border="#2a2a40"
        />
        <StatCard
          label="TOTAL RETURN"
          value={`${totalReturn >= 0 ? '+' : ''}${fmtCurrency(totalReturn)}`}
          sub={`${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%`}
          color={totalReturn >= 0 ? '#00ff88' : '#ff4444'}
          border={totalReturn >= 0 ? '#00ff8833' : '#ff444433'}
        />
        <StatCard
          label="UNREALIZED P&L"
          value={`${unrealizedPnl >= 0 ? '+' : ''}${fmtCurrency(unrealizedPnl)}`}
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
            padding: '8px 14px', fontSize: 12, fontFamily: 'inherit', fontWeight: 700,
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
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#556677', fontSize: 13 }}>
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
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                            background: pos.direction === 'LONG' ? '#00ff8811' : '#ff444411',
                            border: `1px solid ${pos.direction === 'LONG' ? '#00ff8833' : '#ff444433'}`,
                            color: pos.direction === 'LONG' ? '#00ff88' : '#ff4444',
                          }}>{pos.direction}</span>
                          {pos.signal && (
                            <span style={{ fontSize: 10, color: '#7788aa' }}>
                              {pos.signal} · {pos.confidence}% conf
                            </span>
                          )}
                          {hitTarget && <span style={{ fontSize: 10, color: '#00ff88', fontWeight: 700 }}>🎯 TARGET HIT</span>}
                          {hitStop   && <span style={{ fontSize: 10, color: '#ff4444', fontWeight: 700 }}>⚠ STOP HIT</span>}
                        </div>
                        <div style={{ fontSize: 10, color: '#556677', marginTop: 2 }}>
                          {pos.quantity} shares · entered {sym}{pos.entry_price.toFixed(2)} · {new Date(pos.opened_at).toLocaleDateString()}
                        </div>
                      </div>
                      <PnlBadge value={pnl} pct={pct} size="lg" />
                    </div>

                    {/* Price bar */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      {[
                        { label: 'CURRENT', value: cur ? `${sym}${cur.toFixed(2)}` : '—', color: isPos ? '#00ff88' : '#ff4444' },
                        { label: 'ENTRY',   value: `${sym}${pos.entry_price.toFixed(2)}`, color: '#7788aa' },
                        { label: 'TARGET',  value: pos.price_target ? `${sym}${parseFloat(pos.price_target).toFixed(2)}` : '—', color: '#00ff8877' },
                        { label: 'STOP',    value: pos.stop_loss    ? `${sym}${parseFloat(pos.stop_loss).toFixed(2)}` : '—',    color: '#ff444477' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: '#0a0a14', borderRadius: 5, padding: '6px 10px', minWidth: 70 }}>
                          <div style={{ fontSize: 9, color: '#445', letterSpacing: '0.1em', marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {hitTarget && (
                        <button onClick={() => handleClose(pos, pos.price_target, 'TARGET')} style={{
                          flex: 1, padding: '8px', borderRadius: 5, cursor: 'pointer',
                          background: '#00ff8811', border: '1px solid #00ff88',
                          color: '#00ff88', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                        }}>✓ CLOSE AT TARGET</button>
                      )}
                      {hitStop && (
                        <button onClick={() => handleClose(pos, pos.stop_loss, 'STOP')} style={{
                          flex: 1, padding: '8px', borderRadius: 5, cursor: 'pointer',
                          background: '#ff444411', border: '1px solid #ff4444',
                          color: '#ff4444', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                        }}>✕ CLOSE AT STOP</button>
                      )}
                      <button onClick={() => setClosing(pos)} style={{
                        flex: 1, padding: '8px', borderRadius: 5, cursor: 'pointer',
                        background: '#0a0a14', border: '1px solid #2a2a3e',
                        color: '#7788aa', fontFamily: 'inherit', fontSize: 11,
                      }}>CLOSE POSITION</button>
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
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#556677', fontSize: 13 }}>
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
                      <div style={{ fontSize: 9, color: pos.direction === 'LONG' ? '#00ff8866' : '#ff444466' }}>{pos.direction}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontSize: 11, color: '#7788aa' }}>
                        {sym}{pos.entry_price.toFixed(2)} → {sym}{pos.exit_price?.toFixed(2)} · {pos.quantity} shares
                      </div>
                      <div style={{ fontSize: 10, color: '#445', marginTop: 2 }}>
                        {new Date(pos.opened_at).toLocaleDateString()} → {new Date(pos.closed_at).toLocaleDateString()}
                        {pos.exit_reason && pos.exit_reason !== 'MANUAL' && (
                          <span style={{ marginLeft: 6, color: pos.exit_reason === 'TARGET' ? '#00ff8866' : '#ff444466' }}>
                            ({pos.exit_reason})
                          </span>
                        )}
                      </div>
                    </div>
                    {pos.signal && (
                      <div style={{ fontSize: 10, color: '#556677' }}>
                        {pos.signal} {pos.confidence}%
                      </div>
                    )}
                    <PnlBadge value={pos.realized_pnl} pct={pos.realized_pct} />
                  </div>
                );
              })}

              {/* Summary row */}
              <div style={{
                background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 6,
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
              }}>
                <div style={{ fontSize: 11, color: '#556677' }}>
                  {closedPositions.length} trades · {wins} wins · {losses} losses
                  {avgWin  != null && ` · Avg win: +${avgWin.toFixed(1)}%`}
                  {avgLoss != null && ` · Avg loss: ${avgLoss.toFixed(1)}%`}
                </div>
                <PnlBadge value={totalRealizedPnl} size="lg" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Close Modal ── */}
      {closing && (
        <CloseModal
          position={closing}
          currentPrice={prices[closing.ticker] || null}
          onConfirm={(exitPrice, reason) => handleClose(closing, exitPrice, reason)}
          onClose={() => setClosing(null)}
        />
      )}

      <div style={{ fontSize: 10, color: '#2a2a3e', textAlign: 'center', marginTop: 8 }}>
        Virtual paper trading only · No real money involved · Prices from live market data
      </div>
    </div>
  );
}