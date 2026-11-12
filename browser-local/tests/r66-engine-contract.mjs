import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {inspectEngineContract} from '../scripts/verify-engine-contract.mjs';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'r66-self-engine-'));
  const write=(rel,data)=>{
    const path=join(dir,rel);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);
  };
  const pkg={dependencies:{'@rhwp/core':'0.8.7',pdfkit:'0.20.2','svg-to-pdfkit':'0.1.8'}};
  write('browser-local/package.json',JSON.stringify(pkg));
  write('browser-local/src/converter.js',"import {} from '@rhwp/core'; tryProfessionalDocument(); allowRasterFallback:false");
  write('browser-local/src/svg-professional.js',"hwpDoc.renderPageSvgWithProfile(i,'print'); SVGtoPDF();");
  write('browser-local/src/pdfkit-backend.js',"const m=import('pdfkit');function toBlob(){}");
  return {dir,write,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
function withFixture(run){const f=fixture();try{return run(f);}finally{f.cleanup();}}

test('original browser-only pipeline passes contract',()=>withFixture(f=>{
  assert.equal(inspectEngineContract(f.dir).ok,true);
}));
test('original WASM parser dependency must be pinned',()=>withFixture(f=>{
  f.write('browser-local/package.json',JSON.stringify({dependencies:{'@rhwp/core':'0.9.0',pdfkit:'0.20.2','svg-to-pdfkit':'0.1.8'}}));
  assert.ok(inspectEngineContract(f.dir).issues.includes('BROWSER_ENGINE_DEPENDENCY_DRIFT:@rhwp/core'));
}));
test('missing HWP WASM integration is rejected',()=>withFixture(f=>{
  f.write('browser-local/src/converter.js','tryProfessionalDocument(); allowRasterFallback:false');
  assert.ok(inspectEngineContract(f.dir).issues.includes('WASM_PARSER_NOT_USED'));
}));
test('unapproved native_hancom subtree is rejected',()=>withFixture(f=>{
  f.write('native_hancom/hwp_to_pdf.py','# not allowed in browser baseline');
  assert.ok(inspectEngineContract(f.dir).issues.some(e=>e.startsWith('UNAPPROVED_HANCOM_RUNTIME')));
}));
test('silent raster replacement violates object-preserving policy',()=>withFixture(f=>{
  f.write('browser-local/src/converter.js',"import {} from '@rhwp/core'; tryProfessionalDocument(); allowRasterFallback:true");
  assert.ok(inspectEngineContract(f.dir).issues.includes('OBJECT_PRESERVING_POLICY_MISSING'));
}));
test('loss of print SVG vector path is rejected',()=>withFixture(f=>{
  f.write('browser-local/src/svg-professional.js','SVGtoPDF();');
  assert.ok(inspectEngineContract(f.dir).issues.includes('PRINT_SVG_PIPELINE_MISSING'));
}));
test('unapproved COM automation in active browser path is rejected',()=>withFixture(f=>{
  f.write('browser-local/src/converter.js',"import {} from '@rhwp/core'; tryProfessionalDocument(); allowRasterFallback:false; ActiveXObject()");
  assert.ok(inspectEngineContract(f.dir).issues.some(e=>e.startsWith('NATIVE_COM_DEPENDENCY')));
}));
test('contract check never edits project files',()=>withFixture(f=>{
  const path=join(f.dir,'browser-local/src/converter.js');
  const before=readFileSync(path);
  inspectEngineContract(f.dir);
  assert.deepEqual(readFileSync(path),before);
}));

test('CLI resolves project root correctly and succeeds without network',()=>withFixture(f=>{
  f.write('browser-local/scripts/verify-engine-contract.mjs',readFileSync(new URL('../scripts/verify-engine-contract.mjs',import.meta.url),'utf8'));
  const run=spawnSync(process.execPath,[join(f.dir,'browser-local/scripts/verify-engine-contract.mjs')],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/R66_ENGINE_CONTRACT_PASS/);
}));
test('CLI fails closed for forbidden local COM bridge',()=>withFixture(f=>{
  f.write('browser-local/scripts/verify-engine-contract.mjs',readFileSync(new URL('../scripts/verify-engine-contract.mjs',import.meta.url),'utf8'));
  f.write('native_hancom/hwp_to_pdf.py','COM');
  const run=spawnSync(process.execPath,[join(f.dir,'browser-local/scripts/verify-engine-contract.mjs')],{encoding:'utf8'});
  assert.equal(run.status,1);
  assert.match(run.stderr,/UNAPPROVED_HANCOM_RUNTIME/);
}));
