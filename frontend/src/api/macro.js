const RAILWAY = import.meta.env.VITE_API_BASE;

async function fetchWithFallback(railwayUrl, vercelFallbackUrl) {
  try {
    const res  = await fetch(railwayUrl);
    const data = await res.json();
    if (Array.isArray(data) && data.some(d => d.current !== null)) {
      return data;
    }
    throw new Error('No data from Railway');
  } catch {
    try {
      const res  = await fetch(vercelFallbackUrl);
      const data = await res.json();
      return data;
    } catch { return []; }
  }
}

export async function fetchBondData() {
  try {
    const data = await fetchWithFallback(
      `${RAILWAY}/bonds`,
      `/api/macro?type=bonds`
    );
    const find = sym => data.find(d => d.symbol === sym);
    const tnx = find('^TNX');
    const irx = find('^IRX');
    const tyx = find('^TYX');
    const tlt = find('TLT');
    const ief = find('IEF');
    const isYahoo = tnx?.source === 'yahoo';
    let yieldCurve = null;
    if (isYahoo && tnx?.current && irx?.current) {
      yieldCurve = (tnx.current - irx.current).toFixed(2);
    } else if (tlt?.current && find('^IRX')?.current) {
      yieldCurve = (tlt.current - find('^IRX').current).toFixed(2);
    }
    return { tnx, irx, tyx, tlt, ief, yieldCurve, inverted: yieldCurve !== null && parseFloat(yieldCurve) < 0, isYahoo };
  } catch { return null; }
}

export async function fetchInternationalMarkets() {
  try {
    return await fetchWithFallback(
      `${RAILWAY}/international`,
      `/api/macro?type=international`
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