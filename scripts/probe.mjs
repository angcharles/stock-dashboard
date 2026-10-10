const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const out = (s) => console.log("::notice::" + s.replace(/\n/g," ").slice(0, 600));
for (const u of [
  "https://marketchameleon.com/Overview/MU/IV/",
  "https://optioncharts.io/options/MU/volatility-skew",
  "https://optioncharts.io/async/options_ticker_iv_chart?ticker=MU&period=1y",
  "https://www.optionistics.com/quotes/stock-quotes/MU",
  "https://www.alphaquery.com/data/option-statistic-chart?ticker=MU&perType=30-Day&identifier=iv-mean&chartPeriod=1y",
  "https://www.ivolatility.com/options/MU/NASDAQ/",
]) {
  try { const r = await fetch(u, { headers: { "User-Agent": UA } }); const t = await r.text();
    const iv = (t.match(/[^<>]{0,120}(implied vol|IV30|iv_?rank|impliedVolatility)[^<>]{0,160}/i) || [""])[0];
    out(`${r.status} ${u.slice(8, 70)} len=${t.length} :: ${iv}`); } catch (e) { out(`ERR ${u} ${e}`); }
}
