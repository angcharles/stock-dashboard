/* Macro page: Fed funds rate expectations, FedWatch-style.
   Futures-implied rate after each upcoming FOMC meeting, how many basis points of hikes (or cuts) are priced,
   and the probability of each target range, compared with 1 day, 1 week, 2 weeks or 1 month ago.
   Data: data/fedwatch.json, built by scripts/fetch-fedwatch.mjs in the deploy workflow. Re-polls every minute. */
(function () {
  const $ = (id) => document.getElementById(id);
  const host = $("fedSec"); if (!host) return;
  const TZ = "Asia/Singapore";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sgn = (v, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d);
  const pct = (p) => (p * 100).toFixed(1) + "%";
  const iso2date = (s) => { const [Y, M, D] = s.split("-").map(Number); return new Date(Date.UTC(Y, M - 1, D)); };
  const fmtD = (s, yr) => iso2date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(yr ? { year: "numeric" } : {}), timeZone: "UTC" });
  const sgt = (s) => new Date(s * 1000).toLocaleString("en-SG", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const rangeTxt = (lo) => `${(+lo).toFixed(2)}–${(+lo + 0.25).toFixed(2)}%`;
  const LB = [["1D", "1 day"], ["1W", "1 week"], ["2W", "2 weeks"], ["1M", "1 month"]];

  let F = null, lb = "1W", view = "bps", selM = null;
  try { lb = localStorage.getItem("fed-lb") || lb; view = localStorage.getItem("fed-view") || view; } catch (e) {}

  // snapshot to compare with: the last one on or before the lookback date (1D = the previous trading day)
  function then(now) {
    const S = F.snapshots, i = S.indexOf(now);
    if (lb === "1D") return S[i - 1] || null;
    const t = iso2date(now.d);
    if (lb === "1M") t.setUTCMonth(t.getUTCMonth() - 1); else t.setUTCDate(t.getUTCDate() - (lb === "1W" ? 7 : 14));
    const ts = t.toISOString().slice(0, 10);
    for (let k = i - 1; k >= 0; k--) if (S[k].d <= ts) return S[k];
    return null;
  }
  // probabilities relative to today's range
  function sides(m, lower) {
    let hike = 0, hold = 0, cut = 0;
    for (const [k, p] of Object.entries(m.p)) { const d = +k - lower; if (d > 0.001) hike += p; else if (d < -0.001) cut += p; else hold += p; }
    return { hike, hold, cut };
  }

  function controls() {
    $("fedLb").innerHTML = LB.map(([k, t]) => `<button type="button" data-lb="${k}" aria-pressed="${k === lb}" title="Compare with ${t} ago">${k}</button>`).join("");
    $("fedView").innerHTML = [["bps", "Bps priced"], ["rate", "Implied rate"]].map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${k === view}">${t}</button>`).join("");
    $("fedLb").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; lb = b.dataset.lb; try { localStorage.setItem("fed-lb", lb); } catch (x) {} render(); };
    $("fedView").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; view = b.dataset.v; try { localStorage.setItem("fed-view", view); } catch (x) {} render(); };
  }

  function kpis(now, prv) {
    const ms = now.meetings, nx = ms[0], s = sides(nx, now.lower);
    const y1 = ms.filter((m) => m.d.slice(0, 4) === now.d.slice(0, 4)).at(-1), last = ms.at(-1);
    const pm = (m) => prv && prv.meetings.find((x) => x.d === m.d);
    const dTxt = (m) => { const q = pm(m); if (!q) return ""; const dv = (m.rate - q.rate) * 100; return `<em class="${dv > 0.05 ? "up" : dv < -0.05 ? "down" : ""}">${sgn(dv, 1)} bp vs ${lb}</em>`; };
    const pq = pm(nx), ps = pq ? sides(pq, now.lower) : null;
    const box = (k, v, sub) => `<div><b>${k}</b><span>${v}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    $("fedKpi").innerHTML =
      box("Target range", rangeTxt(now.lower), `EFFR ${now.effr.toFixed(2)}%`) +
      box(`Next FOMC · ${fmtD(nx.d)}`, `${pct(s.hike)} hike`, `${pct(s.hold)} hold${s.cut > 0.0005 ? ` · ${pct(s.cut)} cut` : ""}${ps ? ` <em class="${s.hike - ps.hike > 0.0005 ? "up" : s.hike - ps.hike < -0.0005 ? "down" : ""}">${sgn((s.hike - ps.hike) * 100, 1)} pp vs ${lb}</em>` : ""}`) +
      (y1 && y1 !== nx ? box(`Priced by ${fmtD(y1.d)}`, `${sgn(y1.cum, 1)} bp`, `${(y1.cum / 25).toFixed(2)} hikes · ${dTxt(y1)}`) : "") +
      box(`Priced by ${fmtD(last.d, true)}`, `${sgn(last.cum, 1)} bp`, `${(last.cum / 25).toFixed(2)} hikes · ${dTxt(last)}`);
  }

  // ---------- grouped bar chart: now vs then for every meeting ----------
  function chart(now, prv) {
    const el = $("fedChart"), W = Math.max(300, el.clientWidth), H = W < 560 ? 250 : 300;
    const ms = now.meetings, n = ms.length;
    const val = (m) => (view === "bps" ? m.cum : m.rate);
    // "then" in the same terms: bps relative to today's EFFR, so both bars share one baseline
    const tv = (m) => { const q = prv && prv.meetings.find((x) => x.d === m.d); return q ? (view === "bps" ? (q.rate - now.effr) * 100 : q.rate) : null; };
    const all = ms.flatMap((m) => [val(m), tv(m)]).filter((v) => v != null);
    let lo, hi;
    if (view === "bps") { lo = Math.min(0, ...all); hi = Math.max(0, ...all); const pad = Math.max(5, (hi - lo) * 0.12); hi += pad; if (lo < 0) lo -= pad; }
    else { lo = Math.min(now.lower, ...all); hi = Math.max(now.lower + 0.25, ...all); const pad = (hi - lo) * 0.15 || 0.05; lo -= pad; hi += pad; }
    const step = view === "bps" ? niceStep((hi - lo) / 5) : niceStep((hi - lo) / 5);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const L = 46, R = 10, T = 14, B = 34, pw = W - L - R, ph = H - T - B;
    const y = (v) => T + ph * (1 - (v - lo) / (hi - lo));
    const gw = pw / n, bw = Math.max(4, Math.min(22, gw * 0.32)), gap = 2;
    const base = view === "bps" ? y(0) : y(lo);
    let g = "";
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const yy = y(v).toFixed(1), z = view === "bps" && Math.abs(v) < 1e-9;
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" style="stroke:var(--line);stroke-width:${z ? 1.2 : 1}${z ? "" : ";stroke-dasharray:2 3"}"/>`;
      g += `<text x="${L - 6}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end" class="fx">${view === "bps" ? (v > 0 ? "+" : "") + Math.round(v) : v.toFixed(2) + "%"}</text>`;
    }
    if (view === "rate") { // today's target range as a band
      g += `<rect x="${L}" width="${pw}" y="${y(now.lower + 0.25).toFixed(1)}" height="${(y(now.lower) - y(now.lower + 0.25)).toFixed(1)}" style="fill:var(--accent-soft);opacity:.7"/>`;
    }
    const bar = (x, v, cls) => {
      if (v == null) return "";
      const y1 = y(v), top = Math.min(y1, base), h = Math.max(1, Math.abs(base - y1)), r = Math.min(4, bw / 2, h);
      // rounded data end, square at the baseline
      const up = y1 <= base;
      const d = up ? `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${top + h}Z`
        : `M${x},${top}V${top + h - r}Q${x},${top + h} ${x + r},${top + h}H${x + bw - r}Q${x + bw},${top + h} ${x + bw},${top + h - r}V${top}Z`;
      return `<path d="${d}" class="${cls}"/>`;
    };
    ms.forEach((m, i) => {
      const cx = L + gw * (i + 0.5), t = tv(m), sel = m.d === selM;
      if (sel) g += `<rect x="${(L + gw * i + 1).toFixed(1)}" y="${T}" width="${(gw - 2).toFixed(1)}" height="${ph}" rx="4" style="fill:var(--accent-soft)"/>`;
      g += bar(cx - bw - gap / 2, t, "fb-then") + bar(cx + gap / 2, val(m), "fb-now");
      const every = gw < 30 ? 2 : 1, lab = gw < 46 ? iso2date(m.d).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : fmtD(m.d);
      if (i % every === 0 || sel) g += `<text x="${cx.toFixed(1)}" y="${H - B + 15}" text-anchor="middle" class="fx${sel ? " sel" : ""}">${lab}</text>`;
      if (i === 0 || m.d.slice(0, 4) !== ms[i - 1].d.slice(0, 4)) g += `<text x="${cx.toFixed(1)}" y="${H - B + 28}" text-anchor="middle" class="fx yr">${m.d.slice(0, 4)}</text>`;
      g += `<rect class="hit" data-i="${i}" x="${(L + gw * i).toFixed(1)}" y="${T}" width="${gw.toFixed(1)}" height="${ph + B}" fill="transparent"/>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${view === "bps" ? "Basis points of hikes priced" : "Implied fed funds rate"} after each FOMC meeting, now vs ${lb} ago">${g}</svg>`;
    const tip = $("fedTip");
    const show = (i, ev) => {
      const m = ms[i], q = prv && prv.meetings.find((x) => x.d === m.d), s = sides(m, now.lower);
      const row = (k, a, b) => `<span>${k}</span><span>${a}</span><span>${b}</span>`;
      tip.innerHTML = `<b>FOMC ${fmtD(m.d, true)}</b><div class="g3"><span></span><span class="h">Now</span><span class="h">${lb} ago</span>` +
        row("Implied", m.rate.toFixed(3) + "%", q ? q.rate.toFixed(3) + "%" : "–") +
        row("Priced", sgn(m.cum, 1) + " bp", q ? sgn((q.rate - now.effr) * 100, 1) + " bp" : "–") +
        row("This mtg", sgn(m.move, 1) + " bp", q ? sgn(q.move, 1) + " bp" : "–") +
        `</div><div class="rv">Change: ${q ? `<strong>${sgn((m.rate - q.rate) * 100, 1)} bp</strong>` : "no data"} · P(above today's range) ${pct(s.hike)}</div><div class="rv mut">Click for probabilities</div>`;
      tip.hidden = false;
      const box = el.getBoundingClientRect(), cx = L + gw * (i + 0.5);
      let left = cx + 14; if (left + 230 > box.width) left = Math.max(0, cx - 244);
      tip.style.left = left + "px"; tip.style.top = Math.max(0, (ev ? ev.clientY - box.top : 40) - 60) + "px";
    };
    el.querySelectorAll(".hit").forEach((r) => {
      r.addEventListener("mousemove", (e) => show(+r.dataset.i, e));
      r.addEventListener("mouseleave", () => { tip.hidden = true; });
      r.addEventListener("click", () => { selM = ms[+r.dataset.i].d; render(); });
    });
    $("fedLeg").innerHTML = `<span><i class="sw now"></i>Now (${fmtD(now.d)})</span><span><i class="sw then"></i>${prv ? `${lb} ago (${fmtD(prv.d)})` : `${lb} ago: no data yet`}</span>` +
      `<span>${view === "bps" ? "Bars: cumulative bps above (+) or below (−) today's EFFR after each meeting" : "Bars: futures-implied effective fed funds rate after each meeting; band = today's target range"}</span>`;
  }
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }

  // ---------- probability distribution for the selected meeting ----------
  function probs(now, prv) {
    const m = now.meetings.find((x) => x.d === selM) || now.meetings[0], q = prv && prv.meetings.find((x) => x.d === m.d);
    const keys = [...new Set([...Object.keys(m.p), ...(q ? Object.keys(q.p) : [])])].sort((a, b) => b - a).filter((k) => (m.p[k] || 0) >= 0.001 || (q && (q.p[k] || 0) >= 0.001));
    const rows = keys.map((k) => {
      const a = m.p[k] || 0, b = q ? q.p[k] || 0 : null, d = b == null ? null : (a - b) * 100, cur = Math.abs(+k - now.lower) < 0.001;
      const tag = +k > now.lower + 0.001 ? `+${Math.round((+k - now.lower) * 100)}bp` : +k < now.lower - 0.001 ? `−${Math.round((now.lower - +k) * 100)}bp` : "hold";
      return `<div class="pr${cur ? " cur" : ""}"><div class="pk">${rangeTxt(k)}<small>${tag}</small></div>` +
        `<div class="pb"><i class="now" style="width:${(a * 100).toFixed(1)}%"></i>${b != null ? `<i class="then" style="width:${(b * 100).toFixed(1)}%"></i>` : ""}</div>` +
        `<div class="pv">${pct(a)}<small>${b != null ? `${pct(b)} · <span class="${d > 0.05 ? "up" : d < -0.05 ? "down" : ""}">${sgn(d, 1)} pp</span>` : ""}</small></div></div>`;
    }).join("");
    const s = sides(m, now.lower);
    $("fedProb").innerHTML = `<div class="sig-head"><h3>FOMC ${fmtD(m.d, true)}: target range probabilities</h3><span class="score">${s.hike >= s.hold && s.hike >= s.cut ? "Hike favoured" : s.cut > s.hold ? "Cut favoured" : "Hold favoured"}</span></div>` +
      `<p class="note" style="margin:0 0 10px">Implied rate ${m.rate.toFixed(3)}%${q ? ` (${sgn((m.rate - q.rate) * 100, 1)} bp vs ${lb} ago)` : ""} · ${sgn(m.cum, 1)} bp priced from today, ${sgn(m.move, 1)} bp at this meeting. Bars: now; thin line: ${lb} ago.</p>${rows}`;
  }

  function table(now, prv) {
    const head = `<tr><th>Meeting</th><th>Implied rate</th><th>Δ ${lb}</th><th>Bps priced</th><th>This mtg</th><th>P(hike)</th><th>Δ ${lb}</th><th>P(hold)</th><th>P(cut)</th></tr>`;
    const body = now.meetings.map((m) => {
      const q = prv && prv.meetings.find((x) => x.d === m.d), s = sides(m, now.lower), sq = q ? sides(q, now.lower) : null;
      const dr = q ? (m.rate - q.rate) * 100 : null, dp = sq ? (s.hike - sq.hike) * 100 : null;
      const c = (v, e) => v == null ? "–" : `<span class="${v > e ? "up" : v < -e ? "down" : ""}">${sgn(v, 1)}</span>`;
      return `<tr class="${m.d === selM ? "on" : ""}" data-d="${m.d}"><td>${fmtD(m.d)} ’${m.d.slice(2, 4)}</td><td>${m.rate.toFixed(3)}%</td><td>${c(dr, 0.05)}</td><td>${sgn(m.cum, 1)}</td><td>${sgn(m.move, 1)}</td><td>${pct(s.hike)}</td><td>${c(dp, 0.05)}</td><td>${pct(s.hold)}</td><td>${pct(s.cut)}</td></tr>`;
    }).join("");
    $("fedTab").innerHTML = `<table class="ctab ftab">${head}${body}</table>`;
    $("fedTab").querySelectorAll("tr[data-d]").forEach((tr) => tr.onclick = () => { selM = tr.dataset.d; render(); });
  }

  function render() {
    if (!F || !F.snapshots || !F.snapshots.length) { $("fedKpi").innerHTML = ""; $("fedChart").innerHTML = `<p class="sub">Fed funds futures data could not be loaded right now.</p>`; return; }
    const now = F.snapshots.at(-1), prv = then(now);
    if (!selM || !now.meetings.some((m) => m.d === selM)) selM = now.meetings[0].d;
    controls(); kpis(now, prv); chart(now, prv); probs(now, prv); table(now, prv);
    $("fedNote").textContent = `Computed from CBOT 30-day fed funds futures (same method as CME FedWatch: each meeting's implied move is split between the two nearest 25bp outcomes and chained meeting by meeting). ` +
      `Futures as of ${F.quoteTime ? sgt(F.quoteTime) + " SGT" : fmtD(now.d, true)}; comparison uses the ${prv ? fmtD(prv.d, true) : "–"} settle. "Bps priced" for both dates is measured from today's EFFR (${now.effr.toFixed(2)}%), so the change is the shift in the expected rate. Futures can be delayed; for information only.`;
  }

  async function load() {
    try {
      const r = await fetch("../data/fedwatch.json?t=" + Date.now(), { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && (!F || j.updated !== F.updated)) { F = j; render(); } else if (!F) render();
    } catch (e) { if (!F) render(); }
  }
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => F && render(), 150); });
  load(); setInterval(load, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
