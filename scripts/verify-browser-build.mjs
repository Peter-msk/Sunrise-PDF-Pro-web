import {copyFileSync, readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const dist=resolve(import.meta.dirname,'../browser-local/dist');
const wasm=resolve(dist,'rhwp_bg.wasm');
const html=resolve(dist,'index.html');
const bundle=resolve(dist,'assets/local-bundle.js');
const EXPECTED_BYTES=11821756;
const EXPECTED_SHA256='54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989';
if(statSync(wasm).size!==EXPECTED_BYTES)throw Error('WASM size mismatch in packaged assets');
const digest=createHash('sha256').update(readFileSync(wasm)).digest('hex');
if(digest!==EXPECTED_SHA256)throw Error('WASM SHA256 mismatch in packaged assets');
if(statSync(bundle).size<10000)throw Error('Client JS bundle missing or too small');
const content=readFileSync(html,'utf8');
if(!content.includes('local-bundle.js'))throw Error('Client asset reference missing');
if(!content.includes('id="cancel"'))throw Error('R30 cancellation UI missing');
copyFileSync(html,resolve(dist,'app.html')); // Avoid /index.html canonical redirects in Cloudflare's HTML assets router.
console.log(JSON.stringify({asset_delivery:'cloudflare-static-assets',wasm_bytes:EXPECTED_BYTES,wasm_sha256:digest,js_bytes:statSync(bundle).size}));
