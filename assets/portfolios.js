/* Pelosi and Druckenmiller portfolio panels for the main page, under the top movers:
   #pfL — Nancy Pelosi household (estimated weights from STOCK Act filings, model performance vs S&P 500)
   #pfR — Stanley Druckenmiller / Duquesne Family Office (13F share counts marked to market since the quarter end;
          call rows at their underlying shares; weight = share of total reported value)
   Data: data/portfolios.json (holdings, trades, notes; edited when a filing lands) and
   data/portfolios-perf.json (built after each US close by scripts/build-portfolios.py in the ta-data workflow).
   Charts use TradingView Lightweight Charts, already loaded by the page. */
(function () {
  const L = document.getElementById("pfL"), R = document.getElementById("pfR");
  if (!L || !R) return;
  const PAGES = { NVDA: "nvda", BE: "be", GOOGL: "googl", AVGO: "avgo", INTC: "intc", AMZN: "amzn", MSFT: "msft", TSLA: "tesla",
    ARM: "arm", MU: "mu", AMD: "amd", META: "meta", PLTR: "pltr", TSM: "tsm", SNDK: "sndk", AAOI: "aaoi", AMAT: "amat",
    ASML: "asml", COHR: "cohr", GLW: "glw", LITE: "lite", MP: "mp", MRVL: "mrvl", ROK: "rok", SKHY: "skhy", SPCX: "spcx", TER: "ter", ZS: "zs" };

  const st = document.createElement("style");
  st.textContent = `
  .pf{margin-top:22px}
  .pf-card{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:14px;min-width:0}
  .pf-who{font:700 19px/1.15 var(--f-display);margin:0}
  .pf-sub{font-size:12px;color:var(--muted);margin:3px 0 12px}
  .pf-cells{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:10px}
  .pf-cell{border:1px solid var(--line);border-radius:4px;padding:7px 8px;min-width:0}
  .pf-cell b{display:block;font:600 10px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pf-cell span{display:block;font:600 16px var(--f-mono);font-variant-numeric:tabular-nums;margin-top:2px}
  .pf-cell i{display:block;font:500 10.5px var(--f-mono);font-style:normal;color:var(--muted);margin-top:1px;white-space:nowrap}
  .pf-leg{display:flex;gap:12px;font:500 10.5px var(--f-mono);color:var(--muted);margin:2px 0 4px}
  .pf-leg i{display:inline-block;width:10px;height:2px;vertical-align:middle;margin-right:4px}
  .pf-chart{height:150px;margin-bottom:10px}
  .pf table{width:100%;border-collapse:collapse;font:500 11.5px var(--f-mono);font-variant-numeric:tabular-nums}
  .pf th{font:600 9.5px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:right;padding:4px 3px;border-bottom:1px solid var(--line);white-space:nowrap}
  .pf th:first-child,.pf td:first-child{text-align:left}
  .pf td{text-align:right;padding:4px 3px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);white-space:nowrap}
  .pf td a{color:var(--accent);text-decoration:none}
  .pf td small{display:block;font:400 10px var(--f-body);color:var(--muted);max-width:110px;overflow:hidden;text-overflow:ellipsis}
  .pf .bar{display:block;height:3px;background:var(--accent);opacity:.5;border-radius:2px;margin-top:2px}
  .pf details{margin-top:10px;font-size:12px}
  .pf summary{cursor:pointer;font:600 11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
  .pf summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .pf-tr{display:grid;grid-template-columns:62px 44px minmax(0,1fr);gap:4px 6px;padding:5px 0;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);font-size:11.5px}
  .pf-tr .d{font:500 10.5px var(--f-mono);color:var(--muted)}
  .pf-tr .k{font:600 11px var(--f-mono)}
  .pf-tr .x{min-width:0}
  .pf-tr .x a{color:var(--muted);font-size:10.5px}
  .pf-note{font-size:11px;line-height:1.45;color:var(--muted);margin:10px 0 0}
  .pf-note a{color:var(--muted)}
  .pf-call{font:600 9px var(--f-mono);letter-spacing:.04em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:3px;padding:0 3px;margin-left:3px}
  .pf details table{margin-top:6px}
  .pf-flag{font:600 11px var(--f-mono);color:var(--accent);background:var(--accent-soft);border-radius:4px;padding:4px 7px;margin:0 0 10px}
  `;
  document.head.appendChild(st);

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sg = (x, d = 1) => { if (x == null) return "–"; const v = +x.toFixed(d); return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d) + "%"; };
  const cl = (x) => x == null ? "" : x >= 0 ? "up" : "down";
  const usd = (x) => x == null ? "–" : "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mil = (x) => x >= 1e9 ? "$" + (x / 1e9).toFixed(2) + "B" : "$" + (x / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "M";
  const fmtD = (iso, y) => { const [Y, M, D] = iso.split("-").map(Number); return new Date(Date.UTC(Y, M - 1, D)).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}), timeZone: "UTC" }); };
  const tick = (t) => PAGES[t] ? `<a href="${PAGES[t]}/">${esc(t)}</a>` : esc(t);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const cell = (label, val, sub) => `<div class="pf-cell"><b>${label}</b><span class="${cl(val)}">${sg(val)}</span><i>${sub}</i></div>`;
  async function getJSON(u) { try { const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }

  const charts = [];
  function chart(box, dates, a, b) {
    if (!window.LightweightCharts || !dates || dates.length < 2) { box.style.display = "none"; return; }
    const LW = window.LightweightCharts, ink = css("--muted"), line = css("--line");
    const c = LW.createChart(box, { autoSize: true, layout: { background: { color: "transparent" }, textColor: ink, fontSize: 10, fontFamily: css("--f-mono") },
      grid: { vertLines: { visible: false }, horzLines: { color: line } }, rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true }, handleScroll: false, handleScale: false,
      crosshair: { horzLine: { visible: false } } });
    const pf = { type: "custom", formatter: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%" };
    const rb = (s) => { const i = s.findIndex((x) => x != null), base = s[i]; return dates.map((d, j) => s[j] == null || j < i ? null : { time: d, value: (s[j] / base - 1) * 100 }).filter(Boolean); };
    c.addLineSeries({ color: css("--muted"), lineWidth: 1, priceFormat: pf, lastValueVisible: false, priceLineVisible: false }).setData(rb(b));
    c.addLineSeries({ color: css("--accent"), lineWidth: 2, priceFormat: pf, priceLineVisible: false }).setData(rb(a));
    c.timeScale().fitContent();
    charts.push(c);
  }

  function pelosi(cfg, p, fl) {
    const s = p.stats, f = cfg.last_stock_filing, trades = cfg.trades || [];
    const pend = fl && fl.unreviewed && fl.unreviewed.length ? `<div class="pf-flag">New filing ${esc(fl.unreviewed[0].filed)} · review pending</div>` : "";
    L.innerHTML = `<section class="pf" aria-label="Nancy Pelosi portfolio"><div class="mv-h"><span>Pelosi portfolio</span><span>close ${fmtD(p.dates.at(-1))}</span></div>
    <div class="pf-card">
      <h3 class="pf-who">${esc(cfg.title)}</h3>
      <div class="pf-sub">${esc(cfg.basis)} · last stock filing ${fmtD(f, true)}</div>
      ${pend}
      <div class="pf-cells">${cell("Today", s.d1, "S&P " + sg(s.spy_d1))}${cell("Since " + fmtD(f), s.sf, "S&P " + sg(s.spy_sf))}${cell("YTD (model)", s.ytd, "S&P " + sg(s.spy_ytd))}</div>
      <div class="pf-leg"><span><i style="background:var(--accent)"></i>Model portfolio</span><span><i style="background:var(--muted)"></i>S&amp;P 500 (SPY)</span><span>6 months</span></div>
      <div class="pf-chart"></div>
      <table><thead><tr><th>Stock</th><th>Weight</th><th>Price</th><th>Day</th><th>YTD</th></tr></thead><tbody>
      ${p.holdings.map((h) => `<tr><td>${tick(h.t)}<small>${esc(h.n)}</small></td><td>${h.w.toFixed(0)}%<span class="bar" style="width:${Math.min(100, h.w * 5)}%"></span></td><td>${usd(h.px)}</td><td class="${cl(h.d1)}">${sg(h.d1)}</td><td class="${cl(h.ytd)}">${sg(h.ytd, 0)}</td></tr>`).join("")}
      </tbody></table>
      <details><summary>Disclosed trades (${trades.length})</summary>
      ${trades.map(([d, t, ty, what, band, id, yr]) => `<div class="pf-tr"><span class="d">${fmtD(d, d.slice(0, 4) !== p.dates.at(-1).slice(0, 4))}</span><span class="k ${ty === "Sell" ? "down" : ty === "Buy" ? "up" : ""}">${esc(t)}</span>
        <span class="x">${esc(ty)} · ${esc(what)} · ${esc(band)} <a href="${cfg.filing_url.replace("{year}", yr || cfg.filing_year).replace("{id}", id)}" target="_blank" rel="noopener">filing</a></span></div>`).join("")}
      </details>
      <p class="pf-note">${cfg.latest_filing ? esc(cfg.latest_filing) + " " : ""}${esc(cfg.note)} Weights: <a href="${cfg.weights_source.url}" target="_blank" rel="noopener">${esc(cfg.weights_source.name)}</a>. Trades: House Clerk filings.</p>
    </div></section>`;
    chart(L.querySelector(".pf-chart"), p.dates, p.idx, p.spy);
  }

  function druck(cfg, t, fl) {
    const s = t.stats, TOP = 15;
    const pend = fl && fl.new ? `<div class="pf-flag">New 13F filed ${esc(fl.filed)} (period ${esc(fl.period)}) · update pending</div>` : "";
    const row = (h) => `<tr><td>${tick(h.t)}${h.call ? ' <span class="pf-call">calls</span>' : ""}<small>${esc(h.n)}</small></td><td>${(h.sh / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })}K</td><td>${mil(h.v)}</td><td>${h.w.toFixed(1)}%<span class="bar" style="width:${Math.min(100, h.w * 5)}%"></span></td><td class="${cl(h.sq)}">${sg(h.sq)}</td></tr>`;
    const head = `<thead><tr><th>Stock</th><th>Shares</th><th>Value</th><th>Weight</th><th>Since Q</th></tr></thead>`;
    const rest = t.holdings.slice(TOP), restW = rest.reduce((a, h) => a + h.w, 0);
    R.innerHTML = `<section class="pf" aria-label="Stanley Druckenmiller portfolio"><div class="mv-h"><span>Druckenmiller portfolio</span><span>close ${fmtD(t.dates.at(-1))}</span></div>
    <div class="pf-card">
      <h3 class="pf-who">${esc(cfg.title)}</h3>
      <div class="pf-sub">${esc(cfg.basis)} · as of ${fmtD(cfg.period, true)}, filed ${fmtD(cfg.filed)} · ${t.holdings.length} positions</div>
      ${pend}
      <div class="pf-cells"><div class="pf-cell"><b>Value now</b><span>${mil(s.now)}</span><i>filed ${mil(s.filed)}</i></div>${cell("Since " + fmtD(cfg.period), s.sq, "S&P " + sg(s.spy_sq))}${cell("Today", s.d1, "S&P " + sg(s.spy_d1))}</div>
      <div class="pf-leg"><span><i style="background:var(--accent)"></i>13F holdings</span><span><i style="background:var(--muted)"></i>S&amp;P 500 (SPY)</span><span>since ${fmtD(cfg.period)}</span></div>
      <div class="pf-chart"></div>
      <table>${head}<tbody>${t.holdings.slice(0, TOP).map(row).join("")}</tbody></table>
      ${rest.length ? `<details><summary>Other ${rest.length} positions (${restW.toFixed(1)}%)</summary><table>${head}<tbody>${rest.map(row).join("")}</tbody></table></details>` : ""}
      <p class="pf-note">${esc(cfg.previous)} ${esc(cfg.note)} Next 13F due by ${fmtD(cfg.next_due, true)}. Source: <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cfg.cik}&type=13F-HR" target="_blank" rel="noopener">SEC EDGAR</a>.</p>
    </div></section>`;
    chart(R.querySelector(".pf-chart"), t.dates, t.val, t.spy);
  }

  (async function () {
    const [cfg, perf] = await Promise.all([getJSON("data/portfolios.json"), getJSON("data/portfolios-perf.json")]);
    if (!cfg || !perf) return;
    const fl = perf.filings || {};
    if (perf.pelosi) pelosi(cfg.pelosi, perf.pelosi, fl.pelosi);
    if (perf.druck && cfg.druck) druck(cfg.druck, perf.druck, fl.druck);
  })();
})();
