import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const site=process.env.SUNRISE_TEST_URL || 'http://127.0.0.1:4173/';
const origin=new URL(site).origin;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const output=resolve(root,'r29-browser-real-evidence');mkdirSync(output,{recursive:true});
const results=[];
try{
 for(const ext of ['hwp','hwpx']){
  const page=await browser.newPage({acceptDownloads:true});
  // Official public upstream fixture only: inspect SVG text syntax for R32 selectable layer.
  await page.addInitScript(() => {
   const parse=DOMParser.prototype.parseFromString;
   DOMParser.prototype.parseFromString=function(source,type){
    if(type==='image/svg+xml' && !window.__r32SampleLogged){
      window.__r32SampleLogged=true;
      const text=[...source.matchAll(/<text\\b[^>]*>[\\s\\S]*?<\\/text>/g)].slice(0,6).map(x=>x[0].slice(0,320));
      console.log('R32_SVG_SAMPLE',JSON.stringify({svgLength:source.length,textElements:(source.match(/<text\\b/g)||[]).length,text}));
    }
    return parse.call(this,source,type);
   };
  });
  const errors=[],external=[],consoleErrors=[],requestFailures=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());if(m.text().startsWith('R32_SVG_SAMPLE'))console.log(m.text());});
  page.on('requestfailed',req=>requestFailures.push(req.url()+': '+req.failure()?.errorText));
  page.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto(site,{waitUntil:'networkidle',timeout:30000});
  await page.waitForFunction(()=>/초기화 완료|초기화 실패/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
  const boot=await page.locator('#status').innerText();
  console.log('WASM BOOT:',boot,'CONSOLE_ERRORS:',consoleErrors,'REQUEST_FAILURES:',requestFailures);
  if(!boot.includes('초기화 완료'))throw Error(ext+' WASM initialization failed: '+boot+' '+consoleErrors.join('|'));
  await page.locator('#source').setInputFiles(resolve(root,'r29-browser-fixtures/genuine.'+ext));
  if(ext==='hwp'){
   const controls=await page.evaluate(()=>{
    document.querySelector('#convert').click();
    const state={
     cancelEnabled:!document.querySelector('#cancel').disabled,
     fileSelectionLocked:document.querySelector('#source').disabled,
     secondConversionLocked:document.querySelector('#convert').disabled
    };
    document.querySelector('#cancel').click();
    return state;
   });
   if(!Object.values(controls).every(Boolean))throw Error('Cancellation control contract: '+JSON.stringify(controls));
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('취소되었습니다'),null,{timeout:20000});
   if(!(await page.locator('#download').isHidden()))throw Error('Cancelled job exposed a PDF download');
   if(await page.locator('#source').isDisabled())throw Error('Cancelled job did not unlock file selection');
  }
  await page.locator('#convert').click();
  await page.waitForFunction(()=>document.querySelector('#download').hidden===false || document.querySelector('#status').textContent.includes('변환 실패'),null,{timeout:120000});
  const message=await page.locator('#status').innerText();
  if(!message.includes('실제 PDF 생성 완료'))throw new Error(ext+' conversion status: '+message);
  const raster=await page.locator('#preview img').evaluate(async img=>{
   await img.decode();
   return {width:img.naturalWidth,height:img.naturalHeight};
  });
  if(Math.min(raster.width,raster.height)<2300 || Math.max(raster.width,raster.height)<3000)
   throw new Error('R31 high-quality raster under target: '+JSON.stringify({ext,...raster}));
  console.log('R31 300dpi-first-page resolution:',ext,raster);
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
