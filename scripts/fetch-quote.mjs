// Fetches a symbol's latest price and daily closes and writes
// <outdir>/quote.json and <outdir>/history.json for a dashboard page.
// Usage: node scripts/fetch-quote.mjs [SYMBOL=ARM] [OUTDIR=data] [RANGE=1y]
// Tries Yahoo (with cookie + crumb), then Nasdaq, then Stooq, for each piece.
// On total failure it leaves the existing files untouched and exits 0,
// so a deploy still goes out with the last good data.
import { writeFileSync, readFileSync, appendFileSync } from "node:fs";

const SYMBOL = process.argv[2] || "ARM";
const OUT = process.argv[3] || "data";
const RANGE = process.argv[4] || "1y";
const DAYS = Math.round((parseFloat(RANGE) || 1) * (RANGE.endsWith("mo") ? 31 : 366)) + 5; // calendar days of history
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };

const nyDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
const num = (s) => (s == null ? NaN : parseFloat(String(s).replace(/[$,%+\s]/g, "")));
const isOpenNow = () => {
  const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const m = ny.getHours() * 60 + ny.getMinutes(), d = ny.getDay();
  return d >= 1 && d <= 5 && m >= 570 && m < 960;
};

async function get(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...headers }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
  return r;
}

// ---------- Yahoo ----------
async function yahoo() {
  let cookie = "", crumb = "";
  try {
    const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(10000) });
    cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
    if (cookie) crumb = await (await get("https://query2.finance.yahoo.com/v1/test/getcrumb", { Cookie: cookie })).text();
  } catch (e) { log("yahoo crumb:", e.message); }
  const q = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
  let lastErr;
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const r = await get(`https://${host}/v8/finance/chart/${SYMBOL}?range=${RANGE}&interval=1d&includePrePost=false${q}`,
        { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) });
      const res = (await r.json())?.chart?.result?.[0];
      if (!res) throw new Error("empty result");
      const qd = res.indicators?.quote?.[0] || {};
      const ts = res.timestamp || [], cl = qd.close || [], op = qd.open || [], hi = qd.high || [], lo = qd.low || [];
      const d = [], c = [], o = [], h = [], l = [];
      const r2 = (v, fb) => +((v ?? fb).toFixed(2));
      ts.forEach((t, i) => {
        if (cl[i] == null) return;
        const day = nyDate(t * 1000);
        const row = [r2(op[i], cl[i]), r2(hi[i], cl[i]), r2(lo[i], cl[i]), r2(cl[i])];
        if (d.at(-1) === day) { const k = c.length - 1; h[k] = Math.max(h[k], row[1]); l[k] = Math.min(l[k], row[2]); c[k] = row[3]; }
        else { d.push(day); o.push(row[0]); h.push(row[1]); l.push(row[2]); c.push(row[3]); }
      });
      const m = res.meta;
      return { hist: { d, c, o, h, l }, quote: { price: m.regularMarketPrice, time: m.regularMarketTime, date: nyDate(m.regularMarketTime * 1000) } };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ---------- Nasdaq ----------
const NQ = { Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" };
async function nasdaqQuote() {
  const j = await (await get(`https://api.nasdaq.com/api/quote/${SYMBOL}/info?assetclass=stocks`, NQ)).json();
  const p = j?.data?.primaryData;
  const price = num(p?.lastSalePrice);
  if (!isFinite(price)) throw new Error("nasdaq: no price");
  // "Oct 9, 2026 10:05 AM ET" or "Oct 9, 2026" -> epoch seconds (approximate ET offset)
  let time = Math.floor(Date.now() / 1000);
  const stamp = (p?.lastTradeTimestamp || "").replace(/^.*?(\w{3} \d{1,2}, \d{4}.*?)( ET)?$/, "$1");
  const parsed = Date.parse(stamp + " GMT-0400");
  if (isFinite(parsed)) time = Math.floor(parsed / 1000);
  return { price, time, date: nyDate(time * 1000) };
}
async function nasdaqHist() {
  const from = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
  const j = await (await get(`https://api.nasdaq.com/api/quote/${SYMBOL}/historical?assetclass=stocks&fromdate=${from}&limit=${DAYS}`, NQ)).json();
  const rows = j?.data?.tradesTable?.rows || [];
  const d = [], c = [], o = [], h = [], l = [];
  rows.slice().reverse().forEach((r) => {
    const [mm, dd, yy] = r.date.split("/");
    const cl = +num(r.close).toFixed(2), f = (x) => (isFinite(num(x)) ? +num(x).toFixed(2) : cl);
    d.push(`${yy}-${mm}-${dd}`); c.push(cl); o.push(f(r.open)); h.push(f(r.high)); l.push(f(r.low));
  });
  if (d.length < 50) throw new Error("nasdaq: short history");
  return { d, c, o, h, l };
}

// ---------- Stooq ----------
async function stooqQuote() {
  const t = await (await get(`https://stooq.com/q/l/?s=${SYMBOL.toLowerCase()}.us&f=sd2t2c&h&e=csv`)).text();
  const [, row] = t.trim().split(/\r?\n/);
  const [, date, time, close] = row.split(",");
  const price = num(close);
  if (!isFinite(price)) throw new Error("stooq: no price");
  const ts = Math.floor(Date.parse(`${date}T${time}Z`) / 1000) || Math.floor(Date.now() / 1000); // stooq time is CET-ish; close enough
  return { price, time: ts, date };
}
async function stooqHist() {
  const t = await (await get(`https://stooq.com/q/d/l/?s=${SYMBOL.toLowerCase()}.us&i=d`)).text();
  const lines = t.trim().split(/\r?\n/).slice(1).slice(-Math.ceil(DAYS * 0.70));
  const d = [], c = [], o = [], h = [], l = [];
  lines.forEach((ln) => { const f = ln.split(","); if (f.length > 4 && isFinite(num(f[4]))) {
    d.push(f[0]); c.push(+num(f[4]).toFixed(2)); o.push(+num(f[1]).toFixed(2)); h.push(+num(f[2]).toFixed(2)); l.push(+num(f[3]).toFixed(2)); } });
  if (d.length < 50) throw new Error("stooq: short history");
  return { d, c, o, h, l };
}

// ---------- run ----------
let hist = null, quote = null, qSrc = "", hSrc = "";
try { const y = await yahoo(); if (y.hist.d.length >= 50) { hist = y.hist; hSrc = "Yahoo"; } if (y.quote.price) { quote = y.quote; qSrc = "Yahoo"; } }
catch (e) { log("yahoo failed:", e.message); }
if (!quote) for (const [name, fn] of [["Nasdaq", nasdaqQuote], ["Stooq", stooqQuote]]) {
  try { quote = await fn(); qSrc = name; break; } catch (e) { log(name, "quote failed:", e.message); }
}
if (!hist) for (const [name, fn] of [["Nasdaq", nasdaqHist], ["Stooq", stooqHist]]) {
  try { hist = await fn(); hSrc = name; break; } catch (e) { log(name, "history failed:", e.message); }
}
if (!hist) { try { hist = JSON.parse(readFileSync(`${OUT}/history.json`, "utf8")); hSrc = "previous file"; } catch {} }

if (quote && hist) {
  // fold the live price into history and derive the previous close from it
  const i = hist.d.indexOf(quote.date), px = +quote.price.toFixed(2), ohlc = Array.isArray(hist.o) && hist.o.length === hist.c.length;
  if (i >= 0) { hist.c[i] = px; if (ohlc) { hist.h[i] = Math.max(hist.h[i], px); hist.l[i] = Math.min(hist.l[i], px); } }
  else if (quote.date > hist.d.at(-1)) { hist.d.push(quote.date); hist.c.push(px); if (ohlc) { hist.o.push(px); hist.h.push(px); hist.l.push(px); } }
  let prevClose = null;
  for (let k = hist.d.length - 1; k >= 0; k--) if (hist.d[k] < quote.date) { prevClose = hist.c[k]; break; }
  const now = Math.floor(Date.now() / 1000);
  const out = { symbol: SYMBOL, price: +quote.price.toFixed(2), prevClose, time: quote.time, date: quote.date,
    state: isOpenNow() && quote.date === nyDate(Date.now()) ? "REGULAR" : "CLOSED", source: qSrc, historySource: hSrc, fetchedAt: now };
  writeFileSync(`${OUT}/history.json`, JSON.stringify(hist));
  writeFileSync(`${OUT}/quote.json`, JSON.stringify(out));
  log(SYMBOL, "OK", JSON.stringify(out), `${hist.d.length} daily bars`);
  summary(`### ${SYMBOL} $${out.price} (prev $${prevClose}) · ${out.state}\nQuote: ${qSrc} · History: ${hSrc} · ${hist.d.length} bars`);
} else {
  log(SYMBOL, "all sources failed; keeping existing data.");
  summary(`### ⚠️ ${SYMBOL}: all quote sources failed — deployed with previous data`);
}
