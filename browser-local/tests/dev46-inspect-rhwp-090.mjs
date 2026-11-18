import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inspectArchive} from '../scripts/inspect-rhwp-090-package.mjs';
const tarball='https://registry.npmjs.org/@rhwp/core/-/core-0.9.0.tgz';
function fixture(t,{version='0.9.0',wasm=Buffer.from([0,97,115,109,1,0,0,0])}={}){
 const dir=mkdtempSync(join(tmpdir(),'rhwp-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(join(dir,'package'));writeFileSync(join(dir,'package','package.json'),JSON.stringify({name:'@rhwp/core',version}));writeFileSync(join(dir,'package','rhwp_bg.wasm'),wasm);
 const path=join(dir,'fixture.tgz');const r=spawnSync('tar',['-czf',path,'-C',dir,'package']);assert.equal(r.status,0,String(r.stderr));
 return {path,dist:{tarball,integrity:'sha512-'+createHash('sha512').update(readFileSync(path)).digest('base64')}};
}
test('valid synthetic archive yields exact WASM fingerprint, not a browser pass',t=>{const {path,dist}=fixture(t);const r=inspectArchive(path,dist);assert.equal(r.wasm_bytes,8);assert.equal(r.wasm_sha256,createHash('sha256').update(Buffer.from([0,97,115,109,1,0,0,0])).digest('hex'));assert.equal(r.browser_validation,'NOT_RUN');assert.equal(r.signature_verification,'NOT_RUN');});
test('mismatched archive hash fails before unpacking',t=>{const {path,dist}=fixture(t);dist.integrity='sha512-'+Buffer.alloc(64).toString('base64');assert.throws(()=>inspectArchive(path,dist),/ARCHIVE_INTEGRITY_MISMATCH/);});
test('nonofficial URL and missing integrity reject',t=>{const {path,dist}=fixture(t);assert.throws(()=>inspectArchive(path,{...dist,tarball:'https://example.invalid/a.tgz'}),/REGISTRY_METADATA_INVALID/);assert.throws(()=>inspectArchive(path,{tarball}),/REGISTRY_METADATA_INVALID/);});
test('wrong package version rejects even with matching hash',t=>{const {path,dist}=fixture(t,{version:'0.8.7'});assert.throws(()=>inspectArchive(path,dist),/PACKAGE_IDENTITY_MISMATCH/);});
test('not a valid wasm rejects even with matching archive hash',t=>{const {path,dist}=fixture(t,{wasm:Buffer.from('invalid binary')});assert.throws(()=>inspectArchive(path,dist),/INVALID_WASM/);});
