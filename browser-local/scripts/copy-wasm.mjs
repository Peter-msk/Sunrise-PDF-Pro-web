import {mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {RHWP_VERSION,RHWP_WASM_BYTES,RHWP_WASM_SHA256,RHWP_PARTS} from '../src/rhwp-engine.mjs';
import {verifyRhwpAssets} from './rhwp-assets.mjs';
const root=resolve(import.meta.dirname,'..');
const pkg=JSON.parse(readFileSync(resolve(root,'node_modules/@rhwp/core/package.json'),'utf8'));
if(pkg.name!=='@rhwp/core'||pkg.version!==RHWP_VERSION)throw Error('RHWP_PACKAGE_VERSION_MISMATCH');
const bytes=readFileSync(resolve(root,'node_modules/@rhwp/core/rhwp_bg.wasm'));
if(bytes.length!==RHWP_WASM_BYTES||createHash('sha256').update(bytes).digest('hex')!==RHWP_WASM_SHA256)throw Error('RHWP_WASM_PIN_MISMATCH');
const dest=resolve(root,'public');mkdirSync(dest,{recursive:true});
rmSync(resolve(dest,'rhwp_bg.wasm'),{force:true});
let at=0;for(const part of RHWP_PARTS){writeFileSync(resolve(dest,part.name),bytes.subarray(at,at+part.bytes));at+=part.bytes;}
verifyRhwpAssets(dest);
console.log('Verified and split official RHWP WASM:',RHWP_VERSION,RHWP_WASM_BYTES,RHWP_WASM_SHA256);
// Self-host PDF renderer: no document or font is sent to a third party.
const fs=await import('node:fs/promises');
await fs.copyFile(new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs',import.meta.url),
 new URL('../public/pdf-worker.mjs',import.meta.url));
// Local quality audit uses the matching legacy parser/worker pair. Do not
// mix the modern worker with the legacy display layer on older Chromium.
await fs.copyFile(new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',import.meta.url),
 new URL('../public/pdf-worker-legacy.mjs',import.meta.url));
