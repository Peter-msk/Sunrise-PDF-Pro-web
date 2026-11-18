import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareDev46Qa} from '../scripts/compare-dev46-qa.mjs';
const base=JSON.parse(readFileSync(process.env.DEV46_QA_BASELINE,'utf8'));
function candidate(){const x=structuredClone(base);Object.assign(x,{build_revision:'DEV46',deployment_channel:'local',rhwp_version:'0.9.0',generated_at:'2026-11-18T12:00:00Z'});return x;}
function repair(){const x=candidate();for(const f of x.files)if(f.state==='failed')Object.assign(f,{state:'done',pages:1,vector_pages:1,raster_pages:0,error_code:null,filter_category:null});x.totals.done=25;x.totals.failed=0;x.failures_by_code={};return x;}
test('actual baseline is blocked and all ten failed rows are located',()=>{const r=compareDev46Qa(base,base);assert.equal(r.status,'BLOCKED');assert.deepEqual(r.remaining,[3,4,9,10,11,12,13,14,24,25]);assert.equal(r.missing_diagnostics.length,10);assert.equal(r.font_review.length,15);});
test('synthetically repaired report is never a visual acceptance',()=>{const r=compareDev46Qa(base,repair());assert.equal(r.status,'VISUAL_REVIEW_REQUIRED');assert.equal(r.recovered.length,10);assert.equal(r.visual_review_required,true);});
test('missing engine version blocks even 25 structurally completed rows',()=>{const x=repair();delete x.rhwp_version;assert.equal(compareDev46Qa(base,x).status,'BLOCKED');});
test('previous successful page count regression is blocked',()=>{const x=repair();x.files[0].pages=x.files[0].vector_pages=4;assert.deepEqual(compareDev46Qa(base,x).regressions,[1]);});
test('raster substitution is blocked',()=>{const x=repair();x.files[0].vector_pages=2;x.files[0].raster_pages=1;assert.deepEqual(compareDev46Qa(base,x).regressions,[1]);});
test('reordered rows and false totals are blocked',()=>{const x=repair();[x.files[0],x.files[1]]=[x.files[1],x.files[0]];assert.equal(compareDev46Qa(base,x).status,'BLOCKED');const y=repair();y.totals.done=24;assert.equal(compareDev46Qa(base,y).status,'BLOCKED');});
test('stale report and wrong channel are blocked',()=>{const x=repair();x.generated_at=base.generated_at;x.deployment_channel='production';const r=compareDev46Qa(base,x);assert.equal(r.status,'BLOCKED');assert.ok(r.issues.some(i=>i.code==='RETEST_TIMESTAMP_INVALID'));});
test('invalid output counts and residual errors are blocked',()=>{const x=repair();x.files[2].vector_pages=null;assert.equal(compareDev46Qa(base,x).status,'BLOCKED');const y=repair();y.files[2].error_code='PDF_STREAM_TIMEOUT';assert.equal(compareDev46Qa(base,y).status,'BLOCKED');});
test('false failure summary, wrong output engine, and source page mismatch are blocked',()=>{const x=candidate();x.failures_by_code.PDF_STREAM_TIMEOUT=1;assert.equal(compareDev46Qa(base,x).status,'BLOCKED');const y=repair();y.files[0].engine='compat-raster';assert.deepEqual(compareDev46Qa(base,y).regressions,[1]);const z=repair();z.files[0].source_pages=4;assert.deepEqual(compareDev46Qa(base,z).regressions,[1]);});
