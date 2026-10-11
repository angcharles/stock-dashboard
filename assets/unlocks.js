/* Share unlock (lock-up expiry) schedule section.
   Reads unlocks.json next to the page and, if it exists, fills <section id="unlocks"> (or adds one after
   the holders section). For each tranche it shows the shares released, their market value at the live
   price (data/quote.json), and the tranche as a % of average daily volume (20-session average from the
   "v" array in data/history.json, falling back to the figure in unlocks.json). Status (released / next /
   upcoming) is worked out from today's New York date. Refreshes the price every minute.
   EN / 中文 follows <html lang>. Edit unlocks.json when a results date is announced. */
(function () {
  let host = document.getElementById("unlocks");
  if (!host) {
    const after = document.getElementById("holders") || document.getElementById("cashflow");
    if (!after) return;
    host = document.createElement("section"); host.id = "unlocks"; after.after(host);
  }
  host.setAttribute("aria-label", "Share unlock schedule");
  const ADV_N = 20;

  const L = {
    en: {
      nav: "Unlocks", h: "Share unlock schedule",
      sub: "When locked-up insider and pre-IPO shares become sellable. Value uses the live price; the last column compares each tranche with the stock's average daily trading volume, so 400% means about four days of normal trading.",
      date: "Date", ev: "Tranche", grp: "Group", sh: "Shares", out: "% of shares out.", val: "Market value", adv: "% of avg daily volume", st: "Status",
      sRel: "Released", sNext: "Next", sUp: "Upcoming", sEst: "Date est.", sSkip: "Did not trigger",
      kNext: "Next unlock", kNextS: (d, n) => `${d} · in ${n} day${n === 1 ? "" : "s"}`,
      kRel: "Unlocked so far", kRelS: (p) => `${p} of shares outstanding`,
      k26: "Still to unlock in 2026", k26S: (v) => `${v} at the current price`,
      kAdv: "Avg daily volume", kAdvS: (n, d, live) => `${n}-session average · ${live ? "live, " : ""}as of ${d}`,
      days: (x) => `≈ ${x} days`,
      price: (p, d) => `Values at $${p} (${d}).`,
      note: "Share counts are the \"up to\" figures in the IPO prospectus; holders need not sell, so these are ceilings on new supply, not forecasts of selling. Earnings-linked tranches release on the second full trading day after results, and their dates here are estimates until SpaceX announces them. The extended group excludes Musk.",
      src: "Sources", asof: (d) => `Schedule checked ${d}.`, loading: "Loading unlock schedule…", fail: "Unlock schedule is not available.",
    },
    zh: {
      nav: "解禁", h: "股份解禁时间表",
      sub: "禁售的内部人及上市前股份何时可出售。市值按实时股价计算；最后一列为该批股份相当于日均成交量的百分比，400% 约等于四天的正常成交。",
      date: "日期", ev: "批次", grp: "组别", sh: "股数", out: "占总股本", val: "市值", adv: "占日均成交量", st: "状态",
      sRel: "已解禁", sNext: "下一批", sUp: "待解禁", sEst: "日期为估计", sSkip: "未触发",
      kNext: "下一批解禁", kNextS: (d, n) => `${d} · ${n} 天后`,
      kRel: "已解禁合计", kRelS: (p) => `占已发行股份 ${p}`,
      k26: "2026 年内待解禁", k26S: (v) => `按现价约 ${v}`,
      kAdv: "日均成交量", kAdvS: (n, d, live) => `近 ${n} 个交易日平均 · ${live ? "实时，" : ""}截至 ${d}`,
      days: (x) => `约 ${x} 天`,
      price: (p, d) => `市值按 $${p}（${d}）计算。`,
      note: "股数为招股书中的「最多」数量；持有人不一定出售，因此代表新增可售供给上限，而非抛售预测。与财报挂钩的批次在财报后第二个完整交易日解禁，公布前此处日期为估计。延长组不含马斯克。",
      src: "资料来源", asof: (d) => `时间表核对于 ${d}。`, loading: "载入解禁时间表…", fail: "暂无解禁时间表。",
    },
  };
  const lang = () => (document.documentElement.lang || "en").startsWith("zh") ? "zh" : "en";
  const t = (k) => L[lang()][k];
  const tx = (o) => o == null ? "" : typeof o === "string" ? o : (o[lang()] ?? o.en ?? "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fd = (s) => { const [y, m, d] = s.split("-").map(Number); return lang() === "zh" ? `${y}年${m}月${d}日` : `${MON[m - 1]} ${d}, ${y}`; };
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const money = (v) => {
    if (!isFinite(v)) return "—";
    if (lang() === "zh") return v >= 1e12 ? `$${(v / 1e12).toFixed(2)} 万亿` : `$${(v / 1e8).toFixed(0)} 亿`;
    return v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : `$${(v / 1e9).toFixed(1)}B`;
  };
  const shares = (m) => lang() === "zh" ? (m >= 1000 ? `${(m / 100).toFixed(1)} 亿` : `${(m / 100).toFixed(2)} 亿`) : (m >= 1000 ? `${(m / 1000).toFixed(2)}B` : `${m.toFixed(1)}M`);
  const pctS = (v) => !isFinite(v) ? "—" : v >= 10 ? Math.round(v).toLocaleString("en-US") + "%" : v.toFixed(1) + "%";

  const st = document.createElement("style");
  st.textContent = `
  #unlocks .ul-cells{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:14px}
  #unlocks td.num,#unlocks th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  #unlocks td.dt{white-space:nowrap;font-family:var(--f-mono);font-size:13px}
  #unlocks td.dt small{display:block;font-family:var(--f-body);color:var(--muted);font-size:11px}
  #unlocks tr.done td{color:var(--muted)}
  #unlocks tr.skip td{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--line)}
  #unlocks tr.next td{background:var(--accent-soft)}
  #unlocks .advbar{display:flex;align-items:center;gap:8px;justify-content:flex-end}
  #unlocks .advbar i{display:inline-block;height:6px;border-radius:3px;background:var(--copper);min-width:2px}
  #unlocks .advbar small{color:var(--muted);font-size:11px;display:block}
  #unlocks .grp{font:500 11px var(--f-mono);letter-spacing:.04em;color:var(--muted);white-space:nowrap}
  #unlocks .ul-note{font-size:12px;color:var(--muted);margin:10px 0 0}
  #unlocks .ul-note a{color:var(--muted)}
  #unlocks .tbl{overflow-x:auto}
  #unlocks td.ev,#unlocks th.ev{text-align:left;white-space:normal;min-width:220px}
  #unlocks td.stc,#unlocks th.stc{text-align:left}
  @media (max-width:860px){#unlocks .ul-cells{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (max-width:620px){#unlocks .hide-sm{display:none}#unlocks td.ev,#unlocks th.ev{min-width:150px}#unlocks .grp{display:none}#unlocks td.dt{font-size:12px}}`;
  document.head.appendChild(st);

  function navLink() {
    const nav = document.querySelector("nav.sec"); if (!nav) return;
    let a = nav.querySelector('a[href="#unlocks"]');
    if (!a) {
      a = document.createElement("a"); a.href = "#unlocks";
      const after = ["#holders", "#cashflow", "#revenue"].map((s) => nav.querySelector(`a[href="${s}"]`)).find(Boolean);
      after ? after.after(a) : nav.appendChild(a);
    }
    a.textContent = t("nav");
  }

  let D = null, Q = null, H = null, failed = false;

  function px() {
    if (Q && Q.price) return { p: Q.price, d: Q.date, live: true };
    return D ? { p: D.fallback.price, d: D.fallback.price_date, live: false } : null;
  }
  function adv() {
    if (H && Array.isArray(H.v)) {
      const vv = [], dd = [];
      for (let i = H.v.length - 1; i >= 0 && vv.length < ADV_N; i--) if (H.v[i] > 0) { vv.push(H.v[i]); dd.push(H.d[i]); }
      if (vv.length >= 10) return { v: vv.reduce((s, x) => s + x, 0) / vv.length, d: dd[0], live: true };
    }
    return D ? { v: D.fallback.adv, d: D.fallback.adv_date, live: false } : null;
  }

  function render() {
    navLink();
    if (!D) {
      host.innerHTML = `<h2>${t("h")}</h2><div class="panel"><p class="sub" style="margin:0">${failed ? t("fail") : t("loading")}</p></div>`;
      return;
    }
    const now = today(), P = px(), A = adv();
    const OUT = (typeof SHARES === "number" && SHARES > 0) ? SHARES : 13.182e9;
    const rows = D.tranches.slice().sort((a, b) => a.date.localeCompare(b.date));
    const live = rows.filter((r) => !r.skip);
    const next = live.find((r) => r.date > now);
    const relM = live.filter((r) => r.date <= now).reduce((s, r) => s + r.shares, 0);
    const rest26 = live.filter((r) => r.date > now && r.date < "2027-01-01").reduce((s, r) => s + r.shares, 0);
    const maxAdv = Math.max(...live.map((r) => r.shares * 1e6 / A.v * 100));

    const body = rows.map((r) => {
      const sh = r.shares * 1e6, val = sh * P.p, pa = sh / A.v * 100, days = sh / A.v;
      const done = r.date <= now;
      const status = r.skip ? t("sSkip") : done ? t("sRel") : r === next ? t("sNext") : t("sUp");
      const pill = r.skip ? "" : done ? "" : r === next ? "p-watch" : r.shares >= 1000 ? "p-risk" : "";
      const cls = r.skip ? "skip" : done ? "done" : r === next ? "next" : "";
      const dateCell = r.fixed ? fd(r.date) : `${esc(tx(r.est))}<small>${t("sEst")}</small>`;
      const w = Math.max(2, Math.round(Math.sqrt(pa / maxAdv) * 70));
      return `<tr class="${cls}">
        <td class="dt">${dateCell}</td>
        <td class="ev">${esc(tx(r))}<div class="grp">${esc(tx(D.groups[r.group]))}</div></td>
        <td class="num">${shares(r.shares)}</td>
        <td class="num hide-sm">${pctS(sh / OUT * 100)}</td>
        <td class="num">${money(val)}</td>
        <td class="num"><div class="advbar"><span>${pctS(pa)}<small>${t("days")(days >= 10 ? Math.round(days) : days.toFixed(1))}</small></span>${r.skip ? "" : `<i style="width:${w}px"></i>`}</div></td>
        <td class="stc">${pill ? `<span class="pill ${pill}">${status}</span>` : status}</td>
      </tr>`;
    }).join("");

    const nx = next ? `<div class="v">${shares(next.shares)} · ${money(next.shares * 1e6 * P.p)}</div><div class="s">${esc(next.fixed ? t("kNextS")(fd(next.date), dayDiff(now, next.date)) : tx(next.est))}</div>` : `<div class="v">—</div><div class="s"></div>`;
    const srcs = (D.sources || []).map((x) => `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(tx(x.t))}</a>`).join(" · ");
    host.innerHTML = `
      <h2>${t("h")}</h2>
      <p class="sub">${t("sub")}</p>
      <div class="cells ul-cells">
        <div class="cell"><div class="k">${t("kNext")}</div>${nx}</div>
        <div class="cell"><div class="k">${t("kRel")}</div><div class="v">${shares(relM)}</div><div class="s">${t("kRelS")(pctS(relM * 1e6 / OUT * 100))}</div></div>
        <div class="cell"><div class="k">${t("k26")}</div><div class="v">${shares(rest26)}</div><div class="s">${t("k26S")(money(rest26 * 1e6 * P.p))}</div></div>
        <div class="cell"><div class="k">${t("kAdv")}</div><div class="v">${shares(A.v / 1e6)}</div><div class="s">${t("kAdvS")(ADV_N, fd(A.d), A.live)}</div></div>
      </div>
      <div class="panel tbl"><table>
        <thead><tr><th>${t("date")}</th><th class="ev">${t("ev")}</th><th class="num">${t("sh")}</th><th class="num hide-sm">${t("out")}</th><th class="num">${t("val")}</th><th class="num">${t("adv")}</th><th class="stc">${t("st")}</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
      <p class="ul-note">${t("price")(P.p.toFixed(2), fd(P.d))} ${t("note")} ${t("asof")(fd(D.asof))}${srcs ? " " + t("src") + (lang() === "zh" ? "：" : ": ") + srcs : ""}</p>`;
  }

  async function loadLive() {
    const bust = "?t=" + Date.now();
    const [q, h] = await Promise.all([
      fetch("data/quote.json" + bust, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("data/history.json" + bust, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null)]);
    if (q && q.price) Q = q;
    if (h && h.d) H = h;
    if (D) render();
  }

  render();
  fetch("unlocks.json?t=" + Math.floor(Date.now() / 3600e3), { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((j) => { D = j; render(); })
    .catch(() => { failed = true; render(); });
  loadLive();
  setInterval(() => { if (!document.hidden) loadLive(); }, 60e3);
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
