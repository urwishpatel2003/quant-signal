import { useState, useEffect } from 'react';
import { fetchBondData, fetchInternationalMarkets, fetchEconomicCalendar, fetchMacroNews } from '../api/macro';

export function useMacroData() {
  const [bonds,       setBonds]       = useState(null);
  const [intlMarkets, setIntlMarkets] = useState([]);
  const [calendar,    setCalendar]    = useState([]);
  const [macroNews,   setMacroNews]   = useState([]);
  const [loading,     setLoading]     = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [b, intl, cal, news] = await Promise.all([
        fetchBondData(), fetchInternationalMarkets(),
        fetchEconomicCalendar(), fetchMacroNews(),
      ]);
      setBonds(b); setIntlMarkets(intl || []); setCalendar(cal || []); setMacroNews(news || []);
    } catch (e) { console.error('Macro load error:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  return { bonds, intlMarkets, calendar, macroNews, loading, refresh: load };
}
