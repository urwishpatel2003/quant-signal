import { useState } from 'react';
import {
  SignedIn, SignedOut, SignInButton,
  UserButton, useUser, useAuth,
} from '@clerk/clerk-react';
import { TABS } from './utils/constants';
import { useMacroData } from './hooks/useMacroData';
import MacroBar    from './components/MacroBar';
import ScannerTab  from './tabs/ScannerTab';
import OptionsTab  from './tabs/OptionsTab';
import MarketsTab  from './tabs/MarketsTab';
import HelpTab     from './tabs/HelpTab';
import WelcomePage from './components/WelcomePage';

export default function App() {
  const [enteredApp,    setEnteredApp]    = useState(false);
  const [activeTab,     setActiveTab]     = useState('scanner');
  const [optionsTicker, setOptionsTicker] = useState('');

  const macro                    = useMacroData();
  const { user }                 = useUser();
  const { isLoaded, isSignedIn } = useAuth();

  const openOptions    = ticker => { setOptionsTicker(ticker); setActiveTab('options'); };
  const handleNavigate = tab    => setActiveTab(tab);

  // Wait for Clerk
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

  // Show welcome if: not signed in AND hasn't clicked Enter App
  const showWelcome = !isSignedIn && !enteredApp;

  if (showWelcome) {
    return (
      <WelcomePage
        onEnter={() => setEnteredApp(true)}
        onNavigate={tab => { handleNavigate(tab); setEnteredApp(true); }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#07070e', color: '#c8c8d0', fontFamily: "'IBM Plex Mono', monospace" }}>

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

        {/* ── Auth controls ── */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn-sm" style={{ color: '#ffaa00', borderColor: '#ffaa0044', whiteSpace: 'nowrap' }}>
                SIGN IN
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {user?.firstName && (
                <span style={{ fontSize: 10, color: '#445' }}>
                  {user.firstName.toUpperCase()}
                </span>
              )}
              <UserButton
                appearance={{
                  elements: { avatarBox: { width: 28, height: 28 } }
                }}
              />
            </div>
          </SignedIn>
        </div>
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
        <SignedIn>
          {activeTab === 'scanner' && <ScannerTab macro={macro} onOpenOptions={openOptions} onAddToWatchlist={() => {}} />}
          {activeTab === 'options' && <OptionsTab macro={macro} initialTicker={optionsTicker} />}
          {activeTab === 'markets' && <MarketsTab intlMarkets={macro.intlMarkets} bonds={macro.bonds} macroNews={macro.macroNews} calendar={macro.calendar} />}
          {activeTab === 'help'    && <HelpTab />}
        </SignedIn>

        <SignedOut>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '60vh', gap: 20 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#ffaa00' }}>
              SIGN IN TO ACCESS
            </div>
            <div style={{ fontSize: 13, color: '#556', marginBottom: 8 }}>
              Create a free account to use QuAInt Signal
            </div>
            <SignInButton mode="modal">
              <button className="btn" style={{ fontSize: 14, padding: '14px 40px' }}>
                SIGN IN / CREATE ACCOUNT
              </button>
            </SignInButton>
          </div>
        </SignedOut>
      </div>
    </div>
  );
}