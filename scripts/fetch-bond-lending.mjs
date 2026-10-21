// China tab: interbank bond lending (债券借贷) fee rates from CFETS (chinamoney.com.cn).
//  - Daily bulletin (债券借贷日报, cm-u-dlrp/BdcDlyBltn): open / close / high / low / weighted-average lending fee
//    and volume for each tenor (L001, L007, L014, L021, L1M ... L1Y). CFETS only serves roughly the last two
//    weeks, so this script keeps every day it has seen in data/bond-lending.json and adds new days on each run;
//    the history grows from there.
//  - Monthly bulletin (债券借贷月报, cm-u-query-mlrp/BdcMthBltn): weighted fee, deal count and amount by tenor,
//    and amount by bond type (CGB, policy bank, local government ...), back to October 2023.
// CFETS and CCDC publish lending fees by tenor, not by individual bond code or ISIN; see the page note.
// Anything that fails keeps the previous file's values. Usage: node scripts/fetch-bond-lending.mjs
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const B = "https://www.chinamoney.com.cn";
const H = { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: `${B}/chinese/mtdexdaily/`, Origin: B, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" };
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const FILE = "data/bond-lending.json";
const PUB = 2200; // BDC_PUBLISHED_TIME on chinamoney: the daily bulletin is released at 22:00 Beijing
const num = (v) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(x) ? x : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(path, body, method = "POST") {
  const r = await fetch(B + path, { method, headers: H, body: method === "POST" ? body : undefined, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
  return r.json();
}
const TYPE_EN = { "国债": "CGB", "政策性金融债": "Policy bank", "地方政府债": "Local government", "二级资本工具": "Tier-2 capital", "无固定期限资本债券": "Perpetual capital", "中期票据": "MTN", "同业存单": "NCD", "商业银行债": "Bank bond", "短期融资券": "CP", "企业债": "Enterprise bond", "合计": "Total" };

let prev = {};
try { prev = JSON.parse(readFileSync(FILE, "utf8")); } catch { log("no previous bond-lending.json"); }
const daily = new Map((prev.daily || []).map((x) => [x.d, x]));
const monthly = new Map((prev.monthly || []).map((x) => [x.m, x]));

// ---------- daily, by tenor ----------
const dayRow = (records) => {
  const r = {};
  for (const x of records || []) {
    if (!x.instrmntCd) continue;
    r[x.instrmntCd] = { o: num(x.openLngdngRate), c: num(x.clsngLngdngRate), h: num(x.hghstLngdngRate), l: num(x.lwstLngdngRate), w: num(x.wghtdAvgLngdngRate), v: num(x.trdVol) };
  }
  return Object.keys(r).length ? r : null;
};
let win = null;
try {
  const j = await call("/ags/ms/cm-u-dlrp/BdcDlyBltn", `lang=cn&searchDate=&publishedTime=${PUB}`);
  win = { start: j?.data?.startDate, end: j?.data?.endDate };
  const d = j?.data?.lastDate, r = dayRow(j?.records);
  if (d && r) daily.set(d, { d, r });
  log(`daily: CFETS serves ${win.start} → ${win.end}`);
} catch (e) {
  log(`daily latest failed: ${e.message}; trying the static bulletin`);
  try {
    const j = await call("/r/cms/www/chinamoney/data/bond/bdc-dly-bltn-mark.json", null, "GET");
    win = { start: j?.data?.startDate, end: j?.data?.endDate };
    const d = j?.data?.lastDate, r = dayRow(j?.records);
    if (d && r) daily.set(d, { d, r });
  } catch (e2) { log(`static daily failed: ${e2.message}`); }
}
if (win?.start && win?.end) { // backfill every weekday CFETS still serves that we have not stored
  for (let t = Date.parse(win.start + "T12:00:00Z"); t <= Date.parse(win.end + "T12:00:00Z"); t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10), wd = new Date(t).getUTCDay();
    if (daily.has(d)) continue;
    try {
      const j = await call("/ags/ms/cm-u-dlrp/BdcDlyBltn", `lang=cn&searchDate=${d}&publishedTime=${PUB}`);
      const r = j?.data?.lastDate === d ? dayRow(j?.records) : null;
      if (r) { daily.set(d, { d, r }); log(`daily ${d}: ${Object.keys(r).length} tenors`); }
      else if (wd !== 0 && wd !== 6) log(`daily ${d}: no deals (holiday?)`);
    } catch (e) { log(`daily ${d} failed: ${e.message}`); }
    await sleep(300);
  }
}

// ---------- monthly, by tenor and by bond type ----------
const proRow = (records) => {
  const r = {};
  for (const x of records || []) { const k = x.typeEN === "Total" ? "Total" : x.type; if (k) r[k] = { w: num(x.rate), n: num(x.cnt), a: num(x.amt) }; }
  return Object.keys(r).length ? r : null;
};
const balRow = (records) => {
  const r = {};
  for (const x of records || []) { const k = TYPE_EN[x.type] || x.typeEN || x.type; if (k) r[k] = num(x.amt); }
  return Object.keys(r).length ? r : null;
};
let months = [], showYM = null;
try {
  const [p, b] = await Promise.all(["pro", "bal"].map((k) => call(`/r/cms/www/chinamoney/data/bond/bdc-mly-bltn-${k}.json`, null, "GET")));
  showYM = p?.data?.showYearMonth;
  const opt = JSON.parse(p?.data?.optionJson || "{}");
  months = Object.entries(opt).flatMap(([y, ms]) => String(ms).split(",").map((m) => `${y}-${m.trim()}`)).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
  if (showYM) { const pro = proRow(p.records), bal = balRow(b.records); if (pro) monthly.set(showYM, { m: showYM, pro, bal: bal || monthly.get(showYM)?.bal || null }); }
  log(`monthly: ${months.length} months available, latest ${showYM}`);
} catch (e) { log(`monthly latest failed: ${e.message}`); }
// earlier months: query each one once; the latest two are always refreshed in case CFETS revises them
let mthOk = null; // remember which yearMonth format the endpoint accepts
for (const m of months) {
  if (m === showYM) continue;
  const have = monthly.get(m);
  if (have?.pro && have?.bal && months.indexOf(m) < months.length - 2) continue;
  const fmts = mthOk ? [mthOk] : ["dash", "plain"];
  for (const f of fmts) {
    const ym = f === "dash" ? m : m.replace("-", "");
    try {
      const [p, b] = await Promise.all(["pro", "bal"].map((k) => call("/ags/ms/cm-u-query-mlrp/BdcMthBltn", `lang=cn&yearMonth=${ym}&indexType=${k}`)));
      const pro = proRow(p?.records), bal = balRow(b?.records);
      if (pro) { monthly.set(m, { m, pro, bal }); mthOk = f; log(`monthly ${m}: ${Object.keys(pro).length} tenors`); break; }
    } catch (e) { log(`monthly ${m} (${f}) failed: ${e.message}`); }
  }
  await sleep(300);
}

// ---------- write ----------
const D = [...daily.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
const M = [...monthly.values()].sort((a, b) => (a.m < b.m ? -1 : 1));
const ORDER = ["L001", "L007", "L014", "L021", "L1M", "L2M", "L3M", "L4M", "L6M", "L9M", "L1Y"];
const seen = new Set([...D.flatMap((x) => Object.keys(x.r)), ...M.flatMap((x) => Object.keys(x.pro || {}))]);
const tenors = [...ORDER.filter((t) => seen.has(t)), ...[...seen].filter((t) => !ORDER.includes(t) && t !== "Total" && t !== "合计").sort()];
const out = {
  updated: Math.floor(Date.now() / 1000),
  src: "CFETS (chinamoney.com.cn) 债券借贷日报 and 债券借贷月报: interbank bond lending fee rates by tenor; monthly amounts by bond type",
  tenors, latestDay: D.at(-1)?.d || null, latestMonth: M.at(-1)?.m || null, cfetsWindow: win,
  daily: D, monthly: M,
};
if (!D.length && !M.length) { log("nothing fetched and no previous file"); process.exit(1); }
mkdirSync("data", { recursive: true });
writeFileSync(FILE, JSON.stringify(out));
const last = D.at(-1);
const msg = `Bond lending: ${D.length} days (${D[0]?.d ?? "–"} → ${last?.d ?? "–"}), L001 ${last?.r?.L001?.w ?? "–"}% · L007 ${last?.r?.L007?.w ?? "–"}%; ${M.length} months (${M[0]?.m ?? "–"} → ${M.at(-1)?.m ?? "–"})`;
log(msg); summary(`- ${msg}`);
