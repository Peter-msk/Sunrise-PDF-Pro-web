/** DEV26 Windows Chrome/Edge headful minimize, tab switch and cancel/retry.
 * Only pinned public HWP data, local Worker server and local browser memory.
 * Native-minimize evidence is reported separately from CDP forced freeze.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';

const channel=process.env.SUNRISE_BROWSER_CHANNEL||'chrome';
if(!['chrome','msedge'].includes(channel))throw Error('INVALID_WINDOWS_BROWSER_CHANNEL');
if(process.platform!=='win32')throw Error('THIS_TEST_REQUIRES_REAL_WINDOWS');
const base=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:8787/local/';
const root=resolve(import.meta.dirname,'../../r29-browser-fixtures');
const evidence={channel,os:process.platform,headed:true,tabHidden:false,
 nativeWindowMinimizeApplied:false,minimizedPageHidden:false,
 forcedFreezeResumed:false,bfcachePreserved:false,manualRetrySucceeded:false,
 backgroundCompleted:false,queryLocalFontsCalls:0};
const browser=await chromium.launch({
 channel,headless:false,args:['--no-first-run','--no-default-browser-check']
});
const failures=[];
async function readyPage(context){
 const page=await context.newPage();
 page.on('pageerror',e=>failures.push(e.message));
 await page.addInitScript(()=>{
  window.__fontHold=true;
  window.__fontQueryCount=0;
  window.__resolveFontHold=null;
  window.__phaseEvents=[];
  document.addEventListener('freeze',()=>window.__phaseEvents.push('freeze'));
  document.addEventListener('resume',()=>window.__phaseEvents.push('resume'));
  document.addEventListener('visibilitychange',()=>window.__phaseEvents.push(
   'visibility:'+document.visibilityState));
  window.queryLocalFonts=()=>{
   window.__fontQueryCount++;
   if(!window.__fontHold)return Promise.resolve([]);
   return new Promise(resolve=>{window.__resolveFontHold=resolve;});
  };
 });
 await page.goto(base,{waitUntil:'networkidle',timeout:45000});
 await page.waitForFunction(()=>/변환 준비 완료/.test(
  document.querySelector('#status')?.textContent||''),null,{timeout:90000});
 return page;
}
async function startPausedFontAccess(page,name){
 await page.locator('#source').setInputFiles(resolve(root,name));
 await page.locator('#convert').click();
 await page.waitForFunction(()=>!!window.__resolveFontHold&&
  document.querySelector('#cancel')?.disabled===false,null,{timeout:25000});
}
async function completedPdf(page){
 await page.waitForFunction(()=>document.querySelector('#done-count')?.textContent==='1'
  ||document.querySelector('#failed-count')?.textContent==='1',null,{timeout:180000});
 assert.equal(await page.locator('#done-count').innerText(),'1',
  await page.locator('#file-list').innerText());
 const wait=page.waitForEvent('download',{timeout:45000});
 await page.locator('#file-list a.download').first().click();
 const file=await wait,path=await file.path();
 const pdf=await PDFDocument.load(await readFile(path));
 assert.ok(pdf.getPageCount()>=1);
 return pdf.getPageCount();
}
try{
 const context=await browser.newContext({acceptDownloads:true});
 const page=await readyPage(context);
 await startPausedFontAccess(page,'genuine.hwp');
 const second=await context.newPage();
 await second.goto('about:blank');
 await second.bringToFront();
 await sleep(450);
 evidence.tabHidden=await page.evaluate(()=>document.hidden);
 const cdp=await context.newCDPSession(page);
 await cdp.send('Page.enable');
 // A genuine Windows native browser window, not a fake DOM visibility event.
 // A headful Windows runner may still decline to change visibility on minimize.
 let windowId=null;
 try{
  const info=await cdp.send('Browser.getWindowForTarget');
  windowId=info.windowId;
  await cdp.send('Browser.setWindowBounds',{windowId,
   bounds:{windowState:'minimized'}});
  evidence.nativeWindowMinimizeApplied=true;
  await sleep(700);
  evidence.minimizedPageHidden=await page.evaluate(()=>document.hidden);
 }finally{
  if(windowId!==null)
   await cdp.send('Browser.setWindowBounds',{windowId,
    bounds:{windowState:'normal'}}).catch(()=>{});
 }
 await page.bringToFront();
 // In addition to an OS minimize, force an actual renderer freeze/thaw.
 await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
 await sleep(350);
 await cdp.send('Page.setWebLifecycleState',{state:'active'});
 const phases=await page.evaluate(()=>window.__phaseEvents);
 evidence.forcedFreezeResumed=phases.includes('freeze')&&phases.includes('resume');
 assert.equal(evidence.forcedFreezeResumed,true);
 await page.evaluate(()=>{
  window.__fontHold=false;
  window.__resolveFontHold([]);
 });
 await completedPdf(page);
 evidence.backgroundCompleted=true;
 evidence.queryLocalFontsCalls=await page.evaluate(()=>window.__fontQueryCount);
 assert.equal(evidence.queryLocalFontsCalls,1,
  'no duplicate font-permission enumeration after freeze/resume');
 const before=await page.locator('#file-list a.download').first().getAttribute('href');
 // A synthetic persisted BFCache lifecycle exercises the cleanup guard.
 await page.evaluate(()=>{
  window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 const after=await page.locator('#file-list a.download').first().getAttribute('href');
 evidence.bfcachePreserved=before===after&&before?.startsWith('blob:');
 assert.equal(evidence.bfcachePreserved,true);

 const retry=await readyPage(context);
 await startPausedFontAccess(retry,'genuine.hwpx');
 const retryCdp=await context.newCDPSession(retry);
 await retryCdp.send('Page.enable');
 await retryCdp.send('Page.setWebLifecycleState',{state:'frozen'});
 await sleep(280);
 await retryCdp.send('Page.setWebLifecycleState',{state:'active'});
 await retry.bringToFront();
 await retry.locator('#cancel').click();
 await retry.waitForFunction(()=>document.querySelector('#cancel')?.disabled===true &&
  /취소/.test(document.querySelector('#status')?.textContent||''),null,{timeout:12000});
 await retry.waitForFunction(()=>document.querySelector('#convert')?.disabled===false,
  null,{timeout:20000});
 assert.equal(await retry.locator('#done-count').innerText(),'0');
 await retry.evaluate(()=>{window.__fontHold=false;});
 await retry.locator('#convert').click();
 await completedPdf(retry);
 evidence.manualRetrySucceeded=true;
 assert.equal(await retry.evaluate(()=>window.__fontQueryCount),2,
  'one denied/aborted request plus one explicit retry, no automatic duplicate');
 await context.close();
 assert.deepEqual(failures,[],'no uncaught page errors');
 console.log('WINDOWS_BROWSER_DEV26_BACKGROUND_ACCEPTANCE_PASS '+JSON.stringify(evidence));
}finally{await browser.close();}
