import { useState, useEffect } from 'react';
import {
  SignedIn, SignedOut, SignInButton,
  UserButton, useUser, useAuth,
} from '@clerk/clerk-react';
import { TABS } from './utils/constants';
import { useMacroData } from './hooks/useMacroData';
import { useScan } from './hooks/useScan';
import { useWatchlistScans } from './hooks/useWatchlistScans';
import { useMarket } from './context/MarketContext';
import MacroBar       from './components/MacroBar';
import MarketSelector from './components/MarketSelector';
import ScannerTab     from './tabs/ScannerTab';
import OptionsTab     from './tabs/OptionsTab';
import MarketsTab     from './tabs/MarketsTab';
import WatchlistTab   from './tabs/WatchlistTab';
import HelpTab        from './tabs/HelpTab';
import WelcomePage    from './components/WelcomePage';
import { TermsModal, PrivacyModal, AboutModal, ContactModal } from './components/FooterModals';
import ErrorBoundary  from './components/ErrorBoundary';
import BlogTab        from './tabs/BlogTab';
import BlogAdmin      from './tabs/BlogAdmin';

export default function App() {
  const [enteredApp,    setEnteredApp]    = useState(false);
  const [activeTab,     setActiveTab]     = useState('scanner');
  const [optionsTicker, setOptionsTicker] = useState('');
  const [modal,         setModal]         = useState(null);
  const [logoClicks,    setLogoClicks]    = useState(0);

  const macro                    = useMacroData();
  const scan                     = useScan(macro);
  const { market }               = useMarket();
  const { user }                 = useUser();
  const { isLoaded, isSignedIn } = useAuth();

  // Fetch watchlist tickers for background scanning
  const [watchlistTickers, setWatchlistTickers] = useState([]);
  useEffect(() => {
    if (!user?.id) return;
    // Reset tickers immediately on market change to avoid stale data
    setWatchlistTickers([]);
    fetch(`${import.meta.env.VITE_API_BASE}/watchlist/${user.id}?market=${market}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setWatchlistTickers(data.map(d => d.ticker));
      })
      .catch(() => {});
  }, [user?.id, market]);

  const { scans: watchlistScans } = useWatchlistScans(watchlistTickers, market);

  const openOptions    = ticker => { setOptionsTicker(ticker); setActiveTab('options'); };
  const handleNavigate = tab    => setActiveTab(tab);

  const handleLogoClick = () => {
    const clicks = logoClicks + 1;
    setLogoClicks(clicks);
    if (clicks >= 5) {
      setActiveTab('admin');
      setLogoClicks(0);
    } else {
      setModal('about');
    }
  };

  // Hide Options tab for India market
  const visibleTabs = market === 'INDIA'
    ? TABS.filter(t => (typeof t === 'string' ? t : t.id) !== 'options')
    : TABS;

  if (!isLoaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#07070e',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%',
          border: '3px solid #ffaa0022', borderTop: '3px solid #ffaa00',
          animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isSignedIn && !enteredApp) {
    return (
      <WelcomePage
        onEnter={() => setEnteredApp(true)}
        onNavigate={tab => { handleNavigate(tab); setEnteredApp(true); }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#07070e', color: '#e8e8f0',
      fontFamily: "'IBM Plex Mono', monospace", display: 'flex', flexDirection: 'column' }}>

      {modal === 'terms'   && <TermsModal   onClose={() => setModal(null)} />}
      {modal === 'privacy' && <PrivacyModal onClose={() => setModal(null)} />}
      {modal === 'about'   && <AboutModal   onClose={() => setModal(null)} />}
      {modal === 'contact' && <ContactModal onClose={() => setModal(null)} />}

      {/* ── Header ── */}
      <div style={{
        borderBottom: '1px solid #1e1e30',
        background: '#07070e',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* ── Row 1: Logo + MarketSelector + User ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', gap: 12,
        }}>
          {/* Logo */}
          <div style={{ flexShrink: 0 }}>
            <div
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26,
                letterSpacing: '0.05em', lineHeight: 1, cursor: 'pointer' }}
              onClick={handleLogoClick}>
              <span style={{ color: '#ffaa00' }}>Qu</span>
              <span style={{ color: '#00ff88' }}>AI</span>
              <span style={{ color: '#ffaa00' }}>nt Signal</span>
            </div>
            <div style={{ fontSize: 10, color: '#6677aa', letterSpacing: '0.2em', fontWeight: 600 }}>
              AI-POWERED · MARKET INTELLIGENCE
            </div>
          </div>

          {/* Right: MarketSelector + User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <MarketSelector />
            <SignedOut>
              <SignInButton mode="modal">
                <button className="btn-sm"
                  style={{ color: '#ffaa00', borderColor: '#ffaa0044', whiteSpace: 'nowrap' }}>
                  SIGN IN
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {user?.firstName && (
                  <span style={{
                    fontSize: 11, color: '#b0c0dd', fontWeight: 600, letterSpacing: '0.05em',
                    // Hide on small screens
                    maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {user.firstName.toUpperCase()}
                  </span>
                )}
                <UserButton appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} />
              </div>
            </SignedIn>
          </div>
        </div>

        {/* ── Row 2: MacroBar full width ── */}
        <div style={{ borderTop: '1px solid #1a1a2e', overflow: 'hidden' }}>
          <MacroBar
            bonds={macro.bonds}
            intlMarkets={macro.intlMarkets}
            macroNews={macro.macroNews}
            loading={macro.loading}
            market={market}
          />
        </div>
      </div>

      {/* ── Nav Tabs ── */}
      <div className="app-tabs">
        {visibleTabs.map(tab => {
          const id       = typeof tab === 'string' ? tab.toLowerCase() : tab.id;
          const label    = typeof tab === 'string' ? tab : tab.label;
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="tab-btn"
              style={{
                borderBottom: isActive ? '2px solid #ffaa00' : '2px solid transparent',
                color:        isActive ? '#ffaa00' : '#b0c0dd',
                fontWeight:   isActive ? 700 : 600,
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <ErrorBoundary>
        <div className="app-content" style={{ flex: 1 }}>

          {activeTab === 'help'  && <HelpTab />}
          {activeTab === 'blog'  && <BlogTab />}
          {activeTab === 'admin' && <BlogAdmin />}

          <SignedIn>
            <div style={{ display: activeTab === 'scanner' ? 'block' : 'none' }}>
              <ScannerTab
                scan={scan} macro={macro}
                onOpenOptions={openOptions}
                onAddToWatchlist={() => {}}
                market={market}
              />
            </div>

            {/* Options tab — US only */}
            {market === 'US' && (
              <div style={{ display: activeTab === 'options' ? 'block' : 'none' }}>
                <OptionsTab macro={macro} initialTicker={optionsTicker} />
              </div>
            )}

            <div style={{ display: activeTab === 'markets' ? 'block' : 'none' }}>
              <MarketsTab
                intlMarkets={macro.intlMarkets}
                bonds={macro.bonds}
                macroNews={macro.macroNews}
                calendar={macro.calendar}
              />
            </div>

            <div style={{ display: activeTab === 'watchlist' ? 'block' : 'none' }}>
              <WatchlistTab
                onOpenScanner={ticker => { setActiveTab('scanner'); scan.runScan(ticker); }}
                onOpenOptions={ticker => { setOptionsTicker(ticker); setActiveTab('options'); }}
                watchlistScans={watchlistScans}
                onTickerAdded={ticker  => setWatchlistTickers(prev => [...new Set([...prev, ticker])])}
                onTickerRemoved={ticker => setWatchlistTickers(prev => prev.filter(t => t !== ticker))}
                market={market}
              />
            </div>
          </SignedIn>

          {activeTab !== 'help' && activeTab !== 'blog' && activeTab !== 'admin' && (
            <SignedOut>
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                minHeight: '60vh', gap: 20,
              }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#ffaa00' }}>
                  SIGN IN TO ACCESS
                </div>
                <div style={{ fontSize: 14, color: '#b0c0dd', marginBottom: 8 }}>
                  Create a free account to use QuAInt Signal
                </div>
                <SignInButton mode="modal">
                  <button className="btn" style={{ fontSize: 14, padding: '14px 40px' }}>
                    SIGN IN / CREATE ACCOUNT
                  </button>
                </SignInButton>
              </div>
            </SignedOut>
          )}
        </div>
      </ErrorBoundary>

      {/* ── Footer ── */}
      <div style={{
        borderTop: '1px solid #1e1e30',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ fontSize: 11, color: '#7788aa' }}>
          © {new Date().getFullYear()} QuAInt Signal · Built with Claude AI
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'About',   key: 'about'   },
            { label: 'Contact', key: 'contact' },
            { label: 'Terms',   key: 'terms'   },
            { label: 'Privacy', key: 'privacy' },
            { label: 'Blog',    key: 'blog'    },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => item.key === 'blog' ? setActiveTab('blog') : setModal(item.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#7788aa', fontSize: 11, fontFamily: 'inherit',
                padding: 0, letterSpacing: '0.05em', transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#ffaa00'}
              onMouseLeave={e => e.currentTarget.style.color = '#7788aa'}>
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#445' }}>
          ⚠ Not financial advice · Trading involves risk
        </div>
      </div>
    </div>
  );
}