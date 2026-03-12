# QUANT SIGNAL — AI Trading Dashboard

AI-powered market intelligence with real-time options, global macro, and Claude AI signals.

## Quick Start

### 1. Add Your API Keys
Open `backend/server.js` and replace the placeholders at the top:
```js
process.env.ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY_HERE';
process.env.TRADIER_TOKEN     = 'YOUR_TRADIER_TOKEN_HERE';
```
- **Anthropic API key**: https://console.anthropic.com
- **Tradier token**: https://developer.tradier.com (free sandbox account works)

### 2. Install & Run Backend
```bash
cd backend
npm install
node server.js
```
Backend runs on http://localhost:3001

### 3. Install & Run Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on http://localhost:5173

---

## Project Structure

```
quant-signal/
├── backend/
│   ├── server.js          ← Express proxy (Yahoo, Tradier, Claude)
│   └── package.json
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx                    ← Root layout + tab routing only
        ├── main.jsx
        ├── styles/
        │   └── globals.css            ← All CSS
        ├── utils/
        │   └── constants.js           ← Colors, tab names, base URL
        ├── api/
        │   ├── yahoo.js               ← Yahoo Finance fetchers
        │   ├── tradier.js             ← Tradier options + quotes
        │   ├── macro.js               ← Bonds, intl markets, calendar
        │   └── claude.js              ← Claude prompts + API calls
        ├── hooks/
        │   ├── useMacroData.js        ← Global macro data (auto-refresh)
        │   └── useScan.js             ← Scanner logic
        ├── components/
        │   ├── MacroBar.jsx           ← Top persistent ticker bar
        │   ├── MiniChart.jsx          ← SVG sparkline
        │   ├── SignalCard.jsx         ← BUY/SELL/HOLD signal display
        │   ├── ContractCard.jsx       ← Options contract card
        │   ├── BondPanel.jsx          ← Bond market widget
        │   ├── ChainTable.jsx         ← ATM options chain table
        │   ├── MacroNewsPanel.jsx     ← Geo/macro news feed
        │   └── CalendarPanel.jsx      ← Economic calendar widget
        └── tabs/
            ├── ScannerTab.jsx         ← Stock scanner + AI signal
            ├── OptionsTab.jsx         ← Live options plays
            ├── MarketsTab.jsx         ← Global markets dashboard
            ├── WatchlistTab.jsx       ← Saved tickers + scan all
            └── PortfolioTab.jsx       ← Robinhood CSV import + AI
```

## How to Add Features

| What you want to add      | File to edit                    |
|---------------------------|----------------------------------|
| New data source           | `api/yahoo.js` or `api/macro.js` |
| Change Claude prompts     | `api/claude.js`                  |
| New UI component/widget   | New file in `components/`        |
| Change a tab's layout     | Specific file in `tabs/`         |
| New tab                   | New file in `tabs/` + add to `TABS` in `constants.js` + one line in `App.jsx` |
| Colors / theme            | `styles/globals.css` + `utils/constants.js` |
| Global refresh logic      | `hooks/useMacroData.js`          |

## Features
- **SCANNER** — Price analysis with BUY/SELL/HOLD, fundamentals, options flow, news
- **OPTIONS** — Live Tradier chains, ATM-first sorting, AI-recommended contracts, expiry switching
- **MARKETS** — Global sentiment, Asia/Europe/US bonds, VIX, DXY, Gold, Oil, calendar
- **WATCHLIST** — Save tickers, scan all with global macro context
- **PORTFOLIO** — Robinhood CSV import, live P&L, AI signals on all positions

## ⚠ Disclaimer
NOT FINANCIAL ADVICE. For educational purposes only. Options trading involves significant risk.
