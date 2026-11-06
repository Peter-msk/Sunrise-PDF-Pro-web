/** Offline-only diagnostic. Never calls registries or starts deployment. */
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const expected=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const requirements={...expected.dependencies,...expected.devDependencies};
const packages=Object.entries(requirements).map(([name,version])=>{
  const location=resolve(root,'node_modules',...name.split('/'),'package.json');
  try{
    const actual=JSON.parse(readFileSync(location,'utf8')).version;
    return {name,expected:version,installed:actual,valid:actual===version};
  }catch{return {name,expected:version,installed:null,valid:false};}
});
const packagesReady=packages.every(item=>item.valid);
const packagesOnly=process.argv.includes('--packages-only');
const lockPath=resolve(root,'package-lock.json');
let lockValid=false;
if(existsSync(lockPath)){
  try{
    const lock=JSON.parse(readFileSync(lockPath,'utf8'));
    lockValid=Object.entries(requirements).every(([name,version])=>
      lock.packages?.['node_modules/'+name]?.version===version);
  }catch{ /* corrupt lock must never be counted as ready */ }
}
const wasm=resolve(root,'public/rhwp_bg.wasm');
const expectedSha='54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989';
const wasmPresent=existsSync(wasm);
const actualSha=wasmPresent?createHash('sha256').update(readFileSync(wasm)).digest('hex'):null;
const wasmValid=actualSha===expectedSha;
const ready=packagesReady&&lockValid&&(packagesOnly||wasmValid);
const report={offline:true,packagesOnly,node:process.version,packages,
  packageLock:{present:existsSync(lockPath),valid:lockValid},
  wasm:{present:wasmPresent,sha256Valid:wasmValid},
  status:ready?'READY_FOR_LOCAL_BUILD':'MISSING_OR_MISMATCHED_DEPENDENCIES',
  next:ready?'npm run build (local only)':'Internet-enabled PC: npm install --no-audit --no-fund. Then npm run build.'};
console.log(JSON.stringify(report,null,2));
if(!ready)process.exitCode=2;
