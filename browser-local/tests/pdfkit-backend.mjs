import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
const validPdf=readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url));
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';
function fixtures(){
 class PDFDoc extends EventEmitter {
  end(){this.emit('data',validPdf);this.emit('end');}
 }
 const imports=[],registered=[];
 const Helvetica={family:'Helvetica'};
 const map={pdfkit:{PDFDocument:PDFDoc,registerStdFonts:font=>registered.push(font)},
  'svg-to-pdfkit':{default:()=>{}},'pdfkit/standard-fonts/Helvetica':{default:Helvetica}};
 return {PDFDoc,imports,registered,Helvetica,importer:async name=>{imports.push(name);return map[name];}};
}
test('browser adapter collects binary chunks and exposes actual standard-font registration',async()=>{
 const f=fixtures(),backend=await loadBrowserPdfBackend(f.importer);
 backend.registerStdFonts(backend.Helvetica);
 assert.deepEqual(f.registered,[f.Helvetica]);
 const pdf=new backend.PDFDocument(),pending=backend.toBlob(pdf);pdf.end();
 const blob=await pending;
 assert.equal(blob.type,'application/pdf');assert.match(await blob.text(),/^%PDF-1\.[0-7]/);
 assert.equal(pdf.listenerCount('data'),0);assert.equal(pdf.listenerCount('end'),0);
 assert.equal(pdf.listenerCount('error'),0);
});
test('writer error rejects once and removes pending byte listeners',async()=>{
 const f=fixtures(),backend=await loadBrowserPdfBackend(f.importer);
 const pdf=new backend.PDFDocument(),pending=backend.toBlob(pdf);
 pdf.emit('error',new Error('writer failed'));
 await assert.rejects(pending,/writer failed/);
 pdf.emit('error',new Error('late writer failure'));
 assert.equal(pdf.listenerCount('data'),0);
});
test('browser loader refuses a missing standard-font registration interface',async()=>{
 const f=fixtures();
 await assert.rejects(loadBrowserPdfBackend(async name=>name==='pdfkit'?{PDFDocument:f.PDFDoc}:f.importer(name)),/인터페이스/);
});
test('cancelled pending output discards partial bytes and ignores a late end',async()=>{
 const f=fixtures(),backend=await loadBrowserPdfBackend(f.importer),controller=new AbortController();
 const pdf=new backend.PDFDocument(),pending=backend.toBlob(pdf,controller.signal);
 pdf.emit('data',new Uint8Array([1,2,3]));controller.abort();
 await assert.rejects(pending,{name:'AbortError'});
 pdf.end();pdf.emit('error',new Error('late disposal'));
 assert.equal(pdf.listenerCount('data'),0);assert.equal(pdf.listenerCount('end'),0);
});
test('already cancelled output does not collect document data',async()=>{
 const f=fixtures(),backend=await loadBrowserPdfBackend(f.importer),controller=new AbortController();
 controller.abort();const pdf=new backend.PDFDocument();
 await assert.rejects(backend.toBlob(pdf,controller.signal),{name:'AbortError'});
 assert.equal(pdf.listenerCount('data'),0);assert.equal(pdf.listenerCount('end'),0);
});
test('nonbinary chunks fail instead of producing a corrupt PDF',async()=>{
 const f=fixtures(),backend=await loadBrowserPdfBackend(f.importer);
 const pdf=new backend.PDFDocument(),pending=backend.toBlob(pdf);
 pdf.emit('data','unexpected text');
 await assert.rejects(pending,/바이트 형식/);
});
