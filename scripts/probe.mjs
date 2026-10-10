const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const out = (s) => console.log("::notice::" + s.replace(/\n/g," ").slice(0, 700));
const r0 = await fetch("https://www.barchart.com/stocks/quotes/MU/options-history", { headers: { "User-Agent": UA } });
const ck = r0.headers.getSetCookie ? r0.headers.getSetCookie() : [];
const jar = ck.map((c) => c.split(";")[0]).join("; ");
const x = decodeURIComponent((jar.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");
out(`bc page ${r0.status} cookies=${ck.length} xsrf=${x ? "yes" : "no"}`);
const H = { "User-Agent": UA, "Cookie": jar, "X-XSRF-TOKEN": x, "Accept": "application/json", "Referer": "https://www.barchart.com/stocks/quotes/MU/options-history" };
for (const u of [
  "https://www.barchart.com/proxies/core-api/v1/options-historical/get?symbol=MU&fields=symbol,impliedVolatility,historicVolatility,ivRank,tradeTime&orderBy=tradeTime&orderDir=desc&limit=200&raw=1",
  "https://www.barchart.com/proxies/core-api/v1/historical/get?symbol=MU&fields=tradeTime,impliedVolatility,historicVolatility30&type=eod&orderBy=tradeTime&orderDir=desc&limit=200&raw=1",
]) {
  const r = await fetch(u, { headers: H }); const t = await r.text();
  out(`${r.status} ${u.split("v1/")[1].slice(0, 40)} len=${t.length} :: ${t.slice(0, 400)}`);
}
