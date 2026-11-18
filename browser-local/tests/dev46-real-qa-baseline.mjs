import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewLocal25FileReport} from '../src/local-qa-release-gate.mjs';

// Anonymous numeric fixture derived from the 2026-11-18 19:41 KST
// local QA report. No original documents, paths, names or PDF bytes.
const pages=[3,3,null,null,17,17,11,11,null,null,null,null,null,null,5,5,2,2,4,24,24,3,3,null,null];
const filterIndices=new Set([3,4,9,10,11,12,13,14]);
const streamIndices=new Set([24,25]);
function report(){
 const files=pages.map((p,i)=>{
  const index=i+1,filter=filterIndices.has(index),stream=streamIndices.has(index);
  return {index,format:index===19?'hwpx':(index<19?index%2===1:index%2===0)?'hwp':'hwpx',
   state:p===null?'failed':'done',engine:'professional',
   phase:filter?'image_filter':stream?'pdf_stream':'pdf_done',
   error_code:filter?'SVG_FILTER_EFFECT_UNSUPPORTED':stream?'PDF_STREAM_TIMEOUT':null,
   filter_category:filter?'other-primitive':null,pages:p,vector_pages:p,raster_pages:p===null?null:0};
 });
 return {schema:'sunrise-pdf-pro-web-local-qa/v1',totals:{queued:25,done:15,failed:10,ready:0,working:0,cancelled:0,invalid:0},failures_by_code:{SVG_FILTER_EFFECT_UNSUPPORTED:8,PDF_STREAM_TIMEOUT:2},files};
}
test('actual 25-file baseline cannot be accepted: 8 filter failures, 2 stream failures',()=>{
 const r=report(),result=reviewLocal25FileReport(r);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.complete_files,15);
 assert.deepEqual(result.issues.filter(x=>x.code==='QA_FILE_NOT_COMPLETED').map(x=>x.index),[3,4,9,10,11,12,13,14,24,25]);
 assert.equal(r.files.reduce((sum,f)=>sum+(f.vector_pages??0),0),134);
 assert.equal(result.image_pages,0);
 assert.equal(r.files.filter(f=>f.format==='hwp').length,12);
 assert.equal(r.files.filter(f=>f.format==='hwpx').length,13);
});
test('changing the summary to 25 successes does not conceal the real failures',()=>{
 const r=report();
 r.totals.done=25;r.totals.failed=0;r.failures_by_code={};
 const result=reviewLocal25FileReport(r);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.complete_files,15);
 assert.ok(result.issues.some(x=>x.code==='QA_TOTALS_MISMATCH'));
});
// An illustrative repaired report is NOT real conversion evidence.
test('structurally repaired fixture remains visual-review-required',()=>{
 const r=report();
 for(const f of r.files)if(f.state==='failed')Object.assign(f,{state:'done',phase:'pdf_done',error_code:null,filter_category:null,pages:1,vector_pages:1,raster_pages:0});
 r.totals.done=25;r.totals.failed=0;r.failures_by_code={};
 const result=reviewLocal25FileReport(r);
 assert.equal(result.status,'VISUAL_REVIEW_REQUIRED');
 assert.equal(result.visual_review_required,true);
});
