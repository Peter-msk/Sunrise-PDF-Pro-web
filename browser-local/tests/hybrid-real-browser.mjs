/**
 * Playwright acceptance of the explicitly selected compatibility output.
 * Uses published HWP/HWPX fixture files. Default professional conversion is
 * covered by e2e.mjs; this test ensures a second, independent PDF writer works.
 */
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const site=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:8787/local/';
const origin=new URL(site).origin;
const output=resolve(root,'r29-browser-real-evidence');
mkdirSync(output,{recursive:true});
const reports=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 const external=[],errors=[],failedRequests=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('requestfailed',request=>failedRequests.push(request.url()+': '+request.failure()?.errorText));
 page.on('request',request=>{const u=request.url();if(!u.startsWith(origin+'/')&&!u.startsWith('data:')&&!u.startsWith('blob:'))external.push(u);});
 await page.goto(site,{waitUntil:'networkidle',timeout:30000});
 await page.waitForFunction(()=>/변환 준비 완료|초기화 실패|변환 기능 초기화 실패/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
 const boot=await page.locator('#status').innerText();
 if(!boot.includes('변환 준비 완료'))throw Error('WASM boot did not pass: '+boot);
 if(await page.locator('#pdf-engine').inputValue()!=='professional')throw Error('default professional output changed');
 await page.locator('details.options.advanced summary').click();
 await page.locator('#pdf-engine').selectOption('hybrid-filter');
 const files=['hwp','hwpx'].map(ext=>resolve(root,'r29-browser-fixtures/genuine.'+ext));
 for(const file of files)if(!existsSync(file))throw Error('Missing acceptance fixture '+file);
 await page.locator('#source').setInputFiles(files);
 await page.locator('#convert').click();
 await page.waitForFunction(()=>{
  const completed=document.getElementById('done-count')?.textContent==='2';
  const failed=Number(document.getElementById('failed-count')?.textContent||0)>0;
  const idle=document.getElementById('cancel')?.disabled;
  return (completed||failed)&&idle;
 },null,{timeout:240000});
 const done=await page.locator('#done-count').innerText();
 if(done!=='2')throw Error('Hybrid PDF failed: '+(await page.locator('#file-list').innerText()));
 const links=page.locator('#file-list a.download');
 if(await links.count()!==2)throw Error('Expected 2 PDFs');
 for(let i=0;i<2;i++){
  const pending=page.waitForEvent('download',{timeout:30000});
  await links.nth(i).click();
  const download=await pending;
  const filePath=resolve(output,'hybrid-genuine-'+(i===0?'hwp':'hwpx')+'.pdf');
  await download.saveAs(filePath);
  const data=readFileSync(filePath);
  const document=await PDFDocument.load(data);
  if(document.getPageCount()<1)throw Error('PDF has no pages');
  reports.push({format:i===0?'hwp':'hwpx',pages:document.getPageCount(),size:data.length,status:'PASS'});
 }
 if(errors.length||external.length||failedRequests.length)throw Error(JSON.stringify({errors,external,failedRequests}));
 await page.close();
}finally{await browser.close();}
reports.push({status:'PASS',engine:'opt-in hybrid SVG filter: vector where supported, filter-only page fallback',test:'real HWP/HWPX browser PDF downloads'});
writeFileSync(resolve(output,'DEV26_HYBRID_BROWSER_E2E.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports));
