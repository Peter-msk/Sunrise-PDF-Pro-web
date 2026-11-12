import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
const validPdf=readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url));
import {assertSvgSourceWithinBudget,checkSvgPathBudget} from '../src/svg-render-guard.mjs';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';

const path=(d)=>({localName:'path',getAttribute:(name)=>name==='d'?d:null});
const rect={localName:'rect',getAttribute:()=>null};

// The size guard is an admission check, not an XML sanitizer.
test('R66-DEV3 source budget accepts source at the boundary',()=>{
 assert.equal(assertSvgSourceWithinBudget('<svg/>',{maxChars:6}),6);
});
test('R66-DEV3 rejects oversized SVG before DOM/parser/vector renderer',()=>{
 assert.throws(()=>assertSvgSourceWithinBudget('<svg/>!',{maxChars:6}),/SVG_RENDER_SOURCE_CHARS_LIMIT/);
});
test('R66-DEV3 rejects invalid source and bad limits',()=>{
 assert.throws(()=>assertSvgSourceWithinBudget(null),/SVG_RENDER_INPUT_INVALID/);
 assert.throws(()=>assertSvgSourceWithinBudget('x',{maxChars:0}),/SVG_RENDER_BUDGET_INVALID/);
});
test('R66-DEV3 per-path limit cannot silently truncate geometry',()=>{
 assert.deepEqual(checkSvgPathBudget(path('abcde'),0,{maxSinglePath:4,maxPagePaths:8}),
  {ok:false,reason:'SVG_RENDER_SINGLE_PATH_LIMIT'});
});
test('R66-DEV3 aggregate path budget counts every SVG path',()=>{
 const opts={maxSinglePath:4,maxPagePaths:7};
 const a=checkSvgPathBudget(path('aaaa'),0,opts);
 assert.deepEqual(a,{ok:true,total:4});
 assert.deepEqual(checkSvgPathBudget(path('bbb'),a.total,opts),{ok:true,total:7});
 assert.deepEqual(checkSvgPathBudget(path('c'),7,opts),{ok:false,reason:'SVG_RENDER_PAGE_PATH_LIMIT'});
});
test('R66-DEV3 non-path SVG objects do not alter vector budget',()=>{
 assert.deepEqual(checkSvgPathBudget(rect,5,{maxSinglePath:8,maxPagePaths:12}),{ok:true,total:5});
});
test('R66-DEV3 invalid budget is explicitly rejected',()=>{
 assert.equal(checkSvgPathBudget(path(''),-1).reason,'SVG_RENDER_BUDGET_INVALID');
});

class StubPdf extends EventEmitter { destroy(){this.destroyed=true;} }
async function backend(){return loadBrowserPdfBackend(async name=>{
 if(name==='pdfkit')return {PDFDocument:StubPdf,registerStdFonts(){}};
 if(name==='svg-to-pdfkit')return {default:()=>{}};
 if(name==='pdfkit/standard-fonts/Helvetica')return {default:{family:'Helvetica'}};
 throw Error('UNEXPECTED_IMPORT');
});}

test('R66-DEV3 PDFKit byte ceiling rejects before retaining oversized output',async()=>{
 const api=await backend(),pdf=new StubPdf();
 const pending=api.toBlob(pdf,undefined,()=>{},10);
 pdf.emit('data',new Uint8Array(9));
 pdf.emit('data',new Uint8Array(2));
 await assert.rejects(pending,/PDF_STREAM_OUTPUT_BYTES_LIMIT/);
 assert.equal(pdf.destroyed,true);
 assert.equal(pdf.listenerCount('data'),0);
});
test('R66-DEV3 PDFKit byte ceiling accepts exact boundary',async()=>{
 const api=await backend(),pdf=new StubPdf();
 const pending=api.toBlob(pdf,undefined,()=>{},validPdf.length);
 pdf.emit('data',validPdf.subarray(0,5));pdf.emit('data',validPdf.subarray(5));pdf.emit('end');
 assert.equal((await pending).size,validPdf.length);
});
test('R66-DEV3 PDFKit invalid ceiling fails before any listeners are set',async()=>{
 const api=await backend(),pdf=new StubPdf();
 await assert.rejects(api.toBlob(pdf,undefined,()=>{},0),/PDF_STREAM_BUDGET_INVALID/);
 assert.equal(pdf.listenerCount('data'),0);
});
test('R66-DEV3 PDFKit late data after budget breach is ignored',async()=>{
 const api=await backend(),pdf=new StubPdf();
 const pending=api.toBlob(pdf,undefined,()=>{},10);
 pdf.emit('data',new Uint8Array(11));
 await assert.rejects(pending,/PDF_STREAM_OUTPUT_BYTES_LIMIT/);
 pdf.emit('data',new Uint8Array(11));pdf.emit('end');
 assert.equal(pdf.listenerCount('end'),0);
});
