const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const H={"User-Agent":UA,Accept:"application/json, text/javascript, */*","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",Referer:"https://yield.chinabond.com.cn/cbweb-mn/yield_main?locale=zh_CN",Origin:"https://yield.chinabond.com.cn","X-Requested-With":"XMLHttpRequest"};
const CGB="2c9081e50a2f9606010a3068cae70001";
async function q(name,dcq,s,e){try{const r=await fetch(`https://yield.chinabond.com.cn/cbweb-mn/yc/queryYz?bjlx=no&&dcq=${dcq}&&startTime=${s}&&endTime=${e}&&qxlx=0,&&yqqxN=N&&yqqxK=K&&par=day&&ycDefIds=${CGB},&&locale=zh_CN`,{method:"POST",headers:H,signal:AbortSignal.timeout(30000)});const t=await r.text();let j;try{j=JSON.parse(t)}catch{console.log(name,r.status,t.slice(0,300));return}
console.log(name,r.status,Array.isArray(j)?j.map(x=>`${String(x.ycDefId).slice(32)}:${x.seriesData?.length}`).join(" "):t.slice(0,300));}catch(err){console.log(name,"ERR",err.message)}}
await q("2t-20d","1,1y;10,10y;","2026-10-01","2026-10-20");
await q("2t-1y","1,1y;10,10y;","2025-10-16","2026-10-20");
await q("2t-6m","1,1y;10,10y;","2026-04-20","2026-10-20");
await q("2t-3m","1,1y;10,10y;","2026-07-20","2026-10-20");
await q("13t-20d","0.25,0.25y;0.5,0.5y;1,1y;2,2y;3,3y;5,5y;7,7y;10,10y;15,15y;20,20y;30,30y;40,40y;50,50y;","2026-10-01","2026-10-20");
await q("frac-20d","0.25,0.25y;0.5,0.5y;","2026-10-01","2026-10-20");
await q("m-20d","0.25,3m;0.5,6m;","2026-10-01","2026-10-20");
await q("7t-20d","1,1y;2,2y;3,3y;5,5y;7,7y;10,10y;30,30y;","2026-10-01","2026-10-20");
