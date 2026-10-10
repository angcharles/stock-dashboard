const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const out = (s) => console.log("::notice::" + s.replace(/\n/g, " ").slice(0, 900));
const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual" });
const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
const crumb = await (await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } })).text();
for (const [host, sym, extra] of [["query2", "META", ""], ["query1", "META", ""], ["query2", "META", "&lang=en-US&region=US"], ["query2", "FB", ""]]) {
  const j = await (await fetch(`https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=upgradeDowngradeHistory&crumb=${encodeURIComponent(crumb)}${extra}`, { headers: { "User-Agent": UA, Cookie: cookie } })).json();
  const h = j.quoteSummary?.result?.[0]?.upgradeDowngradeHistory?.history || [];
  out(`${host} ${sym} ${extra} n=${h.length} ${JSON.stringify(h[0] || j).slice(0, 300)}`);
}
const n = await fetch("https://api.nasdaq.com/api/analyst/META/ratings", { headers: { "User-Agent": UA, Accept: "application/json" } });
out("nasdaq ratings " + n.status + " " + (await n.text()).slice(0, 600));
const m = await fetch("https://www.marketbeat.com/stocks/NASDAQ/META/forecast/", { headers: { "User-Agent": UA } });
const mt = await m.text(); out("marketbeat " + m.status + " len " + mt.length + " " + (mt.match(/Price Target[^<]{0,200}/) || [""])[0]);
