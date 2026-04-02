// src/tabs/WatchlistTab.jsx
import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useUsage } from '../hooks/useUsage';
import UpgradeModal from '../components/UpgradeModal';

const BASE = import.meta.env.VITE_API_BASE;
const FREE_LIMIT = 5;

function fmtPrice(p) {
  if (!p) return '—';
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

export default function WatchlistTab({ onOpenScanner, onOpenOptions }) {
  const { user } = useUser();
  const userId   = user?.id;
  const { plan, refreshUsage } = useUsage();

  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [inputVal,    setInputVal]    = useState('');
  const [adding,      setAdding]      = useState(false);
  const [error,       setError]       = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [removing,    setRemoving]    = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);

  const fetchWatchlist = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res  = await fetch(`${BASE}/watchlist/${userId}`);
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  // Auto-refresh prices every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchWatchlist(true), 60000);
    return () => clearInterval(interval);
  }, [fetchWatchlist]);

  const handleAdd = async () => {
    const ticker = inputVal.trim().toUpperCase();
    if (!ticker || !userId) return;
    if (plan !== 'pro' && items.length >= FREE_LIMIT) {
      setShowUpgrade(true);
      return;
    }
    setAdding(true); setError('');
    try {
      const res  = await fetch(`${BASE}/watchlist/${userId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('limit')) setShowUpgrade(true);
        else setError(data.error);
      } else {
        setInputVal('');
        fetchWatchlist(true);
      }
    } catch (e) { setError(e.message); }
    setAdding(false);
  };

  const handleRemove = async (ticker) => {
    if (!userId) return;
    setRemoving(ticker);
    try {
      await fetch(`${BASE}/watchlist/${userId}/${ticker}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.ticker !== ticker));
    } catch {}
    setRemoving(null);
  };

  const isPro      = plan === 'pro';
  const isFull     = !isPro && items.length >= FREE_LIMIT;

  return (
    <div>
      {showUpgrade && <UpgradeModal type="watchlist" onClose={() => setShowUpgrade(false)} />}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#ffaa00', lineHeight: 1 }}>
            WATCHLIST
          </div>
          <div style={{ fontSize: 10, color: '#7788aa', marginTop: 2 }}>
            {isPro ? `${items.length} tickers · unlimited` : `${items.length} / ${FREE_LIMIT} tickers · free tier`}
          </div>
        </div>
        <button
          onClick={() => fetchWatchlist(true)}
          disabled={refreshing}
          style={{
            background: 'none', border: '1px solid #2a2a40',
            color: refreshing ? '#7788aa' : '#b0c0dd',
            cursor: refreshing ? 'default' : 'pointer',
            borderRadius: 4, padding: '6px 12px',
            fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.1em',
          }}
        >
          {refreshing ? 'REFRESHING...' : '↻ REFRESH'}
        </button>
      </div>

      {/* ── Add ticker ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', color: '#ffaa00', fontSize: 12,
          }}>$</span>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !adding && handleAdd()}
            placeholder={isFull ? 'UPGRADE TO ADD MORE' : 'ADD TICKER...'}
            disabled={isFull && !isPro}
            className="input"
            style={{ padding: '10px 12px 10px 26px', fontSize: 13, fontWeight: 600, opacity: isFull ? 0.5 : 1 }}
            autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
          />
        </div>
        <button
          className="btn"
          onClick={handleAdd}
          disabled={adding || !inputVal.trim() || (isFull && !isPro)}
          style={{ whiteSpace: 'nowrap', opacity: isFull && !isPro ? 0.4 : 1 }}
        >
          {adding ? 'ADDING...' : '+ ADD'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#ff4444', marginBottom: 12 }}>{error}</div>
      )}

      {/* ── Free tier limit bar ── */}
      {!isPro && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#7788aa', letterSpacing: '0.1em' }}>WATCHLIST CAPACITY</span>
            <span style={{ fontSize: 10, color: isFull ? '#ff4444' : '#b0c0dd' }}>{items.length}/{FREE_LIMIT}</span>
          </div>
          <div style={{ background: '#1a1a2e', borderRadius: 2, height: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min((items.length / FREE_LIMIT) * 100, 100)}%`,
              background: isFull ? '#ff4444' : '#ffaa00',
              borderRadius: 2, transition: 'width 0.3s',
            }} />
          </div>
          {isFull && (
            <div style={{ fontSize: 11, color: '#ff4444', marginTop: 6 }}>
              Limit reached —{' '}
              <button onClick={() => setShowUpgrade(true)}
                style={{ background: 'none', border: 'none', color: '#ffaa00', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>
                upgrade to Pro
              </button>{' '}
              for unlimited
            </div>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 12, color: '#7788aa' }}>
          LOADING WATCHLIST...
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👁</div>
          <div style={{ fontSize: 14, color: '#99aacc', marginBottom: 8 }}>
            Your watchlist is empty
          </div>
          <div style={{ fontSize: 11, color: '#7788aa', lineHeight: 1.8 }}>
            Add tickers above to track them here<br />
            Prices refresh automatically every minute
          </div>
        </div>
      )}

      {/* ── Watchlist items ── */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => {
            const isUp   = item.changePct > 0;
            const isDown = item.changePct < 0;
            const pctColor = isUp ? '#00ff88' : isDown ? '#ff4444' : '#7788aa';

            return (
              <div
                key={item.ticker}
                className="card"
                style={{ padding: '14px 16px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

                  {/* Ticker */}
                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 22, color: '#ffaa00', lineHeight: 1,
                    minWidth: 70, flexShrink: 0,
                  }}>
                    {item.ticker}
                  </div>

                  {/* Price + change */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                      {fmtPrice(item.price)}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: pctColor, marginTop: 2 }}>
                      {item.changePct != null
                        ? `${isUp ? '▲' : isDown ? '▼' : '—'} ${Math.abs(item.changePct).toFixed(2)}%`
                        : '—'}
                      {item.change != null && (
                        <span style={{ color: pctColor + '77', marginLeft: 6 }}>
                          ({isUp ? '+' : ''}{item.change?.toFixed(2)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => onOpenScanner(item.ticker)}
                      style={{
                        background: '#ffaa0011', border: '1px solid #ffaa0033',
                        color: '#ffaa00', cursor: 'pointer', borderRadius: 4,
                        padding: '6px 10px', fontSize: 10, fontFamily: 'inherit',
                        letterSpacing: '0.05em', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#ffaa0022'; e.currentTarget.style.borderColor = '#ffaa0066'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#ffaa0011'; e.currentTarget.style.borderColor = '#ffaa0033'; }}
                    >
                      SCAN
                    </button>
                    <button
                      onClick={() => onOpenOptions(item.ticker)}
                      style={{
                        background: '#4488ff11', border: '1px solid #4488ff33',
                        color: '#4488ff', cursor: 'pointer', borderRadius: 4,
                        padding: '6px 10px', fontSize: 10, fontFamily: 'inherit',
                        letterSpacing: '0.05em', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#4488ff22'; e.currentTarget.style.borderColor = '#4488ff66'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#4488ff11'; e.currentTarget.style.borderColor = '#4488ff33'; }}
                    >
                      ⚡
                    </button>
                    <button
                      onClick={() => handleRemove(item.ticker)}
                      disabled={removing === item.ticker}
                      style={{
                        background: 'none', border: '1px solid #ff444422',
                        color: '#ff444466', cursor: 'pointer', borderRadius: 4,
                        padding: '6px 10px', fontSize: 10, fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ff4444'; e.currentTarget.style.borderColor = '#ff4444'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#ff444466'; e.currentTarget.style.borderColor = '#ff444422'; }}
                    >
                      {removing === item.ticker ? '...' : '✕'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pro upsell if not pro ── */}
      {!isPro && items.length > 0 && (
        <div style={{
          marginTop: 20, padding: '14px 16px',
          background: '#ffaa0008', border: '1px solid #ffaa0022',
          borderRadius: 6, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.1em' }}>
              UPGRADE TO PRO
            </div>
            <div style={{ fontSize: 11, color: '#7788aa', marginTop: 2 }}>
              Unlimited watchlist + unlimited scans & options
            </div>
          </div>
          <button className="btn" onClick={() => setShowUpgrade(true)}
            style={{ fontSize: 11, padding: '8px 20px' }}>
            $5/MO →
          </button>
        </div>
      )}
    </div>
  );
}