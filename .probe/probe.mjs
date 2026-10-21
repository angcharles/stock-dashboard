const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const H={"User-Agent":UA,Referer:"https://www.chinamoney.com.cn/",Origin:"https://www.chinamoney.com.cn","X-Requested-With":"XMLHttpRequest","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",Accept:"application/json, text/plain, */*"};
const get=async(u,m="GET",b)=>{try{const r=await fetch(u,{method:m,headers:H,body:b,signal:AbortSignal.timeout(25000)});return [r.status,await r.text()]}catch(e){return [0,String(e)]}};
const pages=["https://www.chinamoney.com.cn/chinese/mtdexdaily/","https://www.chinamoney.com.cn/chinese/mtmoncjgl/","https://www.chinamoney.com.cn/chinese/mkdatapm/","https://www.chinamoney.com.cn/chinese/mkdatabl/","https://www.chinamoney.com.cn/chinese/bkbl/"];
const seen=new Set();
for(const p of pages){const [s,t]=await get(p);console.log("PAGE",s,p,t.length);
 for(const m of t.matchAll(/src="([^"]+\.js[^"]*)"/g)){let u=m[1];if(u.startsWith("/"))u="https://www.chinamoney.com.cn"+u;else if(!u.startsWith("http"))u=new URL(u,p).href;if(seen.has(u))continue;seen.add(u);
  if(/jquery|bootstrap|echarts|vue|lodash/i.test(u))continue;
  const [s2,js]=await get(u);
  const hits=[...js.matchAll(/["'`]([^"'`\s]*(?:ags\/ms|\/dqs\/|\/r\/cms|\.json)[^"'`\s]*)["'`]/g)].map(x=>x[1]);
  const bl=hits.filter(h=>/bl|lend|Bl|Lnd|lnd|BL/.test(h));
  console.log(" JS",s2,u,js.length,"endpoints:",[...new Set(hits)].slice(0,60).join(" | "));
  if(bl.length)console.log("  BL>>",[...new Set(bl)].join(" | "));
  for(const m2 of js.matchAll(/.{0,120}(借贷|bondLend|BondLend|bl-|_bl|Bl)[\s\S]{0,160}/g))console.log("  CTX:",m2[0].replace(/\s+/g," ").slice(0,300));
 }}
