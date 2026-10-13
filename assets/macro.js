/* Macro page: tiles for crude oil, gold, silver and the 2/5/10/30-year Treasury yields, a history chart
   for the selected one, the yield curve vs 1 month and 1 year ago, and the economic calendar.
   Data: data/macro.json and data/macro-cal.json, built by scripts/fetch-macro.mjs in the deploy workflow.
   Re-polls every minute. Charts: TradingView Lightweight Charts. */
(function () {
  const TZ = "Asia/Singapore";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isY = (x) => x.kind === "yield";
  const fmtV = (x, v) => v == null ? "–" : isY(x) ? v.toFixed(3) + "%" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sgn = (v, d) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
  const chgTxt = (x, chg, pct) => chg == null ? "–" : isY(x) ? `${sgn(chg * 100, 1)} bp` : `${sgn(chg, 2)} (${sgn(pct, 2)}%)`;
  const sgt = (s) => new Date(s * 1000).toLocaleString("en-SG", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtD = (iso) => { const [Y, M, D] = iso.split("-").map(Number); return new Date(Date.UTC(Y, M - 1, D)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); };
  let M = null, CAL = null, sel = "oil", rangeN = 252, calFilter = "us";
  try { sel = localStorage.getItem("macro-sel") || sel; rangeN = +localStorage.getItem("macro-range") || rangeN; calFilter = localStorage.getItem("macro-cal") || calFilter; } catch (e) {}

  // closes with the live price appended (or replacing today's bar)
  function series(x) {
    const d = x.hist.d.slice(), c = x.hist.c.slice();
    if (x.price != null && x.time) {
      const day = new Date(x.time * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      if (d.length && d.at(-1) === day) c[c.length - 1] = x.price; else if (!d.length || day > d.at(-1)) { d.push(day); c.push(x.price); }
    }
    return { d, c };
  }
  const at = (s, daysBack) => { const t = new Date(Date.now() - daysBack * 864e5).toISOString().slice(0, 10); let v = null; for (let i = 0; i < s.d.length; i++) { if (s.d[i] <= t) v = s.c[i]; else break; } return v; };

  function spark(s) {
    const c = s.c.slice(-66); if (c.length < 2) return "";
    const lo = Math.min(...c), hi = Math.max(...c), w = 200, h = 34, k = hi - lo || 1;
    const pts = c.map((v, i) => `${(i / (c.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / k * (h - 4)).toFixed(1)}`).join(" ");
    const col = c.at(-1) >= c[0] ? "var(--up)" : "var(--down)";
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function tiles() {
    const put = (host, list) => {
      host.innerHTML = list.map((x) => {
        const s = series(x), cls = x.chg == null ? "" : x.chg >= 0 ? "up" : "down";
        return `<button type="button" class="tile" data-k="${x.k}" aria-pressed="${x.k === sel}"><b>${esc(x.short)}</b><span class="v">${fmtV(x, x.price)}</span><span class="c ${cls}">${chgTxt(x, x.chg, x.pct)}</span>
          ${spark(s)}<small>${x.realtime ? "Live" : "Delayed"} · ${sgt(x.time)} SGT</small></button>`;
      }).join("");
      host.querySelectorAll(".tile").forEach((b) => b.onclick = () => { sel = b.dataset.k; try { localStorage.setItem("macro-sel", sel); } catch (e) {} tiles(); chart(); });
    };
    put($("tC"), M.items.filter((x) => !isY(x)));
    put($("tY"), M.items.filter(isY));
  }

  let ch = null, line = null;
  function chart() {
    const x = M.items.find((i) => i.k === sel) || M.items[0]; if (!x) return;
    sel = x.k;
    const s = series(x), n = Math.min(rangeN, s.d.length), d = s.d.slice(-n), c = s.c.slice(-n);
    $("chH").textContent = x.name + (x.contract && !isY(x) ? ` · ${x.contract}` : "");
    const rg = document.querySelector(".rng");
    rg.innerHTML = [["1M", 22], ["3M", 66], ["6M", 128], ["1Y", 252]].map(([l, v]) => `<button type="button" data-n="${v}" aria-pressed="${v === rangeN}">${l}</button>`).join("");
    rg.querySelectorAll("button").forEach((b) => b.onclick = () => { rangeN = +b.dataset.n; try { localStorage.setItem("macro-range", rangeN); } catch (e) {} chart(); });
    if (window.LightweightCharts) {
      if (!ch) {
        ch = LightweightCharts.createChart($("chart"), { autoSize: true, localization: { locale: "en-US" }, layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono"), fontSize: 11 },
          grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false }, crosshair: { horzLine: { visible: true } } });
        line = ch.addAreaSeries({ lineColor: css("--accent"), topColor: "rgba(11,111,184,.18)", bottomColor: "rgba(11,111,184,0)", lineWidth: 2 });
      }
      line.applyOptions({ priceFormat: isY(x) ? { type: "custom", formatter: (v) => v.toFixed(2) + "%" } : { type: "price", precision: 2, minMove: 0.01 } });
      line.setData(d.map((t, i) => ({ time: t, value: c[i] })));
      ch.timeScale().fitContent();
    }
    const hi = Math.max(...c), lo = Math.min(...c), first = c[0], last = c.at(-1);
    const ch1m = at(s, 30), ch1y = at(s, 365);
    const delta = (a) => a == null ? "–" : isY(x) ? sgn((last - a) * 100, 0) + " bp" : sgn((last / a - 1) * 100, 1) + "%";
    $("stats").innerHTML = `<div>Last<span>${fmtV(x, last)}</span></div><div>1 month<span>${delta(ch1m)}</span></div><div>1 year<span>${delta(ch1y)}</span></div>
      <div>Range high<span>${fmtV(x, hi)}</span></div><div>Range low<span>${fmtV(x, lo)}</span></div><div>Over range<span>${delta(first)}</span></div>`;
    $("chNote").textContent = `Quote: ${x.src}${x.realtime ? " (real time)" : " (may be delayed)"}, ${sgt(x.time)} SGT. History: ${x.hsrc}, daily closes${d.length ? " from " + fmtD(d[0]) : ""}.${isY(x) ? "" : " Front-month futures; the contract rolls before expiry."}`;
  }

  let cv = null, cvS = [];
  function curve() {
    const Y = ["us2y", "us5y", "us10y", "us30y"].map((k) => M.items.find((i) => i.k === k)).filter(Boolean);
    if (Y.length < 4) { $("curve").closest("section").hidden = true; return; }
    const lab = ["2Y", "5Y", "10Y", "30Y"], yrs = [2, 5, 10, 30];
    const now = Y.map((x) => series(x).c.at(-1)), m1 = Y.map((x) => at(series(x), 30)), y1 = Y.map((x) => at(series(x), 365));
    const rows = [["Now", now, css("--accent"), 2], ["1 month ago", m1, css("--muted"), 1], ["1 year ago", y1, "#d97706", 1]];
    if (window.LightweightCharts) {
      // years-to-maturity on a time axis: use fake daily timestamps so spacing is proportional to maturity
      const T = (y) => 86400 * 30 * y;
      if (!cv) cv = LightweightCharts.createChart($("curve"), { autoSize: true, layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono"), fontSize: 11 },
        grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } }, rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, tickMarkFormatter: (t) => { const i = yrs.findIndex((y) => T(y) === t); return i >= 0 ? lab[i] : ""; } },
        localization: { locale: "en-US", timeFormatter: (t) => { const i = yrs.findIndex((y) => T(y) === t); return i >= 0 ? lab[i] : ""; } },
        handleScroll: false, handleScale: false });
      cvS.forEach((s) => cv.removeSeries(s)); cvS = [];
      for (const [, v, col, w] of rows.slice().reverse()) {
        if (v.some((z) => z == null)) continue;
        const s = cv.addLineSeries({ color: col, lineWidth: w, priceFormat: { type: "custom", formatter: (z) => z.toFixed(2) + "%" }, lastValueVisible: false, priceLineVisible: false, pointMarkersVisible: true });
        s.setData(yrs.map((y, i) => ({ time: T(y), value: v[i] }))); cvS.push(s);
      }
      cv.timeScale().fitContent();
    }
    $("cvLeg").innerHTML = rows.map(([n, , col, w]) => `<span><i style="background:${col};height:${w + 1}px"></i>${n}</span>`).join("");
    const bp = (a, b) => a == null || b == null ? "–" : sgn((a - b) * 100, 0) + " bp";
    const sp = (v) => v.some((z) => z == null) ? [null, null] : [v[2] - v[0], v[3] - v[2]];
    const [s1, s2] = sp(now), [m1a, m1b] = sp(m1), [y1a, y1b] = sp(y1);
    $("cvTab").innerHTML = `<table class="ctab"><thead><tr><th></th><th>Now</th><th>1M chg</th><th>1Y chg</th></tr></thead><tbody>
      ${Y.map((x, i) => `<tr><td>${lab[i]}</td><td>${now[i].toFixed(2)}%</td><td>${bp(now[i], m1[i])}</td><td>${bp(now[i], y1[i])}</td></tr>`).join("")}
      <tr><td>10Y–2Y</td><td class="${s1 < 0 ? "down" : ""}">${s1 == null ? "–" : sgn(s1 * 100, 0) + " bp"}</td><td>${bp(s1, m1a)}</td><td>${bp(s1, y1a)}</td></tr>
      <tr><td>30Y–10Y</td><td>${s2 == null ? "–" : sgn(s2 * 100, 0) + " bp"}</td><td>${bp(s2, m1b)}</td><td>${bp(s2, y1b)}</td></tr></tbody></table>
      <p class="note">Curve points use the latest quote; 1-month and 1-year values are US Treasury daily closes.</p>`;
  }

  let calShown = 0;
  function calendar() {
    const host = $("cal"), f = document.querySelector(".flt");
    const F = [["us", "US"], ["high", "High impact, all"], ["all", "All"]];
    f.innerHTML = F.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === calFilter}">${l}</button>`).join("");
    f.querySelectorAll("button").forEach((b) => b.onclick = () => { calFilter = b.dataset.k; try { localStorage.setItem("macro-cal", calFilter); } catch (e) {} calShown = 0; calendar(); });
    if (!CAL || !CAL.events) { host.innerHTML = `<p class="sub">The calendar could not be loaded right now.</p>`; return; }
    const ok = (e) => calFilter === "all" ? true : calFilter === "high" ? e.imp === "High" : e.c === "USD" || (e.c === "All" && e.imp !== "Low");
    const evs = CAL.events.filter(ok), now = Date.now() / 1000;
    const dayK = (s) => new Date(s * 1000).toLocaleDateString("en-CA", { timeZone: TZ }), today = dayK(now);
    const limit = calShown || 200;
    let html = `<div class="chead2"><span>SGT</span><span></span><span>Event</span><span>Forecast</span><span>Previous</span></div>`, last = "";
    evs.slice(0, limit).forEach((e) => {
      const k = dayK(e.ts);
      if (k !== last) { last = k; html += `<div class="cday${k === today ? " today" : ""}">${k === today ? "Today · " : ""}${new Date(e.ts * 1000).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })}</div>`; }
      const tm = new Date(e.ts * 1000).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
      html += `<div class="crow${e.ts < now - 3600 ? " past" : ""}"><span class="tm">${tm}</span><span class="cc">${esc(e.c)}</span><span><i class="imp ${esc(e.imp)}" title="${esc(e.imp)} impact"></i>${esc(e.t)}${e.act ? ` · <b>${esc(e.act)}</b>` : ""}</span>
        <span class="num"><b>Fcst</b>${esc(e.fc || "–")}</span><span class="num"><b>Prev</b>${esc(e.pv || "–")}</span></div>`;
    });
    host.innerHTML = evs.length ? `<div class="cal">${html}</div>` + (evs.length > limit ? `<button type="button" class="more">Show all (${evs.length})</button>` : "") : `<p class="sub">No events for this filter.</p>`;
    const m = host.querySelector(".more"); if (m) m.onclick = () => { calShown = evs.length; calendar(); };
    $("calSub").textContent = `This week and next, in Singapore time, updated ${sgt(CAL.updated)} SGT. Dots mark expected market impact (red high, orange medium, yellow low).`;
  }

  async function getJSON(u) { try { const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  async function load() {
    const [m, c] = await Promise.all([getJSON("../data/macro.json"), getJSON("../data/macro-cal.json")]);
    const mChanged = m && m.items && m.items.length && (!M || m.updated !== M.updated);
    if (mChanged) { M = m; tiles(); chart(); curve(); }
    else if (!M) { $("tC").innerHTML = `<p class="sub">Macro prices could not be loaded right now.</p>`; }
    if (c && (!CAL || c.updated !== CAL.updated)) { CAL = c; calendar(); } else if (!CAL) calendar();
  }
  load(); setInterval(load, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
