import { useState } from 'react';
import { TABS } from './utils/constants';
import { useMacroData } from './hooks/useMacroData';
import MacroBar     from './components/MacroBar';
import ScannerTab   from './tabs/ScannerTab';
import OptionsTab   from './tabs/OptionsTab';
import MarketsTab   from './tabs/MarketsTab';
import WatchlistTab from './tabs/WatchlistTab';
import PortfolioTab from './tabs/PortfolioTab';
import JournalTab   from './tabs/JournalTab';

export default function App() {
  const [activeTab, setActiveTab]         = useState('scanner');
  const [optionsTicker, setOptionsTicker] = useState('');
  const macro = useMacroData();

  const openOptions = ticker => { setOptionsTicker(ticker); setActiveTab('options'); };
  const addToWatchlist = (ticker, analysis, price) => {
    const key = 'qs_watchlist';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    if (!existing.find(w => w.ticker === ticker)) {
      localStorage.setItem(key, JSON.stringify([...existing, { ticker, analysis, price, added: Date.now() }]));
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#07070e', color: '#c8c8d0', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1a1a2e', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#ffaa00', letterSpacing: '0.05em' }}>QUANT SIGNAL</div>
          <div style={{ fontSize: 10, color: '#333', letterSpacing: '0.2em' }}>AI-POWERED MARKET INTELLIGENCE</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <MacroBar bonds={macro.bonds} intlMarkets={macro.intlMarkets} macroNews={macro.macroNews} loading={macro.loading} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #1a1a2e', padding: '0 24px', display: 'flex', gap: 0 }}>
        {TABS.map(tab => {
          const id    = typeof tab === 'string' ? tab.toLowerCase() : tab.id;
          const label = typeof tab === 'string' ? tab : tab.label;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{
                background: 'none', border: 'none',
                borderBottom: activeTab === id ? '2px solid #ffaa00' : '2px solid transparent',
                color: activeTab === id ? '#ffaa00' : '#445', padding: '12px 16px',
                fontSize: 11, letterSpacing: '0.15em', cursor: 'pointer', transition: 'all 0.2s'
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding: 24 }}>
        {activeTab === 'scanner'   && <ScannerTab   macro={macro} onOpenOptions={openOptions} onAddToWatchlist={addToWatchlist} />}
        {activeTab === 'options'   && <OptionsTab   macro={macro} initialTicker={optionsTicker} />}
        {activeTab === 'markets'   && <MarketsTab   intlMarkets={macro.intlMarkets} bonds={macro.bonds} macroNews={macro.macroNews} calendar={macro.calendar} />}
        {activeTab === 'watchlist' && <WatchlistTab macro={macro} onOpenOptions={openOptions} />}
        {activeTab === 'portfolio' && <PortfolioTab />}
        {activeTab === 'journal'   && <JournalTab />}
      </div>
    </div>
  );
}