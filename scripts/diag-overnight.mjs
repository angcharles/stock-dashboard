// Temporary: dump what each source returns for overnight/extended prices.
import { writeFileSync } from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const out = { at: new Date().toISOString() };
const get = async (u, h = {}) => { const r = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...h }, signal: AbortSignal.timeout(20000) }); return { status: r.status, text: await r.text(), headers: r.headers }; };
let cookie = "", crumb = "";
try { const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual" }); cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  crumb = (await get("https://query2.finance.yahoo.com/v1/test/getcrumb", { Cookie: cookie })).text; } catch (e) { out.crumbErr = e.message; }
for (const s of ["NVDA", "TSLA", "MU"]) {
  const o = (out[s] = {});
  try { const r = await get(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${s}&crumb=${encodeURIComponent(crumb)}`, { Cookie: cookie, Accept: "application/json" });
    const x = JSON.parse(r.text)?.quoteResponse?.result?.[0] || {}; o.yahooQuote = Object.fromEntries(Object.entries(x).filter(([k]) => /market|overnight|hasPrePost/i.test(k))); } catch (e) { o.yahooQuoteErr = e.message; }
  try { const r = await get(`https://query2.finance.yahoo.com/v8/finance/chart/${s}?range=1d&interval=5m&includePrePost=true&crumb=${encodeURIComponent(crumb)}`, { Cookie: cookie });
    const res = JSON.parse(r.text)?.chart?.result?.[0]; const ts = res?.timestamp || [], cl = res?.indicators?.quote?.[0]?.close || [];
    o.yahooChartLast = ts.slice(-3).map((t, i) => [new Date(t * 1000).toISOString(), cl[cl.length - 3 + i]]); o.yahooChartMeta = { tp: res?.meta?.currentTradingPeriod, hasPrePost: res?.meta?.hasPrePostMarketData }; } catch (e) { o.yahooChartErr = e.message; }
  try { const r = await get(`https://api.nasdaq.com/api/quote/${s}/info?assetclass=stocks`, { Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" });
    const d = JSON.parse(r.text)?.data || {}; o.nasdaq = { marketStatus: d.marketStatus, primaryData: d.primaryData, secondaryData: d.secondaryData }; } catch (e) { o.nasdaqErr = e.message; }
  try { const r = await get(`https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${s}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`, { Accept: "application/json" });
    const q = JSON.parse(r.text)?.FormattedQuoteResult?.FormattedQuote?.[0] || {}; o.cnbc = { last: q.last, last_time: q.last_time, curmktstatus: q.curmktstatus, ExtendedMktQuote: q.ExtendedMktQuote }; } catch (e) { o.cnbcErr = e.message; }
}
writeFileSync("diag-overnight.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out).slice(0, 3000));
