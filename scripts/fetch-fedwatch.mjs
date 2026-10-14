// Fed funds rate expectations for the Macro page, FedWatch-style.
// Writes data/fedwatch.json: one snapshot per trading day for about the last 6 weeks, each with the
// futures-implied rate after every upcoming FOMC meeting, the bps priced and the probability of each
// target range. The page compares today's snapshot with 1 day, 1 week, 2 weeks and 1 month ago.
//
// Method (the one CME FedWatch documents):
//   30-day fed funds futures (CBOT ZQ) settle at 100 minus the month's average effective fed funds rate.
//   Walking the meetings in order from today's EFFR, the rate after a meeting is either the next month's
//   implied rate (when that month has no meeting) or solved from the meeting month's average:
//     avg = (d * before + (N - d) * after) / N   (the decision takes effect the day after the meeting).
//   Each meeting's expected move in 25bp steps is split between the two neighbouring moves and chained into
//   a probability tree, giving the probability of each target range after every meeting.
// Sources: Yahoo Finance daily bars for each ZQ contract; FRED (EFFR, DFEDTARL, DFEDTARU) for the
// effective rate and target range, with the New York Fed API and known values as fallbacks.
// Anything that fails keeps the previous file's snapshots.
// Usage: node scripts/fetch-fedwatch.mjs
import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const nyDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
async function get(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...headers }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
  return r;
}

// FOMC decision days (second day of each meeting), from the Fed's published schedules.
// Add the next year's dates when the Fed announces them (usually in August).
export const FOMC = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
];
// Known policy settings, used when FRED and the NY Fed are unreachable: [from date, lower, upper, typical EFFR]
const KNOWN = [
  ["2025-12-11", 3.50, 3.75, 3.64],
  ["2026-09-17", 3.75, 4.00, 3.88],
];
const CODES = "FGHJKMNQUVXZ";
const ym = (d) => d.slice(0, 7);
const addMonth = (m, k = 1) => { const [y, mo] = m.split("-").map(Number); const t = new Date(Date.UTC(y, mo - 1 + k, 1)); return t.toISOString().slice(0, 7); };
const daysIn = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
const zq = (m) => `ZQ${CODES[+m.slice(5, 7) - 1]}${m.slice(2, 4)}.CBT`;
const meetingMonths = new Set(FOMC.map(ym));

// ---------- pure computation (exported for tests) ----------
// prices: { "YYYY-MM": futures price }, date: snapshot date, r0: EFFR on that date, lower: target lower bound
export function snapshot(date, prices, r0, lower) {
  const spread = r0 - lower;                     // where EFFR trades inside the range
  const meetings = FOMC.filter((d) => d > date); // a meeting on the snapshot date has already happened by the settle
  let before = r0, dist = new Map([[0, 1]]);     // distribution over 25bp steps from the current range
  const out = [];
  for (const md of meetings) {
    const m = ym(md), d = +md.slice(8, 10), N = daysIn(m), nx = addMonth(m);
    let after = null, how = "";
    if (!meetingMonths.has(nx) && prices[nx] != null) { after = 100 - prices[nx]; how = "next"; }
    else if (prices[m] != null && N - d > 0) { after = (N * (100 - prices[m]) - d * before) / (N - d); how = "same"; }
    if (after == null || !isFinite(after) || after < -1 || after > 15) break;
    const steps = (after - before) / 0.25, lo = Math.floor(steps), fr = steps - lo;
    const nd = new Map();
    for (const [k, p] of dist) {
      if (1 - fr > 1e-9) nd.set(k + lo, (nd.get(k + lo) || 0) + p * (1 - fr));
      if (fr > 1e-9) nd.set(k + lo + 1, (nd.get(k + lo + 1) || 0) + p * fr);
    }
    dist = nd;
    const probs = {};
    for (const [k, p] of [...dist].sort((a, b) => a[0] - b[0])) if (p >= 0.0005) probs[(lower + k * 0.25).toFixed(2)] = +p.toFixed(4);
    out.push({ d: md, rate: +after.toFixed(4), move: +((after - before) * 100).toFixed(1), cum: +((after - r0) * 100).toFixed(1), how, p: probs });
    before = after;
  }
  return { d: date, effr: r0, lower, upper: lower + 0.25, spread: +spread.toFixed(3), meetings: out };
}

// ---------- fetching ----------
let cookie = "", crumb = "";
async function yahooDaily(sym) {
  if (!crumb) {
    try {
      const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(10000) });
      cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
      if (cookie) crumb = await (await get("https://query2.finance.yahoo.com/v1/test/getcrumb", { Cookie: cookie })).text();
    } catch (e) { log("yahoo crumb:", e.message); }
  }
  const q = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
  const r = await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d${q}`, { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) });
  const res = (await r.json())?.chart?.result?.[0];
  if (!res) throw new Error("empty");
  const ts = res.timestamp || [], cl = res.indicators?.quote?.[0]?.close || [], out = {};
  ts.forEach((t, i) => { if (cl[i] != null && cl[i] > 80 && cl[i] < 101) out[nyDate(t * 1000)] = +cl[i].toFixed(4); });
  const m = res.meta || {};
  if (m.regularMarketPrice > 80 && m.regularMarketTime) out[nyDate(m.regularMarketTime * 1000)] = +m.regularMarketPrice.toFixed(4);
  return { bars: out, time: m.regularMarketTime || null };
}

async function policy() {
  // returns { "YYYY-MM-DD": { effr, lower, upper } } for the last ~3 months
  const from = new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10), out = {};
  try {
    const t = await (await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR,DFEDTARL,DFEDTARU&cosd=${from}`)).text();
    const lines = t.trim().split(/\r?\n/), head = lines[0].split(",");
    for (const ln of lines.slice(1)) {
      const f = ln.split(","), row = {};
      head.forEach((h, i) => { if (i) row[h.trim()] = parseFloat(f[i]); });
      out[f[0]] = { effr: row.EFFR, lower: row.DFEDTARL, upper: row.DFEDTARU };
    }
    log("FRED rows:", Object.keys(out).length);
  } catch (e) { log("FRED failed:", e.message); }
  try {
    const j = await (await get("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/60.json", { Accept: "application/json" })).json();
    for (const r of j?.refRates || []) {
      const o = out[r.effectiveDate] || (out[r.effectiveDate] = {});
      if (!isFinite(o.effr)) o.effr = +r.percentRate;
      if (!isFinite(o.lower) && r.targetRateFrom != null) o.lower = +r.targetRateFrom;
      if (!isFinite(o.upper) && r.targetRateTo != null) o.upper = +r.targetRateTo;
    }
    log("NY Fed rows:", (j?.refRates || []).length);
  } catch (e) { log("NY Fed failed:", e.message); }
  return out;
}
// policy on a date: the latest known row on or before it, else the KNOWN table
function policyOn(date, rows) {
  const keys = Object.keys(rows).filter((k) => k <= date && isFinite(rows[k].effr)).sort();
  const known = KNOWN.filter((k) => k[0] <= date).at(-1) || KNOWN[0];
  let lower = known[1], effr = known[3];
  const kl = Object.keys(rows).filter((k) => k <= date && isFinite(rows[k].lower)).sort().at(-1);
  if (kl) lower = rows[kl].lower;
  if (keys.length) { const e = rows[keys.at(-1)].effr; if (e >= lower - 0.05 && e <= lower + 0.3) effr = e; }
  return { effr, lower };
}

async function main() {
  let prev = { snapshots: [] };
  try { prev = JSON.parse(readFileSync("data/fedwatch.json", "utf8")); } catch {}
  const today = nyDate(Date.now());
  // contracts from ~6 weeks ago through the month after the last listed meeting
  const months = [];
  for (let m = addMonth(ym(today), -2); m <= addMonth(ym(FOMC.at(-1)), 1); m = addMonth(m)) months.push(m);
  const px = {}; let latest = 0, ok = 0;
  for (const m of months) {
    try { const y = await yahooDaily(zq(m)); px[m] = y.bars; if (Object.keys(y.bars).length) ok++; if (y.time > latest) latest = y.time; }
    catch (e) { log(zq(m), "failed:", e.message); }
  }
  log(`contracts with data: ${ok}/${months.length}`);
  const rows = await policy();
  const dates = [...new Set(Object.values(px).flatMap((b) => Object.keys(b)))].sort().filter((d) => d >= nyDate(Date.now() - 45 * 864e5));
  const snaps = [];
  for (const d of dates) {
    const prices = {};
    for (const m of months) { const b = px[m] || {}; if (b[d] != null) prices[m] = b[d]; }
    const { effr, lower } = policyOn(d, rows);
    const s = snapshot(d, prices, effr, lower);
    if (s.meetings.length >= 2) snaps.push(s);
  }
  // keep earlier snapshots from the previous file that this run could not rebuild
  const have = new Set(snaps.map((s) => s.d)), cut = nyDate(Date.now() - 45 * 864e5);
  for (const s of prev.snapshots || []) if (!have.has(s.d) && s.d >= cut) snaps.push(s);
  snaps.sort((a, b) => (a.d < b.d ? -1 : 1));
  if (!snaps.length) { log("no snapshots; keeping the previous file"); return; }
  const now = snaps.at(-1);
  mkdirSync("data", { recursive: true });
  writeFileSync("data/fedwatch.json", JSON.stringify({ updated: Math.floor(Date.now() / 1000), quoteTime: latest || null,
    source: "CBOT 30-day fed funds futures via Yahoo Finance; EFFR and target range from FRED / New York Fed", snapshots: snaps }));
  const nm = now.meetings[0];
  log(`snapshots: ${snaps.length}, latest ${now.d}; next ${nm?.d} implied ${nm?.rate} (${nm?.move}bp)`);
  summary(`- Fed funds: ${snaps.length} daily snapshots, latest ${now.d}; next meeting ${nm?.d} ${nm?.move >= 0 ? "+" : ""}${nm?.move}bp priced`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
