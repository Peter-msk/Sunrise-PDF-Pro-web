/** DEV27 inspect only publicly released HWPX SVG reference kinds.
 * No user input, no original SVG, URL, text or image bytes are persisted.
 */
import {chromium} from 'playwright';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const site=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:4174/';
const root=resolve(import.meta.dirname,'../..');
const fixture=readFileSync(resolve(root,'r29-browser-fixtures/complex.hwpx'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let report={fixture:'rhwp v0.8.7 SO-SUEOP.hwpx',status:'incomplete'};
try{
 const page=await browser.newPage();
 await page.goto(site,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('변환 준비 완료'),null,{timeout:80000});
 const data=Array.from(fixture);
 report=await page.evaluate(async arr=>{
  const mod=await import('/tests/dev27-public-svg-ref-helper.mjs');
  return mod.classifyPublicSvgReferences(arr);
 },data);
 report.status='observed';
 console.log(JSON.stringify(report));
 await page.close();
}catch(e){
 report={...report,status:'failed',error:String(e.message||e).slice(0,200)};
 console.error(JSON.stringify(report));
 process.exitCode=1;
}finally{
 const dir=resolve(root,'r29-browser-real-evidence');
 mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'DEV27_PUBLIC_SVG_REF_DIAGNOSTIC.json'),JSON.stringify(report,null,2));
 await browser.close();
}
