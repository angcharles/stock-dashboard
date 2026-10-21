const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const H={"User-Agent":UA,Referer:"https://www.chinamoney.com.cn/chinese/mtmoncjgl/",Origin:"https://www.chinamoney.com.cn","X-Requested-With":"XMLHttpRequest","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",Accept:"application/json, text/plain, */*"};
const B="https://www.chinamoney.com.cn";
const get=async(u,m="GET",b)=>{try{const r=await fetch(u,{method:m,headers:H,body:b,signal:AbortSignal.timeout(25000)});return [r.status,await r.text()]}catch(e){return [0,String(e)]}};
let [,h]=await get(B+"/r/cms/chinese/chinamoney/html/bond/monthly-bond-lending.html");
for(const x of h.matchAll(/(url\s*:[^\n,}]+|data\s*:\s*\{[^}]*\})/g)) console.log("M",x[1].replace(/\s+/g," "));
[,h]=await get(B+"/r/cms/chinese/chinamoney/html/bond/monthly-active-bonds.html");
for(const x of h.matchAll(/(url\s*:[^\n,}]+|data-name="[^"]+">[^<]+)/g)) console.log("A",x[1].replace(/\s+/g," "));
for(const d of ["2026-10-09","2026-10-15"]){const r=await get(B+"/ags/ms/cm-u-dlrp/BdcDlyBltn","POST",`lang=cn&searchDate=${d}&publishedTime=2200`);console.log("D",d,r[1].slice(200,520));}
