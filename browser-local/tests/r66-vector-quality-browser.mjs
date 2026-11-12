/** DEV26 browser-local HWP PDF quality inspector E2E, public source fixture. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:8787/local/';
const source=resolve(import.meta.dirname,'../../r29-browser-fixtures/genuine.hwp');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 const pageErrors=[],outside=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('request',r=>{
  const url=r.url();
  if(!url.startsWith(new URL(base).origin+'/')&&
    !url.startsWith('data:')&&!url.startsWith('blob:'))outside.push(url);
 });
 await page.goto(base,{waitUntil:'networkidle',timeout:45_000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent
  .includes('변환 준비 완료'),null,{timeout:90_000});
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 await page.locator('#source').setInputFiles(source);
 await page.locator('#convert').click();
 await page.waitForFunction(()=>{
  return document.querySelector('#done-count')?.textContent==='1'||
   document.querySelector('#failed-count')?.textContent==='1';
 },null,{timeout:240_000});
 assert.equal(await page.locator('#done-count').innerText(),'1',
  await page.locator('#file-list').innerText());
 assert.match(await page.locator('#file-list').innerText(),
  /벡터 페이지 보존/);
 const button=page.locator('.vector-quality-audit');
 assert.equal(await button.count(),1);
 await button.click();
 await page.waitForFunction(()=>{
  const text=document.querySelector('#file-list')?.textContent||'';
  return text.includes('PDF 구조 검증')||
   text.includes('PDF 벡터 품질 검사를 완료하지 못했습니다');
 },null,{timeout:90_000});
 const result=await page.locator('#file-list').innerText();
 assert.match(result,/PDF 구조 검증 통과/);
 assert.match(result,/페이지 기준 벡터 보존/);
 assert.match(result,/벡터/);
 assert.match(result,/그림|이미지/);
 assert.doesNotMatch(result,/완료하지 못했습니다/);
 assert.deepEqual(outside,[],'PDF and original HWP are local-only');
 assert.deepEqual(pageErrors,[],'no uncaught page exception');
 console.log('DEV26_VECTOR_QUALITY_BROWSER_PASS',{
  vectorPageSummary:true,realPdfOperatorAudit:true,localOnly:true
 });
 await page.close();
}finally{await browser.close();}
