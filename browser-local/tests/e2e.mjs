import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const output=resolve(root,'r29-browser-real-evidence');mkdirSync(output,{recursive:true});
const results=[];
try{
 for(const ext of ['hwp','hwpx']){
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[],external=[],consoleErrors=[],requestFailures=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  page.on('requestfailed',req=>requestFailures.push(req.url()+': '+req.failure()?.errorText));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173/')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle',timeout:30000});
  await page.waitForFunction(()=>/초기화 완료|초기화 실패/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
  const boot=await page.locator('#status').innerText();
  console.log('WASM BOOT:',boot,'CONSOLE_ERRORS:',consoleErrors,'REQUEST_FAILURES:',requestFailures);
  if(!boot.includes('초기화 완료'))throw Error(ext+' WASM initialization failed: '+boot+' '+consoleErrors.join('|'));
  await page.locator('#source').setInputFiles(resolve(root,'r29-browser-fixtures/genuine.'+ext));
  await page.locator('#convert').click();
  await page.waitForFunction(()=>document.querySelector('#download').hidden===false || document.querySelector('#status').textContent.includes('변환 실패'),null,{timeout:120000});
  const message=await page.locator('#status').innerText();
  if(!message.includes('실제 PDF 생성 완료'))throw new Error(ext+' conversion status: '+message);
  const dlPromise=page.waitForEvent('download',{timeout:20000});
  await page.locator('#download').click();
  const dl=await dlPromise;
  const path=resolve(output,'browser-genuine-'+ext+'.pdf');
  await dl.saveAs(path);
  if(!existsSync(path)||errors.length||external.length||requestFailures.length)throw new Error(JSON.stringify({path,errors,external,requestFailures,consoleErrors}));
  results.push({ext,path,status:'PASS',networkRequests:'same-origin only'});
  await page.close();
 }
} finally{await browser.close();}
writeFileSync(resolve(output,'R29_BROWSER_LOCAL_E2E.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
