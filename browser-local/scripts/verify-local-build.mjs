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
 'HakgyoansimBareonbatangR.ttf':'a7ab8757f6c02e2bd715639d289e792892a04f6771da7308a70b815d4bb415b3',
 'HakgyoansimBareonbatangB.ttf':'f262789f002803bdf4e55b82d34ac6ba1f5f1440bb1f49dbf4105961b5369199',
 'HakgyoansimBareondotumR.ttf':'401d3da9631e7641c60c9273f12c571e759f6aefc66011afbcd3804c89c06efd',
 'HakgyoansimBareondotumB.ttf':'1916434f685368e5398e9f723bb1e8cbb86950d8b57c4ccbf878c2828c8f272d'
};
for(const [name,expected] of Object.entries(fonts)){
 const path=join(dist,'fonts',name);
 if(!existsSync(path)||createHash('sha256').update(readFileSync(path)).digest('hex')!==expected)
  errors.push('approved OFL font missing or hash mismatch: '+name);
}
const symbols=join(dist,'fonts','NotoSansSymbols2-Regular.ttf');
if(!existsSync(symbols))errors.push('OFL symbol fallback font missing');
else{
 const bytes=readFileSync(symbols);
 const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(bytes.length!==656852||sha!=='45df8301c7bdfaccff52e30a0973132e94b2e95d')
  errors.push('OFL symbol font Git blob mismatch');
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
