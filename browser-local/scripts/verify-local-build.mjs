/** Fail closed after a LOCAL Vite build. This cannot verify HWP conversion quality. */
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {verifyRhwpAssets} from './rhwp-assets.mjs';
import {resolve,join} from 'node:path';
import {approvedFonts,verifyApprovedFont} from './install-safe-fonts.mjs';
const dist=resolve(import.meta.dirname,'../dist');
const htmlPath=resolve(dist,'index.html');
const errors=[];
if(!existsSync(htmlPath))errors.push('dist/index.html is missing');
if(!existsSync(join(dist,'pdf-worker.mjs')))errors.push('self-hosted PDF preview worker is missing');
if(!existsSync(join(dist,'pdf-worker-legacy.mjs')))errors.push('self-hosted legacy PDF vector audit worker is missing');
try{verifyRhwpAssets(dist);}catch(e){errors.push('RHWP assets: '+e.message);}
// One approved-font manifest is authoritative at install and dist verification.
for(const font of approvedFonts){
 const path=join(dist,'fonts',font.name);
 if(!existsSync(path)){
  errors.push('approved OFL font missing: '+font.name);
  continue;
 }
 try{verifyApprovedFont(font,readFileSync(path));}
 catch(error){errors.push('approved OFL font invalid: '+font.name+' '+String(error?.message||error));}
}
for(const legacy of ['NanumGothic-Regular.ttf','NanumGothic-Bold.ttf',
 'NanumMyeongjo-Regular.ttf','NanumMyeongjo-Bold.ttf','SunriseSymbols.otf','SunriseMarks.ttf']){
 if(existsSync(join(dist,'fonts',legacy)))errors.push('retired font still shipped: '+legacy);
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
