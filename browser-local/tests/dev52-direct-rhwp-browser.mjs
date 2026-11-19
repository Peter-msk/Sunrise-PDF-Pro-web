/** Standalone opt-in browser probe, using existing MIT public HWPX fixture.
 * Does not modify production UI or upload document bytes.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const fixture=Buffer.from(readFileSync(new URL('./fixtures/dev44-rhwp-test-image.hwpx.b64',import.meta.url),'utf8').trim(),'base64');
const server=await createServer({server:{host:'127.0.0.1',port:5182,strictPort:true}});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5182/',{waitUntil:'domcontentloaded'});
 const results=await page.evaluate(async input=>{
  const {probeDirectRhwp}=await import('/tests/dev52-direct-rhwp-entry.mjs');
  return probeDirectRhwp(input);
 },Array.from(fixture));
 assert.ok(results.length>0);assert.ok(results.every(x=>x.schema===35&&x.operations>0));
 console.log('DEV52_DIRECT_RHWP_PROBE '+JSON.stringify(results));
}finally{await browser?.close();await server.close();}
