// Fetches the last 30 days of news headlines for every stock on the site and writes data/news.json.
// Sources: Google News RSS search (up to ~100 items per query) and Yahoo Finance headline RSS.
// Usage: node scripts/fetch-news.mjs
// If a source fails for a stock, that stock keeps its previous headlines (still trimmed to 30 days),
// so a deploy always goes out with the last good list. Exits 0.
import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";

const STOCKS = [
  // m = a headline must match this to be kept (drops loosely related items from ticker feeds)
  { t: "ARM",  q: '"Arm Holdings" OR "Arm stock" OR "NASDAQ:ARM"', m: /\bArm\b|\bARM\b|Neoverse|SoftBank/ },
  { t: "TSLA", q: 'Tesla (stock OR shares OR TSLA OR Musk OR earnings OR deliveries)', m: /Tesla|TSLA|Cybercab|robotaxi|Optimus|Megapack|\bFSD\b/i },
  { t: "SNDK", q: 'Sandisk OR "NASDAQ:SNDK"', m: /Sandisk|SNDK/i },
  { t: "INTC", q: 'Intel (stock OR shares OR INTC OR foundry OR earnings OR chip)', m: /Intel\b|INTC|Lip-Bu Tan|\b18A\b|\b14A\b/i },
  { t: "SPCX", q: 'SpaceX (stock OR shares OR SPCX OR Starlink OR earnings OR Starship)', m: /SpaceX|SPCX|Starlink|Starship/i },
  { t: "MU",   q: 'Micron (stock OR shares OR MU OR memory OR HBM OR earnings)', m: /Micron|\bMU\b/ },
  { t: "LITE", q: 'Lumentum OR "NASDAQ:LITE"', m: /Lumentum|\bLITE\b/ },
  { t: "COHR", q: '"Coherent Corp" OR "Coherent stock" OR "Coherent shares" OR "NYSE:COHR" OR (Coherent earnings)', m: /Coherent|COHR/ },
  { t: "GOOGL", q: '(Alphabet OR Google) (stock OR shares OR GOOGL OR earnings OR Cloud OR Gemini OR antitrust)', m: /Alphabet|Google|GOOGL?\b|Gemini|YouTube|Waymo/ },
  { t: "META", q: '"Meta Platforms" OR (Meta (stock OR shares OR Zuckerberg OR earnings OR Llama))', m: /\bMeta\b|\bMETA\b|Zuckerberg|Instagram|WhatsApp|Facebook/ },
];
const OUT = "data/news.json";
const DAYS = 30, PER_STOCK = 80;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const cutoff = Date.now() - DAYS * 864e5;
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };

const decode = (s = "") => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ""; };

function parseRss(xml, fallbackSrc) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    let title = tag(it, "title"), src = tag(it, "source") || fallbackSrc;
    if (src && title.endsWith(" - " + src)) title = title.slice(0, -(src.length + 3));
    const ts = Date.parse(tag(it, "pubDate"));
    return { title, url: tag(it, "link"), src, ts };
  }).filter((x) => x.title && x.url && x.ts && x.ts >= cutoff && x.ts <= Date.now() + 36e5);
}

async function rss(url, src) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseRss(await r.text(), src);
}

const key = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

let prev = { items: [] };
try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

const all = [];
for (const s of STOCKS) {
  const got = [];
  const tries = [
    ["google", `https://news.google.com/rss/search?q=${encodeURIComponent(s.q + " when:30d")}&hl=en-US&gl=US&ceid=US:en`, ""],
    ["yahoo", `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${s.t}&region=US&lang=en-US`, "Yahoo Finance"],
  ];
  for (const [name, url, src] of tries) {
    try { const items = await rss(url, src); got.push(...items); console.log(`${s.t} ${name}: ${items.length}`); }
    catch (e) { console.log(`${s.t} ${name} failed: ${e.message}`); }
  }
  let items = got.filter((x) => s.m.test(x.title));
  if (!items.length) {
    items = (prev.items || []).filter((x) => x.t === s.t && x.ts >= cutoff);
    console.log(`${s.t}: no fresh items, kept ${items.length} previous`);
  }
  const seen = new Set(), uniq = [];
  for (const x of items.sort((a, b) => b.ts - a.ts)) {
    const k = key(x.title); if (seen.has(k)) continue; seen.add(k);
    uniq.push({ t: s.t, title: x.title, url: x.url, src: x.src, ts: x.ts });
    if (uniq.length >= PER_STOCK) break;
  }
  all.push(...uniq);
  summary(`- ${s.t}: ${uniq.length} headlines`);
}

all.sort((a, b) => b.ts - a.ts);
mkdirSync("data", { recursive: true });
writeFileSync(OUT, JSON.stringify({ updated: Math.floor(Date.now() / 1000), days: DAYS, items: all }));
console.log(`wrote ${all.length} headlines to ${OUT}`);
