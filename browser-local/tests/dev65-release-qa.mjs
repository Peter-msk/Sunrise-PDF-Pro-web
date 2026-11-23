import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canRecoverFile,recoveryEngine,planConversion} from '../src/conversion-recovery.mjs';
import {stableSvgPipelineFailure} from '../src/svg-runtime-error.mjs';
import {classifyProError} from '../src/pro-telemetry.js';
const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('user-only progress copy retains fixed machine stages but removes RHWP/SVG implementation text',()=>{
 assert.match(ui,/svg_build:'문서 페이지 생성'/);
 assert.match(ui,/svg_normalize:'페이지 내용 준비'/);
 assert.match(ui,/svg_vector:'PDF 페이지 출력'/);
 assert.match(ui,/info\.detail==='wasm_init'\?'문서 변환 기능 준비 중/);
 assert.match(ui,/info\.detail==='wasm_ready'\?'문서 변환 기능 준비 완료'/);
 assert.doesNotMatch(ui,/['"]RHWP 웹 엔진/);
 assert.doesNotMatch(ui,/['"]XLSX 압축 구조 안전 검사/);
 assert.doesNotMatch(ui,/svg_build:'문서 SVG 생성'/);
 assert.doesNotMatch(ui,/svg_vector:'SVG 벡터 PDF 출력'/);
 assert.match(ui,/phases\.has\(info\.detail\)\?info\.detail:'render'/);
 assert.match(ui,/error_code:classifyProError\(item\.error\)/);
});
test('public HTML keeps safe output choices and hides developer-only terminology',()=>{
 assert.doesNotMatch(html,/DEV[0-9]+|RHWP|SVG 필터 오류|미지원 SVG 필터/);
 assert.match(html,/value="professional" selected/);
 assert.match(html,/value="direct-trial"/);
 assert.match(html,/value="hybrid-filter"/);
 assert.match(html,/value="compat-raster"/);
 assert.match(html,/혼합 PDF로 변환/);
 assert.match(html,/글자 검색/);
 assert.match(html,/id="download-all"/);
 assert.match(html,/id="source" type="file"/);
});
test('final user-copy changes preserve exact isolated user-approved fallback',()=>{
 const original=new TypeError('private SVG DOM node');
 const error=stableSvgPipelineFailure(original,{stage:'image_filter',page:2});
 assert.equal(error.code,'SVG_FILTER_PIPELINE_FAILED');
 assert.equal(error.cause,original);
 assert.equal(classifyProError(error),'SVG_FILTER_PIPELINE_FAILED');
 assert.doesNotMatch(error.message,/private SVG/);
 const failed={file:{name:'tested.hwp'},state:'failed',lastEngine:'professional',error:error.message};
 const good={file:{name:'done.hwp'},state:'done',lastEngine:'professional'};
 assert.equal(canRecoverFile(failed),true);
 assert.equal(recoveryEngine(failed),'compat-raster');
 assert.deepEqual(planConversion([failed,good],'professional',failed).pending,[failed]);
 assert.equal(planConversion([failed,good],'professional').engine,'professional');
});
