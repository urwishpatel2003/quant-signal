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
import HelpTab      from './tabs/HelpTab';
import WelcomePage  from './components/WelcomePage';

export default function App() {
  const [showWelcome, setShowWelcome] = useState(true);
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

  const handleNavigate = (tab) => setActiveTab(tab);

  if (showWelcome) {
    return (
      <WelcomePage
        onEnter={() => setShowWelcome(false)}
        onNavigate={handleNavigate}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#07070e', color: '#c8c8d0', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Header ── */}
      <div className="app-header">
        <div className="app-header-logo">
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: '0.05em' }}>
            <span style={{ color: '#ffaa00' }}>Qu</span>
            <span style={{ color: '#00ff88' }}>AI</span>
            <span style={{ color: '#ffaa00' }}>nt Signal</span>
          </div>
          <div className="app-header-subtitle" style={{ fontSize: 10, color: '#333', letterSpacing: '0.2em' }}>
            AI-POWERED MARKET INTELLIGENCE
          </div>
        </div>
        <MacroBar
          bonds={macro.bonds}
          intlMarkets={macro.intlMarkets}
          macroNews={macro.macroNews}
          loading={macro.loading}
        />
      </div>

      {/* ── Tabs ── */}
      <div className="app-tabs">
        {TABS.map(tab => {
          const id    = typeof tab === 'string' ? tab.toLowerCase() : tab.id;
          const label = typeof tab === 'string' ? tab : tab.label;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="tab-btn"
              style={{
                borderBottom: activeTab === id ? '2px solid #ffaa00' : '2px solid transparent',
                color: activeTab === id ? '#ffaa00' : '#445',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div className="app-content">
        {activeTab === 'scanner'   && <ScannerTab   macro={macro} onOpenOptions={openOptions} onAddToWatchlist={addToWatchlist} />}
        {activeTab === 'options'   && <OptionsTab   macro={macro} initialTicker={optionsTicker} />}
        {activeTab === 'markets'   && <MarketsTab   intlMarkets={macro.intlMarkets} bonds={macro.bonds} macroNews={macro.macroNews} calendar={macro.calendar} />}
        {activeTab === 'watchlist' && <WatchlistTab macro={macro} onOpenOptions={openOptions} />}
        {activeTab === 'portfolio' && <PortfolioTab />}
        {activeTab === 'journal'   && <JournalTab />}
        {activeTab === 'help'      && <HelpTab />}
      </div>
    </div>
  );
}