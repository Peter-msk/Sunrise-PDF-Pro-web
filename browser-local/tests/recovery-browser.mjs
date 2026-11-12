/**
 * Browser-level deterministic regression for production error recovery.
 * Inject only the conversion boundary at Vite dev URL. All queue, DOM, batch,
 * event, and per-file restart code is the real application, not a replica.
 * The HWP/HWPX source bytes remain in the browser and no admin data is read.
 */
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const url=process.env.SUNRISE_RECOVERY_UI_URL||'http://127.0.0.1:4174/';
const pdfBytes=Array.from(readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url)));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.addInitScript(bytes=>{window.__recoveryTestPdf=bytes;},pdfBytes);
 let injected=0;
 await page.route('**/src/convert-any.js*',async route=>{
  injected++;
  await route.fulfill({status:200,contentType:'application/javascript',body:`
   export async function convertAnyToPdf(file,onProgress=()=>{},signal,options={}) {
    if(signal?.aborted)throw new DOMException('cancelled','AbortError');
    const mode=options.engine||'professional';
    onProgress({stage:'professional',detail:mode==='professional'?'svg_vector':'compat_raster',page:1,total:1});
    if(mode==='professional'&&file.name==='filter.hwp')throw Error('SVG_FILTER_EFFECT_UNSUPPORTED');
    if(mode==='professional'&&file.name==='stream.hwpx')throw Error('PDF_STREAM_TIMEOUT');
    (window.__attempts||=[]).push({name:file.name,mode});
    const raw=new Uint8Array(window.__recoveryTestPdf);
    return {pdf:new Blob([raw],{type:'application/pdf'}),pages:1,bytes:raw.byteLength,
      renderMode:mode==='professional'?'professional':mode==='hybrid-filter'?'mixed':'raster-compat',warnings:[]};
   }
  `});
 });
 await page.goto(url,{waitUntil:'networkidle',timeout:45000});
 await page.waitForFunction(()=>document.getElementById('status')?.textContent?.includes('변환 준비 완료'),null,{timeout:30000});
 assert.equal(injected,1,'The browser must execute the isolated test converter');
 await page.locator('#source').setInputFiles([
  {name:'filter.hwp',mimeType:'application/octet-stream',buffer:Buffer.alloc(20,7)},
  {name:'stream.hwpx',mimeType:'application/octet-stream',buffer:Buffer.alloc(20,8)},
  {name:'completed.xlsx',mimeType:'application/octet-stream',buffer:Buffer.alloc(20,9)}
 ]);
 await page.locator('#convert').click();
 await page.waitForFunction(()=>document.getElementById('done-count')?.textContent==='1'&&document.getElementById('failed-count')?.textContent==='2'&&document.getElementById('cancel')?.disabled,null,{timeout:35000});
 assert.equal(await page.locator('.compat-retry').count(),2);
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 assert.match(await page.locator('#file-list').innerText(),/SVG_FILTER_EFFECT_UNSUPPORTED/);
 assert.match(await page.locator('#file-list').innerText(),/PDF_STREAM_TIMEOUT/);
 const filterRow=page.locator('.file-row').filter({hasText:'filter.hwp'});
 await filterRow.locator('.compat-retry').click();
 await page.waitForFunction(()=>document.getElementById('done-count')?.textContent==='2'&&document.getElementById('failed-count')?.textContent==='1'&&document.getElementById('cancel')?.disabled,null,{timeout:35000});
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional','global default must remain vector');
 assert.match(await page.locator('.file-row').filter({hasText:'completed.xlsx'}).innerText(),/변환 완료/);
 assert.match(await page.locator('.file-row').filter({hasText:'stream.hwpx'}).innerText(),/PDF_STREAM_TIMEOUT/);
 assert.match(await filterRow.innerText(),/변환 완료/);
 assert.match(await filterRow.innerText(),/혼합 PDF/);
 assert.equal(await page.locator('.compat-retry').count(),1);
 await page.locator('.file-row').filter({hasText:'stream.hwpx'}).locator('.compat-retry').click();
 await page.waitForFunction(()=>document.getElementById('done-count')?.textContent==='3'&&document.getElementById('failed-count')?.textContent==='0'&&document.getElementById('cancel')?.disabled,null,{timeout:35000});
 assert.equal(await page.locator('.compat-retry').count(),0);
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 const attempts=await page.evaluate(()=>window.__attempts);
 assert.deepEqual(attempts.filter(x=>x.name==='filter.hwp').map(x=>x.mode),['professional','hybrid-filter']);
 assert.deepEqual(attempts.filter(x=>x.name==='stream.hwpx').map(x=>x.mode),['professional','compat-raster']);
 assert.deepEqual(pageErrors,[],'no uncaught UI errors');
 console.log('RECOVERY_BROWSER_REAL_UI_PASS: both real error classes recovered individually; successful queue items untouched; vector remains default');
}finally{await browser.close();}
