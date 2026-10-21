const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const H={"User-Agent":UA,Referer:"https://www.chinamoney.com.cn/chinese/mtdexdaily/",Origin:"https://www.chinamoney.com.cn","X-Requested-With":"XMLHttpRequest","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",Accept:"application/json, text/plain, */*"};
const B="https://www.chinamoney.com.cn";
const get=async(u,m="GET",b)=>{try{const r=await fetch(u,{method:m,headers:H,body:b,signal:AbortSignal.timeout(25000)});return [r.status,await r.text()]}catch(e){return [0,String(e)]}};
let [s,t]=await get(B+"/r/cms/chinese/chinamoney/assets/js/cm-basic.js");
for(const k of ["BK_URL","DURL","DQSURL"]){const m=t.match(new RegExp(k+"\\s*=\\s*([^;\\n]+)"));console.log(k,m&&m[1]);}
console.log("JSON1",(await get(B+"/r/cms/www/chinamoney/data/bond/bdc-dly-bltn-mark.json")).join(" ").slice(0,4000));
for(const d of ["2026-10-20","2026-09-18","2025-10-20"]){const r=await get(B+"/ags/ms/cm-u-dlrp/BdcDlyBltn","POST",`lang=cn&searchDate=${d}&publishedTime=2200`);console.log("POST",d,r[0],r[1].slice(0,3000));}
console.log("MLY",(await get(B+"/r/cms/www/chinamoney/data/bond/bdc-mly-bltn-pro.json")).join(" ").slice(0,2500));
console.log("MLYBAL",(await get(B+"/r/cms/www/chinamoney/data/bond/bdc-mly-bltn-bal.json")).join(" ").slice(0,2500));
for(const p of ["/chinese/mkdatabond/","/chinese/mtmonhyzqtj/","/chinese/mkdatapm/"]){
 const [s,t]=await get(B+p);console.log("==== PAGE",s,p);
 for(const m of t.matchAll(/data-url="([^"]+)"/g)){if(/main|navi|foot/.test(m[1]))continue;const [s2,h]=await get(m[1].startsWith("http")?m[1]:B+m[1]);
   console.log("DATAURL",m[1],s2,h.length, /借贷/.test(h)?"HAS借贷":"");
   if(/借贷/.test(h)) for(const x of h.matchAll(/(url\s*:\s*[^,]+|BK_URL\s*\+\s*'[^']+'|DURL\s*\+\s*'[^']+')/g)) console.log("   ",x[1]);
 }}
