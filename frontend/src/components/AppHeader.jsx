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
    <div style={{ flexShrink: 0, minWidth: 0 }}>
      <div
        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(18px, 5vw, 26px)',
          letterSpacing: '0.05em', lineHeight: 1, cursor: 'pointer', whiteSpace: 'nowrap' }}
        onClick={handleLogoClick}>
        <span style={{ color: '#ffaa00' }}>Qu</span>
        <span style={{ color: '#00ff88' }}>AI</span>
        <span style={{ color: '#ffaa00' }}>nt Signal</span>
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: '#8899bb', letterSpacing: '0.15em', fontWeight: 600,
        display: 'none' }} className="show-desktop">
        AI-POWERED MARKET INTELLIGENCE
      </div>
    </div>

    {/* Right side: MarketSelector + User */}
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
            <span style={{ fontSize: 'var(--fs-lg)', color: '#c8d8f0', fontWeight: 600,
              letterSpacing: '0.05em',
              // Hide name on very small screens
              display: 'none' }} className="show-desktop">
              {user.firstName.toUpperCase()}
            </span>
          )}
          <UserButton appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} />
        </div>
      </SignedIn>
    </div>
  </div>

  {/* ── Row 2: MacroBar (full width) ── */}
  <div style={{ borderTop: '1px solid #1a1a2e', overflow: 'hidden' }}>
    <MacroBar bonds={macro.bonds} intlMarkets={macro.intlMarkets}
      macroNews={macro.macroNews} loading={macro.loading}
      market={market} />
  </div>
</div>