/** Production acceptance with pinned PUBLIC rhwp fixtures only.
 * Unlike the local isolated-worker test, production can emit recurring
 * same-origin telemetry, so wait for DOM/functional readiness, not networkidle.
 * No proprietary document or font bytes are sent to the server.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';

const base=process.env.SUNRISE_TEST_URL;
if(!base||!/^https:\/\/sunrise-pdf-pro-web\.ko-pg\.workers\.dev\/local\/$/.test(base))
 throw Error('PRODUCTION_URL_MUST_BE_EXACT_WORKER_LOCAL_ROUTE');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const sourceDir=resolve(import.meta.dirname,'../../r29-browser-fixtures');
const results=[];
try{
 const ctx=await browser.newContext({acceptDownloads:true});
 for(const [ext,fixture] of [['hwp','genuine.hwp'],['hwpx','genuine.hwpx']]){
  const page=await ctx.newPage();
  const exceptions=[],fatalAssets=[];
  page.on('pageerror',e=>exceptions.push(e.message));
  page.on('response',r=>{
   const url=r.url(),code=r.status();
   if(url.startsWith(new URL(base).origin+'/local/')&&code>=400 &&
      /(\/assets\/|\/rhwp_bg\.wasm|\/pdf-worker)/.test(url))
    fatalAssets.push({status:code,url:new URL(url).pathname});
  });
  const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(response?.status(),200);
  await page.waitForFunction(()=>
   /변환 준비 완료/.test(document.querySelector('#status')?.textContent||''),
   null,{timeout:120000});
  console.log('LIVE_BROWSER_BOOT_READY '+JSON.stringify({ext,status:response.status()}));
  assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
  await page.locator('#source').setInputFiles(resolve(sourceDir,fixture));
  await page.locator('#convert').click();
  await page.waitForFunction(()=>
   document.querySelector('#done-count')?.textContent==='1'||
   document.querySelector('#failed-count')?.textContent==='1',
   null,{timeout:240000});
  assert.equal(await page.locator('#done-count').innerText(),'1',
   'actual file status: '+(await page.locator('#file-list').innerText()).slice(0,3500));
  const link=page.locator('#file-list a.download').first();
  const pending=page.waitForEvent('download',{timeout:60000});
  await link.click();
  const download=await pending;
  const bytes=await readFile(await download.path());
  const pdf=await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount()>0);
  assert.ok(await page.locator('.vector-quality-audit').count()>0);
  await page.locator('.vector-quality-audit').click();
  await page.waitForFunction(()=>{
   const t=document.querySelector('#file-list')?.textContent||'';
   return /PDF 구조 검증|PDF 벡터 품질 검사를 완료하지 못했습니다/.test(t);
  },null,{timeout:90000});
  let report=await page.locator('#file-list').innerText();
  assert.match(report,/PDF 구조 검증 통과/,report.slice(0,4000));
  assert.match(report,/추출 글자/);
  assert.ok(await page.locator('.font-audit').count()>0);
  await page.locator('.font-audit').click();
  await page.waitForFunction(()=>{
   const t=document.querySelector('#file-list')?.textContent||'';
   return /PDF 글꼴 리소스|PDF 글꼴 확인을 완료하지 못했습니다/.test(t);
  },null,{timeout:90000});
  report=await page.locator('#file-list').innerText();
  assert.match(report,/PDF 글꼴 리소스/);
  assert.deepEqual(fatalAssets,[],'No critical asset HTTP errors');
  assert.deepEqual(exceptions,[],'No uncaught page exceptions');
  results.push({ext,pages:pdf.getPageCount(),pdfBytes:bytes.length,
   professionalDefault:true,vectorQualityPass:true,fontAuditPass:true});
  await page.close();
 }
 await ctx.close();
 console.log('DEV26_PRODUCTION_FUNCTIONAL_CHROMIUM_PASS '+JSON.stringify(results));
}finally{await browser.close();}
