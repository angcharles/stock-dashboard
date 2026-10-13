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

  /* ---------- interactive bar charts ----------
     Each chart has buttons to switch the measure, show/hide series and re-sort; hovering or focusing a
     row shows a tooltip, and clicking (or Enter) jumps to that company's card. Choices are remembered. */
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  const tip = document.createElement("div");
  tip.className = "ctip"; tip.setAttribute("role", "tooltip"); tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth;
    let left = Math.min(Math.max(8, x + 14), vw - w - 8), top = y - h - 12;
    if (top < 8) top = y + 18;
    tip.style.left = left + window.scrollX + "px"; tip.style.top = top + window.scrollY + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  window.addEventListener("scroll", hideTip, { passive: true });

  function jumpTo(id) {
    if (!document.getElementById("co-" + id)) { flt = "all"; store("dc-filter", "all"); filters(); cards(); }
    const el = document.getElementById("co-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }

  function segBtns(name, opts, cur) {
    return `<div class="seg" role="group" aria-label="${esc(name)}">${opts.map((o) =>
      `<button type="button" data-v="${esc(o.v)}" aria-pressed="${o.v === cur}">${esc(o.n)}</button>`).join("")}</div>`;
  }

  // cfg: id, host, controls(state) -> html, rows(state) -> [{c, bars:[{v, cls, lbl}], val, note, tipHtml}], max(rows)
  function makeChart(cfg) {
    const st = Object.assign({}, cfg.defaults);
    Object.keys(st).forEach((k) => { const v = store("dc-" + cfg.id + "-" + k); if (v != null) st[k] = v; });
    const host = $(cfg.host);
    host.innerHTML = `<div class="ctl"></div><div class="cbody" role="list"></div>`;
    const ctl = host.firstChild, body = host.lastChild;
    let rows = [];
    function render() {
      ctl.innerHTML = cfg.controls(st);
      rows = cfg.rows(st);
      const max = Math.max(1e-9, ...rows.flatMap((r) => r.bars.map((b) => b.v || 0)));
      body.innerHTML = rows.map((r, i) => `<div class="brow ib ${cfg.overlay ? "" : "multi"}" role="listitem" tabindex="0" data-i="${i}" aria-label="${esc(r.c.name)}: ${esc(r.aria)}">
          <div class="bl"><span>${esc(r.c.name)}</span></div>
          <div class="${cfg.overlay ? "bt" : "bt2"}">${r.bars.map((b) => cfg.overlay
            ? (b.v != null ? `<i class="${b.cls}" style="width:${(b.v / max * 100).toFixed(2)}%"></i>` : "")
            : `<div class="bt">${b.v != null ? `<i class="${b.cls}" style="width:${(Math.max(0, b.v) / max * 100).toFixed(2)}%"></i>` : ""}</div>`).join("")}</div>
          <div class="bv">${r.val}</div>
          ${r.note ? `<div class="bn">${esc(r.note)}</div>` : ""}
        </div>`).join("") || `<p class="note">Nothing to show with these settings.</p>`;
    }
    ctl.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const key = b.closest("[data-k]").dataset.k;
      if (key === "show") { // series toggles: keep at least one on
        const on = new Set(st.show.split(",")); const v = b.dataset.v;
        if (on.has(v)) { if (on.size > 1) on.delete(v); } else on.add(v);
        st.show = [...on].join(",");
      } else st[key] = b.dataset.v;
      store("dc-" + cfg.id + "-" + key, st[key]); render();
    });
    const rowOf = (e) => e.target.closest(".ib");
    let touch = false, armed = null;
    body.addEventListener("mousemove", (e) => { if (touch) return; const r = rowOf(e); if (!r) return hideTip(); showTip(rows[r.dataset.i].tipHtml, e.clientX, e.clientY); });
    body.addEventListener("mouseleave", () => { if (!touch) hideTip(); });
    body.addEventListener("focusin", (e) => { const r = rowOf(e); if (!r) return; const b = r.getBoundingClientRect(); showTip(rows[r.dataset.i].tipHtml, b.left + b.width / 2, b.top); });
    body.addEventListener("focusout", () => { if (!touch) hideTip(); });
    // Mouse: click opens the card. Touch: first tap shows the tooltip, a second tap on the same row opens the card.
    body.addEventListener("pointerdown", (e) => { touch = e.pointerType === "touch" || e.pointerType === "pen"; });
    body.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") touch = false; });
    body.addEventListener("click", (e) => {
      const r = rowOf(e); if (!r) return;
      if (touch && armed !== r) {
        armed = r; const b = r.getBoundingClientRect();
        showTip(rows[r.dataset.i].tipHtml.replace("Click to open the card", "Tap again to open the card"), b.left + b.width / 2, b.top);
        return;
      }
      armed = null; hideTip(); jumpTo(rows[r.dataset.i].c.id);
    });
    document.addEventListener("click", (e) => { if (armed && !body.contains(e.target)) { armed = null; hideTip(); } });
    body.addEventListener("keydown", (e) => {
      const r = rowOf(e); if (!r) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hideTip(); jumpTo(rows[r.dataset.i].c.id); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = r[e.key === "ArrowDown" ? "nextElementSibling" : "previousElementSibling"]; if (n) n.focus(); }
      if (e.key === "Escape") hideTip();
    });
    render();
  }
  const ctlRow = (k, label, html) => `<div class="cg" data-k="${k}"><span class="cgl">${esc(label)}</span>${html}</div>`;
  const toggles = (opts, cur) => { const on = new Set(cur.split(",")); return `<div class="seg tg" role="group">${opts.map((o) =>
    `<button type="button" data-v="${o.v}" aria-pressed="${on.has(o.v)}"><i class="sw ${o.cls}"></i>${esc(o.n)}</button>`).join("")}</div>`; };
  const pct = (g) => (g >= 0 ? "+" : "−") + Math.abs(g).toFixed(0) + "%";
  const sortBy = (arr, sort, keyFns) => arr.slice().sort(sort === "az" ? (a, b) => a.c.name.localeCompare(b.c.name) : (a, b) => (keyFns[sort](b) ?? -1) - (keyFns[sort](a) ?? -1));
  const grpOpts = () => [{ v: "all", n: "All" }].concat(D.groups.map((g) => ({ v: g.id, n: g.n.replace(" with their own fleet", "") })));

  // Revenue this year vs next (hyperscalers)
  function revChart() {
    makeChart({
      id: "rev", host: "revYears", defaults: { m: "usd", show: "ty,ny", sort: "ty" },
      controls: (st) => ctlRow("m", "Show", segBtns("Measure", [{ v: "usd", n: "Revenue $" }, { v: "g", n: "Growth %" }], st.m)) +
        ctlRow("show", "Years", toggles([{ v: "ty", n: "This year", cls: "nw" }, { v: "ny", n: "Next year", cls: "nx" }], st.show)) +
        ctlRow("sort", "Sort", segBtns("Sort", [{ v: "ty", n: "This year" }, { v: "ny", n: "Next year" }, { v: "az", n: "A–Z" }], st.sort)),
      rows: (st) => {
        const on = st.show.split(","), useG = st.m === "g";
        const pick = (r) => useG ? r.g : r.v;
        const base = D.companies.filter((c) => c.ry).map((c) => {
          const ty = c.ry[0], ny = c.ry[1];
          const bars = [];
          if (on.includes("ty")) bars.push({ v: pick(ty), cls: "nw" });
          if (on.includes("ny")) bars.push({ v: pick(ny), cls: "nx" });
          const fmt = (r) => useG ? pct(r.g) : money(r.v);
          const val = [on.includes("ty") ? ty : null, on.includes("ny") ? ny : null].filter(Boolean)
            .map((r) => `<div>${fmt(r)} <span>${esc(r.y)}${useG ? "" : " " + pct(r.g)}</span></div>`).join("");
          return { c, bars, val, aria: `${ty.y} ${money(ty.v)} (${pct(ty.g)}), ${ny.y} ${money(ny.v)} (${pct(ny.g)})`,
            tipHtml: `<b>${esc(c.name)}</b>` + c.ry.map((r, i) => `<div class="tr"><i class="sw ${i ? "nx" : "nw"}"></i>${i ? "Next year" : "This year"} · ${esc(r.y)}<span>${money(r.v)} <em class="${r.g >= 0 ? "up" : "down"}">${pct(r.g)}</em></span></div><small>${esc(r.p)} · ${esc(r.s)}</small>`).join("") + `<small class="hint">Click to open the card</small>` };
        });
        const k = { ty: (r) => pick(r.c.ry[0]), ny: (r) => pick(r.c.ry[1]) };
        return sortBy(base, st.sort, k);
      }
    });
  }

  // Power online now vs target
  function powerChart() {
    makeChart({
      id: "pw", host: "power", overlay: true, defaults: { show: "now,tgt", sort: "now", g: "all" },
      controls: (st) => ctlRow("show", "Show", toggles([{ v: "now", n: "Online now", cls: "nw" }, { v: "tgt", n: "Target", cls: "tg" }], st.show)) +
        ctlRow("sort", "Sort", segBtns("Sort", [{ v: "now", n: "Online now" }, { v: "tgt", n: "Target" }, { v: "x", n: "Growth to target" }, { v: "az", n: "A–Z" }], st.sort)) +
        ctlRow("g", "Group", segBtns("Group", grpOpts(), st.g)),
      rows: (st) => {
        const on = st.show.split(",");
        const base = D.companies.filter((c) => c.gw && (c.gw.now != null || c.gw.tgt != null) && (st.g === "all" || c.group === st.g)).map((c) => {
          const n = c.gw.now, t = c.gw.tgt, x = n && t ? t / n : null;
          const bars = [];
          if (on.includes("tgt")) bars.push({ v: t, cls: "tg" });
          if (on.includes("now")) bars.push({ v: n, cls: "nw" });
          const parts = [];
          if (on.includes("now")) parts.push(n != null ? gw(n) : "n/d");
          if (on.includes("tgt")) parts.push(`<span>${on.includes("now") ? "→ " : ""}${t != null ? gw(t) : "n/d"}</span>`);
          return { c, bars, val: parts.join(" "), aria: `now ${n != null ? gw(n) : "not disclosed"}, target ${t != null ? gw(t) : "not disclosed"}`,
            note: st.show === "now,tgt" || st.show === "tgt,now" ? "" : (on.includes("now") ? c.gw.nowT : c.gw.tgtT),
            tipHtml: `<b>${esc(c.name)}</b><div class="tr"><i class="sw nw"></i>Online now<span>${n != null ? gw(n) : "n/d"}</span></div><small>${esc(c.gw.nowT)}</small>` +
              `<div class="tr"><i class="sw tg"></i>Target<span>${t != null ? gw(t) : "n/d"}</span></div><small>${esc(c.gw.tgtT)}</small>` +
              (x ? `<div class="tr">Growth to target<span>${x.toFixed(1)}×</span></div>` : "") + `<small class="hint">Click to open the card</small>` };
        });
        return sortBy(base, st.sort, { now: (r) => r.c.gw.now, tgt: (r) => r.c.gw.tgt, x: (r) => r.c.gw.now && r.c.gw.tgt ? r.c.gw.tgt / r.c.gw.now : null });
      }
    });
  }

  // Capex this year
  function capexChart() {
    makeChart({
      id: "cx", host: "capexBars", defaults: { m: "usd", sort: "hi", g: "all" },
      controls: (st) => ctlRow("m", "Show", segBtns("Measure", [{ v: "usd", n: "Capex $" }, { v: "rev", n: "Capex ÷ revenue" }], st.m)) +
        ctlRow("sort", "Sort", segBtns("Sort", [{ v: "hi", n: "Largest" }, { v: "az", n: "A–Z" }], st.sort)) +
        ctlRow("g", "Group", segBtns("Group", grpOpts(), st.g)),
      rows: (st) => {
        const ratio = (c) => c.capexV != null && c.rev && c.rev.t ? c.capexV / c.rev.t * 100 : null;
        const val = (c) => st.m === "rev" ? ratio(c) : c.capexV;
        const base = D.companies.filter((c) => c.capexV != null && (st.g === "all" || c.group === st.g)).map((c) => ({
          c, bars: [{ v: val(c), cls: "nw" }],
          val: st.m === "rev" ? `${ratio(c).toFixed(0)}%` : money(c.capexV),
          aria: `${c.capexT}, ${ratio(c).toFixed(0)}% of latest annual revenue`,
          note: c.capexT,
          tipHtml: `<b>${esc(c.name)}</b><div class="tr">Capex<span>${money(c.capexV)}</span></div><small>${esc(c.capexT)}</small>` +
            `<div class="tr">Latest revenue<span>${money(c.rev.t)}</span></div><small>${esc(c.rev.p)}</small>` +
            `<div class="tr">Capex ÷ revenue<span>${ratio(c).toFixed(0)}%</span></div>` +
            c.capex.map((x) => `<small>· ${esc(x)}</small>`).join("") + `<small class="hint">Click to open the card</small>` }));
        return sortBy(base, st.sort, { hi: (r) => val(r.c) });
      }
    });
    const none = D.companies.filter((c) => c.capexV == null).map((c) => `${esc(c.name)}: ${esc(c.capexT)}`).join(" · ");
    $("capexNote").innerHTML = "Midpoint of each company's guidance; fiscal years differ (see each card). “Capex ÷ revenue” compares it with the latest full-year revenue. Not on the chart: " + none + ".";
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
    const bar = segs.map((s, i) => `<i class="${s.cls}" data-s="${i}" style="width:${s.pct.toFixed(2)}%" data-tip="${esc(`<b>${esc(s.n)}</b><div class="tr">Revenue<span>${money(s.v)} · ${s.pct.toFixed(0)}%</span></div>${s.s ? `<small>${esc(s.s)}</small>` : ""}`)}"></i>`).join("");
    const leg = segs.map((s, i) => `<li data-s="${i}"><i class="${s.cls}"></i><span class="sn">${esc(s.n)}${s.s ? `<small>${esc(s.s)}</small>` : ""}</span><span class="sv">${money(s.v)}</span><span class="sp">${s.pct.toFixed(0)}%</span></li>`).join("");
    return `<div class="mix"><div class="rbar" role="img" aria-label="Revenue mix">${bar}</div><ul class="rleg">${leg}</ul></div>`;
  }

  function fcTable(f) {
    const head = `<tr><th></th>${f.y.map((y) => `<th>${esc(y)}</th>`).join("")}</tr>`;
    const body = f.rows.map((r) => `<tr><td>${esc(r.n)}<small>${esc(r.s)}</small></td>${r.v.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
    return `<table class="ftab">${head}${body}</table>`;
  }

  // Revenue-mix bars: hovering a segment or a legend row highlights both and shows the figures.
  function mixHover() {
    const box = $("cards");
    const clear = () => box.querySelectorAll(".hl").forEach((e) => e.classList.remove("hl"));
    box.addEventListener("mouseover", (e) => {
      const t = e.target.closest("[data-s]"); clear();
      if (!t || !t.closest(".mix")) return;
      const mix = t.closest(".mix"), i = t.dataset.s;
      mix.classList.add("hl"); mix.querySelectorAll(`[data-s="${i}"]`).forEach((x) => x.classList.add("hl"));
    });
    box.addEventListener("mousemove", (e) => {
      const seg = e.target.closest(".rbar [data-s]");
      if (seg) showTip(seg.dataset.tip, e.clientX, e.clientY); else hideTip();
    });
    box.addEventListener("mouseleave", () => { clear(); hideTip(); });
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
      ${c.ry ? `<div class="ry">${c.ry.map((r, i) => `<div><b>${i ? "Next year" : "This year"} · ${esc(r.y)}</b><span>${money(r.v)}</span><em class="up">+${r.g.toFixed(0)}%</em><small>${esc(r.p)} · ${esc(r.s)}</small></div>`).join("")}</div>` : ""}
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
    tiles(); revChart(); powerChart(); capexChart(); filters(); cards(); mixHover(); chipTables(); sources();
  }).catch(() => { $("cards").innerHTML = '<p class="note">Could not load data/datacenter.json.</p>'; });
})();
