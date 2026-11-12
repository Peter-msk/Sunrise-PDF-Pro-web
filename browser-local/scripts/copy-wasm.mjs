import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const source=resolve(root,'node_modules/@rhwp/core/rhwp_bg.wasm');
const dest=resolve(root,'public/rhwp_bg.wasm');
const EXPECTED_BYTES=11821756;
const EXPECTED_SHA256='54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989';

if(statSync(source).size!==EXPECTED_BYTES)throw Error('Pinned rhwp v0.8.7 WASM size mismatch');
const sha=createHash('sha256').update(readFileSync(source)).digest('hex');
if(sha!==EXPECTED_SHA256)throw Error('Pinned rhwp v0.8.7 WASM SHA-256 mismatch');
mkdirSync(resolve(root,'public'),{recursive:true});
copyFileSync(source,dest);
console.log('Verified and bundled official rhwp WASM:',EXPECTED_BYTES,'bytes, SHA-256',sha);

// Self-host PDF renderer: no document or font is sent to a third party.
const fs=await import('node:fs/promises');
await fs.copyFile(new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs',import.meta.url),
 new URL('../public/pdf-worker.mjs',import.meta.url));
// Local quality audit uses the matching legacy parser/worker pair. Do not
// mix the modern worker with the legacy display layer on older Chromium.
await fs.copyFile(new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',import.meta.url),
 new URL('../public/pdf-worker-legacy.mjs',import.meta.url));
