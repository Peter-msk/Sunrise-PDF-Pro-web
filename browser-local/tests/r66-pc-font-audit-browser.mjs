/** Local-only Chromium HWP -> PDF -> user-clicked embedded-font verification.
 * A public pinned sample is used; no private PC font or document leaves browser.
 */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const site=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:8787/local/';
const fixture=resolve(import.meta.dirname,'../../r29-browser-fixtures/genuine.hwp');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{
  const url=r.url();
  if(!url.startsWith(new URL(site).origin+'/')&&
     !url.startsWith('blob:')&&!url.startsWith('data:'))external.push(url);
 });
 await page.goto(site,{waitUntil:'networkidle',timeout:30_000});
 await page.waitForFunction(()=>/변환 준비 완료/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90_000});
 await page.locator('#source').setInputFiles(fixture);
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 await page.locator('#convert').click();
 await page.waitForFunction(()=>document.querySelector('#done-count')?.textContent==='1'||
  document.querySelector('#failed-count')?.textContent==='1',null,{timeout:240_000});
 assert.equal(await page.locator('#done-count').innerText(),'1',
  await page.locator('#file-list').innerText());
 const button=page.locator('.font-audit');
 assert.equal(await button.count(),1,'HWP vector PDF should expose font resource inspector');
 await button.click();
 await page.waitForFunction(()=>{
  const txt=document.querySelector('#file-list')?.textContent||'';
  return txt.includes('PDF 글꼴 리소스')||
   txt.includes('PDF 글꼴 확인을 완료하지 못했습니다');
 },null,{timeout:60_000});
 const result=await page.locator('#file-list').innerText();
 assert.match(result,/PDF 글꼴 리소스/);
 assert.match(result,/글꼴 프로그램 내장/);
 assert.doesNotMatch(result,/완료하지 못했습니다|Font.*Error/);
 assert.deepEqual(errors,[],'PDF font audit must not crash page');
 assert.deepEqual(external,[],'no external network access');
 console.log('DEV26_LOCAL_FONT_PROGRAM_BROWSER_AUDIT_PASS');
 await page.close();
}finally{await browser.close();}
