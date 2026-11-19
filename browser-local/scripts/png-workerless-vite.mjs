/** Derive a browser-only copy from the exact lock-installed png-js dependency.
 * This avoids relaxing CSP: upstream v2 uses fflate async unzlib (blob Worker).
 * No node_modules original is edited; fail closed if the dependency contract drifts.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function patchPngBrowser(source){
 const imports=/import\s*\{\s*unzlib(?:\s+as\s+(\w+))?\s*\}\s*from\s*['"]fflate['"]\s*;?/g;
 const matches=[...source.matchAll(imports)];
 const call=/\binflate\(new Uint8Array\(this\.imgData\),/g;
 if(matches.length!==1||[...source.matchAll(call)].length!==1||!source.includes('decodePixels(fn)'))throw Error('PNG_JS_2_BROWSER_CONTRACT_DRIFT');
 const name=matches[0][1]||'unzlib';
 return source.replace(imports,'import {inflatePngWithoutWorker as '+name+'} from "../../../src/png-workerless-inflate.mjs";')
  .replace(call,'inflate.call(this,new Uint8Array(this.imgData),');
}
export function workerlessPngAlias(){
 const root=new URL('../node_modules/png-js/',import.meta.url);
 const pkg=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
 if(pkg.version!=='2.0.0')throw Error('PNG_JS_VERSION_DRIFT');
 const source=readFileSync(new URL('lib/png-js.browser.js',root),'utf8');
 const target=new URL('lib/png-js.sunrise.browser.mjs',root);
 const patched=patchPngBrowser(source);
 let previous;try{previous=readFileSync(target,'utf8');}catch{}
 if(previous!==patched)writeFileSync(target,patched,'utf8');
 return {find:/^png-js$/,replacement:fileURLToPath(target)};
}
