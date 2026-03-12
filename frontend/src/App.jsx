import { useState } from 'react';
import './styles/globals.css';
import { TABS } from './utils/constants';
import { useMacroData } from './hooks/useMacroData';
import MacroBar    from './components/MacroBar';
import ScannerTab  from './tabs/ScannerTab';
import OptionsTab  from './tabs/OptionsTab';
import MarketsTab  from './tabs/MarketsTab';
import WatchlistTab from './tabs/WatchlistTab';
import PortfolioTab from './tabs/PortfolioTab';

export default function App() {
  const [activeTab,      setActiveTab]      = useState('SCANNER');
  const [optionsTicker,  setOptionsTicker]  = useState('');
  const [scannerTicker,  setScannerTicker]  = useState('');
  const [watchlistAdd,   setWatchlistAdd]   = useState(null);
  const macro = useMacroData();

  const openOptions = ticker => { setOptionsTicker(ticker); setActiveTab('OPTIONS'); };
  const openScanner = ticker => { setScannerTicker(ticker); setActiveTab('SCANNER'); };
  const addToWatchlist = (ticker, analysis, price) => { setWatchlistAdd({ ticker, analysis, price, ts: Date.now() }); };

  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', fontFamily: "'IBM Plex Mono','Courier New',monospace", color: '#c8c8d0', padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#ffaa00', letterSpacing: '0.1em' }}>QUANT SIGNAL</div>
        <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em' }}>AI-POWERED MARKET INTELLIGENCE</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {macro.loading && <div className="pulse" style={{ fontSize: 9, color: '#ffaa0066' }}>LOADING MACRO...</div>}
          {!macro.loading && macro.bonds && (
            <div style={{ fontSize: 9, color: macro.bonds.inverted ? '#ff444466' : '#00ff8844' }}>
              {macro.bonds.inverted ? '⚠ INVERTED CURVE' : '📊 MACRO LIVE'}
            </div>
          )}
          <button className="btn-sm" onClick={macro.refresh} style={{ fontSize: 9 }}>↻ REFRESH MACRO</button>
          <div style={{ fontSize: 9, color: '#00ff8844' }}>⚡ TRADIER · YAHOO · CLAUDE</div>
        </div>
      </div>

      {/* Macro bar */}
      <MacroBar bonds={macro.bonds} intlMarkets={macro.intlMarkets} macroNews={macro.macroNews} loading={macro.loading} />

      {/* Tab nav */}
      <div style={{ borderBottom: '1px solid #1e1e2e', marginBottom: 24, display: 'flex' }}>
        {TABS.map(t => (
          <button key={t} className={`tab-btn${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'SCANNER' && (
        <ScannerTab
          macro={macro}
          onOpenOptions={openOptions}
          onAddToWatchlist={addToWatchlist}
          key={scannerTicker}
          initialTicker={scannerTicker}
        />
      )}
      {activeTab === 'OPTIONS' && (
        <OptionsTab
          macro={macro}
          initialTicker={optionsTicker}
          key={optionsTicker}
        />
      )}
      {activeTab === 'MARKETS' && (
        <MarketsTab
          intlMarkets={macro.intlMarkets}
          bonds={macro.bonds}
          macroNews={macro.macroNews}
          calendar={macro.calendar}
        />
      )}
      {activeTab === 'WATCHLIST' && (
        <WatchlistTab
          macro={macro}
          onOpenScanner={openScanner}
          onOpenOptions={openOptions}
          externalAdd={watchlistAdd}
        />
      )}
      {activeTab === 'PORTFOLIO' && (
        <PortfolioTab
          macro={macro}
          onOpenScanner={openScanner}
          onOpenOptions={openOptions}
        />
      )}
    </div>
  );
}
