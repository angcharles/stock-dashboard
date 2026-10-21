const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const H={"User-Agent":UA,Referer:"https://www.chinamoney.com.cn/",Origin:"https://www.chinamoney.com.cn","X-Requested-With":"XMLHttpRequest","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",Accept:"application/json, text/plain, */*"};
const B="https://www.chinamoney.com.cn";
const get=async(u,m="GET",b)=>{try{const r=await fetch(u,{method:m,headers:H,body:b,signal:AbortSignal.timeout(25000)});return [r.status,await r.text()]}catch(e){return [0,String(e)]}};
for(const p of ["/chinese/mtdexdaily/","/chinese/mtmoncjgl/"]){
 const [s,t]=await get(B+p);console.log("==== PAGE",s,p);
 for(const m of t.matchAll(/data-url="([^"]+)"/g)){console.log("DATAURL",m[1]);
   const u=m[1].startsWith("http")?m[1]:B+m[1]; const [s2,h]=await get(u);
   console.log("  ->",s2,h.length);
   if(/借贷|bl|Bl/.test(m[1])||/借贷/.test(h)){console.log("  BODY:",h.replace(/\s+/g," ").slice(0,5000));}
 }
}
