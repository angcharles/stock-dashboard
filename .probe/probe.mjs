const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const H={"User-Agent":UA,Referer:"https://www.chinamoney.com.cn/",Origin:"https://www.chinamoney.com.cn","X-Requested-With":"XMLHttpRequest","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",Accept:"application/json, text/plain, */*"};
const get=async(u,m="GET",b)=>{try{const r=await fetch(u,{method:m,headers:H,body:b,signal:AbortSignal.timeout(25000)});return [r.status,await r.text()]}catch(e){return [0,String(e)]}};
for(const p of ["https://www.chinamoney.com.cn/chinese/mtdexdaily/","https://www.chinamoney.com.cn/chinese/mtmoncjgl/"]){
 const [s,t]=await get(p);console.log("==== PAGE",s,p);
 for(const m of t.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)){const c=m[1].trim(); if(c.length>20) console.log("--- INLINE",c.length,"\n",c.slice(0,6000));}
 for(const m of t.matchAll(/src="([^"]+)"/g)) console.log("SRC",m[1]);
 for(const m of t.matchAll(/href="([^"]+)"[^>]*>([^<]{0,30}借贷[^<]{0,30})</g)) console.log("LINK",m[1],m[2]);
}
