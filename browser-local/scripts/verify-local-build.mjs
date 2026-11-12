/** Fail closed after a LOCAL Vite build. This cannot verify HWP conversion quality. */
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const dist=resolve(import.meta.dirname,'../dist');
const asset=resolve(dist,'rhwp_bg.wasm');
const htmlPath=resolve(dist,'index.html');
const errors=[];
if(!existsSync(htmlPath))errors.push('dist/index.html is missing');
if(!existsSync(join(dist,'pdf-worker.mjs')))errors.push('self-hosted PDF preview worker is missing');
if(!existsSync(join(dist,'pdf-worker-legacy.mjs')))errors.push('self-hosted legacy PDF vector audit worker is missing');
if(!existsSync(asset))errors.push('dist/rhwp_bg.wasm is missing');
else {
 const hash=createHash('sha256').update(readFileSync(asset)).digest('hex');
 if(hash!=='54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989')
   errors.push('rhwp_bg.wasm SHA-256 does not match the pinned version');
}
const fonts={
 'NanumGothic-Regular.ttf':'76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31',
 'NanumGothic-Bold.ttf':'f96298f9fb18e364d2370f4c3ce948ac67a2b61af992d7234bc15c42b033c674',
 'NanumMyeongjo-Regular.ttf':'7ed9e8653a8ed04285d51dc343ffea6eb3d9c73afc27383ea8929ee4ffd03205',
 'NanumMyeongjo-Bold.ttf':'bc9ed8e60d93fe6db054b8fb988481b625f2eef8cb2317ad0e9834681b8fe3f3',
 'SunriseSymbols.otf':'f781d5c02eaa95129107e1d860421d60da4c9700beb672e1302c474f626b5992',
 'SunriseMarks.ttf':'c46399732947c51004cc10660b5f977fb981ccd1b473106882e36a99ce1edfc6'};
for(const [name,expected] of Object.entries(fonts)){
 const path=join(dist,'fonts',name);
 if(!existsSync(path)||createHash('sha256').update(readFileSync(path)).digest('hex')!==expected)errors.push('bundled font missing or hash mismatch: '+name);
}
const chunks=existsSync(join(dist,'assets'))
 ?readdirSync(join(dist,'assets')).filter(p=>p.endsWith('.js')):[];
if(chunks.length===0)errors.push('Vite JavaScript bundle was not created');
for(const chunk of chunks){
 if(statSync(join(dist,'assets',chunk)).size===0)errors.push('empty JS chunk: '+chunk);
}
if(existsSync(htmlPath)){
 const html=readFileSync(htmlPath,'utf8');
 if(!/src=["'][^"']+\.js["']/.test(html))errors.push('built HTML has no JavaScript entry');
 if(/cdn\.|unpkg\.com|jsdelivr\.net/i.test(html))errors.push('built HTML references an external CDN');
}
const result={status:errors.length?'FAIL':'PASS',dist,jsChunks:chunks.length,errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
