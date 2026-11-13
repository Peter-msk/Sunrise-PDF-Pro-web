/** DEV27 real-browser UI acceptance for failed HWP/HWPX native print.
 * Uses public versioned rhwp fixtures only. The default PDF attempt is fault
 * injected at its module boundary; the native print path executes the real
 * HWP/HWPX WASM parser, fonts, SVG safety and browser iframe preparation.
 * No actual operating-system print dialog is used: intercept print() and
 * assert the correct user gesture, document identity and state lifecycle.
 */
import {chromium} from 'playwright';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'../..');
const url=process.env.SUNRISE_RECOVERY_UI_URL||'http://127.0.0.1:4174/';
const fixtureExts=['hwp','hwpx'];
const input=fixtureExts.map(ext=>resolve(root,'r29-browser-fixtures/genuine.'+ext));
const evidence=resolve(root,'r29-browser-real-evidence/DEV27_NATIVE_PRINT_REAL_BROWSER.json');
mkdirSync(resolve(root,'r29-browser-real-evidence'),{recursive:true});
const report={test:'DEV27 native print recovery with two public genuine documents',
 url:new URL(url).origin,fixtures:fixtureExts,checks:[],attempts:[],errors:[],
 status:'INCOMPLETE'};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let page;
async function step(label,cb){
 await cb();report.checks.push(label);console.log('PASS: '+label);
}
try{
 page=await browser.newPage({acceptDownloads:true});
 page.on('pageerror',error=>report.errors.push(String(error.message).slice(0,250)));
 await page.addInitScript(()=>{
  window.__dev27PrintCalls=0;
  window.addEventListener('message',e=>{
   if(e.data?.probe==='DEV27_NATIVE_PRINT_GESTURE')window.__dev27PrintCalls++;
  });
  window.print=()=>{
   if(window.parent!==window)window.parent.postMessage({probe:'DEV27_NATIVE_PRINT_GESTURE'},'*');
  };
 });
 let moduleIntercepts=0;
 await page.route('**/src/convert-any.js*',async route=>{
  moduleIntercepts++;
  return route.fulfill({status:200,contentType:'application/javascript',body:`
   export async function convertAnyToPdf(file,onProgress=()=>{},signal,options={}) {
    if(signal?.aborted)throw new DOMException('cancelled','AbortError');
    (window.__dev27Faulted||=[]).push({name:file.name,engine:options.engine});
    if(/\\.hwp(?:x)?$/i.test(file.name))throw Error('SVG_FILTER_EFFECT_UNSUPPORTED');
    throw Error('UNEXPECTED_FIXTURE');
   }`});
 });
 await page.goto(url,{waitUntil:'networkidle',timeout:45000});
 await page.waitForFunction(()=>
  document.getElementById('status')?.textContent?.includes('변환 준비 완료'),null,{timeout:60000});
 await step('real browser initialized existing HWP/HWPX WASM resources',async()=>{
  assert.equal(moduleIntercepts,1);
  assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 });
 await page.locator('#source').setInputFiles(input);
 await page.locator('#convert').click();
 await page.waitForFunction(()=>{
  const disabled=document.getElementById('cancel')?.disabled;
  return disabled&&document.getElementById('failed-count')?.textContent==='2';
 },null,{timeout:90000});
 await step('two real user-selectable fixtures show SVG failure without automatic rasterization',async()=>{
  assert.equal(await page.locator('.native-print-recovery').count(),2);
  assert.equal(await page.locator('.compat-retry').count(),2);
  assert.equal(await page.locator('#done-count').innerText(),'0');
  assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 });
 const printFrame=page.locator('iframe[title="Sunrise PDF PRO 벡터 PDF 인쇄용 문서"]');
 for(const [idx,ext] of fixtureExts.entries()){
  const filename='genuine.'+ext;
  const row=page.locator('.file-row').nth(idx);
  assert.equal(await row.locator('.file-name').innerText(),filename);
  await row.locator('.native-print-recovery').click();
  await page.waitForFunction(()=>{
   const status=document.getElementById('status')?.textContent||'';
   return status.includes('브라우저 인쇄 준비 완료')||
     status.includes('인쇄 준비 실패');
  },null,{timeout:120000});
  const status=await page.locator('#status').innerText();
  assert.match(status,/브라우저 인쇄 준비 완료/,
   filename+' print preparation failed: '+status);
  await step(ext.toUpperCase()+' actual WASM SVG→safe iframe print preparation',async()=>{
   assert.equal(await page.locator('#viewer-file').innerText(),filename);
   assert.equal(await printFrame.count(),1);
   assert.ok(await printFrame.locator('svg').count()>0,'print frame must have checked SVG');
   assert.equal(await printFrame.locator('script,foreignObject').count(),0);
   assert.equal(await row.locator('.native-print-save').count(),1);
   assert.equal(await page.locator('#print-save').isEnabled(),true);
   assert.equal(await page.locator('#failed-count').innerText(),'2');
  });
  await row.getByRole('button',{name:'선택',exact:true}).click();
  await step(ext.toUpperCase()+' same-file reselect preserves existing print job',async()=>{
   assert.equal(await row.locator('.native-print-save').count(),1);
   assert.equal(await printFrame.count(),1);
  });
  await row.locator('.native-print-save').click();
  await page.waitForFunction(expected=>window.__dev27PrintCalls===expected,idx+1,{timeout:10000});
  await step(ext.toUpperCase()+' explicit print click reaches browser print only',async()=>{
   assert.equal(await page.locator('#done-count').innerText(),'0');
   assert.equal(await page.locator('#failed-count').innerText(),'2');
  });
  if(idx===0){
   const second=page.locator('.file-row').nth(1);
   assert.equal(await second.locator('.file-name').innerText(),'genuine.hwpx');
   await second.getByRole('button',{name:'선택',exact:true}).click();
   await step('switching from HWP to HWPX destroys stale HWP print frame',async()=>{
    assert.equal(await printFrame.count(),0);
    assert.equal(await page.locator('#print-save').isEnabled(),false);
    assert.equal(await second.locator('.native-print-save').count(),0);
   });
  }
 }
 await page.locator('#pdf-engine').selectOption('hybrid-filter');
 await step('engine change invalidates stale printed SVG, keeps conversion status',async()=>{
  assert.equal(await printFrame.count(),0);
  assert.equal(await page.locator('#print-save').isEnabled(),false);
  assert.equal(await page.locator('.native-print-save').count(),0);
  assert.equal(await page.locator('#failed-count').innerText(),'2');
 });
 report.attempts=await page.evaluate(()=>window.__dev27Faulted||[]);
 assert.deepEqual(report.attempts.map(x=>x.engine),['professional','professional']);
 assert.deepEqual(report.errors,[]);
 report.status='PASS';
 console.log('DEV27_NATIVE_PRINT_PUBLIC_HWP_HWPX_BROWSER_PASS');
}catch(error){
 report.status='FAIL';report.error=String(error?.stack||error).slice(0,1600);
 if(page){
  report.lastStatus=(await page.locator('#status').innerText().catch(()=>'' )).slice(0,260);
  report.fileRows=(await page.locator('#file-list').innerText().catch(()=>'' )).slice(0,600);
 }
 console.error('DEV27_NATIVE_PRINT_PUBLIC_BROWSER_FAIL',report.error);
 process.exitCode=1;
}finally{
 writeFileSync(evidence,JSON.stringify(report,null,2));
 await browser.close();
}
