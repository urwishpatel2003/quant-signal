// src/components/MarketSelector.jsx
import { useMarket } from '../context/MarketContext';

export default function MarketSelector() {
  const { market, setMarket } = useMarket();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: '#0f0f1a', border: '1px solid #2a2a40',
      borderRadius: 4, padding: '3px 4px', flexShrink: 0,
    }}>
      {[
        { id: 'US',    flag: '🇺🇸', label: 'US'  },
        { id: 'INDIA', flag: '🇮🇳', label: 'IN'  },
      ].map(m => (
        <button
          key={m.id}
          onClick={() => setMarket(m.id)}
          style={{
            background:  market === m.id ? '#ffaa0022' : 'transparent',
            border:      market === m.id ? '1px solid #ffaa0066' : '1px solid transparent',
            color:       market === m.id ? '#ffaa00' : '#7788aa',
            borderRadius: 3, padding: '3px 8px',
            fontSize: 10, fontFamily: 'inherit',
            cursor: 'pointer', letterSpacing: '0.05em',
            fontWeight: market === m.id ? 700 : 400,
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <span>{m.flag}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}