const BASE = import.meta.env.VITE_API_BASE;
const encode = url => url.replace('https://query1.finance.yahoo.com', `${BASE}/yahoo`);

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
  try {
    const topics = [
      'geopolitical risk war conflict',
      'Federal Reserve interest rates policy',
      'US Treasury bonds yield curve',
      'trade war tariffs sanctions',
      'China economy slowdown',
      'Japan Bank of Japan yen',
      'India economy growth RBI',
      'Europe ECB recession',
    ];
    const results = await Promise.all(topics.map(async topic => {
      const res  = await fetch(encode(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(topic)}&newsCount=2`));
      const data = await res.json();
      return (data?.news || []).map(n => ({ title: n.title, publisher: n.publisher, time: n.providerPublishTime, topic }));
    }));
    return results.flat().sort((a, b) => b.time - a.time).slice(0, 16);
  } catch { return []; }
}