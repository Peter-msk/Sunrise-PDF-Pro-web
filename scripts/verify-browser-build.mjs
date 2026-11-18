import {copyFileSync, readFileSync, statSync, readdirSync} from 'node:fs';
import {verifyRhwpAssets} from '../browser-local/scripts/rhwp-assets.mjs';
import {RHWP_WASM_BYTES} from '../browser-local/src/rhwp-engine.mjs';
import {resolve} from 'node:path';

const dist=resolve(import.meta.dirname,'../browser-local/dist');
const html=resolve(dist,'index.html');
const bundle=resolve(dist,'assets/local-bundle.js');
const digest=verifyRhwpAssets(dist);
function checkAssetSizes(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=resolve(dir,entry.name);if(entry.isDirectory())checkAssetSizes(file);else if(statSync(file).size>25*1024*1024)throw Error('Cloudflare asset too large: '+entry.name);}}
checkAssetSizes(dist);
const chunks=readdirSync(resolve(dist,'assets')).filter(name=>/^local-chunk-[A-Za-z0-9_-]+\.js$/.test(name));
if(chunks.length===0)throw Error('Professional engine chunks were not emitted');
for(const name of chunks)if(statSync(resolve(dist,'assets',name)).size===0)throw Error('Empty engine chunk: '+name);
if(statSync(bundle).size<10000)throw Error('Client JS bundle missing or too small');
const content=readFileSync(html,'utf8');
if(!content.includes('local-bundle.js'))throw Error('Client asset reference missing');
if(!content.includes('id="cancel"'))throw Error('R30 cancellation UI missing');
copyFileSync(html,resolve(dist,'app.html')); // Avoid /index.html canonical redirects in Cloudflare's HTML assets router.
console.log(JSON.stringify({asset_delivery:'cloudflare-static-assets',wasm_bytes:RHWP_WASM_BYTES,wasm_sha256:digest,js_bytes:statSync(bundle).size,engine_chunks:chunks.length}));
