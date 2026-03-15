import { useState, useEffect } from 'react';

const STORAGE_KEY = 'quant_signal_journal';
const empty = { ticker: '', type: 'CALL', strike: '', expiry: '', entry: '', exit: '', contracts: '1', notes: '', date: '' };

export default function JournalTab() {
  const [trades, setTrades] = useState([]);
  const [form,   setForm]   = useState(empty);
  const [adding, setAdding] = useState(false);

  useEffect(() => { try { const s = localStorage.getItem(STORAGE_KEY); if (s) setTrades(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); }, [trades]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTrade = () => {
    if (!form.ticker || !form.entry) return;
    const entry     = parseFloat(form.entry);
    const exit      = parseFloat(form.exit) || 0;
    const contracts = parseInt(form.contracts) || 1;
    const pl        = exit ? (exit - entry) * 100 * contracts : null;
    const plPct     = exit ? (((exit - entry) / entry) * 100) : null;
    setTrades(prev => [{ id: Date.now(), date: form.date || new Date().toLocaleDateString(), ticker: form.ticker.toUpperCase(), type: form.type, strike: form.strike, expiry: form.expiry, entry, exit: exit || null, contracts, pl, plPct, win: pl !== null ? pl > 0 : null, notes: form.notes }, ...prev]);
    setForm(empty); setAdding(false);
  };

  const deleteTrade = id => setTrades(prev => prev.filter(t => t.id !== id));

  const updateExit = (id, exitVal) => {
    setTrades(prev => prev.map(t => {
      if (t.id !== id) return t;
      const exit  = parseFloat(exitVal);
      const pl    = (exit - t.entry) * 100 * t.contracts;
      const plPct = ((exit - t.entry) / t.entry) * 100;
      return { ...t, exit, pl, plPct, win: pl > 0 };
    }));
  };

  const closed  = trades.filter(t => t.pl !== null);
  const wins    = closed.filter(t => t.win);
  const losses  = closed.filter(t => !t.win);
  const totalPL = closed.reduce((s, t) => s + t.pl, 0);
  const winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;
  const avgWin  = wins.length   ? wins.reduce((s, t) => s + t.pl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pl, 0) / losses.length : 0;
  const plColor = totalPL >= 0 ? '#00ff88' : '#ff4444';
  const wrColor = winRate >= 60 ? '#00ff88' : winRate >= 40 ? '#ffaa00' : '#ff4444';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28 }}>TRADE JOURNAL</div>
        <button className="btn" onClick={() => setAdding(a => !a)}>{adding ? 'CANCEL' : '+ LOG TRADE'}</button>
      </div>

      {/* Stats */}
      {trades.length > 0 && (
        <div className="journal-stats">
          {[
            ['TOTAL',    trades.length,                                          '#c8c8d0'],
            ['CLOSED',   closed.length,                                          '#c8c8d0'],
            ['WIN RATE', `${winRate}%`,                                          wrColor],
            ['P&L',      `${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(0)}`,    plColor],
            ['AVG WIN',  avgWin  ? `+$${avgWin.toFixed(0)}`  : '—',             '#00ff88'],
            ['AVG LOSS', avgLoss ? `$${avgLoss.toFixed(0)}`  : '—',             '#ff4444'],
          ].map(([l, v, c]) => (
            <div key={l} className="card" style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 9, color: '#445', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="card" style={{ marginBottom: 16, borderColor: '#ffaa0044' }}>
          <div style={{ fontSize: 10, color: '#ffaa0066', letterSpacing: '0.15em', marginBottom: 14 }}>📝 LOG NEW TRADE</div>
          <div className="journal-form-grid" style={{ marginBottom: 10 }}>
            {[
              ['Ticker',    'ticker',    'text',   'AAPL'],
              ['Strike',    'strike',    'number', '150'],
              ['Expiry',    'expiry',    'text',   '2026-03-21'],
              ['Date',      'date',      'text',   'Today'],
              ['Entry $',   'entry',     'number', '1.50'],
              ['Exit $',    'exit',      'number', '3.00'],
              ['Contracts', 'contracts', 'number', '1'],
            ].map(([label, key, type, placeholder]) => (
              <div key={key}>
                <div style={{ fontSize: 9, color: '#445', marginBottom: 4 }}>{label}</div>
                <input type={type} value={form[key]} placeholder={placeholder}
                  onChange={e => set(key, e.target.value)} className="input"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12 }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 9, color: '#445', marginBottom: 4 }}>Type</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['CALL', 'PUT'].map(t => (
                  <button key={t} className="btn-sm" style={{ flex: 1,
                    color: form.type === t ? (t === 'CALL' ? '#00ff88' : '#ff4444') : '#556',
                    borderColor: form.type === t ? (t === 'CALL' ? '#00ff88' : '#ff4444') : '#2a2a3e',
                    background: form.type === t ? (t === 'CALL' ? '#00ff8811' : '#ff444411') : '#1a1a2e' }}
                    onClick={() => set('type', t)}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: '#445', marginBottom: 4 }}>NOTES</div>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Why did you take this trade?" className="input"
              style={{ width: '100%', padding: '8px 10px', fontSize: 12, minHeight: 60, resize: 'vertical' }} />
          </div>
          <button className="btn" onClick={addTrade} style={{ width: '100%' }}>SAVE TRADE</button>
        </div>
      )}

      {trades.length === 0 && !adding && (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: '#333' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>No trades logged yet</div>
          <div style={{ fontSize: 11, marginBottom: 16 }}>Click "+ LOG TRADE" to start tracking</div>
          <button className="btn" onClick={() => setAdding(true)}>+ LOG YOUR FIRST TRADE</button>
        </div>
      )}

      {trades.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', marginBottom: 4 }}>TRADE HISTORY</div>
          {trades.map(t => {
            const typeColor = t.type === 'CALL' ? '#00ff88' : '#ff4444';
            const plColor   = t.pl === null ? '#556' : t.pl >= 0 ? '#00ff88' : '#ff4444';
            return (
              <div key={t.id} className="card" style={{ borderColor: t.pl === null ? '#1e1e2e' : (t.pl >= 0 ? '#00ff8822' : '#ff444422') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 80 }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20 }}>{t.ticker}</div>
                    <div style={{ fontSize: 11, color: typeColor, fontWeight: 600 }}>${t.strike} {t.type}</div>
                  </div>
                  <div style={{ minWidth: 80 }}>
                    <div style={{ fontSize: 9, color: '#445' }}>EXPIRY</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{t.expiry || '—'}</div>
                    <div style={{ fontSize: 9, color: '#334' }}>{t.date}</div>
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <div style={{ fontSize: 9, color: '#445', marginBottom: 2 }}>ENTRY → EXIT</div>
                    <div style={{ fontSize: 12, color: '#c8c8d0' }}>
                      ${t.entry?.toFixed(2)} →{' '}
                      {t.exit
                        ? <span style={{ color: plColor }}>${t.exit?.toFixed(2)}</span>
                        : <input type="number" placeholder="exit $" step="0.01"
                            onBlur={e => e.target.value && updateExit(t.id, e.target.value)}
                            className="input" style={{ width: 70, padding: '2px 6px', fontSize: 11, display: 'inline-block' }} />
                      }
                    </div>
                    <div style={{ fontSize: 9, color: '#445' }}>{t.contracts} contract{t.contracts > 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ minWidth: 90, textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#445', marginBottom: 2 }}>P&L</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: plColor }}>
                      {t.pl !== null ? `${t.pl >= 0 ? '+' : ''}$${t.pl.toFixed(0)}` : 'OPEN'}
                    </div>
                    {t.plPct !== null && <div style={{ fontSize: 10, color: plColor, opacity: 0.7 }}>{t.plPct >= 0 ? '+' : ''}{t.plPct.toFixed(1)}%</div>}
                  </div>
                  {t.win !== null && (
                    <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700,
                      color: t.win ? '#00ff88' : '#ff4444',
                      background: t.win ? '#00ff8811' : '#ff444411',
                      border: `1px solid ${t.win ? '#00ff8844' : '#ff444444'}`, borderRadius: 2 }}>
                      {t.win ? '✓ WIN' : '✗ LOSS'}
                    </div>
                  )}
                  {t.notes && <div style={{ flex: 1, fontSize: 11, color: '#667', fontStyle: 'italic', minWidth: 120 }}>"{t.notes}"</div>}
                  <button onClick={() => deleteTrade(t.id)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}