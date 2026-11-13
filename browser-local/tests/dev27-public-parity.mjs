/** DEV27 independent real PDF audit: same public HWP with NextOffice and Sunrise.
 * One public sample per provider, no user data. Nothing is uploaded to third parties
 * via non-idempotent document POST: those requests are blocked. Only PDF metrics,
 * no document content, binary or extracted text, are persisted.
 */
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {PDFDocument as LibPdf} from 'pdf-lib';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
const out='competitor-public-evidence';
mkdirSync(out,{recursive:true});
const fixtureExt=process.env.DEV27_PUBLIC_FIXTURE_EXT==='hwpx'?'hwpx':'hwp';
const specimen=readFileSync('r29-browser-fixtures/genuine.'+fixtureExt);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report={scope:'Public released '+fixtureExt.toUpperCase()+' only; structure metrics no document content',fixtureFormat:fixtureExt,checkedAt:new Date().toISOString(),sources:{}};
async function audit(bytes){
 const pdf=await LibPdf.load(bytes);
 const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true});
 const parsed=await task.promise;
 let chars=0,textItems=0,imageOps=0;
 try{
  for(let i=1;i<=parsed.numPages;i++){
   const page=await parsed.getPage(i);
   const [text,ops]=await Promise.all([page.getTextContent(),page.getOperatorList()]);
   const texts=text.items.filter(x=>typeof x.str==='string');
   chars+=texts.reduce((n,x)=>n+x.str.length,0);
   textItems+=texts.length;
   imageOps+=ops.fnArray.filter(x=>[OPS.paintImageXObject,OPS.paintInlineImageXObject,
      OPS.paintJpegXObject,OPS.paintImageXObjectRepeat].includes(x)).length;
   page.cleanup();
  }
 }finally{await task.destroy();}
 return {bytes:bytes.length,pdfHeader:bytes.subarray(0,5).toString('ascii'),
  pageCount:pdf.getPageCount(),producer:(pdf.getProducer()||'unknown').slice(0,110),
  creator:(pdf.getCreator()||'unknown').slice(0,110),textItems,extractableCharacters:chars,imagePaints:imageOps};
}
async function downloadToBytes(page,link=null,pending=null){
 const next=pending||page.waitForEvent('download',{timeout:60000});
 if(link)await link.click();
 const download=await next;
 const chunks=[];
 for await(const chunk of await download.createReadStream())chunks.push(chunk);
 const bytes=Buffer.concat(chunks);
 if(bytes.length>24*1024*1024)throw Error('TEST_OUTPUT_LIMIT');
 return bytes;
}
const cases=[
 {id:'nextoffice',url:'https://www.nextoffice.kr/en/hwp-to-pdf'},
 {id:'sunrise-dev27',url:'http://127.0.0.1:4174/'}
];
try{
 for(const c of cases){
  const item={status:'not-started',blockedUploads:0};
  report.sources[c.id]=item;
  const ctx=await browser.newContext({acceptDownloads:true});
  const page=await ctx.newPage();
  try{
   await page.route('**/*',async route=>{
    const req=route.request();
    const method=req.method();
    const data=req.postDataBuffer();
    const typ=(req.headers()['content-type']||'').toLowerCase();
    if(['POST','PUT','PATCH'].includes(method)&&
       (typ.includes('multipart/')||typ.includes('octet-stream')||data?.length>2048)){
     item.blockedUploads++;return route.abort('blockedbyclient');
    }
    return route.continue();
   });
   const nav=await page.goto(c.url,{waitUntil:'domcontentloaded',timeout:35000});
   item.http=nav?.status()||0;
   if(c.id==='nextoffice'){
    // NextOffice may start the conversion/download directly on file selection.
    // Arm the download event before choosing the fixture; never click a disabled button.
    const pending=page.waitForEvent('download',{timeout:25000});
    await page.locator('input[type=file]').first().setInputFiles({
     name:'genuine.'+fixtureExt,mimeType:'application/octet-stream',buffer:specimen});
    const btn=page.getByRole('button',{name:/convert to pdf/i});
    if(await btn.count()&&await btn.first().isEnabled())await btn.first().click();
    const bytes=await downloadToBytes(page,null,pending);
    item.pdf=await audit(bytes);
   }else{
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('변환 준비 완료'),
       null,{timeout:90000});
    await page.locator('#source').setInputFiles({name:'genuine.'+fixtureExt,
     mimeType:'application/octet-stream',buffer:specimen});
    await page.locator('#convert').click();
    await page.waitForFunction(()=>{
     const busy=document.querySelector('#cancel')?.disabled===false;
     const done=document.querySelector('#done-count')?.textContent==='1';
     const failed=document.querySelector('#failed-count')?.textContent==='1';
     return !busy&&(done||failed);
    },null,{timeout:180000});
    item.uiStatus=(await page.locator('#status').innerText()).slice(0,250);
    const links=page.locator('#file-list a.download');
    if(await links.count()!==1)throw Error('SUNRISE_PDF_MISSING');
    const bytes=await downloadToBytes(page,links.first());
    item.pdf=await audit(bytes);
   }
   item.status=item.pdf?.pdfHeader==='%PDF-'&&item.pdf.pageCount>=1?'PASS':'PDF_INVALID';
  }catch(e){
   item.status='FAILED';item.reason=String(e?.message||e).slice(0,180);
  }finally{
   console.log(JSON.stringify({site:c.id,...item}));
   await ctx.close();
  }
 }
}finally{await browser.close();}
writeFileSync(out+'/DEV27_PUBLIC_'+fixtureExt.toUpperCase()+'_PDF_PARITY.json',JSON.stringify(report,null,2));
if(Object.values(report.sources).some(x=>x.status!=='PASS'))process.exitCode=1;
