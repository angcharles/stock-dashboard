const UA = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36","Accept":"application/json,text/html,*/*"};
const out = (s) => console.log("::notice::" + s.replace(/\n/g," ").slice(0, 900));
async function probe(name, url, opt = {}) {
  try {
    const r = await fetch(url, { headers: { ...UA, ...(opt.h || {}) } });
    const t = await r.text();
    out(`${name} ${r.status} len=${t.length} :: ${t.slice(0, opt.n || 500)}`);
    return { r, t };
  } catch (e) { out(`${name} ERR ${e}`); return {}; }
}
const c = await probe("cboe", "https://cdn.cboe.com/api/global/delayed_quotes/options/MU.json", { n: 700 });
try { const j = JSON.parse(c.t); const d = j.data; out("cboe keys " + Object.keys(d).join(",")); out("cboe opt0 " + JSON.stringify(d.options[0])); out("cboe nopts " + d.options.length); } catch (e) { out("cboe parse " + e); }
await probe("alphaq", "https://www.alphaquery.com/data/option-statistic-chart?ticker=MU&perType=30-Day&identifier=iv-mean", { n: 400 });
await probe("cboe-hist", "https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/MU.json", { n: 300 });
await probe("yahoo-opt", "https://query2.finance.yahoo.com/v7/finance/options/MU", { n: 200 });
await probe("nasdaq-opt", "https://api.nasdaq.com/api/quote/MU/option-chain?assetclass=stocks&limit=5", { n: 300 });
