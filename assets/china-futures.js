// China tab: CGB Bond Futures — CFFEX 2/5/10/30-year China government bond futures (TS, TF, T, TL).
// Reads ../data/cgb-futures.json (scripts/fetch-cgb-futures.mjs: Sina Finance delayed quotes and K-lines, CFFEX
// settlement) and ../data/china.json (CCDC cash curve history for the yield comparison); re-checks every minute.
(() => {
  const SRC = "../data/cgb-futures.json", CASH = "../data/china.json";
  const $ = (id) => document.getElementById(id);
  if (!$("fuTiles")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const f = (v, n = 3) => v == null || !isFinite(v) ? "–" : (+v).toFixed(n);
  const sg = (v, n = 3) => v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${(+v).toFixed(n)}`;
  const cls = (v) => v == null || !isFinite(v) || v === 0 ? "" : v > 0 ? "up" : "down";
  const ycls = (v) => v == null || !isFinite(v) || Math.abs(v) < 0.05 ? "" : v > 0 ? "down" : "up"; // yields up = prices down
  const int = (v) => v == null || !isFinite(v) ? "–" : Math.round(v).toLocaleString("en-US");
  const COL = { TS: "--c1", TF: "--c2", T: "--c3", TL: "--c4" };
  const TEN = { TS: "2", TF: "5", T: "10", TL: "30" };
  const DEC = { TS: 3, TF: 3, T: 3, TL: 2 };
  const RNG = { "1D": 1, "5D": 5, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "2Y": 731 };
  let D = null, C = null;
  const st = { p: "T", con: "main", rng: "3M", ym: "imp", yr: "6M", on: { TS: true, TF: true, T: true, TL: true } };
  const P = (p) => D.products.find((x) => x.p === p);
  const mainC = (x) => x.contracts.find((c) => c.code === x.main) || x.contracts[0];

  // ---------- timestamp and session ----------
  const bjNow = () => new Date(Date.now() + 8 * 3600e3);
  function session() {
    const t = bjNow(), wd = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
    if (wd === 0 || wd === 6) return ["Closed", "weekend · opens Monday 09:30 Beijing"];
    if (m >= 570 && m < 690) return ["Open", "morning session 09:30–11:30"];
    if (m >= 690 && m < 780) return ["Lunch break", "reopens 13:00"];
    if (m >= 780 && m < 915) return ["Open", "afternoon session 13:00–15:15"];
    return ["Closed", m < 570 ? "opens 09:30 Beijing" : "closed at 15:15 Beijing"];
  }
  function stamp() {
    if (!D) return;
    const upd = D.updated ? new Date(D.updated * 1000) : null;
    const ago = upd ? Math.max(0, Math.round((Date.now() - upd) / 60000)) : null;
    const agoTxt = ago == null ? "" : ago < 1 ? "just now" : ago < 60 ? `${ago} min ago` : ago < 2880 ? `${Math.round(ago / 60)} h ago` : `${Math.round(ago / 1440)} days ago`;
    const q = D.quoteTime ? new Date(D.quoteTime.replace(" ", "T") + "+08:00") : null;
    const [s, sd] = session();
    const fmt = (d) => d.toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    $("fuStamp").innerHTML = `<span><b>Last updated</b> ${upd ? esc(fmt(upd)) : "–"} SGT <span class="mut">(${esc(agoTxt)})</span></span><span><b>Latest quote</b> ${q ? esc(fmt(q)) : "–"} Beijing/SGT</span><span><b>Market</b> <i class="dot ${s === "Open" ? "on" : ""}"></i>${esc(s)} <span class="mut">· ${esc(sd)}</span></span><span class="mut">Delayed snapshot, refreshed about every 15 min while CFFEX is open${D.settleDate ? ` · CFFEX settlement ${esc(D.settleDate)}` : ""}</span>`;
  }

  // ---------- tiles ----------
  const spark = (pts) => {
    if (pts.length < 2) return "";
    const ys = pts.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), r = hi - lo || 1;
    const d = pts.map((p, i) => `${(i / (pts.length - 1) * 100).toFixed(2)},${(28 - (p[1] - lo) / r * 26).toFixed(2)}`).join(" ");
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  };
  function tiles() {
    $("fuTiles").innerHTML = D.products.map((x) => {
      const c = mainC(x);
      return `<button class="tile" type="button" data-p="${x.p}" aria-pressed="${x.p === st.p}"><b>${x.p} · ${esc(x.name)}</b><span class="v">${f(c.last, DEC[x.p])}</span><span class="c ${cls(c.chg)}">${sg(c.chg, DEC[x.p])} (${sg(c.chgPct, 2)}%)</span><small style="white-space:normal">Yield ${f(c.y, 3)}% <span class="${ycls(c.yChg)}">${sg(c.yChg, 1)}bp</span></small><small>${esc(c.code)} · OI ${int(c.oi)}</small>${spark(x.hist.slice(-60).map((r) => [r[0], r[4]]))}</button>`;
    }).join("");
    $("fuTiles").querySelectorAll(".tile").forEach((b) => b.onclick = () => { st.p = b.dataset.p; st.con = "main"; tiles(); controls(); price(true); });
  }

  // ---------- price chart ----------
  let pc = null, cs = null, vs = null, pBars = [];
  const chartOpts = () => ({ layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono") }, grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } }, rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line") }, crosshair: { mode: 1 } });
  function controls() {
    const x = P(st.p);
    $("fuProd").innerHTML = D.products.map((y) => `<button type="button" data-p="${y.p}" aria-pressed="${y.p === st.p}">${y.p} ${TEN[y.p]}Y</button>`).join("");
    $("fuProd").querySelectorAll("button").forEach((b) => b.onclick = () => { st.p = b.dataset.p; st.con = "main"; tiles(); controls(); price(true); });
    $("fuCon").innerHTML = [["main", `Main (${x.main})`], ...x.contracts.map((c) => [c.code, c.code])].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === st.con}">${l}</button>`).join("");
    $("fuCon").querySelectorAll("button").forEach((b) => b.onclick = () => { st.con = b.dataset.k; controls(); price(true); });
    $("fuRng").innerHTML = Object.keys(RNG).map((r) => `<button type="button" aria-pressed="${r === st.rng}">${r}</button>`).join("");
    $("fuRng").querySelectorAll("button").forEach((b) => b.onclick = () => { st.rng = b.textContent; controls(); price(true); });
  }
  const wall = (s) => Math.floor(Date.parse(s.replace(" ", "T") + ":00Z") / 1000); // Beijing wall time shown as-is
  function bars() {
    const x = P(st.p), code = st.con === "main" ? x.main : st.con;
    const intraday = st.rng === "1D" || st.rng === "5D";
    if (intraday && code === x.main && x.intra?.length) {
      const days = [...new Set(x.intra.map((r) => r[0].slice(0, 10)))].slice(st.rng === "1D" ? -1 : -5);
      return { intraday: true, code, rows: x.intra.filter((r) => days.includes(r[0].slice(0, 10))).map((r) => ({ time: wall(r[0]), o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], lab: r[0] })) };
    }
    const src = st.con === "main" ? x.hist : x.chist?.[code] || [];
    const rows = src.filter((r) => r[1] != null && r[4] != null && (st.con === "main" || (r[5] || 0) > 0));
    const days = RNG[intraday ? "1M" : st.rng], cut = rows.length ? new Date(Date.parse(rows.at(-1)[0]) - days * 864e5).toISOString().slice(0, 10) : "";
    return { intraday: false, code: st.con === "main" ? `${x.p} main continuous` : code, rows: rows.filter((r) => r[0] >= cut).map((r) => ({ time: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], oi: r[6], lab: r[0] })) };
  }
  function price(fit) {
    if (!window.LightweightCharts) return;
    const x = P(st.p), b = bars();
    pBars = b.rows;
    $("fuPH").textContent = `${x.p} · ${x.name} CGB futures${b.intraday ? " · 5-minute bars" : " · daily"}`;
    const o = chartOpts();
    if (pc && pc._intra !== b.intraday) { pc.remove(); pc = null; } // daily dates and intraday timestamps don't mix
    if (!pc) {
      pc = LightweightCharts.createChart($("fuChart"), { ...o, autoSize: true, localization: { locale: "en-US" } });
      cs = pc.addCandlestickSeries({ priceLineVisible: false });
      vs = pc.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
      pc.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      pc.subscribeCrosshairMove((p) => pLegend(p));
      pc._intra = b.intraday;
    } else pc.applyOptions(o);
    const up = css("--up"), dn = css("--down"), dec = DEC[x.p];
    cs.applyOptions({ upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: false, priceFormat: { type: "price", precision: dec, minMove: 1 / 10 ** dec } });
    pc.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
    cs.setData(b.rows.map((r) => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c })));
    vs.setData(b.rows.map((r) => ({ time: r.time, value: r.v || 0, color: (r.c >= r.o ? up : dn) + "66" })));
    pc.applyOptions({ timeScale: { timeVisible: b.intraday, secondsVisible: false } });
    if (fit) pc.timeScale().fitContent();
    pLegend(null);
    pStats(b);
    $("fuPNote").textContent = b.intraday
      ? `5-minute bars for the main contract ${x.main}, Beijing time (= Singapore time). Sessions 09:30–11:30 and 13:00–15:15.`
      : st.con === "main"
        ? `Sina's continuous main-contract series: it follows the most active contract and rolls about a month before delivery, so a small price step can appear at each roll. Pick a contract above for its own history.`
        : `${st.con} only, from the day it started trading.`;
  }
  function pLegend(p) {
    let r = pBars.at(-1);
    if (p?.time != null) { const t = p.time, k = typeof t === "object" ? `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}` : t; r = pBars.find((x) => x.time === k) || r; }
    if (!r) { $("fuLeg").innerHTML = ""; return; }
    const dec = DEC[st.p], i = pBars.indexOf(r), pr = i > 0 ? pBars[i - 1].c : null, ch = pr != null ? r.c - pr : null;
    $("fuLeg").innerHTML = `<span><b>${esc(r.lab)}</b></span><span>O ${f(r.o, dec)}</span><span>H ${f(r.h, dec)}</span><span>L ${f(r.l, dec)}</span><span>C <b>${f(r.c, dec)}</b> <span class="${cls(ch)}">${sg(ch, dec)}</span></span><span>Vol ${int(r.v)}</span>${r.oi ? `<span>OI ${int(r.oi)}</span>` : ""}`;
  }
  function pStats(b) {
    const r = b.rows;
    if (!r.length) { $("fuPStats").innerHTML = ""; return; }
    const dec = DEC[st.p], first = r[0], last = r.at(-1), hi = r.reduce((a, x) => x.h > a.h ? x : a), lo = r.reduce((a, x) => x.l < a.l ? x : a);
    const ch = last.c - first.o, x = P(st.p), term = x.term;
    $("fuPStats").innerHTML = [["Last", f(last.c, dec)], ["Change over range", `<span class="${cls(ch)}">${sg(ch, dec)} (${sg(ch / first.o * 100, 2)}%)</span>`], ["High", `${f(hi.h, dec)} <small class="mut">${esc(String(hi.lab).slice(5))}</small>`], ["Low", `${f(lo.l, dec)} <small class="mut">${esc(String(lo.lab).slice(5))}</small>`], ["Avg volume", int(r.reduce((a, y) => a + (y.v || 0), 0) / r.length)], ["Notional bond", `${term}Y · 3% cpn`]]
      .map(([a, v]) => `<div>${a}<span>${v}</span></div>`).join("");
  }

  // ---------- contracts table ----------
  function table() {
    $("fuTab").innerHTML = D.products.map((x) => `<tr class="g"><td colspan="15">${x.p} · ${esc(x.name)} <span>notional ${x.term}-year 3% bond · ${esc(x.face)} face · main ${esc(x.main)}</span></td></tr>` + x.contracts.map((c) => {
      const dec = DEC[x.p], k = c.ctd;
      return `<tr${c.code === x.main ? ' class="main"' : ""}><td class="code">${esc(c.code)}${c.code === x.main ? ' <span class="ty">Main</span>' : ""}</td><td><b>${f(c.last, dec)}</b></td><td class="${cls(c.chg)}">${sg(c.chg, dec)}</td><td class="${cls(c.chgPct)}">${sg(c.chgPct, 2)}%</td><td>${f(c.open, dec)}</td><td>${f(c.high, dec)}</td><td>${f(c.low, dec)}</td><td>${f(c.prevSettle, dec)}</td><td>${f(c.settle, dec)}</td><td>${int(c.vol)}</td><td>${int(c.oi)}</td><td><b>${f(c.y, 3)}</b>${c.method === "notional" ? '<sup title="Notional bond, no CTD">n</sup>' : ""}</td><td class="${ycls(c.yChg)}">${sg(c.yChg, 1)}</td><td title="${esc(k ? `${k.name} · ${k.coupon}% · matures ${k.mat} · cash yield ${f(k.cashYield, 3)}% · clean ${f(k.cashPx, 3)} · gross basis ${f(k.basis, 1)} · basket ${k.basket} bonds` : "")}">${k ? `${esc(k.code)} <span class="mut">${f(k.coupon, 2)}% ${esc(k.mat.slice(0, 7))}</span>` : "–"}</td><td>${k ? f(k.cf, 4) : "–"}</td></tr>`;
    }).join("")).join("");
    $("fuTabNote").textContent = `Change is against the previous day's settlement price. Settle is CFFEX's official settlement for ${D.settleDate || "the latest trading day"} (blank until it is published after the close). Implied yield is the cheapest-to-deliver (CTD) bond's yield at delivery when its clean price equals futures × conversion factor (CF); hover a CTD for its coupon, maturity, cash yield and gross basis. Yield change is against the previous settlement, in bp.`;
  }

  // ---------- yield chart ----------
  let yc = null, ylines = [];
  const cashSer = (p) => (C?.tenors?.[TEN[p]] || []).map(([d, y]) => [d, y]);
  function yControls() {
    $("fuYMode").innerHTML = [["imp", "Futures-implied"], ["cmp", "vs CCDC cash"], ["basis", "Futures − cash (bp)"]].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === st.ym}"${k !== "imp" && !C ? " disabled" : ""}>${l}</button>`).join("");
    $("fuYMode").querySelectorAll("button").forEach((b) => b.onclick = () => { st.ym = b.dataset.k; yControls(); ychart(true); });
    $("fuYRng").innerHTML = ["1M", "3M", "6M", "1Y", "2Y"].map((r) => `<button type="button" aria-pressed="${r === st.yr}">${r}</button>`).join("");
    $("fuYRng").querySelectorAll("button").forEach((b) => b.onclick = () => { st.yr = b.textContent; yControls(); ychart(true); });
    $("fuYTen").innerHTML = D.products.map((x) => `<button type="button" data-p="${x.p}" aria-pressed="${!!st.on[x.p]}" style="${st.on[x.p] ? `background:var(${COL[x.p]});border-color:var(${COL[x.p]})` : ""}">${TEN[x.p]}Y · ${x.p}</button>`).join("");
    $("fuYTen").querySelectorAll("button").forEach((b) => b.onclick = () => { const p = b.dataset.p; if (st.on[p] && Object.values(st.on).filter(Boolean).length === 1) return; st.on[p] = !st.on[p]; yControls(); ychart(false); });
  }
  function ychart(fit) {
    if (!window.LightweightCharts) return;
    const o = chartOpts();
    if (!yc) { yc = LightweightCharts.createChart($("fuYChart"), { ...o, autoSize: true, localization: { locale: "en-US" } }); yc.subscribeCrosshairMove((p) => yLegend(p)); }
    else yc.applyOptions(o);
    ylines.forEach((l) => yc.removeSeries(l.s)); ylines = [];
    const last = D.products[0]?.yhist?.at(-1)?.[0], cut = last ? new Date(Date.parse(last) - RNG[st.yr] * 864e5).toISOString().slice(0, 10) : "";
    const bpMode = st.ym === "basis";
    for (const x of D.products) {
      if (!st.on[x.p]) continue;
      const col = css(COL[x.p]), imp = x.yhist.filter(([d]) => d >= cut), cash = cashSer(x.p).filter(([d]) => d >= cut);
      const add = (data, label, dashed) => {
        const s = yc.addLineSeries({ color: col, lineWidth: dashed ? 1.5 : 2, lineStyle: dashed ? 2 : 0, priceLineVisible: false, lastValueVisible: true, title: "", priceFormat: { type: "price", precision: bpMode ? 1 : 3, minMove: bpMode ? 0.1 : 0.001 } });
        s.setData(data.map(([time, value]) => ({ time, value })));
        ylines.push({ s, p: x.p, label, data, col, dashed });
      };
      if (bpMode) {
        const cm = new Map(cash);
        add(imp.filter(([d]) => cm.has(d)).map(([d, y]) => [d, +((y - cm.get(d)) * 100).toFixed(1)]), `${TEN[x.p]}Y basis`, false);
      } else {
        add(imp, `${TEN[x.p]}Y ${x.p} implied`, false);
        if (st.ym === "cmp") add(cash, `${TEN[x.p]}Y CCDC cash`, true);
      }
    }
    if (fit) yc.timeScale().fitContent();
    yLegend(null);
    const m = D.products.map((x) => `${x.p} ${mainC(x).ctd ? `CTD ${mainC(x).ctd.code}` : "notional bond"}`).join(", ");
    $("fuYNote").textContent = st.ym === "imp"
      ? `Daily yield equivalent of each product's futures close: today's cheapest-to-deliver bond for the main contract (${m}) priced at futures × conversion factor, solved for yield at delivery. Earlier days use the same bond, so CTD switches over the range are not shown.`
      : st.ym === "cmp"
        ? `Solid lines: futures-implied yield. Dashed: CCDC cash CGB yield at the matching standard tenor (2, 5, 10, 30 years). The CTD's maturity is usually shorter than the standard tenor (for example a 6½–7 year bond for the 10-year contract), so the gap partly reflects the curve's slope, not just futures richness.`
        : `Futures-implied yield minus the CCDC cash yield at the matching standard tenor, in basis points, on days both exist (CCDC history covers the last year). Negative means the futures price implies a lower yield than the cash benchmark.`;
  }
  function yLegend(p) {
    let k = null;
    if (p?.time != null) { const t = p.time; k = typeof t === "object" ? `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}` : t; }
    const bpMode = st.ym === "basis";
    $("fuYLeg").innerHTML = ylines.map((l) => {
      const v = k ? l.data.find(([d]) => d === k) : l.data.at(-1);
      return `<span><i style="background:${l.col};height:${l.dashed ? 1.5 : 2.5}px;${l.dashed ? "opacity:.75" : ""}"></i>${esc(l.label)} <b>${v ? (bpMode ? sg(v[1], 1) + " bp" : f(v[1], 3) + "%") : "–"}</b><span class="mut">${v ? " " + v[0] : ""}</span></span>`;
    }).join("");
  }

  function render(first) {
    stamp(); tiles(); controls(); price(first); table(); yControls(); ychart(first);
  }
  async function load(first) {
    try {
      const r = await fetch(`${SRC}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (!j.products?.length) throw new Error("empty");
      if (!first && D && j.updated === D.updated) { stamp(); return; }
      D = j; render(first);
    } catch (e) { if (first) $("fuStamp").textContent = "CGB futures data is not available yet; it is fetched with the next dashboard refresh. Check back shortly."; }
  }
  async function loadCash() {
    try { const r = await fetch(`${CASH}?t=${Date.now()}`, { cache: "no-store" }); if (r.ok) { C = await r.json(); if (D) { yControls(); ychart(false); } } } catch {}
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => D && (price(false), ychart(false)));
  load(true).then(loadCash);
  setInterval(() => load(false), 60000);
  setInterval(loadCash, 15 * 60000);
})();
