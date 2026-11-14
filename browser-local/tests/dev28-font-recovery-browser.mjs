/** Real public 17-page HWP: vector missing-glyph failure, direct user-
 * initiated full-image PDF recovery. No user private documents or deployment.
 */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
const url=process.env.SUNRISE_DEV28_URL||'http://127.0.0.1:4174/';
const source=resolve(import.meta.dirname,'../../r29-browser-fixtures/complex.hwp');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message).slice(0,130)));
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('변환 준비 완료'),null,{timeout:80000});
 await page.locator('#source').setInputFiles(source);
 await page.locator('#convert').click();
 await page.waitForFunction(()=>document.querySelector('#cancel')?.disabled && document.querySelector('#failed-count')?.textContent==='1',
   null,{timeout:120000});
 const row=page.locator('#file-list .file-row').first();
 const first=await row.innerText();
 assert.match(first,/FONT_GLYPH_MISSING/);
 assert.equal(await row.locator('.compat-retry').count(),1,'missing-glyph must offer image PDF retry');
 assert.equal(await row.locator('.native-print-recovery').count(),1,'keep native print alternative');
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 await row.locator('.compat-retry').click();
 await page.waitForFunction(()=>{
  const c=document.querySelector('#cancel'),done=document.querySelector('#done-count');
  return c?.disabled&&(done?.textContent==='1'||document.querySelector('#failed-count')?.textContent==='1');
 },null,{timeout:300000});
 assert.equal(await page.locator('#done-count').innerText(),'1',
  'explicitly selected image PDF recovery failed: '+(await row.innerText()).slice(0,350));
 const next=page.waitForEvent('download',{timeout:25000});
 await row.locator('a.download').click();
 const dl=await next,parts=[];
 for await(const part of await dl.createReadStream())parts.push(part);
 const bytes=Buffer.concat(parts);
 assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
 const pdf=await PDFDocument.load(bytes);
 assert.equal(pdf.getPageCount(),17);
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 const info=(await row.innerText())+(await page.locator('#pages').innerText());
 assert.match(info,/이미지 PDF/);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({format:'hwp',source:'public rhwp v0.8.7 issue2007 nested cells',
  mode:'explicit compat-raster',status:'PASS',pages:pdf.getPageCount(),outputBytes:bytes.length,
  defaultEnginePreserved:true}));
}catch(e){console.error('DEV28_REAL_FONT_RECOVERY_FAILED',String(e?.stack||e).slice(0,1450));process.exitCode=1;}
finally{await browser.close();}
