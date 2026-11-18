import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {RHWP_PARTS,RHWP_WASM_BYTES,RHWP_WASM_SHA256} from '../src/rhwp-engine.mjs';
import {loadRhwpBytes,getVerifiedRhwpVersion} from '../src/rhwp-wasm-loader.mjs';
import {verifyRhwpAssets} from '../scripts/rhwp-assets.mjs';
import {explicitRhwpModulePlugin} from '../scripts/rhwp-vite-plugin.mjs';
const base='https://example.invalid/local/';
const root=new URL('../public/',import.meta.url);
const parts=RHWP_PARTS.map(p=>readFileSync(new URL(p.name,root)));
function fetchParts(buffers,requests=[]){return async url=>{requests.push(url);const i=RHWP_PARTS.findIndex(p=>url===base+p.name);if(i<0)return new Response(null,{status:404});return new Response(buffers[i]);};}
test('actual installed split WASM reassembles byte-for-byte with both parts',async()=>{
 const requests=[];
 const b=await loadRhwpBytes(base,fetchParts(parts,requests));
 assert.equal(b.byteLength,RHWP_WASM_BYTES);
 assert.equal(createHash('sha256').update(b).digest('hex'),RHWP_WASM_SHA256);
 assert.deepEqual(requests,RHWP_PARTS.map(p=>base+p.name));
 assert.ok(WebAssembly.validate(b));
 assert.equal(verifyRhwpAssets(fileURLToPath(root)),RHWP_WASM_SHA256);
 assert.equal(getVerifiedRhwpVersion(),null,'bytes alone do not establish initialized engine');
});
test('actual parts fail closed for truncation, excess and same-size mutation',async()=>{
 await assert.rejects(loadRhwpBytes(base,fetchParts([parts[0],parts[1].subarray(0,-1)])),/PART_SIZE_MISMATCH/);
 await assert.rejects(loadRhwpBytes(base,fetchParts([Buffer.concat([parts[0],Buffer.from([0])]),parts[1]])),/PART_SIZE_MISMATCH/);
 const wrong=Buffer.from(parts[1]);wrong[0]^=1;
 await assert.rejects(loadRhwpBytes(base,fetchParts([parts[0],wrong])),/HASH_MISMATCH/);
});
test('missing part and unavailable crypto do not initialize',async()=>{
 await assert.rejects(loadRhwpBytes(base,async()=>new Response(null,{status:404})),/PART_UNAVAILABLE/);
 await assert.rejects(loadRhwpBytes(base,fetchParts(parts),null),/CRYPTO_UNAVAILABLE/);
});
test('only RHWP generated default URL is replaced, explicit modules untouched',()=>{
 const plugin=explicitRhwpModulePlugin();
 const code="if (module_or_path === undefined) module_or_path = new URL('rhwp_bg.wasm', import.meta.url);";
 assert.equal(plugin.transform(code,'/project/src/converter.js'),null);
 const result=plugin.transform(code,'/project/node_modules/@rhwp/core/rhwp.js');
 assert.match(result.code,/RHWP_EXPLICIT_WASM_REQUIRED/);
 assert.match(result.code,/module_or_path === undefined/);
 assert.doesNotMatch(result.code,/new URL/);
});
