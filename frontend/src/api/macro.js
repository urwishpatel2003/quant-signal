const RAILWAY = import.meta.env.VITE_API_BASE;

async function fetchWithFallback(railwayUrl, vercelFallbackUrl, minRequired = 6) {
  let railwayData = null;
  try {
    const res  = await fetch(railwayUrl);
    railwayData = await res.json();
  } catch { railwayData = []; }

  const validCount = Array.isArray(railwayData)
    ? railwayData.filter(d => d.current !== null).length
    : 0;

  if (validCount >= minRequired) return railwayData;

  console.log(`[Fallback] Only ${validCount} valid from Railway, trying Yahoo...`);
  try {
    const res      = await fetch(vercelFallbackUrl);
    const yahooData = await res.json();

    // Merge: keep Railway data where valid, fill gaps with Yahoo
    if (Array.isArray(railwayData) && Array.isArray(yahooData)) {
      return railwayData.map(item => {
        if (item.current !== null) return item;
        const yahooItem = yahooData.find(y => y.symbol === item.symbol);
        return yahooItem?.current ? { ...yahooItem } : item;
      });
    }

    const yahooValid = Array.isArray(yahooData)
      ? yahooData.filter(d => d.current !== null).length
      : 0;
    return yahooValid > validCount ? yahooData : (railwayData || []);
  } catch {
    return railwayData || [];
  }
}

export async function fetchBondData() {
  try {
    const data = await fetchWithFallback(
      `${RAILWAY}/bonds`,
      `/api/macro?type=bonds`,
      3
    );

    const find    = sym => data.find(d => d.symbol === sym);
    const tnx     = find('^TNX');
    const irx     = find('^IRX');
    const tyx     = find('^TYX');
    const tlt     = find('TLT');
    const ief     = find('IEF');
    const isYahoo = tnx?.source === 'yahoo';

    let yieldCurve = null;
    if (isYahoo && tnx?.current && irx?.current) {
      yieldCurve = (tnx.current - irx.current).toFixed(2);
    } else if (tlt?.current && irx?.current) {
      yieldCurve = (tlt.current - irx.current).toFixed(2);
    }

    return {
      tnx, irx, tyx, tlt, ief,
      yieldCurve,
      inverted: yieldCurve !== null && parseFloat(yieldCurve) < 0,
      isYahoo,
    };
  } catch { return null; }
}

export async function fetchInternationalMarkets() {
  try {
    return await fetchWithFallback(
      `${RAILWAY}/international`,
      `/api/macro?type=international`,
      6
    );
  } catch { return []; }
}

export async function fetchEconomicCalendar() {
  try {
    const res = await fetch(`${RAILWAY}/calendar`);
    return await res.json();
  } catch { return []; }
}

export async function fetchMacroNews() {
  return [];
}