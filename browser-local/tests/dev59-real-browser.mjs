/** Real browser gate; run locally, without GitHub Actions or deployment. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium,devices} from 'playwright';
import {approvedFonts,verifyApprovedFont} from '../scripts/install-safe-fonts.mjs';
const fontName='HakgyoansimBareondotumR.ttf';
const font=await readFile(new URL('../public/fonts/'+fontName,import.meta.url));
verifyApprovedFont(approvedFonts.find(x=>x.name===fontName),font);
const fixture=Buffer.from((await readFile(new URL('./fixtures/dev44-rhwp-test-image.hwpx.b64',import.meta.url),'utf8')).trim(),'base64');
const server=await createServer({server:{host:'127.0.0.1',port:5183,strictPort:true},plugins:[{name:'dev59-blank-page',configureServer(server){server.middlewares.use('/dev59-test.html',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>DEV59 test only</title>');});}}]});
let browser;const evidence=[];
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DEV59_CASE_TIMEOUT')),ms);})]);}finally{clearTimeout(timer);}}
try{
 await server.listen();
 browser=await chromium.launch({headless:true});
 for(const [name,settings] of [['desktop',{}],['mobile-emulation',devices['Pixel 7']]]){
  const ctx=await browser.newContext(settings);const page=await ctx.newPage();const errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e.message).slice(0,160)));
  await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.protocol==='https:'||u.protocol==='http:'){if(u.origin!=='http://127.0.0.1:5183'){external.push(u.origin);return route.abort();}}return route.continue();});
  const record={profile:name,synthetic:{status:'NOT_RUN'},rhwp:{status:'NOT_RUN'},errors,external};
  try{
   await page.goto('http://127.0.0.1:5183/dev59-test.html');
   try{record.synthetic=await bounded(page.evaluate(async b=>(await import('/tests/dev59-runtime-entry.mjs')).runSyntheticReal(b),Array.from(font)),120000);}
   catch(e){record.synthetic={status:'FAIL',error:String(e.message).slice(0,200)};}
   try{record.rhwp=await bounded(page.evaluate(async ({data,font})=>(await import('/tests/dev59-runtime-entry.mjs')).runPublicRhwp(data,font),{data:Array.from(fixture),font:Array.from(font)}),120000);}
   catch(e){record.rhwp={status:'FAIL',error:String(e.message).slice(0,200)};}
  }finally{evidence.push(record);await ctx.close();}
 }
 console.log('DEV59_REAL_BROWSER_EVIDENCE '+JSON.stringify({browser:browser.version(),platform:process.platform,node:process.version,physicalMobile:false,evidence}));
 assert.ok(evidence.every(x=>x.synthetic.status==='PASS'&&x.rhwp.status==='CONVERTED_UNVERIFIED_VISUAL'&&!x.errors.length&&!x.external.length),'DEV59 real conversion gate incomplete; inspect evidence');
 // Success here does NOT certify public-fixture visual parity or physical devices.
}finally{await browser?.close();await server.close();}
