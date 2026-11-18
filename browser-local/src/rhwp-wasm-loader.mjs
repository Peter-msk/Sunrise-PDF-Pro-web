import {RHWP_PARTS,RHWP_WASM_BYTES,RHWP_WASM_SHA256,RHWP_VERSION} from './rhwp-engine.mjs';
let verifiedVersion=null;
export function getVerifiedRhwpVersion(){return verifiedVersion;}
export async function loadRhwpBytes(base,fetcher=globalThis.fetch,digest=globalThis.crypto?.subtle){
 if(!digest)throw Error('RHWP_WASM_CRYPTO_UNAVAILABLE');
 const out=new Uint8Array(RHWP_WASM_BYTES);let offset=0;
 for(const part of RHWP_PARTS){
  const url=new URL(part.name,base);
  if(url.origin!==new URL(base).origin)throw Error('RHWP_WASM_ORIGIN_MISMATCH');
  const res=await fetcher(url.href,{credentials:'same-origin',redirect:'error'});
  if(!res.ok||!res.body)throw Error('RHWP_WASM_PART_UNAVAILABLE');
  const reader=res.body.getReader();let written=0;
  try{
   while(true){const {value,done}=await reader.read();if(done)break;
    if(value.byteLength>part.bytes-written)throw Error('RHWP_WASM_PART_SIZE_MISMATCH');
    out.set(value,offset+written);written+=value.byteLength;
   }
  }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  if(written!==part.bytes)throw Error('RHWP_WASM_PART_SIZE_MISMATCH');
  offset+=written;
 }
 if(offset!==RHWP_WASM_BYTES)throw Error('RHWP_WASM_SIZE_MISMATCH');
 const actual=Array.from(new Uint8Array(await digest.digest('SHA-256',out)),b=>b.toString(16).padStart(2,'0')).join('');
 if(actual!==RHWP_WASM_SHA256)throw Error('RHWP_WASM_HASH_MISMATCH');
 return out;
}
export async function initializeRhwp(init,base){
 const bytes=await loadRhwpBytes(base);
 await init({module_or_path:bytes});
 verifiedVersion=RHWP_VERSION;
}
