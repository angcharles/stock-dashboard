const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const out = (s) => console.log("::notice::" + s.replace(/\n/g," ").slice(0, 1500));
const base = "https://optioncharts.io/async/option_history_iv?ticker=MU&indicators=&period=";
let first = null;
for (const p of ["6m", "6M", "1y", "180", "180d", "six_months", "1Y", "3m"]) {
  const r = await fetch(base + p, { headers: { "User-Agent": UA } }); const t = await r.text();
  const ds = [...t.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]).sort();
  out(`p=${p} ${r.status} len=${t.length} n=${ds.length} min=${ds[0]} max=${ds[ds.length-1]}`);
  if (!first && ds.length > 30) first = t;
}
const r = await fetch(base, { headers: { "User-Agent": UA } }); const t = first || await r.text();
const k = t.indexOf("2026-10-09"); out("ctx: " + t.slice(Math.max(0, k - 700), k + 500).replace(/\s+/g, " "));
const per = [...new Set([...t.matchAll(/period=([^&"']*)/g)].map((m) => m[1]))]; out("periods: " + per.join(","));
