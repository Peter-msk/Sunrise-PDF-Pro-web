/** DEV27 public competitor behavior probe — single public fixture per site.
 * No user documents, no copied minified code and no credential/captcha bypass.
 * Abort every POST/PUT/PATCH request that may contain file bytes. Public and
 * one-shot. Results distinguish markup inspection and real PDF download.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

const targets=[
 {id:'nextoffice',url:'https://www.nextoffice.kr/en/hwp-to-pdf',fixture:'r29-browser-fixtures/genuine.hwp'},
 {id:'seoulstart',url:'https://seoulstart.com/tools/hwpx-to-pdf',fixture:'r29-browser-fixtures/genuine.hwpx'},
 {id:'workcal',url:'https://workcal.kr/en/tools/hwp-to-pdf/',fixture:'r29-browser-fixtures/genuine.hwp'}
];
const evidence='competitor-public-evidence';
mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const reports=[];
try {
 for(const site of targets){
  const report={id:site.id,origin:new URL(site.url).origin,checkedAt:new Date().toISOString(),pages:[],
   status:'not-started',result:'not-tested',blockedUploads:0,localDocRequests:0};
  const context=await browser.newContext({acceptDownloads:true});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>report.pages.push({kind:'js-error',message:String(e.message).slice(0,100)}));
  await page.route('**/*',async route=>{
   const req=route.request(),method=req.method();
   const typ=(req.headers()['content-type']||'').toLowerCase();
   const body=req.postDataBuffer();
   if(['POST','PUT','PATCH'].includes(method)&&
     (typ.includes('multipart/')||typ.includes('octet-stream')||
       (body&&body.length>2048))){
    report.blockedUploads++;
    return route.abort('blockedbyclient');
   }
   return route.continue();
  });
  try{
   const r=await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:25000});
   report.status=r?.status()??null;
   report.finalOrigin=new URL(page.url()).origin;
   const dom=await page.evaluate(()=>{
    const clean=x=>String(x||'').replace(/\s+/g,' ').trim().slice(0,90);
    return {
     title:document.title.slice(0,130),
     inputTypes:Array.from(document.querySelectorAll('input')).slice(0,30).map(x=>({
      type:x.type,accept:clean(x.accept),multiple:x.multiple,id:clean(x.id),
      visible:!!(x.offsetWidth||x.offsetHeight||x.getClientRects().length)
     })),
     buttons:Array.from(document.querySelectorAll('button,[role=button]')).slice(0,35)
       .map(x=>({label:clean(x.textContent||x.getAttribute('aria-label')),disabled:x.disabled||false})),
     scriptPaths:Array.from(document.scripts).map(x=>{
      if(!x.src)return 'inline';
      try{return new URL(x.src).pathname.slice(0,150);}catch{return 'external';}
     }).slice(0,35),
     hints:clean(document.body?.textContent).slice(0,90)
    };
   });
   report.dom=dom;
   const file=page.locator('input[type=file]');
   const count=await file.count();
   if(!count){report.result='no-file-input';continue;}
   const buffer=readFileSync(site.fixture);
   report.sample={format:site.fixture.endsWith('.hwpx')?'hwpx':'hwp',bytes:buffer.byteLength,
     sha256:createHash('sha256').update(buffer).digest('hex').slice(0,16)};
   await file.first().setInputFiles({name:site.fixture.endsWith('.hwpx')?'genuine.hwpx':'genuine.hwp',
    mimeType:'application/octet-stream',buffer},{timeout:12000});
   const dl=page.waitForEvent('download',{timeout:17000}).catch(()=>null);
   const convert=page.getByRole('button',{name:/convert to pdf|convert|PDF로 변환|변환하기|^변환$/i});
   if(await convert.count()){
    const btn=convert.first();
    if(await btn.isEnabled())await btn.click({timeout:10000}).catch(e=>{report.clickError=String(e.message).slice(0,120);});
   }else{
    report.clickError='No convert button matched. Check public DOM snapshot.';
   }
   const download=await dl;
   if(download){
    const stream=await download.createReadStream();let chunks=[],size=0;
    for await(const chunk of stream){size+=chunk.length;if(size>16*1024*1024)break;chunks.push(chunk);}
    const pdf=Buffer.concat(chunks);
    report.download={suggestedName:download.suggestedFilename().slice(-100),bytes:size,
      startsWithPdf:pdf.subarray(0,5).toString('ascii')==='%PDF-'};
    if(report.download.startsWithPdf){
     try{const parsed=await PDFDocument.load(pdf);report.download.pageCount=parsed.getPageCount();}
     catch(e){report.download.pdfParseError=String(e?.message||e).slice(0,130);}
    }
    report.result=report.download.startsWithPdf&&report.download.pageCount>0?'real-pdf-pass':'download-not-valid-pdf';
   }else{
    report.result='no-download-after-file-selection';
   }
  }catch(error){report.result='probe-error';report.error=String(error?.message||error).slice(0,240);}
  finally{
   try{report.lastUiText=(await page.locator('body').innerText({timeout:3500}))
     .replace(/\s+/g,' ').slice(-300);}catch{}
   reports.push(report);
   console.log(JSON.stringify({id:report.id,status:report.status,result:report.result,
    blockedUploads:report.blockedUploads,download:report.download,reason:report.error||report.clickError}));
   await context.close();
  }
 }
}finally{await browser.close();}
writeFileSync(evidence+'/COMPETITOR_PUBLIC_BROWSER_PROBE.json',
 JSON.stringify({scope:'Public files and publicly visible website UI only; no user content',reports},null,2));
