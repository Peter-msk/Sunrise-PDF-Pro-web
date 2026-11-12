import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRasterCompatibilityPdf} from '../src/raster-compat-pdf.mjs';

const validPdf=new Uint8Array(readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url)));
const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'});
function setup({count=2,pages=[],result=validPdf,controller,failPreprocess=false}={}){
 const events=[];
 const pdf={
  saved:false,embedPng:async bytes=>{assert.ok(bytes instanceof Uint8Array);return {key:'png'};},
  addPage:size=>{pages.push(size);return {drawImage:(image,settings)=>{assert.equal(image.key,'png');assert.equal(settings.width,size[0]);assert.equal(settings.height,size[1]);}};},
  save:async()=>{pdf.saved=true;return result;}
 };
 const doc={renderPageSvgWithProfile:(i,profile)=>{assert.equal(profile,'print');return `<svg data-page="${i}"/>`;}};
 return {doc,pdf,events,options:{
  signal:controller?.signal,
  onProgress:x=>events.push(x),
  preprocessSvg:async(svg)=>{if(failPreprocess)throw Error('SVG_UNSAFE');return svg;},
  rasterPage:async(svg)=>{assert.match(svg,/^<svg/);return {blob:png,widthPt:300,heightPt:600};},
  loadPdfLib:async()=>({PDFDocument:{create:async()=>pdf}})
 },count};
}

test('explicit compat generates full PDF from page images, preserves page count and warns about quality',async()=>{
 const pages=[],x=setup({count:3,pages});
 const r=await buildRasterCompatibilityPdf(x.doc,x.count,x.options);
 assert.deepEqual(pages,[[300,600],[300,600],[300,600]]);
 assert.equal(r.pages,3);assert.equal(r.renderMode,'raster-compat');
 assert.equal(r.vectorPages,0);assert.equal(r.rasterPages,3);
 assert.equal(r.bytes,validPdf.byteLength);assert.equal(r.pdf.type,'application/pdf');
 assert.ok(r.warnings.some(s=>/검색/.test(s)));assert.ok(r.warnings.some(s=>/원본/.test(s)));
 assert.equal(x.events.filter(e=>e.detail==='compat_page_done').length,3);
 assert.equal(x.events.at(-1).detail,'pdf_done');
});

test('compat cancellation stops before reading another page or saving PDF',async()=>{
 const abort=new AbortController(),x=setup({count:2,controller:abort});
 x.options.rasterPage=async()=>{abort.abort();return {blob:png,widthPt:300,heightPt:600};};
 await assert.rejects(buildRasterCompatibilityPdf(x.doc,x.count,x.options),e=>e.name==='AbortError');
 assert.equal(x.pdf.saved,false);
});

test('compat writer cannot claim a truncated or invalid PDF as success',async()=>{
 const x=setup({count:1,result:new Uint8Array([1,2,3,4,5])});
 await assert.rejects(buildRasterCompatibilityPdf(x.doc,x.count,x.options),/PDF_OUTPUT_HEADER_INVALID/);
});

test('compat rejects unsafe source and malformed page image, rather than bypassing validation',async()=>{
 const x=setup({count:1,failPreprocess:true});
 await assert.rejects(buildRasterCompatibilityPdf(x.doc,x.count,x.options),/SVG_UNSAFE/);
 const y=setup({count:1});y.options.rasterPage=async()=>({blob:png,widthPt:0,heightPt:600});
 await assert.rejects(buildRasterCompatibilityPdf(y.doc,y.count,y.options),/COMPAT_PAGE_IMAGE_INVALID/);
});

test('compat is strictly opt-in; default vector engine does not silently rasterize a failed source',()=>{
 const src=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(src,/if\(options\.engine==='compat-raster'\)/);
 // The surrounding try/finally frees the WASM document. Await the async
 // compatibility build before finally, else Chromium sees a freed Rust ptr.
 assert.match(src,/return await buildRasterCompatibilityPdf\(doc,count,/);
 assert.match(src,/allowRasterFallback:false/);
 assert.match(src,/options=\{engine:'professional',\.\.\.options\}/);
 assert.match(ui,/<option value="professional" selected>/);
 assert.match(ui,/<option value="compat-raster">/);
});

test('compat output is bounded and per-page processing yields to cancellation',async()=>{
 const x=setup({count:0});
 await assert.rejects(buildRasterCompatibilityPdf(x.doc,x.count,x.options),/COMPAT_PAGE_COUNT_INVALID/);
 const y=setup({count:121});
 await assert.rejects(buildRasterCompatibilityPdf(y.doc,y.count,y.options),/COMPAT_PAGE_COUNT_INVALID/);
});


test('compat stages are whitelisted by both client and server telemetry and traced with real phases',()=>{
 const client=readFileSync(new URL('../src/pro-telemetry.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../../src/admin/handler.js',import.meta.url),'utf8');
 const trace=readFileSync(new URL('../../src/trace-dev4-runtime.js',import.meta.url),'utf8');
 for(const name of ['compat_raster','compat_page_done','compat_save']){
  assert.match(client,new RegExp(name));
  assert.match(server,new RegExp(name));
 }
 assert.match(trace,/image_\|compat_raster/);
 assert.match(trace,/pdf_\|compat_save/);
});
