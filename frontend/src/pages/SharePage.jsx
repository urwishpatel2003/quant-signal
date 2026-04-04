// SharePage.jsx  — public page at /share/:id, no auth required
import { useState, useEffect } from 'react';
import { SignalCard, SimulatorCard } from '../components/ShareCard';

const BASE = import.meta.env.VITE_API_BASE;

export default function SharePage({ id }) {
  const [card,    setCard]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch(`${BASE}/share/${id}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setCard(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#07070e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7788aa', fontSize: 14 }}>
      Loading...
    </div>
  );

  if (error || !card) return (
    <div style={{ minHeight: '100vh', background: '#07070e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ color: '#ff444488', fontSize: 14 }}>Card not found or expired</div>
      <a href="/" style={{ color: '#ff9a00', fontSize: 13, textDecoration: 'none' }}>→ Try QuAInt Signal</a>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh', background: '#07070e',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 20, gap: 24,
    }}>
      {/* Render the card */}
      {card.type === 'signal'
        ? <SignalCard data={card.data} />
        : <SimulatorCard data={card.data} />
      }

      {/* CTA */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#7788aa', marginBottom: 12 }}>
          AI-powered stock analysis & paper trading
        </div>
        <a href="/" style={{
          display: 'inline-block', padding: '12px 28px',
          background: '#ff9a0022', border: '1px solid #ff9a00',
          color: '#ff9a00', borderRadius: 6, textDecoration: 'none',
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: '0.1em',
        }}>
          TRY QUAINT SIGNAL FREE →
        </a>
      </div>

      <div style={{ fontSize: 10, color: '#2a2a3e' }}>
        quaint-signal.tech · AI-powered market signals
      </div>
    </div>
  );
}