import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './styles/globals.css';
import { MarketProvider } from './context/MarketContext';


const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      appearance={{
        variables: {
          colorPrimary:         '#ffaa00',
          colorBackground:      '#0f0f18',
          colorInputBackground: '#07070e',
          colorInputText:       '#c8c8d0',
          colorText:            '#c8c8d0',
          colorTextSecondary:   '#8899aa',
          colorNeutral:         '#2a2a3e',
          colorDanger:          '#ff4444',
          colorSuccess:         '#00ff88',
          borderRadius:         '2px',
          fontFamily:           "'IBM Plex Mono', monospace",
        },
        elements: {
          card: {
            background:  '#0f0f18',
            border:      '1px solid #1e1e2e',
            boxShadow:   '0 8px 32px rgba(0,0,0,0.8)',
          },
          headerTitle: {
            color:       '#ffaa00',
            fontFamily:  "'Bebas Neue', sans-serif",
            letterSpacing: '0.1em',
            fontSize:    '28px',
          },
          headerSubtitle: {
            color: '#8899aa',
          },
          socialButtonsBlockButton: {
            background:  '#1a1a2e',
            border:      '1px solid #2a2a3e',
            color:       '#c8c8d0',
          },
          socialButtonsBlockButtonText: {
            color: '#c8c8d0',
          },
          socialButtonsBlockButtonArrow: {
            color: '#99aacc',
          },
          dividerLine: {
            background: '#1e1e2e',
          },
          dividerText: {
            color: '#8899bb',
          },
          formFieldLabel: {
            color:     '#8899aa',
            fontSize:  '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          },
          formFieldInput: {
            background: '#07070e',
            border:     '1px solid #2a2a3e',
            color:      '#ffffff',
            fontSize:   '14px',
          },
          formFieldInputShowPasswordButton: {
            color: '#99aacc',
          },
          formButtonPrimary: {
            background:  '#ffaa00',
            color:       '#07070e',
            fontWeight:  '600',
            fontSize:    '13px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          },
          footerActionLink: {
            color: '#ffaa00',
          },
          footerActionText: {
            color: '#99aacc',
          },
          identityPreviewText: {
            color: '#c8c8d0',
          },
          identityPreviewEditButton: {
            color: '#ffaa00',
          },
          otpCodeFieldInput: {
            background:  '#07070e',
            border:      '1px solid #2a2a3e',
            color:       '#ffffff',
          },
          alertText: {
            color: '#ff4444',
          },
          formResendCodeLink: {
            color: '#ffaa00',
          },
          navbar: {
            background: '#0f0f18',
          },
          navbarButton: {
            color: '#8899aa',
          },
          navbarButtonActive: {
            color:      '#ffaa00',
            background: '#ffaa0011',
          },
          userButtonPopoverCard: {
            background: '#0f0f18',
            border:     '1px solid #1e1e2e',
          },
          userButtonPopoverActionButton: {
            color: '#c8c8d0',
          },
          userButtonPopoverActionButtonText: {
            color: '#c8c8d0',
          },
          userButtonPopoverFooter: {
            display: 'none',
          },
        },
      }}
    >   <MarketProvider>
       <App />
      </MarketProvider>
    </ClerkProvider>
  </React.StrictMode>
);