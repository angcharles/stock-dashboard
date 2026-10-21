// China tab: CFETS interbank bond lending (债券借贷) fees by tenor, daily and monthly, plus monthly volume by bond type.
// Reads ../data/bond-lending.json (written by scripts/fetch-bond-lending.mjs) and re-checks it every minute.
(() => {
  const SRC = "../data/bond-lending.json";
  const $ = (id) => document.getElementById(id);
  if (!$("blTiles")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const f = (v, n = 4) => v == null || !isFinite(v) ? "–" : (+v).toFixed(n);
  const bp = (v, n = 1) => v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${(+v).toFixed(n)}`;
  const cls = (v) => v == null || !isFinite(v) || Math.abs(v) < 0.05 ? "" : v > 0 ? "up" : "down";
  const NAME = { L001: "Overnight", L007: "7 days", L014: "14 days", L021: "21 days", L1M: "1 month", L2M: "2 months", L3M: "3 months", L4M: "4 months", L6M: "6 months", L9M: "9 months", L1Y: "1 year" };
  const COL = ["--c1", "--c2", "--c3", "--c4", "--c5"];
  const TYPES = [["CGB", "--c1"], ["Policy bank", "--c2"], ["Local government", "--c4"], ["Other", "--c6"]];
  let D = null;
  const st = { mode: null, sel: ["L001", "L007", "L1M"], rng: "All", tyN: 24 };

  // series of weighted fee for a tenor
  const dSer = (t) => (D.daily || []).filter((x) => x.r?.[t]?.w != null).map((x) => [x.d, x.r[t].w, x.r[t].v]);
  const mSer = (t) => (D.monthly || []).filter((x) => x.pro?.[t]?.w != null).map((x) => [x.m + "-01", x.pro[t].w, x.pro[t].a]);
  const ser = (t) => st.mode === "daily" ? dSer(t) : mSer(t);
  const lastMonth = (t) => { const s = mSer(t); return s.at(-1)?.[1] ?? null; };
  const spark = (pts) => {
    if (pts.length < 2) return "";
    const ys = pts.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), r = hi - lo || 1;
    const d = pts.map((p, i) => `${(i / (pts.length - 1) * 100).toFixed(2)},${(28 - (p[1] - lo) / r * 26).toFixed(2)}`).join(" ");
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  };

  // ---------- tiles ----------
  function tiles() {
    const T = ["L001", "L007", "L014", "L1M", "L3M", "L6M"].filter((t) => D.tenors?.includes(t));
    $("blTiles").innerHTML = T.map((t) => {
      const ds = dSer(t), ms = mSer(t), last = ds.at(-1), prev = ds.at(-2);
      const v = last ? last[1] : ms.at(-1)?.[1];
      const d1 = last && prev ? (last[1] - prev[1]) * 100 : null;
      const vm = v != null && ms.length ? (v - ms.at(-1)[1]) * 100 : null;
      const on = st.sel.includes(t);
      return `<button class="tile" type="button" data-t="${t}" aria-pressed="${on}"><b>${t} · ${esc(NAME[t] || t)}</b><span class="v">${f(v, 3)}%</span><span class="c ${cls(d1)}">${bp(d1)} bp 1D</span><small>vs ${ms.length ? new Date(ms.at(-1)[0] + "T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" }) : "mo"} avg ${bp(vm)} bp</small>${spark(ms.slice(-24))}</button>`;
    }).join("");
    $("blTiles").querySelectorAll(".tile").forEach((b) => b.onclick = () => toggle(b.dataset.t, true));
  }
  function toggle(t, solo) {
    if (solo) st.sel = st.sel.includes(t) && st.sel.length > 1 ? st.sel.filter((x) => x !== t) : st.sel.includes(t) ? st.sel : [...st.sel, t].slice(-5);
    tiles(); controls(); chart(true);
  }

  // ---------- chart ----------
  let ch = null, lines = [];
  function controls() {
    const nD = (D.daily || []).length;
    $("blMode").innerHTML = [["daily", `Daily (${nD} days)`], ["monthly", `Monthly (${(D.monthly || []).length} months)`]].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === st.mode}">${l}</button>`).join("");
    $("blMode").querySelectorAll("button").forEach((b) => b.onclick = () => { st.mode = b.dataset.k; st.rng = "All"; controls(); chart(true); });
    $("blTen").innerHTML = (D.tenors || []).map((t) => `<button type="button" data-t="${t}" aria-pressed="${st.sel.includes(t)}" title="${esc(NAME[t] || t)}">${t}</button>`).join("");
    $("blTen").querySelectorAll("button").forEach((b) => b.onclick = () => toggle(b.dataset.t, true));
    const R = st.mode === "daily" ? ["1M", "3M", "All"] : ["6M", "1Y", "2Y", "All"];
    $("blRng").innerHTML = R.map((r) => `<button type="button" aria-pressed="${r === st.rng}">${r}</button>`).join("");
    $("blRng").querySelectorAll("button").forEach((b) => b.onclick = () => { st.rng = b.textContent; controls(); chart(true); });
  }
  const cutOf = (s) => {
    const days = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "2Y": 731 }[st.rng];
    if (!days || !s.length) return "";
    return new Date(Date.parse(s.at(-1)[0]) - days * 864e5).toISOString().slice(0, 10);
  };
  function chart(fit) {
    $("blcH").textContent = `Weighted lending fee over time — ${st.mode === "daily" ? "daily" : "monthly average"} (%)`;
    const data = st.sel.map((t, i) => { const s = ser(t), c = cutOf(s); return { t, col: css(COL[i % COL.length]), v: s.filter(([d]) => d >= c) }; });
    if (window.LightweightCharts) {
      const opts = { layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono") }, grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } }, rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line") }, crosshair: { mode: 1 } };
      if (!ch) {
        ch = LightweightCharts.createChart($("blChart"), { ...opts, autoSize: true, localization: { locale: "en-US" } });
        ch.subscribeCrosshairMove((p) => legend(p));
      } else ch.applyOptions(opts);
      lines.forEach((l) => ch.removeSeries(l.s)); lines = [];
      for (const d of data) {
        const s = ch.addLineSeries({ color: d.col, lineWidth: d === data[0] ? 2.5 : 2, priceLineVisible: false, lastValueVisible: true, pointMarkersVisible: d.v.length < 40, priceFormat: { type: "price", precision: 3, minMove: 0.001 } });
        s.setData(d.v.map(([time, value]) => ({ time, value })));
        lines.push({ s, ...d });
      }
      ch.applyOptions({ timeScale: { timeVisible: false } });
      if (fit) ch.timeScale().fitContent();
    }
    legend(null);
    stats(data[0]);
    const nD = (D.daily || []).length;
    $("blNote").textContent = st.mode === "daily"
      ? `Daily weighted-average fee from the CFETS bond lending daily bulletin, ${D.daily?.[0]?.d || "–"} to ${D.latestDay || "–"}. CFETS only serves about two weeks of daily bulletins, so the dashboard stores each day as it is published (around 22:00 Beijing) and this daily history lengthens every business day.${nD < 40 ? " Switch to Monthly for the longer history back to October 2023." : ""}`
      : `Monthly volume-weighted fee from the CFETS bond lending monthly bulletin, ${D.monthly?.[0]?.m || "–"} to ${D.latestMonth || "–"}. Hover for each month's fee and amount lent.`;
  }
  function legend(p) {
    $("blLeg").innerHTML = lines.map((l) => {
      let v = l.v.at(-1);
      if (p?.time && p.seriesData?.get(l.s)) { const t = p.time, k = typeof t === "string" ? t : typeof t === "object" ? `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}` : new Date(t * 1000).toISOString().slice(0, 10); v = l.v.find(([d]) => d === k) || [k, p.seriesData.get(l.s).value]; }
      const amt = v?.[2] != null ? (st.mode === "daily" ? ` · ${(v[2] / 1000).toFixed(1)} bn` : ` · ${(v[2] / 1).toFixed(0)} 亿`) : "";
      return `<span><i style="background:${l.col};height:2.5px"></i><b>${l.t}</b> ${v ? f(v[1], 4) + "%" : "–"}<span class="mut">${v ? " " + (st.mode === "daily" ? v[0] : String(v[0]).slice(0, 7)) : ""}${amt}</span></span>`;
    }).join("");
  }
  function stats(d) {
    if (!d?.v?.length) { $("blStats").innerHTML = ""; return; }
    const ys = d.v.map((p) => p[1]), first = d.v[0], last = d.v.at(-1);
    const hi = d.v.reduce((a, b) => b[1] > a[1] ? b : a), lo = d.v.reduce((a, b) => b[1] < a[1] ? b : a);
    const lab = (x) => st.mode === "daily" ? x : String(x).slice(0, 7);
    $("blStats").innerHTML = [[`${d.t} latest`, `${f(last[1], 4)}% <small class="mut">${lab(last[0])}</small>`], [`Change over range`, `<span class="${cls((last[1] - first[1]) * 100)}">${bp((last[1] - first[1]) * 100)} bp</span>`], ["High", `${f(hi[1], 4)}% <small class="mut">${lab(hi[0])}</small>`], ["Low", `${f(lo[1], 4)}% <small class="mut">${lab(lo[0])}</small>`], ["Average", `${f(ys.reduce((a, b) => a + b, 0) / ys.length, 4)}%`]]
      .map(([a, b]) => `<div>${a}<span>${b}</span></div>`).join("");
  }

  // ---------- latest-day table ----------
  function table() {
    const day = D.daily?.at(-1), prev = D.daily?.at(-2);
    if (!day) { $("blTab").innerHTML = `<tr><td colspan="9" class="empty">No daily bulletin yet.</td></tr>`; return; }
    $("bltH").textContent = `Latest day by tenor · ${day.d}`;
    $("blTab").innerHTML = (D.tenors || []).filter((t) => day.r[t]).map((t) => {
      const x = day.r[t], p = prev?.r?.[t], lm = lastMonth(t);
      const d1 = p?.w != null && x.w != null ? (x.w - p.w) * 100 : null, vm = lm != null && x.w != null ? (x.w - lm) * 100 : null;
      return `<tr><td title="${esc(NAME[t] || "")}">${t}</td><td><b>${f(x.w, 4)}</b></td><td>${f(x.o, 2)}</td><td>${f(x.c, 2)}</td><td>${f(x.h, 2)}</td><td>${f(x.l, 2)}</td><td class="${cls(d1)}">${bp(d1)}</td><td class="${cls(vm)}">${bp(vm)}</td><td>${x.v != null ? (x.v / 1000).toFixed(2) : "–"}</td></tr>`;
    }).join("");
    const tot = Object.values(day.r).reduce((a, x) => a + (x.v || 0), 0);
    $("blTabNote").textContent = `CFETS daily bulletin for ${day.d}: fees in % a year on face value; 1D against ${prev?.d || "the previous day"}; "vs last mo" against the ${D.latestMonth || "latest"} monthly average. Total lent ${(tot / 1000).toFixed(1)} bn RMB.`;
  }

  // ---------- monthly volume by bond type (stacked bars) ----------
  function typeChart() {
    $("blTyR").innerHTML = [12, 24, 36].map((n) => `<button type="button" aria-pressed="${n === st.tyN}">${n}M</button>`).join("");
    $("blTyR").querySelectorAll("button").forEach((b) => b.onclick = () => { st.tyN = parseInt(b.textContent); typeChart(); });
    const M = (D.monthly || []).filter((m) => m.bal).slice(-st.tyN);
    const svg = $("blTy"), W = Math.max(280, svg.clientWidth || 480), Hh = 260, P = { l: 44, r: 8, t: 10, b: 26 };
    svg.setAttribute("viewBox", `0 0 ${W} ${Hh}`);
    if (!M.length) { svg.innerHTML = ""; return; }
    const parts = M.map((m) => {
      const b = m.bal, total = b.Total ?? Object.entries(b).filter(([k]) => k !== "Total").reduce((a, [, v]) => a + (v || 0), 0);
      const known = TYPES.slice(0, 3).map(([k]) => b[k] || 0), other = Math.max(0, total - known.reduce((a, x) => a + x, 0));
      return { m: m.m, v: [...known, other], total, w: m.pro?.Total?.w };
    });
    const hi = Math.max(...parts.map((p) => p.total)) * 1.08 || 1;
    const bw = (W - P.l - P.r) / parts.length, X = (i) => P.l + i * bw, Y = (v) => P.t + (1 - v / hi) * (Hh - P.t - P.b);
    let g = "";
    const step = hi > 40000 ? 10000 : hi > 20000 ? 5000 : 2000;
    for (let v = 0; v <= hi; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${P.l - 6}" y="${Y(v) + 3.5}" text-anchor="end" style="font:500 10px var(--f-mono);fill:var(--muted)">${(v / 10000).toFixed(v % 10000 ? 1 : 0)}万亿</text>`;
    parts.forEach((p, i) => {
      let acc = 0;
      p.v.forEach((v, k) => { if (!v) return; const y0 = Y(acc), y1 = Y(acc + v); acc += v; g += `<rect x="${(X(i) + bw * 0.12).toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}" fill="var(${TYPES[k][1]})" fill-opacity="${k === 3 ? 0.55 : 0.9}"/>`; });
      const every = Math.max(1, Math.ceil(parts.length / Math.max(3, Math.floor(W / 64))));
      if ((i % every === 0 && parts.length - 1 - i >= every / 2) || i === parts.length - 1) g += `<text x="${(X(i) + bw / 2).toFixed(1)}" y="${Hh - 8}" text-anchor="middle" style="font:500 10px var(--f-mono);fill:var(--muted)">${p.m.slice(2).replace("-", "/")}</text>`;
    });
    g += `<rect id="blTyHi" y="${P.t}" height="${Hh - P.t - P.b}" fill="var(--accent)" fill-opacity=".08" visibility="hidden"/>`;
    svg.innerHTML = g;
    $("blTyLeg").innerHTML = TYPES.map(([k, c]) => `<span><i class="dot" style="background:var(${c})"></i>${k}</span>`).join("") + `<span class="mut">Amount lent per month, RMB 亿 (100m)</span>`;
    const tip = $("blTyTip"), hiR = svg.querySelector("#blTyHi");
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width, i = Math.floor((sx - P.l) / bw);
      if (i < 0 || i >= parts.length) { leave(); return; }
      const p = parts[i];
      hiR.setAttribute("x", X(i)); hiR.setAttribute("width", bw); hiR.setAttribute("visibility", "visible");
      tip.innerHTML = `<b>${p.m}</b> · total ${p.total.toFixed(0)} 亿${p.w != null ? ` · fee ${f(p.w, 4)}%` : ""}<br>` + TYPES.map(([k], j) => `${k} ${p.v[j].toFixed(0)} (${(p.v[j] / p.total * 100).toFixed(0)}%)`).join("<br>");
      tip.hidden = false;
      const left = (X(i) + bw) * r.width / W;
      tip.style.left = Math.min(Math.max(0, left + 8), r.width - tip.offsetWidth) + "px"; tip.style.top = "4px";
    };
    const leave = () => { tip.hidden = true; hiR.setAttribute("visibility", "hidden"); };
    svg.onpointermove = move; svg.onpointerdown = move; svg.onpointerleave = leave;
  }

  function render(first) {
    if (!st.mode) st.mode = (D.daily || []).length >= 40 ? "daily" : "monthly";
    st.sel = st.sel.filter((t) => D.tenors?.includes(t)); if (!st.sel.length && D.tenors?.length) st.sel = [D.tenors[0]];
    tiles(); controls(); chart(first); table(); typeChart();
    const upd = D.updated ? new Date(D.updated * 1000).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }) : "–";
    $("blSub").innerHTML = `Interbank bond lending fee rates from CFETS: the annualised fee a borrower pays to borrow bonds (mostly CGBs and policy bank bonds, used to cover shorts and as collateral), by lending tenor. A rising fee means bonds are scarcer to borrow. Latest daily bulletin <b>${esc(D.latestDay || "–")}</b>, latest monthly bulletin <b>${esc(D.latestMonth || "–")}</b>; refreshed ${esc(upd)} Singapore time. Click a tile or tenor to add or remove it from the chart.`;
  }
  async function load(first) {
    try {
      const r = await fetch(`${SRC}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (!first && D && j.updated === D.updated) return;
      D = j; render(first);
    } catch (e) { if (first) $("blSub").textContent = "Bond lending data is not available yet; it is fetched with the China bond refresh. Check back shortly."; }
  }
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => D && typeChart(), 120); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => D && (chart(false), typeChart()));
  load(true); setInterval(() => load(false), 60000);
})();
