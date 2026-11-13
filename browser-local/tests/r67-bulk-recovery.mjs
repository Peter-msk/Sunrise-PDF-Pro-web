/** DEV27: explicit user-confirmed recovery for a multi-document SVG batch. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canRecoverFile,planBulkRecovery,planConversion,recoveryEngine} from '../src/conversion-recovery.mjs';

const failed=(name,error='SVG_FILTER_EFFECT_UNSUPPORTED',lastEngine='professional')=>
 ({file:{name},state:'failed',error,lastEngine});
const done=name=>({file:{name},state:'done',result:{bytes:100}});
const ready=name=>({file:{name},state:'ready'});

test('25-item reported batch: explicitly recover only eight filter failures, preserve success and pending files',()=>{
 const completed=Array.from({length:13},(_,i)=>done('success'+i+'.hwp'));
 const broken=Array.from({length:8},(_,i)=>failed('failed'+i+(i%2?'.hwpx':'.hwp')));
 const waiting=Array.from({length:4},(_,i)=>ready('waiting'+i+'.hwpx'));
 const items=[...completed,...broken,...waiting];
 assert.equal(items.length,25);
 const plan=planBulkRecovery(items);
 assert.equal(plan.bulk,true);assert.equal(plan.recovery,true);
 assert.equal(plan.pending.length,8);
 assert.deepEqual(plan.pending,broken);
 assert.equal(plan.targets.length,8);
 assert.ok(plan.targets.every(x=>x.engine==='hybrid-filter'&&x.cause==='SVG_FILTER_EFFECT_UNSUPPORTED'));
 assert.ok(completed.every(x=>x.state==='done'&&x.result.bytes===100));
 assert.ok(waiting.every(x=>x.state==='ready'));
});

test('each failed document chooses the least destructive engine independently',()=>{
 const a=failed('filter.hwp');
 const b=failed('stream.hwpx','PDF_STREAM_TIMEOUT');
 const c=failed('hybrid.hwp','SVG_FILTER_EFFECT_UNSUPPORTED','hybrid-filter');
 const plan=planBulkRecovery([a,b,c]);
 assert.deepEqual(plan.targets.map(x=>x.engine),['hybrid-filter','compat-raster','compat-raster']);
 assert.deepEqual(plan.targets.map(x=>x.cause),
  ['SVG_FILTER_EFFECT_UNSUPPORTED','PDF_STREAM_TIMEOUT','SVG_FILTER_EFFECT_UNSUPPORTED']);
});

test('bulk button cannot degrade unrecognized failure, completed file or cancelled file',()=>{
 const ignored=failed('missingfont.hwp','FONT_GLYPH_MISSING');
 const doneButFailed={...failed('done.hwp'),state:'done'};
 const cancelled={...failed('cancelled.hwpx'),state:'cancelled'};
 const notHwp=failed('sheet.xlsx');
 assert.equal(canRecoverFile(ignored),false);
 const plan=planBulkRecovery([ignored,doneButFailed,cancelled,notHwp,ready('new.hwp')]);
 assert.deepEqual(plan.pending,[]);
 assert.equal(plan.recovery,false);
});

test('bulk is read-only planning: ordinary conversion retains professional default',()=>{
 const x=failed('filter.hwp'),other=ready('new.hwp');
 const normal=planConversion([x,other],'professional');
 assert.equal(normal.engine,'professional');
 assert.deepEqual(normal.pending,[x,other]);
 const batch=planBulkRecovery([x,other]);
 assert.deepEqual(batch.pending,[x]);
 assert.equal(x.lastEngine,'professional');
 assert.equal(recoveryEngine(x),'hybrid-filter');
});

test('reject malformed queue with identical fail-closed contract',()=>{
 assert.throws(()=>planBulkRecovery(null),/CONVERSION_QUEUE_INVALID/);
 assert.throws(()=>planBulkRecovery({}),/CONVERSION_QUEUE_INVALID/);
});

test('production UI requires direct click, distinct per-item engines, and no global engine switch',()=>{
 const js=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="recover-failed"[^>]*hidden disabled/);
 assert.match(html,/실패 파일만 복구/);
 assert.match(js,/\$\('recover-failed'\)\.addEventListener\('click'/);
 assert.match(js,/requestedBulkRecovery=true/);
 assert.match(js,/bulkRequested\?planBulkRecovery\(items\):planConversion/);
 assert.match(js,/const recoverySpecs=new Map/);
 assert.match(js,/itemEngine=spec\?\.engine\|\|engine/);
 assert.match(js,/engine:itemEngine/);
 assert.doesNotMatch(js,/\$\('pdf-engine'\)\.value\s*=\s*'compat-raster'/);
 assert.doesNotMatch(js,/\$\('pdf-engine'\)\.value\s*=\s*'hybrid-filter'/);
});
