/* Datacenter page: hyperscalers, neoclouds, AI labs and colocation REITs, with their chips, power (GW),
   capex, revenue mix and 2026–2028 revenue outlook. Data: data/datacenter.json, edited by hand
   (figures are dated in the file; update after each earnings season). No live data. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (v) => v == null ? "—" : "$" + (v >= 100 ? v.toFixed(0) : v >= 1 ? +v.toFixed(1) : v.toFixed(2)) + "B";
  const gw = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + " GW";
  let D = null, flt = "all";
  try { flt = localStorage.getItem("dc-filter") || "all"; } catch (e) {}

  const srcLink = (i) => {
    const s = D.sources[i];
    return s ? `<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a>` : "";
  };

  function tiles() {
    $("tiles").innerHTML = (D.tiles || []).map((t) =>
      `<div class="tile"><b>${esc(t.k)}</b><span class="v">${esc(t.v)}</span><small title="${esc(t.s)}">${esc(t.s)}</small></div>`).join("");
  }

  // Horizontal bars: power online now (solid) against the stated target (outline).
  function powerChart() {
    const rows = D.companies.filter((c) => c.gw && (c.gw.now != null || c.gw.tgt != null));
    const max = Math.max(...rows.map((c) => Math.max(c.gw.now || 0, c.gw.tgt || 0)));
    const sc = (v) => (v / max * 100).toFixed(2) + "%";
    $("power").innerHTML = rows.map((c) => {
      const now = c.gw.now, tgt = c.gw.tgt;
      return `<div class="brow">
        <div class="bl"><span>${esc(c.name)}</span></div>
        <div class="bt">
          ${tgt != null ? `<i class="tg" style="width:${sc(tgt)}"></i>` : ""}
          ${now != null ? `<i class="nw" style="width:${sc(now)}"></i>` : ""}
        </div>
        <div class="bv">${now != null ? gw(now) : "n/d"}<span>${tgt != null ? " → " + gw(tgt) : ""}</span></div>
        <div class="bn">${esc(c.gw.nowT)} · ${esc(c.gw.tgtT)}</div>
      </div>`;
    }).join("");
  }

  function capexChart() {
    const rows = D.companies.filter((c) => c.capexV != null).sort((a, b) => b.capexV - a.capexV);
    const max = rows[0].capexV;
    $("capexBars").innerHTML = rows.map((c) => `<div class="brow">
        <div class="bl"><span>${esc(c.name)}</span></div>
        <div class="bt"><i class="nw" style="width:${(c.capexV / max * 100).toFixed(2)}%"></i></div>
        <div class="bv">${money(c.capexV)}</div>
        <div class="bn">${esc(c.capexT)}</div>
      </div>`).join("");
    const none = D.companies.filter((c) => c.capexV == null).map((c) => `${esc(c.name)}: ${esc(c.capexT)}`).join(" · ");
    $("capexNote").innerHTML = "Midpoint of each company's guidance; fiscal years differ (see each card). Not on the chart: " + none + ".";
  }

  function filters() {
    const opts = [{ id: "all", n: "All" }].concat(D.groups);
    $("flt").innerHTML = opts.map((g) => `<button type="button" data-g="${g.id}" aria-pressed="${g.id === flt}">${esc(g.n)}</button>`).join("");
    $("flt").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      flt = b.dataset.g;
      try { localStorage.setItem("dc-filter", flt); } catch (err) {}
      filters(); cards();
    };
  }

  function revBar(r) {
    const tot = r.segs.reduce((a, s) => a + s.v, 0);
    let k = 0;
    const segs = r.segs.map((s) => {
      const cls = s.dc ? "dc" : "o" + (k++ % 4);
      return { ...s, cls, pct: s.v / tot * 100 };
    });
    const bar = segs.map((s) => `<i class="${s.cls}" style="width:${s.pct.toFixed(2)}%" title="${esc(s.n)}: ${money(s.v)}"></i>`).join("");
    const leg = segs.map((s) => `<li><i class="${s.cls}"></i><span class="sn">${esc(s.n)}${s.s ? `<small>${esc(s.s)}</small>` : ""}</span><span class="sv">${money(s.v)}</span><span class="sp">${s.pct.toFixed(0)}%</span></li>`).join("");
    return `<div class="rbar" role="img" aria-label="Revenue mix">${bar}</div><ul class="rleg">${leg}</ul>`;
  }

  function fcTable(f) {
    const head = `<tr><th></th>${f.y.map((y) => `<th>${esc(y)}</th>`).join("")}</tr>`;
    const body = f.rows.map((r) => `<tr><td>${esc(r.n)}<small>${esc(r.s)}</small></td>${r.v.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
    return `<table class="ftab">${head}${body}</table>`;
  }

  function cards() {
    const list = D.companies.filter((c) => flt === "all" || c.group === flt);
    const gname = Object.fromEntries(D.groups.map((g) => [g.id, g.n]));
    $("cards").innerHTML = list.map((c) => `<article class="co" id="co-${c.id}">
      <header>
        <div><span class="tick">${esc(c.ticker)}</span><span class="grp g-${c.group}">${esc(gname[c.group])}</span></div>
        <h3>${esc(c.name)}</h3>
        <p class="desc">${esc(c.blurb)}</p>
      </header>
      <div class="kv">
        <div><b>Power</b><span>${c.gw.now != null ? gw(c.gw.now) : "n/d"}</span><small>${esc(c.gw.nowT)}</small></div>
        <div><b>Target</b><span>${c.gw.tgt != null ? gw(c.gw.tgt) : "n/d"}</span><small>${esc(c.gw.tgtT)}</small></div>
        <div><b>Capex</b><span>${c.capexV != null ? money(c.capexV) : "—"}</span><small>${esc(c.capexT)}</small></div>
      </div>
      <h4>Chips (CPU / GPU / accelerators)</h4>
      <ul class="chips">${c.chips.map((x) => `<li><span class="ck k-${esc(x.k)}">${esc(x.k)}</span><span class="cn">${esc(x.n)}<small>${esc(x.s)}</small></span></li>`).join("")}</ul>
      <h4>Spending</h4>
      <ul class="bul">${c.capex.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h4>Revenue mix · ${esc(c.rev.p)} · ${money(c.rev.t)}</h4>
      ${revBar(c.rev)}
      <h4>Outlook</h4>
      ${fcTable(c.fc)}
      <p class="wt">${esc(c.watch)}</p>
      <footer>${c.page ? `<a class="go" href="../${esc(c.page)}">Open the ${esc(c.ticker.split(": ")[1] || c.name)} dashboard →</a>` : ""}<details><summary>Sources</summary><ol>${c.src.map((i) => `<li>${srcLink(i)}</li>`).join("")}</ol></details></footer>
    </article>`).join("");
  }

  function chipTables() {
    $("prices").innerHTML = `<table class="ctab"><tr><th>Chip or system</th><th>Maker</th><th>Price</th><th>Basis</th></tr>` +
      D.chipPrices.map((p) => `<tr><td>${esc(p.c)}</td><td>${esc(p.v)}</td><td class="n">${esc(p.p)}</td><td class="b">${esc(p.b)}</td></tr>`).join("") + `</table>`;
    $("rental").innerHTML = `<table class="ctab"><tr><th>Chip</th><th>Where</th><th>$ per GPU-hour</th></tr>` +
      D.rental.map((p) => `<tr><td>${esc(p.c)}</td><td>${esc(p.w)}</td><td class="n">${esc(p.p)}</td></tr>`).join("") + `</table>`;
    $("chipSrc").innerHTML = "Sources: " + D.chipSrc.map(srcLink).join(" · ");
  }

  function sources() {
    $("srcList").innerHTML = D.sources.map((s, i) => `<li>${srcLink(i)}</li>`).join("");
  }

  fetch("../data/datacenter.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    D = d;
    $("asof").textContent = d.asofText;
    $("dnote").textContent = d.note;
    tiles(); powerChart(); capexChart(); filters(); cards(); chipTables(); sources();
  }).catch(() => { $("cards").innerHTML = '<p class="note">Could not load data/datacenter.json.</p>'; });
})();
