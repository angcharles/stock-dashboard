// China tab data: the ChinaBond (CCDC) China government bond yield curve, standard-tenor history, and every
// outstanding CGB by bond code and ISIN with its CCDC curve yield and today's CFETS interbank traded yield.
//  - CCDC curve: yield.chinabond.com.cn searchYc, 中债国债收益率曲线 (到期 / yield to maturity), latest published day.
//  - CCDC history: queryYz, one year of daily closes for the standard tenors.
//  - Bonds: data/cgb-master.json (built by fetch-cgb-master.mjs from CFETS bond info) plus the CFETS cash-bond
//    trade feed (CbtPri), which gives the latest and weighted-average traded yield of each bond traded today.
// The curve yield shown for each bond is the CCDC curve read at that bond's remaining term (linear between
// CCDC's curve points); "vs curve" is the CFETS traded yield minus that, in basis points.
// Anything that fails keeps the previous file's values. Writes data/china.json. Usage: node scripts/fetch-china.mjs
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const CCDC = { "User-Agent": UA, Accept: "application/json, text/javascript, */*", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: "https://yield.chinabond.com.cn/cbweb-mn/yield_main?locale=zh_CN", Origin: "https://yield.chinabond.com.cn", "X-Requested-With": "XMLHttpRequest" };
const CFETS = { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://www.chinamoney.com.cn/", Origin: "https://www.chinamoney.com.cn", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" };
const CGB = "2c9081e50a2f9606010a3068cae70001"; // 中债国债收益率曲线
const TENORS = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 50];
const shDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
const today = shDate(Date.now());
const addDays = (d, n) => shDate(Date.parse(d + "T12:00:00+08:00") + n * 864e5);
async function post(url, headers, body = "") {
  const r = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
  return r.json();
}

let prev = {};
try { prev = JSON.parse(readFileSync("data/china.json", "utf8")); } catch {}
let master = { bonds: {} };
try { master = JSON.parse(readFileSync("data/cgb-master.json", "utf8")); } catch { log("no data/cgb-master.json yet"); }

// 1. Latest CCDC curve (walk back over holidays / before today's curve is published)
let curve = null;
for (let i = 0; i < 10 && !curve; i++) {
  const d = addDays(today, -i);
  try {
    const j = await post(`https://yield.chinabond.com.cn/cbweb-mn/yc/searchYc?xyzSelect=txy&&workTimes=${d}&&dxbj=0&&qxll=0,&&yqqxN=N&&yqqxK=K&&ycDefIds=${CGB},&&wrjxCBFlag=0&&locale=zh_CN`, CCDC);
    const s = (Array.isArray(j) ? j : []).find((x) => x?.seriesData?.length > 10);
    if (s) curve = { date: s.worktime || d, pts: s.seriesData.map(([t, y]) => [+(+t).toFixed(4), +(+y).toFixed(4)]).filter(([t, y]) => isFinite(t) && isFinite(y)) };
  } catch (e) { log(`curve ${d} failed: ${e.message}`); }
}
if (!curve) { curve = prev.curve || null; log("curve: kept previous"); } else log(`curve: ${curve.date}, ${curve.pts.length} points`);

// 2. CCDC standard-tenor history, one year
let tenors = {};
try {
  const dcq = TENORS.map((t) => `${t},${t}y;`).join("");
  const j = await post(`https://yield.chinabond.com.cn/cbweb-mn/yc/queryYz?bjlx=no&&dcq=${dcq}&&startTime=${addDays(today, -370)}&&endTime=${today}&&qxlx=0,&&yqqxN=N&&yqqxK=K&&par=day&&ycDefIds=${CGB},&&locale=zh_CN`, CCDC);
  for (const s of Array.isArray(j) ? j : []) {
    const t = parseFloat(String(s.ycDefId || "").slice(CGB.length));
    if (!isFinite(t) || !s.seriesData?.length) continue;
    const d = s.seriesData.map(([ms, y]) => [shDate(ms), +(+y).toFixed(4)]).filter(([, y]) => isFinite(y)).sort((a, b) => a[0] < b[0] ? -1 : 1);
    tenors[t] = d;
  }
} catch (e) { log(`history failed: ${e.message}`); }
for (const t of TENORS) if (!tenors[t]?.length && prev.tenors?.[t]) tenors[t] = prev.tenors[t];
// make sure each tenor's last point is the latest curve day
const interp = (pts, x) => {
  if (!pts?.length || !isFinite(x)) return null;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts.at(-1)[1];
};
if (curve) for (const t of TENORS) {
  const h = tenors[t] || (tenors[t] = []), y = interp(curve.pts, t);
  if (y == null) continue;
  if (!h.length || h.at(-1)[0] < curve.date) h.push([curve.date, +y.toFixed(4)]);
}
log("tenors:", TENORS.map((t) => `${t}Y ${tenors[t]?.at(-1)?.[1] ?? "–"}`).join(" · "));

// 3. CFETS cash-bond trades today
let trades = {}, tradeTime = null;
try {
  const j = await post("https://www.chinamoney.com.cn/ags/ms/cm-u-md-bond/CbtPri?flag=1&lang=cn&abdAssetEncdShrtDesc=&emaEntyEncdShrtDesc=", CFETS);
  for (const r of j?.records || []) {
    const name = r.abdAssetEncdFullDescByRmb || r.abdAssetEncdShrtDesc || "";
    if (!(master.bonds?.[r.bondcode] || /国债/.test(name))) continue;
    const num = (v) => { const x = parseFloat(v); return isFinite(x) ? x : null; };
    trades[r.bondcode] = { name, isin: r.isinCode && r.isinCode !== "---" ? r.isinCode : null, last: num(r.dmiLatestContraRate), wavg: num(r.dmiWghtdContraRate), px: num(r.dmiLatestRate), chg: num(r.bpNum), ttm: r.termToMaturity, t: r.showDate };
    if (r.showDate && (!tradeTime || r.showDate > tradeTime)) tradeTime = r.showDate;
  }
  log(`CFETS trades: ${Object.keys(trades).length} CGBs`);
} catch (e) { log(`trades failed: ${e.message}`); }
if (!Object.keys(trades).length && prev.tradeDay === today) { // keep this session's earlier read
  for (const b of prev.bonds || []) if (b.last != null) trades[b.code] = { name: b.name, isin: b.isin, last: b.last, wavg: b.wavg, px: b.px, chg: b.chg, t: prev.tradeTime };
  tradeTime = prev.tradeTime;
}

// 4. Bonds: outstanding CGBs from the master list, plus anything traded that the list does not have yet
const typeOf = (n = "") => /贴现/.test(n) ? "Discount" : /超长期?特别/.test(n) ? "Ultra-long special" : /特别/.test(n) ? "Special" : /储蓄/.test(n) ? "Savings" : "Coupon";
const ttmYears = (mat, fallback) => {
  if (mat) return (Date.parse(mat) - Date.parse(today)) / (365.25 * 864e5);
  const m = String(fallback || "").match(/([\d.]+)\s*([YD])/i);
  return m ? (m[2].toUpperCase() === "D" ? +m[1] / 365 : +m[1]) : null;
};
const rows = new Map();
for (const b of Object.values(master.bonds || {})) {
  if (b.matured || !b.mat || b.mat < today) continue;
  if (/储蓄/.test(b.name || "")) continue; // savings bonds are not traded in the interbank market
  rows.set(b.code, { ...b });
}
for (const [code, tr] of Object.entries(trades)) if (!rows.has(code) && !/储蓄/.test(tr.name)) rows.set(code, { code, name: tr.name, isin: tr.isin });
const bonds = [];
for (const b of rows.values()) {
  const tr = trades[b.code] || {};
  const ttm = ttmYears(b.mat, tr.ttm);
  if (ttm == null || ttm <= 0) continue;
  const cy = curve ? interp(curve.pts, ttm) : null;
  const o = {
    code: b.code, isin: b.isin || tr.isin || null, name: b.name || tr.name || null, type: typeOf(b.name || tr.name),
    coupon: b.coupon ?? null, issue: b.issue || null, mat: b.mat || null, term: b.term || null, ttm: +ttm.toFixed(3),
    curve: cy == null ? null : +cy.toFixed(4),
    last: tr.last ?? null, wavg: tr.wavg ?? null, px: tr.px ?? null, chg: tr.chg ?? null,
  };
  o.vs = o.last != null && o.curve != null ? +((o.last - o.curve) * 100).toFixed(1) : null;
  bonds.push(o);
}
bonds.sort((a, b) => a.ttm - b.ttm || (a.code < b.code ? -1 : 1));

const out = {
  updated: Math.floor(Date.now() / 1000),
  src: "ChinaBond (CCDC) China government bond yield curve (yield to maturity); bond list and ISINs from CFETS bond information; traded yields from the CFETS interbank cash-bond trade feed",
  curve, tenors, bonds, tradeDay: Object.keys(trades).length ? today : prev.tradeDay || null, tradeTime,
  masterUpdated: master.updated || null,
};
mkdirSync("data", { recursive: true });
writeFileSync("data/china.json", JSON.stringify(out));
const msg = `China: CCDC curve ${curve?.date ?? "none"}, 10Y ${tenors[10]?.at(-1)?.[1] ?? "–"}; ${bonds.length} bonds (${bonds.filter((b) => b.isin).length} with ISIN, ${bonds.filter((b) => b.last != null).length} traded today)`;
log(msg); summary(`- ${msg}`);
if (!curve && !bonds.length) process.exit(1);
