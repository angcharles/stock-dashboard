/* FX page: tiles for the majors, nine Asian dollar pairs and two crosses, a commentary panel for the selected pair, a history
   chart with the same indicators as the Macro page, and the economic calendar for these currencies.
   Data: data/fx.json (scripts/fetch-fx.mjs) and data/macro-cal.json (scripts/fetch-macro.mjs), deploy workflow.
   Re-polls every minute. Charts: TradingView Lightweight Charts. */
(function () {
  const TZ = "Asia/Singapore";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isY = () => false;
  const CCYN = { USD: "US dollar", EUR: "euro", GBP: "pound", AUD: "Australian dollar", JPY: "yen", CHF: "Swiss franc", CAD: "Canadian dollar", CNH: "offshore yuan", HKD: "Hong Kong dollar", SGD: "Singapore dollar", KRW: "won", IDR: "rupiah", INR: "rupee", TWD: "Taiwan dollar", MYR: "ringgit", PHP: "peso" };
  const dp = (x) => (x && x.dp != null ? x.dp : 4);
  const fx = (x, v) => v.toLocaleString("en-US", { minimumFractionDigits: dp(x), maximumFractionDigits: dp(x) });
  const nth = (a, i) => a[a.length + i]; // a.at(i) for negative i, for older browsers
  const fmtV = (x, v) => v == null ? "–" : fx(x, v);
  const sgn = (v, d) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
  const chgTxt = (x, chg, pct) => chg == null ? "–" : `${sgn(chg, dp(x))} (${sgn(pct, 2)}%)`;
  const sgt = (s) => new Date(s * 1000).toLocaleString("en-SG", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtD = (iso) => { const [Y, M, D] = iso.split("-").map(Number); return new Date(Date.UTC(Y, M - 1, D)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); };
  let M = null, CAL = null, sel = "eurusd", rangeN = 252, calFilter = "fx";
  try { sel = localStorage.getItem("fx-sel") || sel; rangeN = +localStorage.getItem("fx-range") || rangeN; calFilter = localStorage.getItem("fx-cal") || calFilter; } catch (e) {}

  // Trading date a quote belongs to: the FX day rolls at 5pm New York time,
  // so a quote after 17:00 ET (or on a weekend) counts toward the next weekday's bar.
  function sessionDay(ts) {
    const p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ts * 1000)).forEach((q) => { p[q.type] = q.value; });
    const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
    if (+p.hour >= 17) d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  // daily OHLC with the live price folded into today's bar (older files may hold closes only)
  function series(x) {
    const H = x.hist, d = H.d.slice(), c = H.c.slice();
    const o = (H.o || H.c).slice(), h = (H.h || H.c).slice(), l = (H.l || H.c).slice();
    if (x.price != null && x.time) {
      const day = sessionDay(x.time), p = x.price;
      if (d.length && nth(d, -1) === day) { const k = c.length - 1; c[k] = p; h[k] = Math.max(h[k], p); l[k] = Math.min(l[k], p); }
      else if (!d.length || day > nth(d, -1)) { const pc = c.length ? nth(c, -1) : p; d.push(day); o.push(pc); h.push(Math.max(pc, p)); l.push(Math.min(pc, p)); c.push(p); }
    }
    return { d, o, h, l, c };
  }

  // ---------- indicators (same formulas as the stock pages' technical charts) ----------
  const sma = (a, n) => { const out = Array(a.length).fill(null); let t = 0; for (let i = 0; i < a.length; i++) { t += a[i]; if (i >= n) t -= a[i - n]; if (i >= n - 1) out[i] = t / n; } return out; };
  const ema = (a, n) => { const k = 2 / (n + 1); let e = null; return a.map((v, i) => { e = e == null ? v : v * k + e * (1 - k); return i < n - 1 ? null : e; }); };
  function macd(c) {
    const e12 = ema(c, 12), e26 = ema(c, 26);
    const m = c.map((_, i) => e12[i] == null || e26[i] == null ? null : e12[i] - e26[i]);
    let s0 = -1; for (let i = 0; i < m.length; i++) if (m[i] != null) { s0 = i; break; }
    const sig = Array(c.length).fill(null);
    if (s0 >= 0) ema(m.slice(s0), 9).forEach((v, j) => { sig[s0 + j] = v; });
    return { m, sig, hist: m.map((v, i) => v == null || sig[i] == null ? null : v - sig[i]) };
  }
  function rsi(c, n) {
    n = n || 14; const out = Array(c.length).fill(null); if (c.length <= n) return out;
    let g = 0, q = 0;
    for (let i = 1; i <= n; i++) { const dd = c[i] - c[i - 1]; g += Math.max(dd, 0); q += Math.max(-dd, 0); }
    g /= n; q /= n; out[n] = q ? 100 - 100 / (1 + g / q) : 100;
    for (let i = n + 1; i < c.length; i++) { const dd = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(dd, 0)) / n; q = (q * (n - 1) + Math.max(-dd, 0)) / n; out[i] = q ? 100 - 100 / (1 + g / q) : 100; }
    return out;
  }
  function psar(h, l, step, max) {
    step = step || 0.02; max = max || 0.2;
    const n = h.length, out = Array(n).fill(null), tr = Array(n).fill(null); if (n < 3) return { out, tr };
    let up = h[1] >= h[0], af = step, ep = up ? Math.max(h[0], h[1]) : Math.min(l[0], l[1]), sar = up ? Math.min(l[0], l[1]) : Math.max(h[0], h[1]);
    for (let i = 2; i < n; i++) {
      sar = sar + af * (ep - sar);
      if (up) { sar = Math.min(sar, l[i - 1], l[i - 2]); if (l[i] < sar) { up = false; sar = ep; ep = l[i]; af = step; } else if (h[i] > ep) { ep = h[i]; af = Math.min(af + step, max); } }
      else { sar = Math.max(sar, h[i - 1], h[i - 2]); if (h[i] > sar) { up = true; sar = ep; ep = h[i]; af = step; } else if (l[i] < ep) { ep = l[i]; af = Math.min(af + step, max); } }
      out[i] = sar; tr[i] = up;
    }
    return { out, tr };
  }
  const at = (s, daysBack) => { const t = new Date(Date.now() - daysBack * 864e5).toISOString().slice(0, 10); let v = null; for (let i = 0; i < s.d.length; i++) { if (s.d[i] <= t) v = s.c[i]; else break; } return v; };

  function spark(s) {
    const c = s.c.slice(-66); if (c.length < 2) return "";
    const lo = Math.min(...c), hi = Math.max(...c), w = 200, h = 34, k = hi - lo || 1;
    const pts = c.map((v, i) => `${(i / (c.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / k * (h - 4)).toFixed(1)}`).join(" ");
    const col = nth(c, -1) >= c[0] ? "var(--up)" : "var(--down)";
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // Tile status: "Live" for real-time quotes; onshore-only currencies (ringgit, rupiah, rupee) say so after their
  // local close; any other quote older than 45 minutes while FX is open (Sun 5pm to Fri 5pm New York) is flagged stale.
  function liveTag(x) {
    const age = Date.now() / 1000 - x.time, p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).forEach((q) => { p[q.type] = q.value; });
    const wd = p.weekday, hr = +p.hour, open = !(wd === "Sat" || (wd === "Sun" && hr < 17) || (wd === "Fri" && hr >= 17));
    if (open && age > 2700) return x.onshore ? "Onshore close" : `<span class="down">Stale ${Math.round(age / 60)} min</span>`;
    return x.realtime ? "Live" : "Delayed";
  }

  // ---------- commentary for the selected pair: what moved it, the call, latest headlines ----------
  // Narrative comes from data/fx-recap.json rows (written by Claude after each New York close: note, why, view);
  // the live move and technical state are computed here from the same data as the tile and chart.
  let REC = null, NEWS = null;
  const NEWSM = { eur: /\beuro\b|EUR\/|\bECB\b|Lagarde/i, gbp: /sterling|\bpound\b|GBP|Bank of England|\bBoE\b/i, aud: /Australian dollar|Aussie|\bRBA\b/i,
    jpy: /\byen\b|JPY|Bank of Japan|\bBOJ\b|Katayama|intervention/i, chf: /Swiss franc|\bfranc\b|\bSNB\b/i, cad: /Canadian dollar|loonie|Bank of Canada/i,
    cnh: /yuan|renminbi|\bCNH\b|\bCNY\b|PBOC|People's Bank/i, hkd: /Hong Kong dollar|HKMA|\bHKD\b/i, sgd: /Singapore dollar|\bMAS\b|\bSGD\b|S\$NEER/i,
    krw: /\bwon\b|\bKRW\b|Bank of Korea|\bBOK\b|Kospi/i, twd: /Taiwan dollar|\bTWD\b|Taiwan's central bank|\bTaiex\b/i, myr: /ringgit|\bMYR\b|Bank Negara/i,
    php: /Philippine peso|\bpeso\b|\bPHP\b|Bangko Sentral|\bBSP\b/i, idr: /rupiah|\bIDR\b|Bank Indonesia/i, inr: /rupee|\bINR\b|Reserve Bank of India|\bRBI\b/i };
  const DIRL = { up: ["▲", "Higher"], down: ["▼", "Lower"], range: ["◆", "Range"] };
  function commentary(scroll) {
    const box = $("fxc"); if (!box || !M) return;
    const x = M.items.find((i) => i.k === sel); if (!x) { box.hidden = true; return; }
    const S = series(x), last = nth(S.c, -1), row = REC && REC.rows ? REC.rows[x.k] : null;
    const pc = (a) => a == null ? "–" : sgn((last / a - 1) * 100, 2) + "%";
    const pcls = (a) => a == null ? "" : last >= a ? "up" : "down";
    const w1 = at(S, 7), m1 = at(S, 30), ma30 = nth(sma(S.c, 30), -1), r = nth(rsi(S.c, 14), -1), m = macd(S.c);
    const [a, b] = x.short.split("/"), base = CCYN[a] || a, quote = CCYN[b] || b;
    // which currency is doing the moving: for USD/xxx a rise means the dollar gained
    const lead = x.chg == null ? "" : x.chg >= 0 ? `${base} firmer` : `${quote} firmer`;
    const tech = [ma30 == null ? "" : `${last >= ma30 ? "above" : "below"} its 30-day average (${fx(x, ma30)})`,
      r == null ? "" : `RSI ${r.toFixed(0)}${r >= 70 ? ", overbought" : r <= 30 ? ", oversold" : ""}`,
      nth(m.m, -1) == null ? "" : `MACD ${nth(m.m, -1) >= nth(m.sig, -1) ? "above" : "below"} signal`].filter(Boolean).join(" · ");
    const v = row && row.view, [ic, lab] = v ? DIRL[v.dir] || DIRL.range : ["", ""];
    const lvl = (n) => (+n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(+n) && dp(x) <= 2 ? 0 : dp(x), maximumFractionDigits: dp(x) });
    const call = v ? `<p class="fxc-call"><span class="fr-d fr-${esc(v.dir)}">${ic} ${lab}</span> ${esc(v.call || "")}${v.target != null ? ` · target <b>${lvl(v.target)}</b>` : ""}${v.stop != null ? ` · wrong ${v.dir === "down" ? "above" : v.dir === "up" ? "below" : "outside"} <b>${lvl(v.stop)}</b>` : ""}</p>` : "";
    const re = NEWSM[(a === "USD" ? b : a).toLowerCase()], since = Date.now() / 1000 - 4 * 86400;
    const heads = re && NEWS && NEWS.items ? NEWS.items.filter((n) => n.ts >= since && re.test(n.title)).sort((p, q) => q.ts - p.ts)
      .filter((n, i, all) => all.findIndex((o) => o.title === n.title) === i).slice(0, 4) : [];
    const why = row && (row.why || row.note);
    box.innerHTML = `<div class="fxc-h"><div><div class="eyebrow">What's moving ${esc(x.short)}</div><h2>${esc(x.name)}</h2></div>
        <div class="fxc-m"><span>Now <b>${fmtV(x, x.price)}</b></span><span>Today <b class="${x.chg == null ? "" : x.chg >= 0 ? "up" : "down"}">${x.pct == null ? "–" : sgn(x.pct, 2) + "%"}</b></span><span>1 week <b class="${pcls(w1)}">${pc(w1)}</b></span><span>1 month <b class="${pcls(m1)}">${pc(m1)}</b></span></div></div>
      ${why ? `<div class="fxc-g"><div class="fxc-l">Why it moved</div><p>${esc(row.why || row.note)}</p>${row.why && row.note ? `<p class="fxc-s"><b>Week to ${esc(REC.asof || "last close")}:</b> ${esc(row.note)}</p>` : ""}</div>` : `<p class="sub">Commentary for this pair arrives with the next daily FX recap.</p>`}
      ${row && row.outlook ? `<div class="fxc-g"><div class="fxc-l">Expert view</div><p>${esc(row.outlook)}</p>${call}</div>` : call ? `<div class="fxc-g"><div class="fxc-l">My call (${esc((REC && REC.horizon) || "1–2 weeks")})</div>${call}</div>` : ""}
      <div class="fxc-g"><div class="fxc-l">Right now</div><p class="fxc-s">${lead ? esc(lead) + " today; " : ""}${esc(tech)}. ${esc(liveTag(x).replace(/<[^>]+>/g, ""))} quote, ${sgt(x.time)} SGT.</p></div>
      ${row && row.watch ? `<div class="fxc-g"><div class="fxc-l">Watch</div><p class="fxc-s">${esc(row.watch)}</p></div>` : ""}
      ${heads.length ? `<div class="fxc-g"><div class="fxc-l">Latest headlines</div><ul class="fxc-n">${heads.map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span>${esc(n.src || "")} · ${sgt(n.ts)}</span></li>`).join("")}</ul></div>` : ""}
      <p class="fxc-f">Commentary by Claude${REC ? `, as of ${esc(REC.commentary_asof || REC.asof)}` : ""}; refreshed after each New York close. Moves and technicals update live. A market view, not financial advice.</p>`;
    box.hidden = false;
    if (scroll && box.getBoundingClientRect().top > innerHeight - 120) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function tiles() {
    const put = (host, list) => {
      host.innerHTML = list.map((x) => {
        const s = series(x), cls = x.chg == null ? "" : x.chg >= 0 ? "up" : "down";
        return `<button type="button" class="tile" data-k="${x.k}" aria-pressed="${x.k === sel}"><b>${esc(x.short)}</b><span class="v">${fmtV(x, x.price)}</span><span class="c ${cls}">${chgTxt(x, x.chg, x.pct)}</span>
          ${spark(s)}<small>${liveTag(x)} · ${sgt(x.time)} SGT</small></button>`;
      }).join("");
      host.querySelectorAll(".tile").forEach((b) => b.onclick = () => { sel = b.dataset.k; try { localStorage.setItem("fx-sel", sel); } catch (e) {} tiles(); chart(); commentary(true); });
    };
    const host = $("tC"), groups = [...new Set(M.items.map((x) => x.g || "Pairs"))];
    host.innerHTML = groups.map((g, i) => `<div class="grp">${esc(g)}</div><div class="tiles" id="tg${i}"></div>`).join("");
    groups.forEach((g, i) => put($("tg" + i), M.items.filter((x) => (x.g || "Pairs") === g)));
  }

  const IND = [["ma5", "MA 5", "#d97706"], ["ma10", "MA 10", "#7c3aed"], ["ma30", "MA 30", "#0d9488"], ["ma100", "MA 100", "#64748b"], ["sar", "SAR", "#0b6fb8"], ["macd", "MACD", ""], ["rsi", "RSI", ""]];
  let on = { ma5: true, ma10: true, ma30: true, ma100: true, sar: true, macd: true, rsi: true };
  try { const z = JSON.parse(localStorage.getItem("fx-ind") || "null"); if (z) for (const k in z) on[k] = z[k]; } catch (e) {}
  let C = null; // { main, mac, rs, candle, ma{}, sar, mh, ml, ms, rl, r70, r30 }
  function mkChart(el, h) {
    return LightweightCharts.createChart(el, { autoSize: true, localization: { locale: "en-US" },
      layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono"), fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } }, rightPriceScale: { borderVisible: false, minimumWidth: 64 },
      timeScale: { borderVisible: false, visible: h }, crosshair: { mode: 0 } });
  }
  function build() {
    const up = css("--up"), dn = css("--down");
    const main = mkChart($("chart"), true), mac = mkChart($("chMacd"), false), rs = mkChart($("chRsi"), false);
    const candle = main.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn });
    const ma = {};
    IND.slice(0, 4).forEach(([k, , col]) => { ma[k] = main.addLineSeries({ color: col, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); });
    const sar = main.addLineSeries({ color: "#0b6fb8", lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const mh = mac.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    const ml = mac.addLineSeries({ color: css("--accent"), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    const ms = mac.addLineSeries({ color: "#d97706", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const rl = rs.addLineSeries({ color: "#7c3aed", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    rl.createPriceLine({ price: 70, color: dn, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    rl.createPriceLine({ price: 30, color: up, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    // keep the three panes on the same time window
    const all = [main, mac, rs]; let busy = false;
    all.forEach((c) => c.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (busy || !r) return; busy = true; all.forEach((o) => { if (o !== c) o.timeScale().setVisibleLogicalRange(r); }); busy = false; }));
    main.subscribeCrosshairMove((p) => ohlc(p && p.time ? p.time : null));
    C = { main, mac, rs, candle, ma, sar, mh, ml, ms, rl };
  }
  let cur = null;
  function ohlc(t) {
    if (!cur) return;
    const S = cur.s, i = t ? S.d.indexOf(typeof t === "string" ? t : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`) : S.d.length - 1;
    const k = i < 0 ? S.d.length - 1 : i, x = cur.x, f = (v) => v == null ? "–" : fx(x, v);
    const pc = k ? S.c[k - 1] : null, chg = pc ? (isY(x) ? sgn((S.c[k] - pc) * 100, 1) + " bp" : sgn((S.c[k] / pc - 1) * 100, 2) + "%") : "";
    const I = cur.I;
    $("chOhlc").innerHTML = `<b>${fmtD(S.d[k])}</b> O ${f(S.o[k])} H ${f(S.h[k])} L ${f(S.l[k])} C ${f(S.c[k])} <span class="${S.c[k] >= (pc || S.c[k]) ? "up" : "down"}">${chg}</span>`
      + `<span class="mut"> · MA5 ${f(I.ma5[k])} · MA10 ${f(I.ma10[k])} · MA30 ${f(I.ma30[k])} · MA100 ${f(I.ma100[k])} · SAR ${f(I.sar.out[k])} · RSI ${I.r[k] == null ? "–" : I.r[k].toFixed(0)} · MACD ${I.m.m[k] == null ? "–" : I.m.m[k].toFixed(dp(x) + 1)}</span>`;
  }
  function chart() {
    const x = M.items.find((i) => i.k === sel) || M.items[0]; if (!x) return;
    sel = x.k;
    const S = series(x), N = S.d.length, n = Math.min(rangeN, N), from = N - n;
    const I = { ma5: sma(S.c, 5), ma10: sma(S.c, 10), ma30: sma(S.c, 30), ma100: sma(S.c, 100), sar: psar(S.h, S.l), m: macd(S.c), r: rsi(S.c, 14) };
    cur = { x, s: S, I };
    $("chH").textContent = `${x.short} · ${x.name}`;
    const rg = document.querySelector(".rng");
    rg.innerHTML = [["1M", 22], ["3M", 66], ["6M", 128], ["1Y", 252]].map(([l, v]) => `<button type="button" data-n="${v}" aria-pressed="${v === rangeN}">${l}</button>`).join("");
    rg.querySelectorAll("button").forEach((b) => b.onclick = () => { rangeN = +b.dataset.n; try { localStorage.setItem("fx-range", rangeN); } catch (e) {} chart(); });
    const tg = $("chInd");
    tg.innerHTML = IND.map(([k, l, col]) => `<button type="button" data-k="${k}" aria-pressed="${!!on[k]}">${col ? `<i style="background:${col}"></i>` : ""}${l}</button>`).join("");
    tg.querySelectorAll("button").forEach((b) => b.onclick = () => { on[b.dataset.k] = !on[b.dataset.k]; try { localStorage.setItem("fx-ind", JSON.stringify(on)); } catch (e) {} chart(); });
    $("chMacd").hidden = !on.macd; $("chRsi").hidden = !on.rsi;
    const flat = !x.hist.o;
    if (window.LightweightCharts) {
      if (!C) build();
      const pf = { type: "price", precision: dp(x), minMove: Math.pow(10, -dp(x)) };
      // every date gets a point (blank where the indicator has no value yet) so all panes share one bar index
      const pts = (a) => S.d.map((t, i) => a[i] == null ? { time: t } : { time: t, value: a[i] });
      C.candle.applyOptions({ priceFormat: pf });
      C.candle.setData(S.d.map((t, i) => ({ time: t, open: S.o[i], high: S.h[i], low: S.l[i], close: S.c[i] })));
      ["ma5", "ma10", "ma30", "ma100"].forEach((k) => { C.ma[k].applyOptions({ priceFormat: pf, visible: !!on[k] }); C.ma[k].setData(pts(I[k])); });
      C.sar.applyOptions({ priceFormat: pf, visible: !!on.sar });
      C.sar.setData(pts(I.sar.out));
      const up = css("--up"), dn = css("--down");
      C.mh.setData(S.d.map((t, i) => I.m.hist[i] == null ? { time: t } : { time: t, value: I.m.hist[i], color: I.m.hist[i] >= 0 ? up : dn }));
      C.ml.setData(pts(I.m.m)); C.ms.setData(pts(I.m.sig));
      C.rl.setData(pts(I.r));
      // show the chosen range; earlier bars stay loaded so the 100-day average starts at the left edge
      const r = { from: from - 0.5, to: N - 0.5 + 2 };
      [C.main, C.mac, C.rs].forEach((c) => c.timeScale().setVisibleLogicalRange(r));
    }
    ohlc(null);
    const c = S.c.slice(from), hi = Math.max(...S.h.slice(from)), lo = Math.min(...S.l.slice(from)), first = c[0], last = nth(c, -1);
    const ch1m = at(S, 30), ch1y = at(S, 365);
    const delta = (a) => a == null ? "–" : isY(x) ? sgn((last - a) * 100, 0) + " bp" : sgn((last / a - 1) * 100, 1) + "%";
    const rv = nth(I.r, -1), mm = nth(I.m.m, -1), ms = nth(I.m.sig, -1), sv = nth(I.sar.out, -1), st = nth(I.sar.tr, -1);
    $("stats").innerHTML = `<div>Last<span>${fmtV(x, last)}</span></div><div>1 month<span>${delta(ch1m)}</span></div><div>1 year<span>${delta(ch1y)}</span></div>
      <div>Range high<span>${fmtV(x, hi)}</span></div><div>Range low<span>${fmtV(x, lo)}</span></div>
      <div>RSI 14<span class="${rv >= 70 ? "down" : rv <= 30 ? "up" : ""}">${rv == null ? "–" : rv.toFixed(0)}${rv >= 70 ? " overbought" : rv <= 30 ? " oversold" : ""}</span></div>
      <div>MACD<span class="${mm >= ms ? "up" : "down"}">${mm == null || ms == null ? "–" : mm >= ms ? "Above signal" : "Below signal"}</span></div>
      <div>Parabolic SAR<span class="${st ? "up" : "down"}">${sv == null ? "–" : (st ? "Up · " : "Down · ") + fmtV(x, sv)}</span></div>`;
    $("chNote").textContent = `Quote: ${x.src}${x.realtime ? " (real time)" : " (may be delayed)"}, ${sgt(x.time)} SGT. History: ${x.hsrc}, daily bars${S.d.length ? " from " + fmtD(S.d[from]) : ""}; today's bar includes the latest quote. Indicators: simple moving averages (5, 10, 30, 100 days), Parabolic SAR (0.02, 0.2), MACD (12, 26, 9), RSI 14.${flat ? " This history has closes only, so candles show the close." : ""} A rising ${x.short} means a stronger ${CCYN[x.short.slice(0, 3)] || x.short.slice(0, 3)} against the ${CCYN[x.short.slice(4)] || x.short.slice(4)}. FX trades around the clock on weekdays; daily bars roll at 5pm New York time.`;
  }

  let calShown = 0;
  function calendar() {
    const host = $("cal"), f = document.querySelector(".flt");
    const F = [["fx", "These currencies"], ["high", "High impact, these currencies"], ["all", "All"]];
    const CCY = ["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "CNY", "JPY", "All"];
    f.innerHTML = F.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === calFilter}">${l}</button>`).join("");
    f.querySelectorAll("button").forEach((b) => b.onclick = () => { calFilter = b.dataset.k; try { localStorage.setItem("fx-cal", calFilter); } catch (e) {} calShown = 0; calendar(); });
    if (!CAL || !CAL.events) { host.innerHTML = `<p class="sub">The calendar could not be loaded right now.</p>`; return; }
    const ok = (e) => calFilter === "all" ? true : CCY.includes(e.c) && (calFilter === "high" ? e.imp === "High" : e.imp !== "Low");
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
  let lastSlow = 0;
  async function load() {
    const slow = !REC || Date.now() - lastSlow > 600000;
    const [m, c, rc, nw] = await Promise.all([getJSON("../data/fx.json"), getJSON("../data/macro-cal.json"),
      slow ? getJSON("../data/fx-recap.json") : null, slow ? getJSON("../data/fx-news.json") : null]);
    if (slow) { lastSlow = Date.now(); if (rc) REC = rc; if (nw) NEWS = nw; }
    const mChanged = m && m.items && m.items.length && (!M || m.updated !== M.updated);
    if (mChanged) { M = m; tiles(); chart(); }
    if (M && (mChanged || slow)) commentary(false);
    else if (!M) { $("tC").innerHTML = `<p class="sub">FX rates could not be loaded right now.</p>`; }
    if (c && (!CAL || c.updated !== CAL.updated)) { CAL = c; calendar(); } else if (!CAL) calendar();
  }
  load(); setInterval(load, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
