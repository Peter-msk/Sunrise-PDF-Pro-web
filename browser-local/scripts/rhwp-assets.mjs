import {readFileSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {RHWP_PARTS,RHWP_WASM_BYTES,RHWP_WASM_SHA256} from '../src/rhwp-engine.mjs';
export function verifyRhwpAssets(dir){
 if(existsSync(resolve(dir,'rhwp_bg.wasm')))throw Error('STALE_MONOLITHIC_WASM_ASSET');
 const hash=createHash('sha256');let bytes=0;
 for(const part of RHWP_PARTS){
  const file=resolve(dir,part.name);
  if(statSync(file).size!==part.bytes||part.bytes>25*1024*1024)throw Error('RHWP_WASM_PART_SIZE_MISMATCH');
  hash.update(readFileSync(file));bytes+=part.bytes;
 }
 const digest=hash.digest('hex');
 if(bytes!==RHWP_WASM_BYTES||digest!==RHWP_WASM_SHA256)throw Error('RHWP_WASM_HASH_MISMATCH');
 return digest;
}
