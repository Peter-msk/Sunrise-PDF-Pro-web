/** Developer-only acquisition / verification. Never edits the repo or deploys.
 * Node 24 and tar (Windows 10+/Linux), official npm registry, no lifecycle scripts.
 */
import {spawnSync} from 'node:child_process';
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const name='@rhwp/core',version='0.9.0',registry='https://registry.npmjs.org/';
const tarball=registry+name+'/-/core-'+version+'.tgz';
const maxArchive=64*1024*1024;
function run(cmd,args,cwd,limit=1024*1024){
 const r=spawnSync(cmd,args,{cwd,maxBuffer:limit,timeout:120_000,windowsHide:true});
 if(r.error||r.status!==0)throw Error('COMMAND_FAILED:'+cmd);
 return r.stdout;
}
function npm(args,cwd){
 // npm run provides npm_execpath; no shell interpolation of user inputs.
 if(process.env.npm_execpath)return run(process.execPath,[process.env.npm_execpath,...args],cwd);
 if(process.platform==='win32')throw Error('RUN_VIA_NPM_ON_WINDOWS');
 return run('npm',args,cwd);
}
export function inspectArchive(path,dist){
 if(dist?.tarball!==tarball||typeof dist.integrity!=='string'||!/^sha512-[A-Za-z0-9+/]{86}==$/.test(dist.integrity))throw Error('REGISTRY_METADATA_INVALID');
 const size=statSync(path);if(!size.isFile()||size.size<=0||size.size>maxArchive)throw Error('ARCHIVE_SIZE_INVALID');
 const archive=readFileSync(path);
 const expected=Buffer.from(dist.integrity.slice(7),'base64'),actual=createHash('sha512').update(archive).digest();
 if(expected.length!==64||!timingSafeEqual(expected,actual))throw Error('ARCHIVE_INTEGRITY_MISMATCH');
 const pkg=JSON.parse(run('tar',['-xOf',resolve(path),'package/package.json'],undefined).toString('utf8'));
 if(pkg.name!==name||pkg.version!==version)throw Error('PACKAGE_IDENTITY_MISMATCH');
 const wasm=run('tar',['-xOf',resolve(path),'package/rhwp_bg.wasm'],undefined,maxArchive);
 if(wasm.length<8||!WebAssembly.validate(wasm))throw Error('INVALID_WASM');
 return {status:'CANDIDATE_VERIFIED',name,version,tarball,integrity:dist.integrity,wasm_bytes:wasm.length,wasm_sha256:createHash('sha256').update(wasm).digest('hex'),package_dependencies:Object.keys(pkg.dependencies??{}),signature_verification:'NOT_RUN',browser_validation:'NOT_RUN'};
}
export function acquire(){
 const dir=mkdtempSync(join(tmpdir(),'sunrise-rhwp-090-'));
 try{
  const opts=['--registry='+registry,'--fetch-retries=0','--fetch-timeout=30000'];
  const dist=JSON.parse(npm(['view',name+'@'+version,'dist','--json',...opts],dir));
  const packed=JSON.parse(npm(['pack',name+'@'+version,'--json','--ignore-scripts',...opts],dir));
  if(!Array.isArray(packed)||packed.length!==1||typeof packed[0]?.filename!=='string'||basename(packed[0].filename)!==packed[0].filename)throw Error('NPM_PACK_RESULT_INVALID');
  return inspectArchive(join(dir,packed[0].filename),dist);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==0&&args.length!==2)throw Error('USAGE: [archive.tgz registry-dist.json]');
  const result=args.length===2?inspectArchive(args[0],JSON.parse(readFileSync(args[1],'utf8'))):acquire();
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error('RHWP_090_ACQUISITION_BLOCKED:',e.message);process.exitCode=1;}
}
