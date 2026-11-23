import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stableSvgPipelineFailure} from '../src/svg-runtime-error.mjs';
import {classifyProError} from '../src/pro-telemetry.js';
import {canRecoverFile,recoveryEngine,planConversion,planBulkRecovery,localFailureAdvice} from '../src/conversion-recovery.mjs';

const failed=(error,lastEngine='professional')=>({
 file:{name:'test.hwp'},state:'failed',lastEngine,error
});

test('live QA: untagged filter exception is safe, stable, page-scoped and locally causally linked',()=>{
 const root=new TypeError('private document name and CSS node value');
 const err=stableSvgPipelineFailure(root,{stage:'image_filter',page:9});
 assert.equal(err.code,'SVG_FILTER_PIPELINE_FAILED');
 assert.equal(err.cause,root);
 assert.match(err.message,/9쪽/);
 assert.doesNotMatch(err.message,/private document|CSS node/);
 assert.equal(classifyProError(err),'SVG_FILTER_PIPELINE_FAILED');
 assert.equal(classifyProError(err.message),'SVG_FILTER_PIPELINE_FAILED');
});
test('live QA: cancellations and known fail-closed machine errors retain identity',()=>{
 const cancelled=new DOMException('취소','AbortError');
 assert.equal(stableSvgPipelineFailure(cancelled),cancelled);
 for(const code of ['SVG_FILTER_EFFECT_UNSUPPORTED','PNG_EMBEDDED_PAGE_PIXEL_BUDGET_EXCEEDED','SVG_FILTER_IMAGE_BYTES_LIMIT']){
  const input=new Error(code);
  assert.equal(stableSvgPipelineFailure(input,{page:2}),input);
  assert.equal(classifyProError(input),code);
 }
});
test('live QA: unknown SVG phases never export raw exception or invent full-PDF success',()=>{
 const code='SVG_VECTOR_RENDER_FAILED';
 const x=stableSvgPipelineFailure(new Error('private contents'),{stage:'svg_vector',page:4});
 assert.equal(x.code,code);
 assert.equal(classifyProError(x),code);
 assert.doesNotMatch(x.message,/private contents/);
});
test('live QA: a failed HWP receives only an explicitly selected isolated image recovery',()=>{
 for(const code of ['SVG_FILTER_PIPELINE_FAILED','SVG_VECTOR_RENDER_FAILED']){
  const item=failed(code);
  const done={file:{name:'done.hwp'},state:'done',lastEngine:'professional'};
  const pending={file:{name:'pending.hwp'},state:'ready',lastEngine:'professional'};
  assert.ok(canRecoverFile(item));
  assert.equal(recoveryEngine(item),'compat-raster');
  const plan=planConversion([done,item,pending],'professional',item);
  assert.equal(plan.engine,'compat-raster');
  assert.deepEqual(plan.pending,[item]);
  assert.equal(plan.recovery,true);
  assert.equal(planConversion([done,item,pending],'professional').engine,'professional');
  assert.ok(!canRecoverFile({...item,state:'done'}));
  assert.ok(!canRecoverFile({...item,lastEngine:'compat-raster'}));
  assert.ok(localFailureAdvice(code)?.includes('글자 검색이 불가능'));
  assert.deepEqual(planBulkRecovery([done,item,pending]).pending,[item]);
 }
});
test('live QA: HWP code wiring retains fixed known errors and per-file progress without publishing private data',()=>{
 const converter=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
 const writer=readFileSync(new URL('../src/svg-professional.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(converter,/stableSvgPipelineFailure\(error,\{stage:'image_filter',page:meta\.page\|\|1\}\)/);
 assert.match(writer,/SVG_VECTOR_RENDER_FAILED/);
 assert.match(writer,/PDF_STREAM_TIMEOUT/);
 assert.match(ui,/item\._proProgressEvents=0/);
 assert.match(ui,/마지막 처리/);
 assert.match(ui,/classifyProError\(item\.error\)/);
 assert.doesNotMatch(ui,/error_code:\s*item\.error/);
});
