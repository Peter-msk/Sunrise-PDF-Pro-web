import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const source=resolve(root,'node_modules/@rhwp/core/rhwp_bg.wasm');
const dest=resolve(root,'public/rhwp_bg.wasm');
mkdirSync(resolve(root,'public'),{recursive:true});
if(statSync(source).size<1024)throw Error('Official rhwp WASM is empty');
copyFileSync(source,dest);
console.log('Bundled official @rhwp/core v0.8.7 WASM:',statSync(dest).size,'bytes');
