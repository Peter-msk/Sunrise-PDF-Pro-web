/**
 * Real Chromium acceptance for a deliberately frozen -> resumed HWP job.
 * This verifies continuation after the browser pauses JavaScript execution;
 * it is not proof that an actual Windows-minimized tab stays scheduled.
 */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {spawn} from 'node:child_process';
import {get} from 'node:http';
import {setTimeout as sleep} from 'node:timers/promises';

const root=resolve(import.meta.dirname,'..');
const source=resolve(root,'../r29-browser-fixtures/genuine.hwp');
if(!existsSync(source))throw Error('REAL_HWP_FIXTURE_MISSING');
const base='http://127.0.0.1:4194/';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4194','--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 let ready=false;
 for(let i=0;i<90;i++){
  if(server.exitCode!==null)throw Error('Vite startup failed: '+server.exitCode);
  try{const response=await new Promise((ok,bad)=>get(base,r=>{r.resume();ok(r.statusCode);}).on('error',bad));if(response===200){ready=true;break;}}catch{}
  await sleep(250);
 }
 if(!ready)throw Error('VITE_HIDDEN_TAB_START_TIMEOUT');
 browser=await chromium.launch({headless:process.env.SUNRISE_HEADFUL_TEST!=='1',args:['--no-sandbox']});
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(base,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('변환 준비 완료'),null,{timeout:90000});
 await page.locator('details.options.advanced summary').click();
 await page.evaluate(async()=>{
  const response=await fetch('/fonts/NanumGothic-Regular.ttf');
  if(!response.ok)throw Error('Font test fixture missing');
  const font=await response.blob();
  window.__localQueries=0;
  window.queryLocalFonts=async()=>{
   window.__localQueries++;
   if(window.__localQueries>1)throw Error('FONT_CACHE_MUST_PREVENT_SECOND_ENUMERATION');
   return [{family:'Nanum Gothic',fullName:'Nanum Gothic',postscriptName:'NanumGothic',style:'Regular',blob:async()=>font}];
  };
 });
 await page.locator('#font-check').click();
 await page.waitForFunction(()=>document.querySelector('#pc-font-status')?.textContent.includes('1개에 접근 가능합니다'),null,{timeout:15000});
 await page.locator('#source').setInputFiles(source);
 await page.locator('#convert').click();
 // Playwright's ordinary newPage()/bringToFront() leaves the source page
 // visible in automated Chrome. CDP's Page Lifecycle transition forces the
 // actual hidden and frozen states; a real frozen page CANNOT run JavaScript.
 // Resume in the hidden state, then verify conversion completes there.
 const cdp=await context.newCDPSession(page);
 await cdp.send('Page.enable');
 await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
 await sleep(400);
 await cdp.send('Page.setWebLifecycleState',{state:'active'});
 // Automated Chromium does not necessarily expose hidden after CDP resumes.
 // The supported CDP lifecycle calls above establish the forced pause/resume.
 const visibleAfterResume=await page.evaluate(()=>document.visibilityState);
 let state='ready';
 for(let i=0;i<180;i++){
  state=await page.locator('.file-row').first().getAttribute('data-state');
  if(state==='done'||state==='failed')break;
  await sleep(1000);
 }
 if(state!=='done')throw Error('HWP_BACKGROUND_CONVERSION_'+state+' '+await page.locator('#status').innerText());
 const queries=await page.evaluate(()=>window.__localQueries);
 if(queries!==1)throw Error('FONT_DATA_REQUERIED_AFTER_CHECK: '+queries);
 await page.bringToFront();
 const link=page.locator('#file-list a.download');
 const dlWait=page.waitForEvent('download',{timeout:20000});await link.click();
 const download=await dlWait;const p=await download.path();
 const pdf=await PDFDocument.load(await (await import('node:fs/promises')).readFile(p));
 if(pdf.getPageCount()<1)throw Error('HWP_BACKGROUND_EMPTY_PDF');
 if(pageErrors.length)throw Error('HWP_BACKGROUND_JS_ERRORS '+JSON.stringify(pageErrors));
 console.log('FROZEN_RESUMED_HWP_AND_FONT_CACHE_PASS '+JSON.stringify({pauseResume:'CDP Page Lifecycle',visibilityAfterResume:visibleAfterResume,pages:pdf.getPageCount(),queryLocalFontsCalls:queries}));
 await context.close();
}finally{await browser?.close();server.kill('SIGTERM');}
