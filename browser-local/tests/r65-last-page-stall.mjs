import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeEmbeddedPngSvg} from '../src/svg-embedded-raster-budget.mjs';
import {tryProfessionalDocument} from '../src/svg-professional.js';

function oversizedPng(){
 const bytes=new Uint8Array(24);
 bytes.set([137,80,78,71,13,10,26,10],0);
 bytes.set([0,0,0,13,73,72,68,82],8);
 const v=new DataView(bytes.buffer);
 v.setUint32(16,10_000);
 v.setUint32(20,10_000);
 const href={localName:'href',name:'href',value:'data:image/png;base64,'+Buffer.from(bytes).toString('base64')};
 const doc={
  documentElement:{localName:'svg'},
  doctype:null,
  querySelector:()=>null,
  querySelectorAll:()=>[{attributes:[href]}]
 };
 return {doc,href};
}
function opts(overrides={}){
 const {doc}=oversizedPng();
 return {parse:()=>doc,serialize:()=>'<svg/>',imageTimeoutMs:18,...overrides};
}
function goodBitmap(){
 return {width:3000,height:3000,close(){}};
}
function canvas(toBlob){
 const ctx={clearRect(){},drawImage(){}};
 return {getContext:()=>ctx,toBlob};
}
test('R65 pending createImageBitmap is a bounded failure, not a stuck batch',async()=>{
 const start=Date.now();
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,
  opts({decode:()=>new Promise(()=>{})})),/PNG_RESIZE_DECODE_TIMEOUT/);
 assert.ok(Date.now()-start<1000);
});
test('R65 pending canvas PNG encoder has an upper bound',async()=>{
 const start=Date.now();
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,
  opts({decode:async()=>goodBitmap(),makeCanvas:()=>canvas(()=>{})})),
  /PNG_RESIZE_ENCODE_TIMEOUT/);
 assert.ok(Date.now()-start<1000);
});
test('R65 pending file-reader/dataURL is a bounded failure',async()=>{
 const start=Date.now();
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,
  opts({decode:async()=>goodBitmap(),
   makeCanvas:()=>canvas(cb=>cb(new Blob(['png']))),
   toDataURL:()=>new Promise(()=>{})})),/PNG_RESIZE_DATAURL_TIMEOUT/);
 assert.ok(Date.now()-start<1000);
});
test('R65 PDFKit missing end event fails instead of hanging forever',async()=>{
 let destroyed=false;
 const phases=[];
 class PDFDoc{
  registerFont(){}
  end(){}
  destroy(){destroyed=true;}
 }
 await assert.rejects(tryProfessionalDocument({},0,{
  checkedSvg:async()=>({svg:'<svg/>',width:1,height:1}),
  finalizeTimeoutMs:20,
  onProgress:p=>phases.push(p.detail),
  loadLibraries:async()=>({
   PDFDocument:PDFDoc,
   registerStdFonts:()=>{},Helvetica:{},
   SVGtoPDF:()=>{},
   toBlob:()=>new Promise(()=>{})
  })
 }),/PDF_STREAM_TIMEOUT/);
 assert.ok(destroyed,'partial PDF writer must be disposed');
 assert.deepEqual(phases,['pdf_finalize','pdf_stream']);
});
test('R65 progress migration does not rebuild old telemetry table',()=>{
 const migrate=readFileSync(new URL('../../db/migrations/0004_r65_conversion_progress.sql',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../../src/admin/handler.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../src/pro-telemetry.js',import.meta.url),'utf8');
 assert.match(migrate,/CREATE TABLE IF NOT EXISTS pro_telemetry_progress/);
 assert.doesNotMatch(migrate,/DROP TABLE|ALTER TABLE|DELETE FROM pro_telemetry/i);
 assert.match(admin,/if\(b\.kind==='convert_progress'\)/);
 assert.match(admin,/INSERT OR IGNORE INTO pro_telemetry_progress/);
 assert.match(admin,/DELETE FROM pro_telemetry_progress WHERE happened_at/);
 for(const key of ['image_png','svg_vector','pdf_finalize','pdf_stream'])
  assert.ok(admin.includes("'"+key+"'")&&client.includes("'"+key+"'"));
});
