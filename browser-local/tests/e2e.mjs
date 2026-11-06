/**
 * Release acceptance: actual browser-local HWP + HWPX -> individual PDF files
 * and one ZIP, using the default object-preserving professional engine.
 * Does not transmit documents to the Worker; only same-origin assets are loaded.
 * Any unsupported source fails this gate instead of silently switching to raster.
 */
import {chromium} from 'playwright';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {unzipSync} from 'fflate';
const root=resolve(import.meta.dirname,'../..');
const site=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:4173/';
const origin=new URL(site).origin;
const output=resolve(root,'r29-browser-real-evidence');
mkdirSync(output,{recursive:true});
const reports=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[],external=[],failures=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>failures.push(r.url()+': '+r.failure()?.errorText));
 page.on('request',r=>{
  const u=r.url();
  if(!u.startsWith(origin+'/')&&!u.startsWith('blob:')&&!u.startsWith('data:'))external.push(u);
 });
 await page.goto(site,{waitUntil:'networkidle',timeout:30000});
 await page.waitForFunction(()=>/변환 준비 완료|초기화 실패|변환 기능 초기화 실패/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
 const boot=await page.locator('#status').innerText();
 if(!boot.includes('변환 준비 완료'))throw Error('rhwp WASM initialization failed: '+boot);
 if(await page.locator('#pdf-engine').inputValue()!=='professional')throw Error('Default engine must preserve text and shapes');
 const originals=['hwp','hwpx'].map(ext=>resolve(root,'r29-browser-fixtures/genuine.'+ext));
 for(const source of originals)if(!existsSync(source))throw Error('Missing fixture '+source);
 await page.locator('#source').setInputFiles(originals);
 if(await page.locator('#total-count').innerText()!=='2')throw Error('HWP/HWPX batch selection not registered');
 await page.locator('#convert').click();
 await page.waitForFunction(()=>{
  const status=document.querySelector('#status')?.textContent||'';
  const finished=document.querySelector('#done-count')?.textContent==='2';
  const failed=document.querySelector('#failed-count')?.textContent!=='0';
  return !document.querySelector('#cancel')?.disabled&&(finished||failed)
   || finished&&document.querySelector('#download-all')?.hidden===false
   || failed&&document.querySelector('#cancel')?.disabled;
 },null,{timeout:240000});
 const status=await page.locator('#status').innerText();
 const done=await page.locator('#done-count').innerText();
 if(done!=='2')throw Error('Professional HWP/HWPX batch failed: '+status+'; '+(await page.locator('#file-list').innerText()));
 await page.locator('#download-all').waitFor({state:'visible',timeout:60000});
 const links=page.locator('#file-list a.download');
 if(await links.count()!==2)throw Error('Expected two per-file PDF links');
 for(let i=0;i<2;i++){
  const dlPromise=page.waitForEvent('download',{timeout:30000});
  await links.nth(i).click();
  const download=await dlPromise;
  const ext=i===0?'hwp':'hwpx';
  const path=resolve(output,'browser-genuine-'+ext+'.pdf');
  await download.saveAs(path);
  if(!existsSync(path)||readFileSync(path).subarray(0,5).toString()!=='%PDF-')throw Error(ext+' invalid PDF download');
  reports.push({ext,path,bytes:readFileSync(path).length});
 }
 const zipWait=page.waitForEvent('download',{timeout:30000});
 await page.locator('#download-all').click();
 const zip=await zipWait;
 const zipPath=resolve(output,'browser-genuine-batch.zip');await zip.saveAs(zipPath);
 const unpacked=unzipSync(new Uint8Array(readFileSync(zipPath)));
 const names=Object.keys(unpacked).sort();
 if(names.length!==2||names.some(x=>!x.endsWith('.pdf')||Buffer.from(unpacked[x].subarray(0,5)).toString('ascii')!=='%PDF-'))
  throw Error('ZIP does not contain exactly two valid PDF files: '+JSON.stringify(names));
 if(errors.length||external.length||failures.length)throw Error(JSON.stringify({errors,external,failures}));
 reports.push({archive:zipPath,contents:names,status:'PASS',engine:'professional',networkRequests:'same-origin only',boot});
 await page.close();
}finally{await browser.close();}
writeFileSync(resolve(output,'R40_BROWSER_LOCAL_E2E.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
