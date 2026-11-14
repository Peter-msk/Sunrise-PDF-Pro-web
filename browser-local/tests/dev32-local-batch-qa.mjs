import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocalBatchQaReport,localQaErrorCode} from '../src/local-batch-qa.mjs';

const item=(name,state,extra={})=>({file:{name,size:1234},state,...extra});
test('25-file test shape: count successes, failures and waiting without pretending to re-run files',()=>{
 const items=[
  ...Array.from({length:13},(_,i)=>item('confidential_'+i+'.hwp','done',
   {lastEngine:'professional',_proDurationMs:8000,result:{pages:3,vectorPages:3,rasterPages:0}})),
  ...Array.from({length:8},(_,i)=>item('PRIVATE_'+i+(i%2?'.hwpx':'.hwp'),'failed',
   {lastEngine:'professional',_proDurationMs:120000,_proDiagStage:'image_filter',
    error:'C:\\sensitive\\PRIVATE_DOC: SVG_FILTER_EFFECT_UNSUPPORTED; 원본 본문'})),
  ...Array.from({length:4},(_,i)=>item('pending_private_'+i+'.hwpx','ready'))
 ];
 const report=buildLocalBatchQaReport(items,{generatedAt:'2026-11-14T05:30:00Z'});
 assert.deepEqual(report.totals,{queued:25,done:13,failed:8,ready:4,working:0,cancelled:0,invalid:0});
 assert.equal(report.failures_by_code.SVG_FILTER_EFFECT_UNSUPPORTED,8);
 assert.equal(report.files.length,25);
 assert.equal(report.files[13].phase,'image_filter');
 assert.equal(report.files[13].engine,'professional');
 assert.equal(report.files[13].pages,null);
 const json=JSON.stringify(report);
 for(const forbidden of ['confidential','PRIVATE','sensitive','원본 본문'])
  assert.equal(json.includes(forbidden),false);
});
test('unknown error and metadata collapse to fixed vocabulary without names or text',()=>{
 const report=buildLocalBatchQaReport([
  item('소득세_민감.xlsx','failed',{error:'지출 원장 내역: unknown details',lastEngine:'unknown',_proDiagStage:'random-stage'}),
  item('unsafe.exe','invalid',{error:'secret',_proDurationMs:Infinity}),
  item('photo.jpg','done',{result:{pages:1,vectorPages:0,rasterPages:1}})
 ],{generatedAt:'2026-11-14'});
 assert.equal(report.files[0].error_code,'OTHER_ERROR');
 assert.equal(report.files[0].engine,null);
 assert.equal(report.files[0].phase,null);
 assert.equal(report.files[1].format,'other');
 assert.equal(report.files[1].duration_ms,null);
 assert.equal(report.files[2].pages,1);
 assert.equal(JSON.stringify(report).includes('소득세'),false);
 assert.equal(JSON.stringify(report).includes('지출'),false);
});
test('invalid inputs reject and known classification remains bounded',()=>{
 assert.throws(()=>buildLocalBatchQaReport(null),/LOCAL_QA_QUEUE_INVALID/);
 assert.throws(()=>buildLocalBatchQaReport([],{generatedAt:'NAN'}),/LOCAL_QA_TIME_INVALID/);
 assert.equal(localQaErrorCode('XLSX_ZIP_LOCAL_HEADER_MISMATCH'),'XLSX_ZIP_ERROR');
 assert.equal(localQaErrorCode('PDF_STREAM_TIMEOUT (NO_FINAL_BYTES)'),'PDF_STREAM_TIMEOUT');
 assert.equal(localQaErrorCode(''),null);
});
test('UI integration allows download only by user click without external upload',()=>{
 const {readFileSync}=await import('node:fs');
 const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="qa-export"/);
 assert.match(ui,/buildLocalBatchQaReport\(items\)/);
 assert.match(ui,/\$\('qa-export'\)\.addEventListener\('click'/);
 assert.match(ui,/URL\.createObjectURL\(new Blob\(/);
 assert.match(ui,/URL\.revokeObjectURL/);
 assert.doesNotMatch(ui,/emitProEvent\('qa_/);
});
