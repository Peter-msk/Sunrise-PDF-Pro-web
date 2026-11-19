/** Real RHWP -> full browser application -> PDF; public MIT fixture only. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {JSDOM} from 'jsdom';
import {PDFDocument} from 'pdf-lib';

const fixture=Buffer.from(readFileSync(new URL('./fixtures/dev44-rhwp-test-image.hwpx.b64',import.meta.url),'utf8').trim(),'base64');
const files=unzipSync(fixture);
const variants=[
 {name:'gray',effect:'GRAY_SCALE',bright:'0',contrast:'0',crop:false},
 {name:'blackwhite',effect:'BLACK_WHITE',bright:'0',contrast:'0',crop:false},
 {name:'brightness-contrast',effect:'REAL_PIC',bright:'10',contrast:'20',crop:false},
 {name:'crop-gray',effect:'GRAY_SCALE',bright:'0',contrast:'0',crop:true}
];
function make(v){
 const output={...files};let altered=0,crops=0;
 for(const path of Object.keys(output).filter(x=>/^Contents\/section\d+\.xml$/.test(x))){
  const dom=new JSDOM(strFromU8(output[path]),{contentType:'text/xml'}),d=dom.window.document;
  for(const picture of Array.from(d.getElementsByTagNameNS('*','pic'))){
   const img=Array.from(picture.getElementsByTagNameNS('*','img')).find(x=>x.hasAttribute('binaryItemIDRef'));
   if(!img)continue;
   img.setAttribute('effect',v.effect);img.setAttribute('bright',v.bright);img.setAttribute('contrast',v.contrast);altered++;
   if(v.crop){
    const clip=picture.getElementsByTagNameNS('*','imgClip')[0];
    const org=picture.getElementsByTagNameNS('*','orgSz')[0];
    if(!clip)continue;
    const w=Number(org?.getAttribute('width')),h=Number(org?.getAttribute('height'));
    let left=Number(clip.getAttribute('left')),right=Number(clip.getAttribute('right'));
    let top=Number(clip.getAttribute('top')),bottom=Number(clip.getAttribute('bottom'));
    if(!(right>left)&&w>1){left=0;right=w;}
    if(!(bottom>top)&&h>1){top=0;bottom=h;}
    if(!(right-left>4&&bottom-top>4))continue;
    clip.setAttribute('left',String(Math.round(left+(right-left)/4)));
    clip.setAttribute('right',String(Math.round(right)));
    clip.setAttribute('top',String(Math.round(top)));
    clip.setAttribute('bottom',String(Math.round(bottom)));
    crops++;
   }
  }
  output[path]=strToU8(d.documentElement.outerHTML);
  dom.window.close();
 }
 assert.ok(altered>0,JSON.stringify({v,altered}));
 if(v.crop)assert.ok(crops>0,'No real HWPX crop metadata was mutated');
 return {name:v.name+'.hwpx',mimeType:'application/zip',buffer:Buffer.from(zipSync(output,{level:0})),altered,crops};
}
const samples=variants.map(make);

const site=process.env.SUNRISE_RELEASE_TEST_URL;
assert.ok(['http://127.0.0.1:8787/local/','https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/'].includes(site),'unexpected release target');
const origin=new URL(site).origin;
const channel=origin.startsWith('https:')?'production':'local';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
 const page=await context.newPage();
 const errors=[],outbound=[],wasm=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(/rhwp-0\.9\.0-part[12]\.bin$/.test(new URL(r.url()).pathname))wasm.push({path:new URL(r.url()).pathname,status:r.status()});});
 await page.addInitScript(()=>{globalThis.__workerViolations=[];document.addEventListener('securitypolicyviolation',e=>{if(e.effectiveDirective==='worker-src')globalThis.__workerViolations.push(e.effectiveDirective);});});
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin||['blob:','data:'].includes(u.protocol))return route.continue();
  outbound.push(u.origin);return route.abort('blockedbyclient');
 });
 await page.goto(site,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('변환 준비 완료'),null,{timeout:30000});
 assert.equal(await page.locator('#build-revision').textContent(),'DEV51 ('+channel+')');
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 await page.locator('#source').setInputFiles(samples.map(({name,mimeType,buffer})=>({name,mimeType,buffer})));
 await page.locator('#convert').click();
 await page.waitForFunction(()=>Number(document.querySelector('#done-count')?.textContent||0)+Number(document.querySelector('#failed-count')?.textContent||0)===4,null,{timeout:180000});
 // Completion counts may settle before the final archive/UI redraw.
 await page.waitForFunction(()=>document.querySelector('#cancel')?.disabled===true,null,{timeout:60000});
 const exportWait=page.waitForEvent('download');await page.locator('#qa-export').click();
 const qa=JSON.parse(readFileSync(await (await exportWait).path(),'utf8'));
 console.log('RELEASE_QA '+JSON.stringify(qa));
 assert.equal(qa.rhwp_version,'0.9.0');
 assert.equal(qa.deployment_channel,channel);
 assert.equal(qa.totals.done,4);
 assert.equal(qa.totals.failed,0);
 const links=page.locator('#file-list a.download');
 assert.equal(await links.count(),4);
 for(let i=0;i<4;i++){
  const wait=page.waitForEvent('download');await links.nth(i).click();
  const pdf=await PDFDocument.load(readFileSync(await (await wait).path()));
  assert.equal(pdf.getPageCount(),5);assert.equal(qa.files[i].vector_pages,5);assert.equal(qa.files[i].raster_pages,0);
 }
 for(const part of [1,2])assert.ok(wasm.some(r=>r.path==='/local/rhwp-0.9.0-part'+part+'.bin'&&r.status===200));
 assert.deepEqual(await page.evaluate(()=>globalThis.__workerViolations),[]);
 assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
 console.log('DEV47_RELEASE_SMOKE_PASS '+channel+' 4 files 20 vector pages');
}finally{await browser.close();}
