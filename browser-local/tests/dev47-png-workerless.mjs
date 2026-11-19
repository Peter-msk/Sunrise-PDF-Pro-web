import test from 'node:test';
import assert from 'node:assert/strict';
import {zlibSync} from 'fflate';
import {inflatePngWithoutWorker,pngScanlineBytes} from '../src/png-workerless-inflate.mjs';
import {patchPngBrowser,workerlessPngAlias} from '../scripts/png-workerless-vite.mjs';
import {readFileSync} from 'node:fs';
const meta={width:2,height:1,pixelBitlength:32,interlaceMethod:0};
const raw=Uint8Array.of(0,255,0,0,128,0,255,0,255);
test('lossless RGBA scanlines and synchronous callback',()=>{
 let calls=0;
 inflatePngWithoutWorker.call(meta,zlibSync(raw),(error,bytes)=>{assert.equal(error,null);assert.deepEqual(bytes,raw);calls++;});
 assert.equal(calls,1);
});
test('Adam7 size includes only nonempty passes',()=>assert.equal(pngScanlineBytes({width:1,height:1,pixelBitlength:32,interlaceMethod:1}),5));
test('bad length, checksum and dimensions fail before callback',()=>{
 const bad=zlibSync(raw);bad[bad.length-1]^=1;
 for(const bytes of [zlibSync(raw.subarray(0,8)),zlibSync(Uint8Array.of(...raw,0)),bad]){
  assert.throws(()=>inflatePngWithoutWorker.call(meta,bytes,()=>assert.fail('invalid callback')),/PNG_PDF_IDAT_/);
 }
 assert.throws(()=>pngScanlineBytes({...meta,width:9000}),/BUDGET/);
});
test('installed pinned browser module is patched exactly, without altering upstream',()=>{
 const path=workerlessPngAlias().replacement,source=readFileSync(new URL('../node_modules/png-js/lib/png-js.browser.js',import.meta.url),'utf8');
 assert.equal(readFileSync(path,'utf8'),patchPngBrowser(source));
 assert.match(readFileSync(path,'utf8'),/inflate\.call\(this,/);
 assert.throws(()=>patchPngBrowser('unexpected'),/CONTRACT_DRIFT/);
});
