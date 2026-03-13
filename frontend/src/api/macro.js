const BASE = import.meta.env.VITE_API_BASE;

export async function fetchBondData() {
  try {
    const data = await (await fetch(`${BASE}/bonds`)).json();
    const find = sym => data.find(d => d.symbol === sym);
    const tnx = find('^TNX'), irx = find('^IRX'), tyx = find('^TYX');
    const tlt = find('TLT'),  ief = find('IEF');
    const yieldCurve = tnx?.current && irx?.current
      ? (tnx.current - irx.current).toFixed(2) : null;
    return { tnx, irx, tyx, tlt, ief, yieldCurve, inverted: yieldCurve !== null && parseFloat(yieldCurve) < 0 };
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