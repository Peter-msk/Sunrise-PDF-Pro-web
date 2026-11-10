import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boundedFontStep} from '../src/font-timeout.mjs';
import {installMeasureFonts} from '../src/pdf-fonts.js';

test('R64 font browser step has finite timeout even for forever-pending blob',async()=>{
 const start=Date.now();
 await assert.rejects(()=>boundedFontStep(()=>new Promise(()=>{}),{
  timeoutMs:20,code:'PC_FONT_BLOB_TIMEOUT'
 }),{name:'TimeoutError',code:'PC_FONT_BLOB_TIMEOUT'});
 assert.ok(Date.now()-start<1000,'pending font promise must not stall batch');
});
test('R64 slow font can settle later without mutating completed result',async()=>{
 let finish;
 const original=new Promise(resolve=>{finish=resolve;});
 const outcome=boundedFontStep(original,{timeoutMs:15}).catch(e=>e.name);
 assert.equal(await outcome,'TimeoutError');
 finish('late font');
 assert.equal(await outcome,'TimeoutError');
});
test('R64 user cancellation overrides pending font operation',async()=>{
 const c=new AbortController();
 const result=boundedFontStep(()=>new Promise(()=>{}),{signal:c.signal,timeoutMs:5000});
 c.abort();
 await assert.rejects(result,{name:'AbortError'});
});
test('R64 FontFace.load watchdog skips an unavailable face and releases installed faces',async()=>{
 const registered=new Set();
 const fontSet={add:f=>registered.add(f),delete:f=>registered.delete(f)};
 class SlowFontFace {
  async load(){return new Promise(()=>{});}
 }
 const registry={faces:[{
  family:'Hangul Test',aliases:['hangultest'],cssAliases:[],
  bytes:new Uint8Array([1,2,3]),bold:false,italic:false
 }]};
 const start=Date.now();
 const cleanup=await installMeasureFonts(registry,undefined,fontSet,SlowFontFace,{
  skipUnavailable:true,maxTotalMs:100,perFaceMs:20
 });
 assert.ok(Date.now()-start<1000);
 assert.equal(cleanup.stats.skipped,1);
 assert.equal(cleanup.stats.timedOut,1);
 assert.equal(registered.size,0);
 cleanup();
});
test('R64 on-device font discovery is bounded and bundled aliases scoped to SVG names',()=>{
 const root=new URL('../src/',import.meta.url);
 const scan=readFileSync(new URL('local-fonts.js',root),'utf8');
 const converter=readFileSync(new URL('converter.js',root),'utf8');
 const main=readFileSync(new URL('main.js',root),'utf8');
 const telemetry=readFileSync(new URL('pro-telemetry.js',root),'utf8');
 const server=readFileSync(new URL('../../src/admin/handler.js',import.meta.url),'utf8');
 assert.match(scan,/maxReadMs=22000/);
 assert.match(scan,/boundedFontStep\(\(\)=>item\.blob\(\)/);
 assert.match(converter,/const tailoredBundled=options\.localFonts/);
 assert.match(converter,/maxTotalMs:18000,perFaceMs:3500/);
 assert.match(main,/info\.detail==='read'/);
 for(const stage of ['font_scan','font_read','font_bundle','font_measure']){
  assert.ok(telemetry.includes("'"+stage+"'"));
  assert.ok(server.includes("'"+stage+"'"));
 }
});
