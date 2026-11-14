import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canRecoverFile,planConversion,planBulkRecovery,planSingleRetry,
 localFailureAdvice,recoveryEngine} from '../src/conversion-recovery.mjs';

const doc=(name,state='failed',error='CONVERSION_FAILED',engine='professional')=>
 ({file:{name},state,error,lastEngine:engine,result:null});

test('failed XLSX retry is exactly one file and preserves successful neighbors',()=>{
 const ok=doc('complete.jpg','done'),bad=doc('sheet.xlsx');
 const waiting=doc('next.hwpx','ready'),other=doc('another.xls');
 const all=[ok,bad,waiting,other];
 const plan=planSingleRetry(all,'professional',bad);
 assert.deepEqual(plan.pending,[bad]);
 assert.equal(plan.engine,'professional');
 assert.equal(plan.recovery,false);
 assert.equal(plan.singleRetry,true);
 assert.equal(ok.state,'done');
 assert.equal(waiting.state,'ready');
 assert.equal(other.state,'failed');
});

test('cancelled image and failed legacy XLS are separately retriable',()=>{
 for(const f of [doc('photo.png','cancelled'),doc('scan.jpeg'),doc('old.xls'),doc('doc.hwp'),doc('rich.hwpx')]){
  const plan=planSingleRetry([f],'professional',f);
  assert.deepEqual(plan.pending,[f]);
  assert.equal(f.state==='cancelled'||f.state==='failed',true);
 }
});

test('stale and unsupported retry targets cannot convert anything',()=>{
 const valid=doc('valid.xlsx'),stale=doc('stale.xlsx');
 for(const target of [stale,doc('finished.xlsx','done'),doc('queued.xlsx','ready'),doc('payload.exe'),null]){
  const plan=planSingleRetry([valid],'professional',target);
  assert.deepEqual(plan.pending,[]);
  assert.equal(plan.singleRetry,false);
 }
 assert.throws(()=>planSingleRetry(null,'professional',valid),/CONVERSION_QUEUE_INVALID/);
});

test('direct retry preserves explicitly selected engine, never auto-downgrades',()=>{
 const pdfError=doc('broken.hwpx','failed','FONT_GLYPH_MISSING');
 const plan=planSingleRetry([pdfError],'professional',pdfError);
 assert.equal(plan.engine,'professional');
 assert.equal(plan.recovery,false);
 // Existing explicit recovery remains separate and may select compat-raster.
 const recovery=planBulkRecovery([pdfError]);
 assert.equal(recovery.targets.length,1);
 assert.equal(recoveryEngine(pdfError),'compat-raster');
 const normal=planConversion([pdfError],'professional');
 assert.equal(normal.engine,'professional');
});

test('fixed error guidance never copies arbitrary source content',()=>{
 const cases=[
  ['XLSX_ZIP_LOCAL_HEADER_MISMATCH','XLSX 내부 ZIP'],
  ['XLSX_PARSE_FAILED','XLSX 시트 해석'],
  ['XLSX_ENGINE_UNAVAILABLE','모듈 로드'],
  ['FILE_READ_IDLE_TIMEOUT','파일 읽기 실패'],
  ['FONT_GLYPH_MISSING','원본 서체'],
  ['SVG_FILTER_EFFECT_UNSUPPORTED','SVG 그림 효과'],
  ['PDF_OUTPUT_TRAILER_INCOMPLETE','완전성 검사']
 ];
 for(const [code,phrase] of cases){
  const advice=localFailureAdvice('비밀_계좌_보고서.xlsx: '+code);
  assert.ok(advice.includes(phrase),code);
  assert.ok(!advice.includes('비밀_계좌'),code);
 }
 assert.equal(localFailureAdvice('비밀보고서.xlsx 오류 문자열'),null);
});

test('SVG filter recovery button remains separate from generic retry',()=>{
 const special=doc('bad.hwp','failed','SVG_FILTER_EFFECT_UNSUPPORTED');
 assert.equal(canRecoverFile(special),true);
 assert.equal(recoveryEngine(special),'hybrid-filter');
 const brokenSheet=doc('bad.xlsx','failed','XLSX_PARSE_FAILED');
 assert.equal(canRecoverFile(brokenSheet),false);
 assert.deepEqual(planBulkRecovery([special,brokenSheet]).pending,[special]);
});

test('source UI guards a single retry by explicit click and active list membership',()=>{
 const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(ui,/requestedFileRetry=item/);
 assert.match(ui,/items\.includes\(item\)/);
 assert.match(ui,/planSingleRetry\(items,selectedEngine,oneFileRetry\)/);
 assert.match(ui,/const selectedEngine=requestedBatchEngine\|\|\$\('pdf-engine'\)\.value;/);
 assert.match(ui,/requestedBatchEngine=null;/);
 assert.doesNotMatch(ui,/\$\('pdf-engine'\)\.value\s*=\s*'hybrid-filter'/);
 assert.match(ui,/requestedFileRetry=null/);
 assert.match(ui,/singleRetry/);
 assert.match(ui,/이 파일만 다시 시도/);
 assert.match(ui,/localFailureAdvice\(item\.error\)/);
 // No automatic engine switching of general failed files.
 assert.doesNotMatch(ui,/\$\('pdf-engine'\)\.value\s*=\s*'compat-raster'/);
});

test('UI follows normalize and motion-accessibility patterns without new packages',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="dev30-native-ux-safety"/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/focus-within/);
 assert.match(html,/text-size-adjust:100%/);
 const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 for(const lib of ['react','shadcn-ui','antd','@mui/material','animate.css','sortablejs','normalize.css'])
  assert.equal(Object.hasOwn(packageJson.dependencies||{},lib),false);
});
