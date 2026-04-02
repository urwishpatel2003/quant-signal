// Global market context — US or India
import { createContext, useContext, useState } from 'react';

const MarketContext = createContext({ market: 'US', setMarket: () => {} });

export function MarketProvider({ children }) {
  const [market, setMarket] = useState(
    () => localStorage.getItem('quaint_market') || 'US'
  );

  const switchMarket = (m) => {
    localStorage.setItem('quaint_market', m);
    setMarket(m);
  };

  return (
    <MarketContext.Provider value={{ market, setMarket: switchMarket }}>
      {children}
    </MarketContext.Provider>
  );
}

export const useMarket = () => useContext(MarketContext);