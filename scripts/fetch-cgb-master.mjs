// China government bond master list for the China tab: every CGB the CFETS bond-info service lists,
// keyed by bond code, with its ISIN, Chinese short name, issue date, maturity, coupon and original term.
// Source: CFETS / chinamoney.com.cn bond info (English list for ISINs, Chinese list for names, English detail
// for maturity and coupon). Incremental: known bonds are not re-read, except new issues whose coupon was not
// set yet and bonds whose detail failed earlier, so after the first full run each daily run takes seconds.
// Writes data/cgb-master.json. Usage: node scripts/fetch-cgb-master.mjs [--full]
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const H = { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://www.chinamoney.com.cn/", Origin: "https://www.chinamoney.com.cn", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" };
const BASE = "https://www.chinamoney.com.cn/ags/ms/cm-u-bond-md/";
const FULL = process.argv.includes("--full");
const T0 = Date.now(), BUDGET = 30 * 60 * 1000; // stop and save after 30 minutes; the next run continues
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const blank = (v) => v == null || v === "" || v === "---" ? null : v;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });

async function post(path, body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + path, { method: "POST", headers: H, body, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
const page = (path, n) => post(path, `pageNo=${n}&pageSize=15&bondName=&bondCode=&issueEnty=&bondType=100001&bondSpclPrjctVrty=&couponType=&issueYear=&entyDefinedCode=&rtngShrt=`);

let master = { bonds: {} };
try { master = JSON.parse(readFileSync("data/cgb-master.json", "utf8")); } catch {}
const B = master.bonds || (master.bonds = {});

// 1. List pages (newest issue first). Stop once three whole pages are already known, unless --full.
let known = 0, added = 0, pages = 0, total = null;
for (let n = 1; ; n++) {
  if (Date.now() - T0 > BUDGET) { log("time budget reached during list"); break; }
  let en, cn;
  try { [en, cn] = await Promise.all([page("BondMarketInfoListEN", n), page("BondMarketInfoList2", n)]); }
  catch (e) { log(`list page ${n} failed: ${e.message}`); break; }
  const rows = en?.data?.resultList || [];
  if (en?.data?.total) total = en.data.total;
  if (!rows.length) break;
  pages++;
  const names = {};
  for (const r of cn?.data?.resultList || []) names[r.bondDefinedCode] = r.bondName;
  let fresh = 0;
  for (const r of rows) {
    const code = r.bondCode; if (!code) continue;
    const b = B[code] || (B[code] = { code });
    if (!b.def) { fresh++; added++; }
    b.def = r.bondDefinedCode;
    if (blank(r.isin)) b.isin = r.isin;
    if (names[r.bondDefinedCode]) b.name = names[r.bondDefinedCode];
    if (!b.issue && blank(r.issueStartDate)) b.issue = r.issueStartDate;
  }
  known = fresh ? 0 : known + 1;
  if (!FULL && known >= 3 && Object.keys(B).length > 200) break;
  await sleep(150);
}
log(`list: ${pages} pages read, ${added} new bonds, CFETS total ${total}`);

// 2. Detail (maturity, coupon, term, ISIN) for bonds that need it.
const daysSince = (d) => (Date.parse(today) - Date.parse(d)) / 864e5;
const need = Object.values(B).filter((b) => b.def && !b.matured && (
  !b.mat || !b.isin ||
  (b.coupon == null && !/贴现/.test(b.name || "") && b.issue && daysSince(b.issue) < 60)));
log(`detail: ${need.length} bonds to read`);
let done = 0, fail = 0;
async function detail(b) {
  try {
    const j = await post("BondDetailInfoEN", `bondDefinedCode=${b.def}`);
    const d = j?.data?.bondBaseInfo; if (!d) throw new Error("no bondBaseInfo");
    if (blank(d.isinCode)) b.isin = d.isinCode;
    if (blank(d.mrtyDate)) b.mat = d.mrtyDate;
    if (blank(d.issueDate)) b.issue = d.issueDate;
    if (blank(d.bondPeriod)) b.term = d.bondPeriod.replace(/Year/i, "Y").replace(/Month/i, "M").replace(/Day/i, "D");
    const cp = parseFloat(blank(d.parCouponRate) ?? "");
    if (isFinite(cp)) b.coupon = cp;
    if (blank(d.couponFrqncy)) b.freq = d.couponFrqncy.replace("seminnually", "semi-annual");
    const amt = parseFloat(blank(d.issueAmnt) ?? "");
    if (isFinite(amt)) b.amt = amt; // first tranche, CNY 100 million
    done++;
  } catch (e) { fail++; if (fail <= 5) log(`detail ${b.code} failed: ${e.message}`); }
}
for (let i = 0; i < need.length; i += 4) {
  if (Date.now() - T0 > BUDGET) { log("time budget reached during detail; the next run continues"); break; }
  await Promise.all(need.slice(i, i + 4).map(detail));
  await sleep(200);
  if (i % 200 === 0 && i) log(`  ${i} / ${need.length}`);
}
for (const b of Object.values(B)) b.matured = !!(b.mat && b.mat < today);

const live = Object.values(B).filter((b) => !b.matured && b.mat);
master.updated = Math.floor(Date.now() / 1000);
master.src = "CFETS (chinamoney.com.cn) bond information: English list and detail for ISIN, maturity and coupon; Chinese list for names";
mkdirSync("data", { recursive: true });
writeFileSync("data/cgb-master.json", JSON.stringify(master));
const msg = `CGB master: ${Object.keys(B).length} bonds on file, ${live.length} outstanding, ${live.filter((b) => b.isin).length} with ISIN; detail read ${done}, failed ${fail}`;
log(msg); summary(`- ${msg}`);
