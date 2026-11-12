import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {createPdfOutputGuard,assertCompletePdfBytes} from '../src/pdf-output-integrity.mjs';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';
const pdf=readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url));
const bytes=()=>new Uint8Array(pdf);
const encoder=new TextEncoder();
class StreamPdf extends EventEmitter{destroy(){this.destroyed=true;}}
async function backend(){return loadBrowserPdfBackend(async name=>{
 if(name==='pdfkit')return {PDFDocument:StreamPdf,registerStdFonts(){}};
 if(name==='svg-to-pdfkit')return {default:()=>{}};
 if(name==='pdfkit/standard-fonts/Helvetica')return {default:{}};
 throw Error(name);
});}

// These are structural checks; the fixture is also read by PyMuPDF and pypdf
// in the external acceptance script. Do not overstate as PDF parse validation.
test('real two-page PDF has complete header/startxref/EOF',()=>{
 const b=bytes(),r=assertCompletePdfBytes(b);
 assert.equal(r,b);
});
test('one-byte streaming chunks work across boundary tokens',()=>{
 const guard=createPdfOutputGuard(),parts=[];
 for(const n of bytes()){const part=new Uint8Array([n]);guard.append(part);parts.push(part);}
 assert.equal(guard.finish(parts).bytes,pdf.length);
});
test('uneven streaming chunk boundaries preserve tail and exact length',()=>{
 const guard=createPdfOutputGuard();const b=bytes();
 let i=0;
 for(const step of [1,5,3,512,11,99,123,2048]){
  guard.append(b.subarray(i,Math.min(b.length,i+step)));
  i=Math.min(b.length,i+step);
 }
 guard.append(b.subarray(i));
 assert.equal(guard.bytes,b.length);assert.equal(guard.finish([b]).bytes,b.length);
});
test('valid PDF with harmless trailing linebreaks remains supported',()=>{
 const b=bytes();
 assertCompletePdfBytes(new Uint8Array([...b,10,13,10]));
});
test('missing entire PDF body fails header check',()=>{
 assert.throws(()=>assertCompletePdfBytes(encoder.encode('image/png\0'.repeat(9))),/PDF_OUTPUT_HEADER_INVALID/);
});
test('truncated final PDF EOF fails closed',()=>{
 const b=bytes();
 const text=Buffer.from(b).toString('latin1');
 const end=text.lastIndexOf('%%EOF');assert.ok(end>=0);
 assert.throws(()=>assertCompletePdfBytes(b.subarray(0,end)),/PDF_OUTPUT_TRAILER_INCOMPLETE/);
});
test('header-only stream is not accepted as completed PDF',()=>{
 assert.throws(()=>assertCompletePdfBytes(encoder.encode('%PDF-1.7\n'+'x'.repeat(70))),/PDF_OUTPUT_TRAILER_INCOMPLETE/);
});
test('fake EOF without startxref is rejected',()=>{
 assert.throws(()=>assertCompletePdfBytes(encoder.encode('%PDF-1.7\n'+'.'.repeat(100)+'\n%%EOF\n')),/PDF_OUTPUT_TRAILER_INCOMPLETE/);
});
test('out of bounds xref offset fails closed',()=>{
 const b=bytes();const s=Buffer.from(b).toString('latin1');
 const mutated=encoder.encode(s.replace(/startxref\s+[0-9]+\s+%%EOF/,'startxref\n999999999\n%%EOF'));
 assert.throws(()=>assertCompletePdfBytes(mutated),/PDF_OUTPUT_XREF_OFFSET_INVALID/);
});
test('no unbounded output exceeds a byte budget',()=>{
 assert.throws(()=>assertCompletePdfBytes(bytes(),100),/PDF_OUTPUT_BYTES_LIMIT/);
 assert.throws(()=>createPdfOutputGuard(513*1024*1024),/PDF_OUTPUT_BUDGET_INVALID/);
});
test('finish cannot be called twice or append after finish',()=>{
 const g=createPdfOutputGuard();g.append(bytes());g.finish(bytes());
 assert.throws(()=>g.finish(),/ALREADY_FINISHED/);
 assert.throws(()=>g.append(bytes()),/ALREADY_FINISHED/);
});
test('the PDFKit browser output path rejects a truncated stream at end',async()=>{
 const b=await backend(),pdf=new StreamPdf(),pending=b.toBlob(pdf);
 pdf.emit('data',encoder.encode('%PDF-1.7\ntruncated'));
 pdf.emit('end');
 await assert.rejects(pending,/PDF_OUTPUT_TRAILER_INCOMPLETE|PDF_OUTPUT_HEADER_INVALID/);
 assert.equal(pdf.listenerCount('data'),0);assert.equal(pdf.listenerCount('end'),0);
});
test('the PDFKit browser output path returns a real two-page PDF Blob',async()=>{
 const b=await backend(),stream=new StreamPdf(),events=[];
 const pending=b.toBlob(stream,undefined,p=>events.push(p.bytes));
 const input=bytes();
 stream.emit('data',input.subarray(0,5));
 stream.emit('data',input.subarray(5,1000));
 stream.emit('data',input.subarray(1000));
 stream.emit('end');
 const blob=await pending;
 assert.equal(blob.size,input.length);assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),input);
 assert.equal(events.at(-1),input.length);
});
test('PDFKit chunk size budget and cancellation protections remain active',async()=>{
 const lib=await backend(),stream=new StreamPdf();const pending=lib.toBlob(stream,undefined,()=>{},100);
 stream.emit('data',bytes());
 await assert.rejects(pending,/PDF_STREAM_OUTPUT_BYTES_LIMIT/);
 assert.equal(stream.destroyed,true);
 const ctrl=new AbortController(),next=new StreamPdf();const p2=lib.toBlob(next,ctrl.signal);
 next.emit('data',bytes().subarray(0,24));ctrl.abort();
 await assert.rejects(p2,{name:'AbortError'});
});
