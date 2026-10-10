const UA = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"};
const out = (s) => console.log("::notice::" + s.replace(/\n/g," ").slice(0, 1500));
const h = await (await fetch("https://www.alphaquery.com/stock/MU/volatility-option-statistics/30-day/iv-mean", { headers: UA })).text();
const i = h.indexOf("option-statistic-chart"); out("page len " + h.length + " idx " + i);
for (const m of h.matchAll(/option-statistic-chart[^"'`]*/g)) out("ref: " + m[0]);
if (i > 0) out(h.slice(i - 900, i + 600));
for (const q of ["", "&perPeriod=1y", "&range=1y", "&days=365", "&startDate=2026-03-01"]) {
  const r = await fetch("https://www.alphaquery.com/data/option-statistic-chart?ticker=MU&perType=30-Day&identifier=iv-mean" + q, { headers: UA });
  const t = await r.text(); let j = []; try { j = JSON.parse(t); } catch (e) {}
  out(`q=${q} ${r.status} n=${j.length} first=${j[0] && j[0].x} last=${j.length && j[j.length-1].x}`);
}
