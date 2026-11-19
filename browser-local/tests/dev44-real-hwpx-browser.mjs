/** Real RHWP -> full browser application -> PDF; public MIT fixture only. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
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
const server=await createServer({server:{host:'127.0.0.1',port:5180,strictPort:true}});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const workerViolations=[];
 await page.addInitScript(()=>{globalThis.__dev47WorkerViolations=[];document.addEventListener('securitypolicyviolation',e=>{if(e.effectiveDirective==='worker-src')globalThis.__dev47WorkerViolations.push(e.effectiveDirective);});});
 await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('변환 준비 완료'),null,{timeout:30000});
 const label=await page.locator('#build-revision').textContent();
 assert.equal(label,'DEV49 (local)');
 const evidence=[];
 for(let i=0;i<samples.length;i++){
  const probe=await page.evaluate(async ({data,mode})=>{
   const {inspectPublicFixture}=await import('/tests/dev44-engine-probe.mjs');
   return inspectPublicFixture(data,mode);
  },{data:Array.from(samples[i].buffer),mode:['blackwhite','brightness-contrast'].includes(variants[i].name)?variants[i].name:null});
  evidence.push({name:variants[i].name,altered:samples[i].altered,crops:samples[i].crops,...probe});
 }
 console.log('RHWP_ENGINE_EVIDENCE '+JSON.stringify(evidence));
 assert.ok(evidence[0].effects.includes('rhwp-img-grayscale'));
 // The exact pinned engine deliberately bakes zero-adjustment BMP BlackWhite.
 // Absence of a filter is not enough: require every original pixel, dimensions,
 // alpha, image count, both output levels and a nontrivial source transformation.
 const bw=evidence[1].baked;
 assert.ok(bw,'missing baked blackwhite evidence');
 assert.equal(evidence[1].effects.includes('rhwp-img-blackwhite'),false,'double application of baked blackwhite');
 assert.equal(bw.images,evidence[1].altered,'image count mismatch');
 assert.equal(bw.pngImages,bw.images,'baked image is not PNG');
 assert.ok(bw.pixels>0&&bw.black>0&&bw.white>0&&bw.changed>0,JSON.stringify(bw));
 assert.equal(bw.mismatched,0,JSON.stringify(bw));
 assert.equal(bw.alphaMismatch,0,JSON.stringify(bw));
 // RHWP 0.9.0 bakes this RealPic tone into PNG, rather than emitting an SVG filter.
 const tone=evidence[2].baked;
 assert.ok(tone,'missing baked brightness/contrast evidence');
 assert.deepEqual(evidence[2].effects,[],'double application of baked tone');
 assert.equal(tone.images,evidence[2].altered,'tone image count mismatch');
 assert.equal(tone.pngImages,tone.images,'baked tone is not PNG');
 assert.ok(tone.visible>0&&tone.changed>0,JSON.stringify(tone));
 assert.equal(tone.mismatched,0,JSON.stringify(tone));
 assert.equal(tone.alphaMismatch,0,JSON.stringify(tone));
 assert.ok(evidence[3].effects.includes('rhwp-img-grayscale'));
 assert.ok(evidence[3].cropViewports>0,'RHWP did not actually emit an inner crop viewport');
 await page.locator('#source').setInputFiles(samples.map(({name,mimeType,buffer})=>({name,mimeType,buffer})));
 assert.equal(await page.locator('#pdf-engine').inputValue(),'professional');
 // Public fixtures only: observe the actual UI without changing conversion behavior.
 // Browser heartbeats preserve the last responsive stage even when a later
 // synchronous operation blocks the page or the final QA download is unavailable.
 page.on('console',message=>{
  const value=message.text();
  if(value.startsWith('DEV46_BATCH_HEARTBEAT '))console.log(value);
 });
 await page.evaluate(()=>{
  const snapshot=()=>{
   const text=id=>document.getElementById(id)?.textContent||'';
   console.log('DEV46_BATCH_HEARTBEAT '+JSON.stringify({
    total:text('total-count'),done:text('done-count'),failed:text('failed-count'),
    summary:text('summary-state'),progress:document.querySelector('#progress')?.value??null,
    status:text('status'),
    states:Array.from(document.querySelectorAll('#file-list .file-row'),row=>row.dataset.state)
   }));
  };
  snapshot();
  setInterval(snapshot,5000);
 });
 await page.locator('#convert').click();
 try{
  await page.waitForFunction(()=>Number(document.querySelector('#done-count')?.textContent||0)+Number(document.querySelector('#failed-count')?.textContent||0)===4,null,{timeout:180000});
 }catch(error){
  // Do not turn an incomplete batch into a passing test. The same local,
  // privacy-filtered QA export is available during an in-progress conversion.
  try{
   const [partial]=await Promise.all([
    page.waitForEvent('download',{timeout:5000}),
    page.locator('#qa-export').click({timeout:5000})
   ]);
   const report=JSON.parse(readFileSync(await partial.path(),'utf8'));
   console.log('DEV46_BATCH_TIMEOUT_QA '+JSON.stringify(report));
  }catch(qaError){
   console.error('DEV46_BATCH_TIMEOUT_QA_UNAVAILABLE '+(qaError?.name||'Error'));
  }
  console.error('DEV46_BATCH_PAGE_ERRORS '+JSON.stringify(errors));
  throw error;
 }
 const exported=page.waitForEvent('download');
 await page.locator('#qa-export').click();
 const qaDownload=await exported;
 const qa=JSON.parse(readFileSync(await qaDownload.path(),'utf8'));
 console.log('APP_QA '+JSON.stringify(qa));
 assert.match(qaDownload.suggestedFilename(),/DEV49_local_/);
 assert.equal(qa.build_revision,'DEV49');
 assert.equal(qa.rhwp_version,'0.9.0');
 assert.equal(qa.deployment_channel,'local');
 assert.equal(qa.totals.done,4,JSON.stringify(qa));
 assert.equal(qa.totals.failed,0);
 const links=page.locator('#file-list a.download');
 assert.equal(await links.count(),4);
 const output=[];
 for(let i=0;i<4;i++){
  const next=page.waitForEvent('download');await links.nth(i).click();const d=await next;
  const bytes=readFileSync(await d.path());const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),evidence[i].pages);
  assert.equal(qa.files[i].vector_pages,evidence[i].pages);
  assert.equal(qa.files[i].raster_pages,0);
  output.push({name:variants[i].name,pages:pdf.getPageCount(),bytes:bytes.length});
 }
 workerViolations.push(...await page.evaluate(()=>globalThis.__dev47WorkerViolations));
 assert.deepEqual(workerViolations,[],'worker CSP violations');
 assert.deepEqual(errors,[]);
 console.log('DEV46_FULL_BROWSER_PASS '+JSON.stringify(output));
}finally{await browser?.close();await server.close();}
