/** DEV27 document-to-PDF print-parity evidence using existing HWP/HWPX.
 * On public fixtures only. Reads the real native-print sandbox frame after
 * prepareNativePrint (real WASM/SVG/fonts); copies markup into an isolated
 * Chromium print page and invokes Chrome printToPDF via Playwright.
 *
 * IMPORTANT: This tests the print HTML/layout path. It does NOT intercept
 * the operating system's Save as PDF dialog or copy runtime FontFace bytes;
 * the isolated page can use different fallback fonts. Do not claim Hancom
 * layout parity or actual Windows PDF-dialog save.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=resolve(import.meta.dirname,'../..');
const site=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:4174/';
const fixturePrefix=process.env.DEV27_PUBLIC_FIXTURE_SET==='complex'?'complex':'genuine';
const samples=['hwp','hwpx'];
const evidenceDir=resolve(root,'r29-browser-real-evidence');
mkdirSync(evidenceDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const result={source:'Public rhwp v0.8.7 fixtures only',
  test:'actual WASM-generated SVG into standalone Chromium printToPDF',
  limitation:'isolated page cloned from print iframe; FontFace objects not transferred; not OS print dialog',
  files:[],browserErrors:[],pass:false};
async function inspect(bytes){
 const pdf=await PDFDocument.load(bytes);
 const loader=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true});
 let chars=0,images=0,textItems=0;
 const collectedText=[];
 try{
  const loaded=await loader.promise;
  for(let i=1;i<=loaded.numPages;i++){
   const pg=await loaded.getPage(i);
   const [text,ops]=await Promise.all([pg.getTextContent(),pg.getOperatorList()]);
   const values=text.items.filter(x=>typeof x.str==='string');
   chars+=values.reduce((sum,x)=>sum+x.str.length,0);
   collectedText.push(values.map(x=>x.str).join(''));
   textItems+=values.length;
   images+=ops.fnArray.filter(x=>[OPS.paintImageXObject,OPS.paintInlineImageXObject,
     OPS.paintJpegXObject,OPS.paintImageXObjectRepeat].includes(x)).length;
   pg.cleanup();
  }
 }finally{await loader.destroy();}
 return {validPdf:bytes.subarray(0,5).toString('ascii')==='%PDF-',
   sizeBytes:bytes.length,pages:pdf.getPageCount(),
   pageBoxes:pdf.getPages().map(p=>({widthPt:Number(p.getSize().width.toFixed(3)),
     heightPt:Number(p.getSize().height.toFixed(3))})),
   textItems,extractableCharacters:chars,imagePaintOps:images,
   extractedTextDigest:createHash('sha256').update(collectedText.join('\u000c')).digest('hex').slice(0,24)};
}
let page;
try{
 page=await browser.newPage({acceptDownloads:true});
 page.on('pageerror',e=>result.browserErrors.push(String(e.message).slice(0,160)));
 await page.goto(site,{waitUntil:'networkidle',timeout:40000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('변환 준비 완료'),
    null,{timeout:90000});
 for(const ext of samples){
  const file=fixturePrefix+'.'+ext;
  const specimen=readFileSync(resolve(root,'r29-browser-fixtures',file));
  const r={format:ext,inputSizeBytes:specimen.length,professional:null,nativePrintClone:null};
  result.files.push(r);
  const filePath=resolve(root,'r29-browser-fixtures',file);
  await page.locator('#source').setInputFiles(filePath);
  await page.locator('#convert').click();
  await page.waitForFunction(()=>{
   const busy=!document.querySelector('#cancel')?.disabled;
   return !busy&&(document.querySelector('#done-count')?.textContent==='1'||
    document.querySelector('#failed-count')?.textContent==='1');
  },null,{timeout:200000});
  const done=await page.locator('#done-count').innerText();
  assert.equal(done,'1',ext+' professional failed: '+await page.locator('#status').innerText());
  const downloadPromise=page.waitForEvent('download',{timeout:20000});
  await page.locator('#file-list a.download').click();
  const dl=await downloadPromise;
  const chunks=[];
  for await(const chunk of await dl.createReadStream())chunks.push(chunk);
  r.professional=await inspect(Buffer.concat(chunks));
  await page.locator('#print-prepare').evaluate(button=>button.click());
  await page.waitForFunction(()=>{
   const msg=document.querySelector('#status')?.textContent||'';
   return msg.includes('브라우저 인쇄 준비 완료')||msg.includes('인쇄 준비 실패');
  },null,{timeout:180000});
  const status=await page.locator('#status').innerText();
  assert.match(status,/브라우저 인쇄 준비 완료/,ext+' native print: '+status);
  const snapshot=await page.locator('iframe[title="Sunrise PDF PRO 벡터 PDF 인쇄용 문서"]')
   .evaluate(el=>{
    const doc=el.contentDocument;
    const root=doc?.documentElement;
    return {html:root?.outerHTML||'',pages:doc.querySelectorAll('section.sunrise-print-page').length,
     svgs:doc.querySelectorAll('section.sunrise-print-page > svg').length};
   });
  assert.ok(snapshot.html.startsWith('<html'),'missing print frame markup');
  assert.ok(snapshot.pages>0&&snapshot.svgs>0);
  const printable=await browser.newPage();
  try{
   await printable.setContent('<!doctype html>'+snapshot.html,
     {waitUntil:'load',timeout:30000});
   await printable.evaluate(()=>document.fonts?.ready);
   // The standalone printToPDF flow uses the exact SVG nodes and @page CSS
   // emitted by prepareNativePrint, but not the original runtime-loaded faces.
   const bytes=Buffer.from(await printable.pdf({preferCSSPageSize:true,printBackground:true,
     displayHeaderFooter:false,timeout:30000}));
   r.nativePrintClone=await inspect(bytes);
   r.printSvgPages=snapshot.pages;
  }finally{await printable.close();}
  const pageDeltas=r.professional.pageBoxes.map((box,index)=>{
   const other=r.nativePrintClone.pageBoxes[index];
   return other?{
    widthPt:Number(Math.abs(box.widthPt-other.widthPt).toFixed(3)),
    heightPt:Number(Math.abs(box.heightPt-other.heightPt).toFixed(3))
   }:null;
  });
  r.pageSizeDeltaPt=pageDeltas;
  r.status=r.professional.validPdf&&r.nativePrintClone.validPdf&&
    r.professional.pages===r.nativePrintClone.pages&&
    r.professional.extractedTextDigest===r.nativePrintClone.extractedTextDigest&&
    r.professional.extractableCharacters>0&&
    pageDeltas.every(x=>x&&x.widthPt<=0.5&&x.heightPt<=0.5)
    ?'PASS':'MISMATCH';
  console.log(JSON.stringify({format:ext,status:r.status,professional:r.professional,
    nativePrintClone:r.nativePrintClone}));
  await page.locator('#reset').click();
 }
 assert.deepEqual(result.browserErrors,[]);
 result.pass=result.files.every(x=>x.status==='PASS');
 if(!result.pass)process.exitCode=1;
}catch(error){
 result.error=String(error?.stack||error).slice(0,1600);
 console.error('DEV27_PRINT_PDF_PARITY_FAILED',result.error);
 process.exitCode=1;
}finally{
 writeFileSync(resolve(evidenceDir,'DEV27_PRINT_PDF_PARITY_PUBLIC_'+fixturePrefix+'.json'),
    JSON.stringify(result,null,2));
 await browser.close();
}
