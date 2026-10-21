const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
async function t(name,url,opt={}){
  try{const r=await fetch(url,{method:opt.method||"GET",headers:{"User-Agent":UA,Accept:"application/json, text/plain, */*",...(opt.h||{})},body:opt.body,signal:AbortSignal.timeout(25000)});
  const s=await r.text();console.log(`\n### ${name} HTTP ${r.status} len=${s.length}\n${s.slice(0,opt.n||900)}`);}catch(e){console.log(`\n### ${name} ERR ${e.message}`);}
}
const CGB="2c9081e50a2f9606010a3068cae70001";
const d="2026-10-20";
const form={"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",Referer:"https://yield.chinabond.com.cn/cbweb-mn/yield_main?locale=zh_CN",Origin:"https://yield.chinabond.com.cn","X-Requested-With":"XMLHttpRequest"};
await t("searchYc",`https://yield.chinabond.com.cn/cbweb-mn/yc/searchYc?xyzSelect=txy&&workTimes=${d}&&dxbj=0&&qxll=0,&&yqqxN=N&&yqqxK=K&&ycDefIds=${CGB},&&wrjxCBFlag=0&&locale=zh_CN`,{method:"POST",h:form,n:1500});
await t("queryYz",`https://yield.chinabond.com.cn/cbweb-mn/yc/queryYz?bjlx=no&&dcq=1,1y;10,10y;&&startTime=2026-10-01&&endTime=${d}&&qxlx=0,&&yqqxN=N&&yqqxK=K&&par=day&&ycDefIds=${CGB},&&locale=zh_CN`,{method:"POST",h:form,n:1500});
await t("czb",`https://yield.chinabond.com.cn/cbweb-czb-web/czb/czbChartSearch?parentId=8a8b2ca037a7ca910137bfaa94fa5057&&searchDate=${d}&&locale=zh_CN`,{method:"POST",h:form,n:1500});
await t("czbMore","https://yield.chinabond.com.cn/cbweb-czb-web/czb/moreInfo?locale=cn_ZH&nameType=1",{n:1500});
const cmh={Referer:"https://www.chinamoney.com.cn/",Origin:"https://www.chinamoney.com.cn","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"};
await t("cm-list2","https://www.chinamoney.com.cn/ags/ms/cm-u-bond-md/BondMarketInfoList2",{method:"POST",h:cmh,body:"pageNo=1&pageSize=5&bondName=&bondCode=&issueEnty=&bondType=100001&bondSpclPrjctVrty=&couponType=&issueYear=&entyDefinedCode=&rtngShrt=",n:2500});
await t("cm-listEN","https://www.chinamoney.com.cn/ags/ms/cm-u-bond-md/BondMarketInfoListEN",{method:"POST",h:cmh,body:"pageNo=1&pageSize=5&bondType=100001&bondCode=&bondName=",n:2500});
await t("cm-detail","https://www.chinamoney.com.cn/ags/ms/cm-u-bond-md/BondDetailInfo",{method:"POST",h:cmh,body:"bondDefinedCode=ahaciu6o91",n:3000});
await t("cm-detailEN","https://www.chinamoney.com.cn/ags/ms/cm-u-bond-md/BondDetailInfoEN",{method:"POST",h:cmh,body:"bondDefinedCode=ahaciu6o91",n:3000});
await t("cm-CbtPri","https://www.chinamoney.com.cn/ags/ms/cm-u-md-bond/CbtPri?flag=1&lang=cn&abdAssetEncdShrtDesc=&emaEntyEncdShrtDesc=",{method:"POST",h:cmh,n:2500});
await t("cm-valuation","https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/BondValuationEN",{method:"POST",h:cmh,body:"pageNo=1&pageSize=5",n:1500});
