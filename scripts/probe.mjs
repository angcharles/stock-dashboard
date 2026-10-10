const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const out = (s) => console.log("::notice::" + s.replace(/\n/g," ").slice(0, 1200));
const base = "https://optioncharts.io";
const r = await fetch(base + "/options/MU/option-history-iv", { headers: { "User-Agent": UA } }); const t = await r.text();
const refs = [...new Set([...t.matchAll(/["'](\/async\/[^"']+)["']/g)].map((m) => m[1].replace(/&amp;/g, "&")))];
out(`${r.status} len=${t.length} refs: ${refs.join(" | ")}`);
for (const ref of refs.filter((x) => /iv|histor|volat/i.test(x))) {
  const r2 = await fetch(base + ref, { headers: { "User-Agent": UA, "Accept": "*/*", "X-Requested-With": "XMLHttpRequest" } }); const t2 = await r2.text();
  out(`${r2.status} ${ref} len=${t2.length} :: ${t2.slice(0, 300)}`);
  const d = t2.match(/[^\n]{0,80}(\d{4}-\d{2}-\d{2})[^\n]{0,200}/); if (d) out("dates: " + d[0]);
  const ds = [...t2.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]); if (ds.length) out(`n dates ${ds.length} first ${ds[0]} last ${ds[ds.length - 1]} min ${ds.slice().sort()[0]}`);
}
