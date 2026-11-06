import { existsSync,readFileSync,readdirSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const files=[];
function walk(dir){for(const item of readdirSync(dir,{withFileTypes:true})){
 const path=join(dir,item.name);if(item.isDirectory())walk(path);else if(item.name.endsWith('.js'))files.push(path);
}}
walk(join(root,'src'));
const imports=/\b(?:import|export)\s*(?:[^'"()]*?\s+from\s*)?['"](\.\.?\/[^'"]+)['"]/g;
const failures=[];
for(const file of files){
 const code=readFileSync(file,'utf8');
 for(const m of code.matchAll(imports)){
  const target=resolve(dirname(file),m[1]);
  if(!existsSync(target)&&!existsSync(target+'.js'))failures.push(`${file}: missing ${m[1]}`);
 }
}
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
for(const dependency of ['@rhwp/core','pdf-lib','@pdf-lib/fontkit','pdfkit','svg-to-pdfkit']){
 if(!pkg.dependencies[dependency])failures.push('package.json missing '+dependency);
}
if(!existsSync(join(root,'scripts/copy-wasm.mjs')))failures.push('missing WASM copy script');
if(!existsSync(join(root,'index.html')))failures.push('missing browser UI');
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log('Local source integration contract PASS:',files.length,'JS modules, imports/dependencies/scripts present');
