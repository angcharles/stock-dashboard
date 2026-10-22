// China tab: CCDC China government bond curve, tenor history, and outstanding CGBs by bond code and ISIN.
// Reads ../data/china.json (written by scripts/fetch-china.mjs) and re-checks it every minute.
(() => {
  const SRC = "../data/china.json";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const TEN = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 50];
  const lab = (t) => t < 1 ? `${Math.round(t * 12)}M` : `${t}Y`;
  const f2 = (v, n = 2) => v == null || !isFinite(v) ? "–" : (+v).toFixed(n);
  const bp = (v, n = 1) => v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${(+v).toFixed(n)}`;
  const cls = (v) => v == null || !isFinite(v) || Math.abs(v) < 0.05 ? "" : v > 0 ? "up" : "down"; // yields up = green, as on the Macro tab
  let D = null;
  const st = { cvMax: 30, hT: 10, hR: "6M", q: "", type: "All", mat: "", grp: "bucket", traded: false, sort: "ttm", dir: 1 };

  // ---------- series helpers ----------
  const ser = (t) => D?.tenors?.[t] || [];
  const back = (s, days) => { // value on or before (last date - days)
    if (!s.length) return null;
    const cut = new Date(Date.parse(s.at(-1)[0]) - days * 864e5).toISOString().slice(0, 10);
    for (let i = s.length - 1; i >= 0; i--) if (s[i][0] <= cut) return s[i][1];
    return null;
  };
  const chg = (s, days) => { if (!s.length) return null; const p = days === 1 ? (s.length > 1 ? s.at(-2)[1] : null) : back(s, days); return p == null ? null : (s.at(-1)[1] - p) * 100; };
  const spread = (a, b) => { // series of a - b in bp, on common dates
    const m = new Map(ser(b)); return ser(a).filter(([d]) => m.has(d)).map(([d, y]) => [d, +((y - m.get(d)) * 100).toFixed(2)]);
  };
  const spark = (pts) => {
    if (pts.length < 2) return "";
    const ys = pts.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), r = hi - lo || 1;
    const d = pts.map((p, i) => `${(i / (pts.length - 1) * 100).toFixed(2)},${(28 - (p[1] - lo) / r * 26).toFixed(2)}`).join(" ");
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  };

  // ---------- tiles ----------
  function tiles() {
    const items = [1, 2, 5, 10, 30].map((t) => ({ k: t, name: `CGB ${lab(t)}`, s: ser(t), unit: "%" }))
      .concat([{ k: "s10_1", name: "10Y – 1Y", s: spread(10, 1), unit: "bp" }, { k: "s30_10", name: "30Y – 10Y", s: spread(30, 10), unit: "bp" }]);
    $("tiles").innerHTML = items.map((it) => {
      const s = it.s, last = s.at(-1)?.[1];
      const c = (days) => { if (!s.length) return null; const p = days === 1 ? s.at(-2)?.[1] : back(s, days); return p == null ? null : it.unit === "%" ? (last - p) * 100 : last - p; };
      const d1 = c(1), w = c(7), m = c(30);
      const v = last == null ? "–" : it.unit === "%" ? f2(last, 3) + "%" : f2(last, 1) + " bp";
      const s3 = s.slice(-66);
      return `<button class="tile" type="button" data-k="${it.k}" aria-pressed="${String(it.k) === String(st.hT)}"><b>${esc(it.name)}</b><span class="v">${v}</span><span class="c ${cls(d1)}">${bp(d1)} bp 1D</span><small>1W ${bp(w)} · 1M ${bp(m)} bp</small>${spark(s3)}</button>`;
    }).join("");
    $("tiles").querySelectorAll(".tile").forEach((b) => b.onclick = () => { st.hT = b.dataset.k; tiles(); hist(true); $("hH").scrollIntoView({ behavior: "smooth", block: "start" }); });
  }

  // ---------- curve ----------
  function curveTable() {
    $("cvTab").innerHTML = TEN.map((t) => {
      const s = ser(t); if (!s.length) return "";
      const td = (v) => `<td class="${cls(v)}">${bp(v)}</td>`;
      return `<tr><td>${lab(t)}</td><td>${f2(s.at(-1)[1], 4)}</td>${td(chg(s, 1))}${td(chg(s, 7))}${td(chg(s, 30))}${td(chg(s, 365))}</tr>`;
    }).join("");
  }
  function curveChart() {
    const svg = $("cv"), W = Math.max(300, svg.clientWidth || 600), Hh = 320, P = { l: 44, r: 12, t: 12, b: 28 };
    svg.setAttribute("viewBox", `0 0 ${W} ${Hh}`);
    const max = st.cvMax, now = (D.curve?.pts || []).filter(([t]) => t <= max + 1e-9);
    const old = (days) => TEN.filter((t) => t <= max).map((t) => [t, back(ser(t), days)]).filter(([, y]) => y != null);
    const w1 = old(7), m1 = old(30);
    const dots = (D.bonds || []).filter((b) => b.last != null && b.ttm <= max);
    const ys = [...now, ...w1, ...m1].map((p) => p[1]).concat(dots.map((b) => b.last));
    if (!ys.length) { svg.innerHTML = ""; return; }
    let lo = Math.min(...ys), hi = Math.max(...ys); const pad = (hi - lo) * 0.08 || 0.1; lo -= pad; hi += pad;
    const X = (t) => P.l + t / max * (W - P.l - P.r), Y = (y) => P.t + (hi - y) / (hi - lo) * (Hh - P.t - P.b);
    const line = (pts, col, w, dash = "") => pts.length > 1 ? `<polyline points="${pts.map(([t, y]) => `${X(t).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linejoin="round"/>` : "";
    let g = "";
    const step = (hi - lo) > 1.2 ? 0.25 : (hi - lo) > 0.5 ? 0.1 : 0.05;
    for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(y)}" y2="${Y(y)}" stroke="var(--line)" stroke-width="1"/><text x="${P.l - 6}" y="${Y(y) + 3.5}" text-anchor="end">${y.toFixed(2)}</text>`;
    const nar = W < 520, xt = max <= 10 ? (nar ? [0, 2, 5, 7, 10] : [0, 1, 2, 3, 5, 7, 10]) : max <= 30 ? (nar ? [0, 5, 10, 20, 30] : [0, 1, 2, 5, 7, 10, 15, 20, 30]) : (nar ? [0, 10, 20, 30, 40, 50] : [0, 1, 5, 10, 20, 30, 40, 50]);
    for (const t of xt) g += `<text x="${X(t)}" y="${Hh - 8}" text-anchor="middle">${t ? t + "Y" : "0"}</text>`;
    g += line(m1, "var(--c3)", 1.4, "4 3") + line(w1, "var(--c2)", 1.4, "4 3") + line(now, "var(--c1)", 2.4);
    g += dots.map((b, i) => `<circle cx="${X(b.ttm).toFixed(1)}" cy="${Y(b.last).toFixed(1)}" r="3" fill="var(--ink)" fill-opacity=".55" data-i="${i}"/>`).join("");
    g += `<line id="cvX" y1="${P.t}" y2="${Hh - P.b}" stroke="var(--muted)" stroke-dasharray="2 3" visibility="hidden"/><circle id="cvP" r="4" fill="var(--c1)" visibility="hidden"/>`;
    svg.innerHTML = g;
    const tip = $("cvTip"), vx = svg.querySelector("#cvX"), vp = svg.querySelector("#cvP");
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width, sy = (ev.clientY - r.top) * Hh / r.height;
      if (sx < P.l || sx > W - P.r) { leave(); return; }
      let best = null, bd = 9;
      dots.forEach((b) => { const d = Math.hypot(X(b.ttm) - sx, Y(b.last) - sy); if (d < bd) { bd = d; best = b; } });
      let html, px, py;
      if (best) {
        px = X(best.ttm); py = Y(best.last);
        html = `<b>${esc(best.code)}</b> ${esc(best.isin || "")}<br>${esc(best.name || "")}<br>Left ${f2(best.ttm)}Y · traded ${f2(best.last, 4)}%<br>Curve ${f2(best.curve, 4)}% · vs curve <span class="${cls(best.vs)}">${bp(best.vs)} bp</span>`;
      } else {
        const t = (sx - P.l) / (W - P.l - P.r) * max;
        let y = null; for (let i = 1; i < now.length; i++) if (t <= now[i][0]) { const [a, ya] = now[i - 1], [b, yb] = now[i]; y = ya + (yb - ya) * (t - a) / (b - a); break; }
        if (y == null) { leave(); return; }
        px = X(t); py = Y(y);
        html = `${t < 1 ? Math.round(t * 12) + "M" : t.toFixed(1) + "Y"} · <b>${y.toFixed(4)}%</b>`;
      }
      vx.setAttribute("x1", px); vx.setAttribute("x2", px); vx.setAttribute("visibility", "visible");
      vp.setAttribute("cx", px); vp.setAttribute("cy", py); vp.setAttribute("visibility", "visible");
      tip.innerHTML = html; tip.hidden = false;
      const left = px * r.width / W, top = py * r.height / Hh;
      tip.style.left = Math.min(Math.max(0, left + 12), r.width - tip.offsetWidth) + "px";
      tip.style.top = Math.max(0, top - tip.offsetHeight - 10) + "px";
    };
    const leave = () => { tip.hidden = true; vx.setAttribute("visibility", "hidden"); vp.setAttribute("visibility", "hidden"); };
    svg.onpointermove = move; svg.onpointerdown = move; svg.onpointerleave = leave;
    $("lgNow").textContent = D.curve?.date ? `CCDC ${D.curve.date}` : "Latest";
    $("cvNote").textContent = `CCDC curve dated ${D.curve?.date || "–"} (Beijing business day). Dashed lines use CCDC's closes at the standard tenors a week and a month earlier. Dots: ${dots.length} CGBs traded on CFETS ${D.tradeDay || "today"}${D.tradeTime ? ` (as of ${D.tradeTime} Beijing)` : ""}; hover or tap for code, ISIN and spread to the curve.`;
  }

  // ---------- history ----------
  let ch = null, ls = null;
  function hist(fit) {
    const k = String(st.hT), isS = k.startsWith("s");
    const s = k === "s10_1" ? spread(10, 1) : k === "s30_10" ? spread(30, 10) : ser(+k);
    const days = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366 }[st.hR];
    const cut = s.length ? new Date(Date.parse(s.at(-1)[0]) - days * 864e5).toISOString().slice(0, 10) : "";
    const v = s.filter(([d]) => d >= cut);
    $("hH").textContent = isS ? `${k === "s10_1" ? "10Y – 1Y" : "30Y – 10Y"} spread history (bp)` : `CGB ${lab(+k)} yield history (%)`;
    $("hTen").innerHTML = TEN.map((t) => `<button type="button" data-k="${t}" aria-pressed="${String(t) === k}">${lab(t)}</button>`).join("") + `<button type="button" data-k="s10_1" aria-pressed="${k === "s10_1"}">10Y–1Y</button><button type="button" data-k="s30_10" aria-pressed="${k === "s30_10"}">30Y–10Y</button>`;
    $("hTen").querySelectorAll("button").forEach((b) => b.onclick = () => { st.hT = b.dataset.k; tiles(); hist(true); });
    $("hRng").innerHTML = ["1M", "3M", "6M", "1Y"].map((r) => `<button type="button" aria-pressed="${r === st.hR}">${r}</button>`).join("");
    $("hRng").querySelectorAll("button").forEach((b) => b.onclick = () => { st.hR = b.textContent; hist(true); });
    if (window.LightweightCharts) {
      const opts = { layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono") }, grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } }, rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line") }, crosshair: { mode: 1 } };
      if (!ch) { ch = LightweightCharts.createChart($("hist"), { ...opts, autoSize: true, localization: { locale: "en-US" } }); ls = ch.addLineSeries({ color: css("--accent"), lineWidth: 2, priceLineVisible: false }); }
      else { ch.applyOptions(opts); ls.applyOptions({ color: css("--accent") }); }
      ls.applyOptions({ priceFormat: { type: "price", precision: isS ? 1 : 3, minMove: isS ? 0.1 : 0.001 } });
      ls.setData(v.map(([time, value]) => ({ time, value })));
      if (fit) ch.timeScale().fitContent();
    }
    if (v.length) {
      const ys = v.map((p) => p[1]), mul = isS ? 1 : 100, u = isS ? " bp" : "%";
      const fmt = (x) => isS ? f2(x, 1) + u : f2(x, 3) + u;
      $("hStats").innerHTML = [["Latest", fmt(v.at(-1)[1]) + ` <small class="mut">${v.at(-1)[0]}</small>`], [`${st.hR} change`, `<span class="${cls((v.at(-1)[1] - v[0][1]) * mul)}">${bp((v.at(-1)[1] - v[0][1]) * mul)} bp</span>`], ["High", fmt(Math.max(...ys))], ["Low", fmt(Math.min(...ys))], ["Average", fmt(ys.reduce((a, b) => a + b, 0) / ys.length)]]
        .map(([a, b]) => `<div>${a}<span>${b}</span></div>`).join("");
    } else $("hStats").innerHTML = "";
  }

  // ---------- bonds table ----------
  const BUCKETS = [[0, 1, "Up to 1 year"], [1, 3, "1 – 3 years"], [3, 5, "3 – 5 years"], [5, 7, "5 – 7 years"], [7, 10, "7 – 10 years"], [10, 20, "10 – 20 years"], [20, 30, "20 – 30 years"], [30, 99, "Over 30 years"]];
  const bucket = (t) => BUCKETS.findIndex(([, b]) => t <= b + 1e-9);
  const COLS = [
    ["code", "Code", (b) => `<td class="code">${esc(b.code)}</td>`],
    ["isin", "ISIN", (b) => `<td>${esc(b.isin || "–")}</td>`],
    ["name", "Name", (b) => `<td class="nm" title="${esc(b.name)}">${esc(b.name || "–")}</td>`],
    ["type", "Type", (b) => `<td><span class="ty ${esc(b.type.split(" ")[0])}">${esc(b.type)}</span></td>`],
    ["coupon", "Coupon %", (b) => `<td>${b.type === "Discount" ? "–" : f2(b.coupon, 2)}</td>`],
    ["mat", "Maturity", (b) => `<td>${esc(b.mat || "–")}</td>`],
    ["ttm", "Left (Y)", (b) => `<td>${f2(b.ttm, 2)}</td>`],
    ["curve", "CCDC curve %", (b) => `<td>${f2(b.curve, 4)}</td>`],
    ["last", "CFETS last %", (b) => `<td>${f2(b.last, 4)}</td>`],
    ["wavg", "CFETS w.avg %", (b) => `<td>${f2(b.wavg, 4)}</td>`],
    ["chg", "Chg bp", (b) => `<td class="${cls(b.chg)}">${bp(b.chg, 2)}</td>`],
    ["vs", "vs curve bp", (b) => `<td class="${cls(b.vs)}">${bp(b.vs)}</td>`],
  ];
  function rows() {
    const q = st.q.trim().toLowerCase();
    return (D.bonds || []).filter((b) =>
      (!q || [b.code, b.isin, b.name].some((x) => String(x || "").toLowerCase().includes(q))) &&
      (st.type === "All" || (st.type === "Special" ? /Special/.test(b.type) : b.type === st.type)) &&
      (!st.mat || (() => { const [lo, hi] = st.mat.split("-").map(Number); return b.ttm >= lo && b.ttm < hi; })()) &&
      (!st.traded || b.last != null))
      .sort((a, b) => {
        const x = a[st.sort], y = b[st.sort];
        if (x == null && y == null) return a.ttm - b.ttm;
        if (x == null) return 1; if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * st.dir || a.ttm - b.ttm;
      });
  }
  function table() {
    $("bType").innerHTML = ["All", "Coupon", "Special", "Discount"].map((t) => `<button type="button" aria-pressed="${t === st.type}">${t}</button>`).join("");
    $("bType").querySelectorAll("button").forEach((b) => b.onclick = () => { st.type = b.textContent; table(); });
    $("bGrp").innerHTML = [["bucket", "By tenor"], ["none", "Ungrouped"]].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === st.grp}">${l}</button>`).join("");
    $("bGrp").querySelectorAll("button").forEach((b) => b.onclick = () => { st.grp = b.dataset.k; table(); });
    $("bHead").innerHTML = COLS.map(([k, l]) => `<th scope="col" data-k="${k}" ${st.sort === k ? `aria-sort="${st.dir > 0 ? "ascending" : "descending"}"` : ""} tabindex="0">${l}</th>`).join("");
    $("bHead").querySelectorAll("th").forEach((th) => { const go = () => { const k = th.dataset.k; st.dir = st.sort === k ? -st.dir : 1; st.sort = k; table(); }; th.onclick = go; th.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
    const R = rows();
    const line = (b) => `<tr>${COLS.map((c) => c[2](b)).join("")}</tr>`;
    let html = "";
    if (!R.length) html = `<tr><td colspan="${COLS.length}" class="empty">No bonds match.</td></tr>`;
    else if (st.grp === "bucket") {
      const by = BUCKETS.map(() => []); R.forEach((b) => by[Math.max(0, bucket(b.ttm))].push(b));
      by.forEach((list, i) => {
        if (!list.length) return;
        const tr = list.filter((b) => b.vs != null), avg = tr.length ? tr.reduce((a, b) => a + b.vs, 0) / tr.length : null;
        html += `<tr class="g"><td colspan="${COLS.length}">${BUCKETS[i][2]}<span>${list.length} bonds · ${list.filter((b) => b.last != null).length} traded today${avg != null ? ` · avg vs curve ${bp(avg)} bp` : ""}</span></td></tr>` + list.map(line).join("");
      });
    } else html = R.map(line).join("");
    $("bBody").innerHTML = html;
    const all = D.bonds || [];
    $("bNote").textContent = `${R.length} of ${all.length} outstanding CGBs shown · ${all.filter((b) => b.isin).length} with an ISIN on file · ${all.filter((b) => b.last != null).length} traded on CFETS ${D.tradeDay || "today"}. New issues can show no ISIN or coupon for a few days until CFETS publishes them. Click a column header to sort.`;
  }
  $("bQ").oninput = (e) => { st.q = e.target.value; table(); };
  $("bTr").onchange = (e) => { st.traded = e.target.checked; table(); };
  $("bMat").onchange = (e) => { st.mat = e.target.value; table(); };
  $("bDl").onclick = () => {
    const head = ["code", "isin", "name", "type", "coupon_pct", "issue", "maturity", "years_left", "ccdc_curve_pct", "cfets_last_pct", "cfets_wavg_pct", "chg_bp", "vs_curve_bp"];
    const q = (v) => v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
    const body = rows().map((b) => [b.code, b.isin, b.name, b.type, b.coupon, b.issue, b.mat, b.ttm, b.curve, b.last, b.wavg, b.chg, b.vs].map(q).join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `cgb-by-code-isin-${D.curve?.date || "latest"}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  function rngButtons() {
    $("cvRng").innerHTML = [[10, "0–10Y"], [30, "0–30Y"], [50, "0–50Y"]].map(([m, l]) => `<button type="button" data-m="${m}" aria-pressed="${m === st.cvMax}">${l}</button>`).join("");
    $("cvRng").querySelectorAll("button").forEach((b) => b.onclick = () => { st.cvMax = +b.dataset.m; rngButtons(); curveChart(); });
  }
  function render(first) {
    tiles(); rngButtons(); curveTable(); curveChart(); hist(first); table();
    const upd = D.updated ? new Date(D.updated * 1000).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }) : "–";
    $("lede").innerHTML = `China government bond (CGB) yields from ChinaBond (CCDC), the official curve compiled by China Central Depository &amp; Clearing, and every outstanding CGB listed by bond code and ISIN with its CFETS interbank traded yield. Latest CCDC curve: <b>${esc(D.curve?.date || "–")}</b>. Data refreshed ${esc(upd)} Singapore time; the page re-checks every minute.`;
  }
  async function load(first) {
    try {
      const r = await fetch(`${SRC}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (!first && D && j.updated === D.updated) return;
      D = j; render(first);
    } catch (e) { if (first) $("lede").textContent = "China bond data is not available yet. It is fetched with each dashboard refresh; check back in a few minutes."; }
  }
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => D && curveChart(), 120); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => D && (curveChart(), hist(false)));
  load(true); setInterval(() => load(false), 60000);
})();
