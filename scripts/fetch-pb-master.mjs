// Policy bank bond master list for the China tab: China Development Bank (国开), Agricultural Development Bank
// of China (农发) and Export-Import Bank of China (进出口) bonds, keyed by bond code, with ISIN, issue date,
// maturity and coupon from CFETS bond information (chinamoney.com.cn).
// Which bonds: every policy bank bond seen trading on CFETS, taken from data/china.json (each issuer's traded bonds
// and its running register, written by fetch-china.mjs). Each code is looked up once: the English list searched by
// bond code gives its CFETS internal id, then the English detail gives maturity and coupon. A failed lookup is
// retried on later runs (up to 5 tries), so the list fills in as bonds trade.
// Writes data/pb-master.json. Usage: node scripts/fetch-pb-master.mjs
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const H = { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://www.chinamoney.com.cn/", Origin: "https://www.chinamoney.com.cn", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" };
const BASE = "https://www.chinamoney.com.cn/ags/ms/cm-u-bond-md/";
const T0 = Date.now(), BUDGET = 6 * 60 * 1000; // stop and save after 6 minutes; the next run continues
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

let master = { bonds: {} };
try { master = JSON.parse(readFileSync("data/pb-master.json", "utf8")); } catch {}
const B = master.bonds || (master.bonds = {});
let china = {};
try { china = JSON.parse(readFileSync("data/china.json", "utf8")); } catch { log("no data/china.json yet"); }

// codes to know about: today's traded policy bank bonds plus each issuer's register
for (const [k, p] of Object.entries(china.pb || {})) {
  for (const b of [...(p.bonds || []), ...(p.reg || [])]) {
    if (!b?.code) continue;
    const m = B[b.code] || (B[b.code] = { code: b.code });
    m.issuer = k;
    if (b.name && !m.name) m.name = b.name;
    if (b.isin && !m.isin) m.isin = b.isin;
  }
}

const need = Object.values(B).filter((b) => !b.matured && !b.mat && (b.tries || 0) < 5);
log(`policy bank master: ${Object.keys(B).length} bonds on file, ${need.length} to look up`);
let done = 0, fail = 0;
async function lookup(b) {
  try {
    if (!b.def) {
      const j = await post("BondMarketInfoListEN", `pageNo=1&pageSize=15&bondName=&bondCode=${encodeURIComponent(b.code)}&issueEnty=&bondType=&bondSpclPrjctVrty=&couponType=&issueYear=&entyDefinedCode=&rtngShrt=`);
      const r = (j?.data?.resultList || []).find((x) => x.bondCode === b.code);
      if (!r) throw new Error("not in the CFETS list");
      b.def = r.bondDefinedCode;
      if (blank(r.isin)) b.isin = r.isin;
      if (!b.issue && blank(r.issueStartDate)) b.issue = r.issueStartDate;
    }
    const j = await post("BondDetailInfoEN", `bondDefinedCode=${b.def}`);
    const d = j?.data?.bondBaseInfo; if (!d) throw new Error("no bondBaseInfo");
    if (blank(d.isinCode)) b.isin = d.isinCode;
    if (blank(d.mrtyDate)) b.mat = d.mrtyDate;
    if (blank(d.issueDate)) b.issue = d.issueDate;
    if (blank(d.bondPeriod)) b.term = d.bondPeriod.replace(/Year/i, "Y").replace(/Month/i, "M").replace(/Day/i, "D");
    const cp = parseFloat(blank(d.parCouponRate) ?? "");
    if (isFinite(cp)) b.coupon = cp;
    if (!b.mat) throw new Error("no maturity in detail");
    delete b.tries; done++;
  } catch (e) { b.tries = (b.tries || 0) + 1; fail++; if (fail <= 5) log(`lookup ${b.code} failed: ${e.message}`); }
}
for (let i = 0; i < need.length; i += 4) {
  if (Date.now() - T0 > BUDGET) { log("time budget reached; the next run continues"); break; }
  await Promise.all(need.slice(i, i + 4).map(lookup));
  await sleep(250);
}
for (const b of Object.values(B)) b.matured = !!(b.mat && b.mat < today);

const live = Object.values(B).filter((b) => !b.matured);
master.updated = Math.floor(Date.now() / 1000);
master.src = "CFETS (chinamoney.com.cn) bond information, English list searched by bond code and English detail, for policy bank bonds seen trading on CFETS";
mkdirSync("data", { recursive: true });
writeFileSync("data/pb-master.json", JSON.stringify(master));
const by = (k) => live.filter((b) => b.issuer === k);
const msg = `Policy bank master: ${live.length} outstanding (CDB ${by("cdb").length}, ADBC ${by("adbc").length}, EXIM ${by("exim").length}), ${live.filter((b) => b.mat).length} with maturity; looked up ${done}, failed ${fail}`;
log(msg); summary(`- ${msg}`);
