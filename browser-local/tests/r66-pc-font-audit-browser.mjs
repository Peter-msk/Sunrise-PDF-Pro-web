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
 // DEV62: only PDF preview and download remain visible to users. Font
 // resource inspection stays in its separate testable source module.
 assert.equal(await page.locator('.font-audit').count(),0);
 assert.equal(await page.locator('.vector-quality-audit').count(),0);
 assert.equal(await page.locator('#quality-detail').count(),0);
 assert.deepEqual(errors,[],'PDF font audit must not crash page');
 assert.deepEqual(external,[],'no external network access');
 console.log('DEV62_BROWSER_USER_OUTPUT_CLEAN_PASS');
 await page.close();
}finally{await browser.close();}
