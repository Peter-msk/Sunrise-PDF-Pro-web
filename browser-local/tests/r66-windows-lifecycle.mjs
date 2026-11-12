/** DEV26: browser visibility/freeze/BFCache and user cancellation contracts.
 * Tests only active in-memory work. A discarded tab cannot run JavaScript.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createConversionClock} from '../src/conversion-clock.js';
import {runBatch} from '../src/batch.js';
import {planConversion} from '../src/conversion-recovery.mjs';

function clockFixture(){
 const window=new JSDOM('<div id="status">준비 중</div>').window;
 const doc=window.document;
 let t=0,hidden=false,scheduled=0,cleared=0;
 Object.defineProperty(doc,'hidden',{get:()=>hidden});
 const clock=createConversionClock({
  doc,now:()=>t,wallNow:()=>1794470400000+t,
  setIntervalFn:()=>++scheduled,clearIntervalFn:()=>++cleared
 });
 const get=id=>doc.getElementById('conversion-'+id).textContent;
 const hint=()=>doc.querySelector('.conversion-clock-hint').textContent;
 return {clock,get,hint,step:ms=>{t+=ms;},hide:val=>{hidden=val;},close:()=>window.close(),
  counter:()=>({scheduled,cleared})};
}
test('background transition suppresses ETA without pretending work progressed',()=>{
 const p=clockFixture();
 try{
  p.clock.start(2);p.step(30000);p.clock.update(0,.5,'SVG 변환');
  assert.match(p.get('remaining'),/약 00:30/);
  p.hide(true);p.clock.setLifecycle({isHidden:true});
  assert.equal(p.get('remaining'),'계산 중');assert.equal(p.get('finish'),'—');
  assert.match(p.hint(),/다른 탭 또는 최소화/);
  p.step(40000);
  p.hide(false);p.clock.setLifecycle({isHidden:false});
  assert.equal(p.get('remaining'),'계산 중','stale background progress must NOT get an ETA');
  assert.match(p.hint(),/갱신이 지연/);
  p.clock.update(1,.2,'PDF 생성');
  assert.notEqual(p.get('remaining'),'계산 중','real progress after resume allows ETA');
 }finally{p.clock.reset();p.close();}
});
test('freeze and thaw preserve elapsed time, suppress ETA while frozen and do not restart clock',()=>{
 const p=clockFixture();
 try{
  p.clock.start(1);p.step(13000);p.clock.update(0,.5,'페이지');
  p.clock.setLifecycle({isHidden:true,isFrozen:true});
  assert.match(p.hint(),/동결/);assert.equal(p.get('remaining'),'계산 중');
  p.step(17000);p.clock.setLifecycle({isHidden:false,isFrozen:false});
  assert.equal(p.get('elapsed'),'00:30');
  assert.equal(p.counter().scheduled,1,'one timer only, thaw does not create another');
  assert.equal(p.get('remaining'),'계산 중');
 }finally{p.clock.finish('done');p.close();}
});
test('completed PDF remains on cancellation and only pending files run when user retries',async()=>{
 const items=['done.hwp','cancelled.hwp','queued.hwpx'].map(name=>({
  file:{name},state:'ready'
 }));
 const abort=new AbortController(),calls=[];
 await runBatch(items,async file=>{
  calls.push(file.name);
  if(file.name==='cancelled.hwp')abort.abort();
  return {pdf:new Blob([file.name],{type:'application/pdf'})};
 },abort.signal);
 assert.deepEqual(items.map(x=>x.state),['done','cancelled','ready']);
 const preserved=items[0].result.pdf;
 assert.deepEqual(calls,['done.hwp','cancelled.hwp']);
 const plan=planConversion(items,'professional');
 assert.deepEqual(plan.pending,items.slice(1));
 await runBatch(plan.pending,async file=>{
  calls.push(file.name);
  return {pdf:new Blob([file.name],{type:'application/pdf'})};
 });
 assert.deepEqual(items.map(x=>x.state),['done','done','done']);
 assert.equal(items[0].result.pdf,preserved);
 assert.deepEqual(calls,['done.hwp','cancelled.hwp','cancelled.hwp','queued.hwpx']);
});
test('cancelled between documents is a normal queue stop, not an unhandled AbortError',async()=>{
 const abort=new AbortController();
 const items=['done.hwp','waiting.hwpx'].map(name=>({file:{name},state:'ready'}));
 await assert.doesNotReject(runBatch(items,async file=>{
  abort.abort();
  return {pdf:new Blob([file.name],{type:'application/pdf'})};
 },abort.signal));
 assert.deepEqual(items.map(x=>x.state),['cancelled','ready'],
  'the current result is withheld when cancellation was signaled before publication');
});
test('source separates BFCache freeze from terminal pagehide and never auto-resubmits',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/window\.addEventListener\('pagehide',event=>\{/);
 assert.match(main,/if\(event\.persisted\)\{/);
 assert.match(main,/window\.addEventListener\('pageshow',event=>/);
 assert.match(main,/document\.addEventListener\('freeze'/);
 assert.match(main,/document\.addEventListener\('resume'/);
 assert.match(main,/document\.wasDiscarded/);
 assert.match(main,/controller\.abort\(\)/);
 assert.match(main,/중단된 작업을 중복 실행하지 않습니다/);
});
