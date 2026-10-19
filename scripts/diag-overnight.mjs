// Temporary: look for a source that publishes overnight (24-hour session) prices.
import { writeFileSync } from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const out = { at: new Date().toISOString() };
const get = async (u, h = {}) => { try { const r = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...h }, signal: AbortSignal.timeout(20000) }); return { status: r.status, text: (await r.text()).slice(0, 4000) }; } catch (e) { return { err: e.message }; } };
// Webull public quote gateway (Webull offers 24-hour trading)
const wl = await get("https://quotes-gw.webullfintech.com/api/search/pc/tickers?keyword=NVDA&pageIndex=1&pageSize=3&regionId=6");
out.webullSearch = wl;
try {
  const id = JSON.parse(wl.text)?.data?.find((x) => x.disSymbol === "NVDA")?.tickerId;
  out.webullId = id;
  if (id) out.webullQuote = await get(`https://quotes-gw.webullfintech.com/api/stock/tickerRealTime/getQuote?tickerId=${id}&includeSecu=1&includeQuote=1&more=1`);
} catch (e) { out.webullErr = e.message; }
out.robinhood = await get("https://api.robinhood.com/marketdata/quotes/?symbols=NVDA&bounds=24_5", { Accept: "application/json" });
out.robinhood2 = await get("https://api.robinhood.com/quotes/NVDA/", { Accept: "application/json" });
out.stockanalysis = await get("https://stockanalysis.com/api/quotes/s/nvda", { Accept: "application/json" });
writeFileSync("diag-overnight.json", JSON.stringify(out, null, 1));
