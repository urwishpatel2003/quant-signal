const BASE = import.meta.env.VITE_API_BASE;

export async function fetchBondData() {
  try {
    const data = await (await fetch(`${BASE}/bonds`)).json();
    const find = sym => data.find(d => d.symbol === sym);
    const tlt = find('TLT');
    const ief = find('IEF');
    const shy = find('^IRX'); // SHY mapped to ^IRX
    const tnx = find('^TNX'); // IEF mapped to ^TNX
    const tyx = find('^TYX'); // TLT mapped to ^TYX

    // Yield curve: use changePct direction of TLT vs SHY as proxy
    const yieldCurve = tlt?.current && shy?.current
      ? (tlt.current - shy.current).toFixed(2) : null;

    return {
      tnx, irx: shy, tyx, tlt, ief,
      yieldCurve,
      inverted: yieldCurve !== null && parseFloat(yieldCurve) < 0,
      isEtfMode: true, // flag so components know to show $ not %
    };
  } catch { return null; }
}

export async function fetchInternationalMarkets() {
  try { return await (await fetch(`${BASE}/international`)).json(); }
  catch { return []; }
}

export async function fetchEconomicCalendar() {
  try { return await (await fetch(`${BASE}/calendar`)).json(); }
  catch { return []; }
}

export async function fetchMacroNews() {
  // Yahoo Finance search API blocked — returning empty until Finnhub is integrated
  return [];
}