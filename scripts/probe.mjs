const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const out = (s) => console.log("::notice::" + s.replace(/\n/g," ").slice(0, 900));
for (const u of ["https://optioncharts.io/options/MU/volatility-skew", "https://optioncharts.io/options/MU/historical-volatility", "https://optioncharts.io/options/MU"]) {
  const r = await fetch(u, { headers: { "User-Agent": UA } }); const t = await r.text();
  const refs = [...new Set([...t.matchAll(/["'](\/async\/[^"']+)["']/g)].map((m) => m[1]))];
  out(`${r.status} ${u} refs: ${refs.join(" | ")}`);
  const m = t.match(/[^<>]{0,200}(30-day|IV30|IV Rank|historical volatility)[^<>]{0,200}/i); if (m) out("txt: " + m[0]);
}
