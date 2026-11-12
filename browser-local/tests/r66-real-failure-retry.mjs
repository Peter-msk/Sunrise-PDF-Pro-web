import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canRecoverFile,planConversion,recoveryCode,recoveryEngine} from '../src/conversion-recovery.mjs';
const failed=(name,error,engine='professional')=>({file:{name},error,state:'failed',lastEngine:engine});
const pending=(name)=>({file:{name},state:'ready'});
const done=(name)=>({file:{name},state:'done'});

test('real SVG filter error offers explicit one-file recovery',()=>{
 const x=failed('문서.hwp','1쪽 출력 실패 (SVG_FILTER_EFFECT_UNSUPPORTED)');
 assert.equal(recoveryCode(x.error),'SVG_FILTER_EFFECT_UNSUPPORTED');
 assert.equal(canRecoverFile(x),true);
 const other=pending('기다리는문서.hwpx'),finished=done('완료된문서.hwp');
 const plan=planConversion([finished,other,x],'professional',x);
 assert.equal(plan.recovery,true);assert.equal(plan.engine,'hybrid-filter');
 assert.equal(plan.cause,'SVG_FILTER_EFFECT_UNSUPPORTED');assert.deepEqual(plan.pending,[x]);
 assert.equal(recoveryEngine(x),'hybrid-filter');
});

test('real PDFKit EOF stall offers explicit one-file recovery',()=>{
 const x=failed('문서.HWPX','PDF_STREAM_TIMEOUT');
 const plan=planConversion([x,pending('표.xlsx')],'professional',x);
 assert.equal(plan.pending.length,1);assert.strictEqual(plan.pending[0],x);
 assert.equal(plan.engine,'compat-raster');assert.equal(plan.cause,'PDF_STREAM_TIMEOUT');
 assert.equal(recoveryEngine(x),'compat-raster');
});

test('no implicit raster downgrade after a failure',()=>{
 const x=failed('문서.hwp','SVG_FILTER_EFFECT_UNSUPPORTED');
 const y=pending('다음.hwp');
 const plan=planConversion([x,y],'professional');
 assert.equal(plan.recovery,false);assert.equal(plan.engine,'professional');
 assert.deepEqual(plan.pending,[x,y]);
});

test('do not expose recovery for non-HWP formats or unsupported failures',()=>{
 assert.equal(canRecoverFile(failed('표.xlsx','PDF_STREAM_TIMEOUT')),false);
 assert.equal(canRecoverFile(failed('문서.hwp','FONT_FAMILY_OR_VARIANT_UNAVAILABLE')),false);
 assert.equal(canRecoverFile(failed('문서.hwp','PDF_STREAM_TIMEOUT','compat-raster')),false);
 assert.equal(canRecoverFile(failed('문서.hwp','PDF_STREAM_TIMEOUT','hybrid-filter')),true);
 assert.equal(canRecoverFile({...failed('문서.hwp','PDF_STREAM_TIMEOUT'),state:'done'}),false);
 assert.equal(canRecoverFile(failed('문서.hwp','PREFIX_PDF_STREAM_TIMEOUT_EXTRA')),false);
});

test('stale or unapproved retry target cannot switch conversion engine',()=>{
 const x=failed('문서.hwp','PDF_STREAM_TIMEOUT');
 const plan=planConversion([pending('다음.hwp')],'professional',x);
 assert.equal(plan.recovery,false);assert.equal(plan.engine,'professional');
 assert.deepEqual(plan.pending,[]);
});

test('explicitly chosen compatibility for full batch remains supported',()=>{
 const x=pending('문서.hwp'),y=pending('표.xlsx');
 const plan=planConversion([x,y],'compat-raster');
 assert.equal(plan.recovery,false);assert.equal(plan.engine,'compat-raster');
 assert.equal(plan.pending.length,2);
});

test('UI uses the plan for exactly one retry without changing global option',()=>{
 const src=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(src,/requestedFileRecovery=item;/);
 assert.match(src,/planConversion\(items,\$\('pdf-engine'\)\.value,requested\)/);
 assert.match(src,/const \{pending,engine\}=plan/);
 assert.match(src,/item\.lastEngine=engine/);
 assert.match(src,/requested\?\.state==='done'\?requested/);
 assert.match(src,/plan\.recovery&&item===requested/);
 assert.match(html,/<option value="professional" selected>/);
 assert.match(html,/compat-retry/);
 assert.doesNotMatch(src,/\$\('pdf-engine'\)\.value='compat-raster'/);
});

test('reject malformed queue rather than retaining stale state',()=>{
 assert.throws(()=>planConversion(null,'professional'),/CONVERSION_QUEUE_INVALID/);
});

test('failed hybrid SVG filter recovery does not retry hybrid forever',()=>{
 const x=failed('미지원.hwpx','SVG_FILTER_EFFECT_UNSUPPORTED','hybrid-filter');
 assert.equal(canRecoverFile(x),true);
 assert.equal(recoveryEngine(x),'compat-raster');
 assert.equal(planConversion([x],'professional',x).engine,'compat-raster');
});

test('recovery engine cannot select unsupported fallback without user-confirmed failure',()=>{
 assert.equal(recoveryEngine(failed('표.xlsx','SVG_FILTER_EFFECT_UNSUPPORTED')),null);
 assert.equal(recoveryEngine(failed('문서.hwp','SVG_EXTERNAL_RESOURCE')),null);
 assert.equal(recoveryEngine({...failed('문서.hwp','PDF_STREAM_TIMEOUT'),state:'done'}),null);
});

test('recovery UI offers selective mixed PDF before full-page raster',()=>{
 const src=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(src,/const hybrid=recoveryEngine\(item\)==='hybrid-filter'/);
 assert.match(src,/이 파일만 혼합 PDF로 복구/);
 assert.match(src,/이 파일만 이미지 PDF로 복구/);
 assert.match(src,/plan\.engine==='hybrid-filter'/);
});
