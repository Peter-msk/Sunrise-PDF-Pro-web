/** DEV36: self-host approved OFL fonts, pinned to reviewed source bytes.
 * Build-time network only. HWP/PDF data and font requests never leave the user's browser.
 * Each mirror payload is verified against the user-supplied ZIP's SHA-256;
 * a 131-byte Git LFS pointer, corrupted font or unexpected version is rejected.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=resolve(root,'public/fonts');
const schoolCommit='13419fb816fb1a5fef1d05026b94355cf84bc392';
const symbolsCommit='7213ed1f96266b95e22cd5645a07851c9c18298e';
export const approvedFonts=Object.freeze([
 {name:'HakgyoansimBareonbatangR.ttf',size:1779920,sha256:'a7ab8757f6c02e2bd715639d289e792892a04f6771da7308a70b815d4bb415b3'},
 {name:'HakgyoansimBareonbatangB.ttf',size:1767012,sha256:'f262789f002803bdf4e55b82d34ac6ba1f5f1440bb1f49dbf4105961b5369199'},
 {name:'HakgyoansimBareondotumR.ttf',size:963020,sha256:'401d3da9631e7641c60c9273f12c571e759f6aefc66011afbcd3804c89c06efd'},
 {name:'HakgyoansimBareondotumB.ttf',size:949900,sha256:'1916434f685368e5398e9f723bb1e8cbb86950d8b57c4ccbf878c2828c8f272d'},
 {name:'NotoSansSymbols2-Regular.ttf',size:656852,gitBlobSha:'45df8301c7bdfaccff52e30a0973132e94b2e95d'}
]);
const legacyFonts=[
 'NanumMyeongjo-Regular.ttf','NanumMyeongjo-Bold.ttf',
 'NanumGothic-Regular.ttf','NanumGothic-Bold.ttf',
 'SunriseSymbols.otf','SunriseMarks.ttf'
];
export function verifyApprovedFont(font,bytes){
 const b=Buffer.from(bytes);
 if(b.length!==font.size)throw Error('SAFE_FONT_SIZE_MISMATCH:'+font.name);
 if(b.length<4||b[0]!==0||b[1]!==1||b[2]!==0||b[3]!==0)
  throw Error('SAFE_FONT_SIGNATURE_INVALID:'+font.name);
 const actual=font.sha256
  ?createHash('sha256').update(b).digest('hex')
  :createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
 const expected=font.sha256||font.gitBlobSha;
 if(actual!==expected)throw Error('SAFE_FONT_HASH_MISMATCH:'+font.name);
 return true;
}
export function approvedSource(font){
 if(font.gitBlobSha)
  return 'https://raw.githubusercontent.com/edwardkim/rhwp/'+symbolsCommit+'/assets/fonts/'+font.name;
 return 'https://media.githubusercontent.com/media/aaronlee09-max/datatronics/'+schoolCommit+'/fonts/'+font.name;
}
async function loadVerified(font){
 const target=resolve(dir,font.name);
 try{const b=await readFile(target);verifyApprovedFont(font,b);return b;}
 catch(e){if(e?.code!=='ENOENT'&&!String(e?.message).startsWith('SAFE_FONT_'))throw e;}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  const response=await fetch(approvedSource(font),{signal:controller.signal,redirect:'follow'});
  if(!response.ok)throw Error('SAFE_FONT_DOWNLOAD_FAILED:'+font.name+':HTTP_'+response.status);
  const length=Number(response.headers.get('content-length'));
  if(Number.isFinite(length)&&length>font.size)throw Error('SAFE_FONT_DOWNLOAD_OVERSIZE:'+font.name);
  if(!response.body)throw Error('SAFE_FONT_DOWNLOAD_EMPTY:'+font.name);
  const reader=response.body.getReader(),parts=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;
   total+=value.byteLength;if(total>font.size)throw Error('SAFE_FONT_DOWNLOAD_OVERSIZE:'+font.name);
   parts.push(value);
  }}finally{reader.releaseLock();}
  const b=Buffer.concat(parts.map(x=>Buffer.from(x)),total);
  verifyApprovedFont(font,b);
  return b;
 }finally{clearTimeout(timer);}
}
export async function installApprovedFonts(){
 // Validate every source before changing any destination file. A partial
 // download must not remove the existing font coverage.
 const fonts=await Promise.all(approvedFonts.map(loadVerified));
 await mkdir(dir,{recursive:true});
 for(let i=0;i<fonts.length;i++)await writeFile(resolve(dir,approvedFonts[i].name),fonts[i]);
 for(const name of legacyFonts){
  try{await unlink(resolve(dir,name));}
  catch(e){if(e?.code!=='ENOENT')throw e;}
 }
 return approvedFonts.map((font,i)=>({name:font.name,size:fonts[i].length}));
}
const directlyInvoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(directlyInvoked)installApprovedFonts().then(files=>{
 console.log('SAFE_FONT_INSTALL_PASS '+JSON.stringify(files));
}).catch(error=>{console.error(String(error));process.exitCode=1;});
