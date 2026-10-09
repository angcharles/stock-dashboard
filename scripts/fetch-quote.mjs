// Fetches a symbol's latest price and daily closes from Yahoo Finance and writes
// <outdir>/quote.json and <outdir>/history.json for a dashboard page.
// Usage: node scripts/fetch-quote.mjs [SYMBOL=ARM] [OUTDIR=data] [RANGE=1y]
// On any failure it leaves the existing files untouched and exits 0,
// so a deploy still goes out with the last good data.
import { writeFileSync, readFileSync } from "node:fs";

const SYMBOL = process.argv[2] || "ARM";
const OUT = process.argv[3] || "data";
const RANGE = process.argv[4] || "1y";
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function chart(range, interval) {
  let lastErr;
  for (const host of HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${SYMBOL}?range=${range}&interval=${interval}&includePrePost=false`;
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!r.ok) throw new Error(`${host} HTTP ${r.status}`);
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (!res) throw new Error(`${host} empty result`);
      return res;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const nyDate = (ts) =>
  new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

try {
  const daily = await chart(RANGE, "1d");
  const ts = daily.timestamp || [];
  const close = daily.indicators?.quote?.[0]?.close || [];
  const d = [], c = [];
  ts.forEach((t, i) => {
    if (close[i] == null) return;
    const day = nyDate(t);
    if (d[d.length - 1] === day) { c[c.length - 1] = +close[i].toFixed(2); return; }
    d.push(day); c.push(+close[i].toFixed(2));
  });

  const m = daily.meta;
  const price = m.regularMarketPrice;
  const time = m.regularMarketTime;
  const date = nyDate(time);
  // previous close = last daily close before the quote's trading day
  let prevClose = null;
  for (let i = d.length - 1; i >= 0; i--) { if (d[i] < date) { prevClose = c[i]; break; } }
  if (prevClose == null) prevClose = m.previousClose ?? m.chartPreviousClose;

  // market state from the trading-period window
  const now = Math.floor(Date.now() / 1000);
  const reg = m.currentTradingPeriod?.regular;
  const state = reg && now >= reg.start && now < reg.end ? "REGULAR" : "CLOSED";

  if (d.length < 50 || !price) throw new Error("not enough data");

  writeFileSync(`${OUT}/history.json`, JSON.stringify({ d, c }));
  writeFileSync(`${OUT}/quote.json`, JSON.stringify({
    symbol: SYMBOL, price: +price.toFixed(2), prevClose: +(+prevClose).toFixed(2),
    time, date, state, source: "Yahoo Finance", fetchedAt: now,
  }));
  console.log(`${SYMBOL} ${price} (prev ${prevClose}) ${state} @ ${new Date(time * 1000).toISOString()}, ${d.length} daily bars`);
} catch (e) {
  console.warn("Quote fetch failed, keeping existing data:", e.message);
  try { console.warn("Existing quote:", readFileSync(`${OUT}/quote.json`, "utf8")); } catch {}
}
