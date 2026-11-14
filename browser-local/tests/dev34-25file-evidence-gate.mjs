import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocalBatchQaReport} from '../src/local-batch-qa.mjs';
import {reviewLocal25FileReport,QA_BATCH_SIZE} from '../src/local-qa-release-gate.mjs';

function baseline(){
 const items=Array.from({length:25},(_,i)=>({
  file:{name:'PRIVATE_ORIGINAL_'+i+(i%2?'.hwpx':'.hwp')},state:'done',
  lastEngine:'professional',result:{pages:2,vectorPages:2,rasterPages:0}
 }));
 return buildLocalBatchQaReport(items,{generatedAt:'2026-11-14T00:00:00Z'});
}
test('25 structurally complete documents are still VISUAL_REVIEW_REQUIRED',()=>{
 const result=reviewLocal25FileReport(baseline());
 assert.equal(QA_BATCH_SIZE,25);
 assert.equal(result.status,'VISUAL_REVIEW_REQUIRED');
 assert.equal(result.reported_files,25);
 assert.equal(result.complete_files,25);
 assert.equal(result.image_pages,0);
 assert.deepEqual(result.issues,[]);
 assert.equal(result.visual_review_required,true);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_ORIGINAL/);
});
test('realistic 251-page document passes structural check, still requires visual review',()=>{
 const report=baseline();
 report.files[0].pages=251;report.files[0].vector_pages=250;report.files[0].raster_pages=1;
 const result=reviewLocal25FileReport(report);
 assert.equal(result.status,'VISUAL_REVIEW_REQUIRED');
 assert.equal(result.image_pages,1);
 assert.equal(result.visual_review_required,true);
});

test('25 items with 8 failed and 4 ready never count as accepted',()=>{
 const report=baseline();
 for(let i=13;i<21;i++){
  report.files[i]={...report.files[i],state:'failed',pages:null,vector_pages:null,
   raster_pages:null,error_code:'SVG_FILTER_EFFECT_UNSUPPORTED',filter_category:'blur'};
 }
 for(let i=21;i<25;i++){
  report.files[i]={...report.files[i],state:'ready',pages:null,vector_pages:null,
   raster_pages:null,error_code:null,filter_category:null};
 }
 report.totals={queued:25,done:13,failed:8,ready:4,working:0,cancelled:0,invalid:0};
 const result=reviewLocal25FileReport(report);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.complete_files,13);
 assert.equal(result.issues.filter(x=>x.code==='QA_FILE_NOT_COMPLETED').length,12);
});
test('server or user summary cannot falsify per-file totals',()=>{
 const report=baseline();report.totals.done=24;
 assert.equal(reviewLocal25FileReport(report).issues.at(-1).code,'QA_TOTALS_MISMATCH');
});
test('invalid page data, invisible PDF components and explicit raster counts are diagnosed',()=>{
 const report=baseline();
 report.files[0].vector_pages=1;
 report.files[1].raster_pages=2;report.files[1].vector_pages=0;
 report.files[2].pages=null;
 const result=reviewLocal25FileReport(report);
 assert.equal(result.status,'BLOCKED');
 assert.ok(result.issues.some(x=>x.code==='QA_PAGE_COMPONENTS_MISMATCH'&&x.index===1));
 assert.ok(result.issues.some(x=>x.code==='QA_PAGES_INVALID'&&x.index===3));
 assert.equal(result.image_pages,2);
});
test('missing, foreign or oversized inputs fail closed without raw details',()=>{
 assert.equal(reviewLocal25FileReport(null).status,'BLOCKED');
 const report=baseline();report.files.pop();
 assert.ok(reviewLocal25FileReport(report).issues.some(x=>x.code==='QA_FILE_COUNT_MISMATCH'));
 report.files[0].format='PRIVATE_NAME';
 assert.ok(reviewLocal25FileReport(report).issues.some(x=>x.code==='QA_FORMAT_INVALID'));
 assert.throws(()=>reviewLocal25FileReport(report,{expectedFiles:0}),/LOCAL_QA_EXPECTED_COUNT_INVALID/);
 assert.throws(()=>reviewLocal25FileReport(report,{expectedFiles:10000}),/LOCAL_QA_EXPECTED_COUNT_INVALID/);
});
