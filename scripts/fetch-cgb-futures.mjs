// China tab: CGB (China government bond) futures on CFFEX — TS (2-year), TF (5-year), T (10-year), TL (30-year).
//  - Delayed quote for each listed contract (the three nearest quarterly months): Sina Finance hq feed
//    (CFF_RE_<code>), which runs a few minutes behind the exchange.
//  - Daily OHLC / volume / open interest: Sina Finance daily K-line, for each listed contract and for Sina's
//    continuous main-contract series (<product>0), which rolls to the most active contract.
//  - Intraday 5-minute bars for the main contract (last few sessions).
//  - Official settlement price: CFFEX daily statistics XML (cffex.com.cn), when published after the close.
// Futures-implied yield (the yield equivalent of a futures price), computed on the cheapest-to-deliver bond:
//  1. Deliverable basket from data/china.json (regular coupon CGBs, CFFEX remaining-term and original-term
//     rules per product), cash yield = today's CFETS traded yield, else the CCDC curve at its remaining term.
//  2. CFFEX conversion factor for each bond; implied repo rate = (futures × CF + accrued at delivery + coupons
//     paid before delivery − dirty price today) / dirty price today, annualised. Highest implied repo = CTD.
//  3. Implied yield = the CTD's yield to maturity at the delivery date when its clean price is futures × CF.
// The daily history applies today's CTD and conversion factor to each day's close (the listed contract where
// it traded, Sina's continuous main contract before that). If the basket cannot be built, the notional bond
// (3% annual coupon, 2/5/10/30 years) is used instead and marked as such.
// Anything that fails keeps the previous file's values. Writes data/cgb-futures.json.
// Usage: node scripts/fetch-cgb-futures.mjs
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SINA = { "User-Agent": UA, Referer: "https://finance.sina.com.cn/futures/quotes/T0.shtml", Accept: "*/*" };
const FILE = "data/cgb-futures.json";
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const num = (v) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(x) ? x : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bj = (ms) => new Date(ms + 8 * 3600e3); // Beijing wall clock in UTC fields
const PRODUCTS = [
  { p: "TS", name: "2-Year", term: 2, face: "RMB 2m" },
  { p: "TF", name: "5-Year", term: 5, face: "RMB 1m" },
  { p: "T", name: "10-Year", term: 10, face: "RMB 1m" },
  { p: "TL", name: "30-Year", term: 30, face: "RMB 1m" },
];
const COUPON = 3; // CFFEX notional bond coupon, % a year, paid annually

// Yield (% a year) at which the notional bond with `n` annual coupons of 3 is worth `px` per 100 face.
export function impliedYield(px, n) {
  if (!(px > 0)) return null;
  const pv = (y) => { let s = 0; const r = 1 + y / 100; for (let k = 1; k <= n; k++) s += COUPON / r ** k; return s + 100 / r ** n; };
  let lo = -5, hi = 20;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (pv(m) > px) lo = m; else hi = m; }
  return +((lo + hi) / 2).toFixed(4);
}

// ---------- bond math (actual/actual, China interbank convention) ----------
const DAY = 864e5;
const ms = (d) => Date.parse(d + "T00:00:00Z");
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addM = (d, k) => { // same day-of-month k months later, clamped to month end
  const t = new Date(ms(d)), y = t.getUTCFullYear(), m = t.getUTCMonth() + k, day = t.getUTCDate();
  const end = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(Date.UTC(y, m, Math.min(day, end)));
};
const FREQ = { yearly: 1, "semi-annual": 2 };
function schedule(b) { // coupon dates, ascending, last = maturity
  const step = 12 / b.f, out = [];
  for (let k = 0; ; k++) { const d = addM(b.mat, -step * k); if (d <= b.issue) break; out.push(d); if (k > 400) break; }
  return out.reverse();
}
function period(b, s) { // previous / next coupon dates around settlement s
  const i = b.cpns.findIndex((d) => d > s);
  if (i < 0) return null;
  return { pc: i ? b.cpns[i - 1] : addM(b.cpns[0], -12 / b.f), nc: b.cpns[i], n: b.cpns.length - i };
}
const accrued = (b, s) => { const p = period(b, s); return p ? (b.c / b.f) * (ms(s) - ms(p.pc)) / (ms(p.nc) - ms(p.pc)) : 0; };
function dirty(b, y, s) {
  const p = period(b, s); if (!p) return null;
  const cf = b.c / b.f, r = y / 100;
  if (p.n === 1) return (100 + cf) / (1 + r * (ms(b.mat) - ms(s)) / DAY / 365);
  const w = (ms(p.nc) - ms(s)) / (ms(p.nc) - ms(p.pc)), q = 1 + r / b.f;
  let v = 0;
  for (let i = 0; i < p.n; i++) v += cf / q ** (w + i);
  return v + 100 / q ** (w + p.n - 1);
}
function ytm(b, dp, s) {
  let lo = -3, hi = 15;
  for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (dirty(b, m, s) > dp) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// CFFEX conversion factor; dm = first day of the delivery month
function convFactor(b, dm, del) {
  const r = COUPON / 100, c = b.c / 100, f = b.f;
  const after = b.cpns.filter((d) => d > del);
  if (!after.length) return null;
  const nx = after[0], x = (new Date(ms(nx)).getUTCFullYear() - new Date(ms(dm)).getUTCFullYear()) * 12 + new Date(ms(nx)).getUTCMonth() - new Date(ms(dm)).getUTCMonth();
  const n = after.length, q = 1 + r / f;
  const v = (1 / q) ** (x * f / 12) * (c / f + c / r + (1 - c / r) / q ** (n - 1)) - (c / f) * (1 - x * f / 12);
  return +v.toFixed(4);
}
// contract dates: last trading day = second Friday of the delivery month; delivery = 3 business days later
function contractDates(code) {
  const yy = 2000 + +code.slice(-4, -2), mm = +code.slice(-2);
  const first = new Date(Date.UTC(yy, mm - 1, 1)), fri = 1 + ((5 - first.getUTCDay() + 7) % 7) + 7;
  return { dm: iso(Date.UTC(yy, mm - 1, 1)), ltd: iso(Date.UTC(yy, mm - 1, fri)), del: iso(Date.UTC(yy, mm - 1, fri + 5)) };
}
// CFFEX deliverable rules: remaining term on the first day of the delivery month, and original term
const BASKET = { TS: [1.5, 2.25, 5], TF: [4, 5.25, 7], T: [6.5, 10.25, 10], TL: [25, 99, 30] };
function ctdFor(p, code, F, bonds, today) {
  const { dm, del } = contractDates(code), [lo, hi, orig] = BASKET[p];
  const days = (ms(del) - ms(today)) / DAY;
  if (!(F > 0) || days <= 0) return null;
  let best = null, n = 0;
  for (const b of bonds) {
    const rem = (ms(b.mat) - ms(dm)) / DAY / 365.25;
    if (rem < lo || rem > hi || b.term > orig) continue;
    const y = b.last ?? b.curve; if (y == null) continue;
    const cf = convFactor(b, dm, del); if (!cf) continue;
    n++;
    const dp0 = dirty(b, y, today), cpn = b.cpns.filter((d) => d > today && d <= del).length * (b.c / b.f);
    const inv = F * cf + accrued(b, del);
    const irr = (inv + cpn - dp0) / dp0 * 365 / days * 100;
    const clean0 = dp0 - accrued(b, today);
    const x = { code: b.code, name: b.name, coupon: b.c, mat: b.mat, cf, irr: +irr.toFixed(3), cashYield: +(+y).toFixed(4), cashPx: +clean0.toFixed(4), basis: +((clean0 - F * cf) * 100).toFixed(1) };
    if (!best || x.irr > best.irr) best = { ...x, b };
  }
  if (!best) return null;
  const yImp = ytm(best.b, F * best.cf + accrued(best.b, del), del);
  const { b, ...rest } = best;
  return { ...rest, del, basket: n, y: +yImp.toFixed(4), _b: b };
}
const ctdYield = (ctd, F) => F > 0 ? +ytm(ctd._b, F * ctd.cf + accrued(ctd._b, ctd.del), ctd.del).toFixed(4) : null;

async function get(url, headers = SINA, enc = "gbk") {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
  const buf = await r.arrayBuffer();
  try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder().decode(buf); }
}
const jsonArr = (txt) => { const a = txt.indexOf("["), b = txt.lastIndexOf("]"); return a >= 0 && b > a ? JSON.parse(txt.slice(a, b + 1)) : null; };

// Listed contracts: the three nearest quarterly months (Mar/Jun/Sep/Dec) that have not reached their last
// trading day (the second Friday of the delivery month).
function listed(now = Date.now()) {
  const t = bj(now), out = [];
  let y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  while (m % 3) m++;
  if (m > 12) { m -= 12; y++; }
  while (out.length < 3) {
    const first = new Date(Date.UTC(y, m - 1, 1)), fri = 1 + ((5 - first.getUTCDay() + 7) % 7) + 7;
    const last = Date.UTC(y, m - 1, fri, 7, 15) - 8 * 3600e3; // 15:15 Beijing on the second Friday
    if (now < last + 864e5) out.push(`${String(y).slice(2)}${String(m).padStart(2, "0")}`);
    m += 3; if (m > 12) { m -= 12; y++; }
  }
  return out;
}

let prev = {};
try { prev = JSON.parse(readFileSync(FILE, "utf8")); } catch { log("no previous cgb-futures.json"); }
const prevP = Object.fromEntries((prev.products || []).map((x) => [x.p, x]));
const months = listed();
log(`listed months: ${months.join(", ")}`);

// ---------- 1. delayed quotes, all contracts in one request ----------
const codes = PRODUCTS.flatMap(({ p }) => months.map((m) => p + m));
const quotes = {};
try {
  const txt = await get(`https://hq.sinajs.cn/list=${codes.map((c) => "CFF_RE_" + c).join(",")}`);
  for (const m of txt.matchAll(/hq_str_CFF_RE_([A-Z]+\d{4})="([^"]*)"/g)) {
    const f = m[2].split(",");
    if (f.length < 10) continue;
    const date = f.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) || null, time = f.find((x) => /^\d{2}:\d{2}:\d{2}$/.test(x)) || null;
    quotes[m[1]] = { open: num(f[0]), high: num(f[1]), low: num(f[2]), last: num(f[3]), vol: num(f[4]), amt: num(f[5]), oi: num(f[6]), prevClose: num(f[13]), prevSettle: num(f[14]), prevOi: num(f[15]), date, time };
  }
  log(`quotes: ${Object.keys(quotes).length}/${codes.length}`);
} catch (e) { log(`quotes failed: ${e.message}`); }

// ---------- 2. daily K-lines (each contract + continuous main) and intraday ----------
const kline = async (sym) => {
  const a = jsonArr(await get(`https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/InnerFuturesNewService.getDailyKLine?symbol=${sym}&_=${Date.now()}`));
  return (a || []).map((x) => [x.d, num(x.o), num(x.h), num(x.l), num(x.c), num(x.v), num(x.p), num(x.s)]).filter((r) => r[0] && r[4] != null);
};
const minline = async (sym) => {
  const a = jsonArr(await get(`https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/InnerFuturesNewService.getFewMinLine?symbol=${sym}&type=5&_=${Date.now()}`));
  return (a || []).map((x) => [String(x.d).slice(0, 16), num(x.o), num(x.h), num(x.l), num(x.c), num(x.v), num(x.p)]).filter((r) => r[0] && r[4] != null);
};

// ---------- 3. CFFEX official daily statistics (settlement), latest published trading day ----------
const cffex = {};
let cffexDate = null;
for (let i = 0; i < 6 && !cffexDate; i++) {
  const d = bj(Date.now() - i * 864e5), wd = d.getUTCDay();
  if (wd === 0 || wd === 6) continue;
  const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`, dd = String(d.getUTCDate()).padStart(2, "0");
  try {
    const xml = await get(`http://www.cffex.com.cn/sj/hqsj/rtj/${ym}/${dd}/index.xml`, { "User-Agent": UA, Referer: "http://www.cffex.com.cn/rtj/" }, "utf-8");
    for (const b of xml.matchAll(/<dailydata>([\s\S]*?)<\/dailydata>/g)) {
      const tag = (t) => (b[1].match(new RegExp(`<${t}>\\s*([^<]*)\\s*</${t}>`)) || [])[1]?.trim();
      const id = tag("instrumentid");
      if (!id || !/^(TS|TF|T|TL)\d{4}$/.test(id)) continue;
      cffex[id] = { settle: num(tag("settlementprice")), close: num(tag("closeprice")), oi: num(tag("openinterest")), vol: num(tag("volume")), prevSettle: num(tag("presettlementprice")) };
    }
    if (Object.keys(cffex).length) { cffexDate = `${ym.slice(0, 4)}-${ym.slice(4)}-${dd}`; log(`CFFEX daily ${cffexDate}: ${Object.keys(cffex).length} CGB contracts`); }
  } catch (e) { log(`CFFEX ${ym}${dd} failed: ${e.message}`); }
}

// ---------- deliverable bonds (regular coupon CGBs) ----------
const todayBJ = iso(bj(Date.now()).getTime());
let bonds = [];
try {
  const china = JSON.parse(readFileSync("data/china.json", "utf8"));
  let master = { bonds: {} };
  try { master = JSON.parse(readFileSync("data/cgb-master.json", "utf8")); } catch {}
  const byCode = {}; for (const v of Object.values(master.bonds || {})) byCode[v.code] = v;
  const termY = (t) => { const m = String(t || "").match(/^(\d+(?:\.\d+)?)([YMD])$/); return m ? +m[1] / ({ Y: 1, M: 12, D: 365 })[m[2]] : 99; };
  for (const x of china.bonds || []) {
    if (x.type !== "Coupon" || !(x.coupon > 0) || !x.mat || !x.issue) continue;
    const f = FREQ[byCode[x.code]?.freq] || (termY(x.term) >= 10 ? 2 : 1);
    const b = { code: x.code, name: x.name, c: x.coupon, f, issue: x.issue, mat: x.mat, term: termY(x.term), last: x.last ?? null, curve: x.curve ?? null };
    b.cpns = schedule(b);
    if (b.cpns.length) bonds.push(b);
  }
  log(`deliverable candidates: ${bonds.length} coupon CGBs (china.json ${china.tradeDay || china.curve?.date})`);
} catch (e) { log(`bond list unavailable: ${e.message}; using the notional bond`); }

// ---------- assemble ----------
const products = [];
let ok = 0;
for (const P of PRODUCTS) {
  const old = prevP[P.p] || {};
  const oldC = Object.fromEntries((old.contracts || []).map((c) => [c.code, c]));
  const chist = {};
  for (const m of months) {
    const code = P.p + m;
    try { chist[code] = (await kline(code)).slice(-260); } catch (e) { log(`kline ${code} failed: ${e.message}`); chist[code] = old.chist?.[code] || []; }
    await sleep(200);
  }
  let hist = [];
  try { hist = (await kline(P.p + "0")).slice(-560); } catch (e) { log(`kline ${P.p}0 failed: ${e.message}`); }
  if (hist.length < 20) hist = old.hist || hist;

  const contracts = months.map((m) => {
    const code = P.p + m, q = quotes[code], k = chist[code] || [], o = oldC[code] || {}, x = cffex[code] || {};
    const lastK = k.at(-1), prevK = k.at(-2);
    const last = q?.last || lastK?.[4] || o.last || null;
    // reference for the change: previous settlement from the quote, else the previous day's settle/close
    const ref = q?.prevSettle || (q?.date && lastK?.[0] === q.date ? (prevK?.[7] || prevK?.[4]) : (lastK?.[7] || lastK?.[4])) || o.prevSettle || null;
    const chg = last != null && ref ? +(last - ref).toFixed(3) : null;
    return {
      code, last, prevSettle: ref, chg, chgPct: chg != null ? +(chg / ref * 100).toFixed(3) : null,
      open: q?.open || lastK?.[1] || null, high: q?.high || lastK?.[2] || null, low: q?.low || lastK?.[3] || null,
      vol: q?.vol ?? lastK?.[5] ?? null, oi: q?.oi || lastK?.[6] || x.oi || null,
      settle: x.settle ?? null, settleDate: x.settle != null ? cffexDate : null,
      date: q?.date || lastK?.[0] || o.date || null, time: q?.time || o.time || null,
    };
  });
  for (const c of contracts) {
    let ctd = null;
    try { ctd = bonds.length ? ctdFor(P.p, c.code, c.last, bonds, todayBJ) : null; } catch (e) { log(`CTD ${c.code} failed: ${e.message}`); }
    c.ctd = ctd;
    c.method = ctd ? "ctd" : "notional";
    c.y = ctd ? ctd.y : impliedYield(c.last, P.term);
    c.yRef = ctd ? ctdYield(ctd, c.prevSettle) : impliedYield(c.prevSettle, P.term);
    c.yChg = c.y != null && c.yRef != null ? +((c.y - c.yRef) * 100).toFixed(2) : null; // bp
    c.yN = impliedYield(c.last, P.term);
  }
  if (contracts.some((c) => c.last)) ok++;
  const main = [...contracts].sort((a, b) => (b.oi || 0) - (a.oi || 0))[0]?.code || old.main || null;
  let intra = [];
  if (main) { try { intra = await minline(main); } catch (e) { log(`intraday ${main} failed: ${e.message}`); } }
  const days = [...new Set(intra.map((r) => r[0].slice(0, 10)))].slice(-5);
  intra = intra.filter((r) => days.includes(r[0].slice(0, 10)));
  if (!intra.length && old.main === main) intra = old.intra || [];
  // daily implied yield: today's CTD of the main contract applied to each day's close of the main contract,
  // and to Sina's continuous main series before the main contract was the one trading
  const mc = contracts.find((c) => c.code === main), mk = new Map((chist[main] || []).filter((r) => (r[5] || 0) > 0).map((r) => [r[0], r[4]]));
  const yOf = (F) => mc?.ctd ? ctdYield(mc.ctd, F) : impliedYield(F, P.term);
  const yhist = hist.map((r) => [r[0], yOf(mk.get(r[0]) ?? r[4])]).filter((r) => r[1] != null);
  for (const c of contracts) delete c.ctd?._b;
  products.push({ ...P, main, method: mc?.method || "notional", contracts, hist, yhist, chist, intra });
  log(`${P.p}: main ${main}, last ${contracts.find((c) => c.code === main)?.last}, hist ${hist.length}, intraday ${intra.length}`);
}

const times = products.flatMap((p) => p.contracts).filter((c) => c.date && c.time).map((c) => `${c.date} ${c.time}`).sort();
const out = {
  updated: Math.floor(Date.now() / 1000),
  quoteTime: times.at(-1) || prev.quoteTime || null, // Beijing time of the latest quote
  settleDate: cffexDate || prev.settleDate || null,
  coupon: COUPON,
  products: ok ? products : prev.products || products,

};
mkdirSync("data", { recursive: true });
writeFileSync(FILE, JSON.stringify(out));
summary(`### CGB futures\n${products.map((p) => `- ${p.p} main ${p.main}: ${p.contracts.find((c) => c.code === p.main)?.last ?? "–"}`).join("\n")}\nQuote time ${out.quoteTime} Beijing`);
log(`wrote ${FILE}; quote time ${out.quoteTime}`);
