import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {createPdfOutputGuard,assertCompletePdfBytes} from '../src/pdf-output-integrity.mjs';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';

const classic=readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url));
const stream=readFileSync(new URL('./fixtures/r66-xref-stream.pdf',import.meta.url));
function ptr(b){const m=/startxref\s+(\d+)/.exec(b.toString('latin1'));return Number(m?.[1]);}
function changedPointer(b,pointer){return Buffer.from(b.toString('latin1').replace(/startxref\s+\d+/,`startxref\n${pointer}`),'latin1');}
function guardParts(parts){const g=createPdfOutputGuard();for(const part of parts)g.append(part);return g.finish(parts);}
class StreamPdf extends EventEmitter{destroy(){this.destroyed=true;}}
async function backend(){return loadBrowserPdfBackend(async name=>{
 if(name==='pdfkit')return {PDFDocument:StreamPdf,registerStdFonts(){}};
 if(name==='svg-to-pdfkit')return {default:()=>{}};
 if(name==='pdfkit/standard-fonts/Helvetica')return {default:{}};
 throw Error(name);
});}

test('classic xref points to the actual xref keyword',()=>{
 assert.equal(guardParts([classic]).xrefKind,'table');
 assert.equal(assertCompletePdfBytes(classic),classic);
});
test('PDF 1.5+ xref stream points to an indirect /Type /XRef object',()=>{
 assert.equal(guardParts([stream]).xrefKind,'stream');
 assert.equal(assertCompletePdfBytes(stream),stream);
});
test('a valid numeric offset into the PDF header is not accepted',()=>{
 const bad=changedPointer(classic,12);
 assert.throws(()=>assertCompletePdfBytes(bad),/PDF_OUTPUT_XREF_TARGET_INVALID/);
});
test('a valid numeric offset into a PDF body is not accepted for xref-stream fixture',()=>{
 const bad=changedPointer(stream,100);
 assert.throws(()=>assertCompletePdfBytes(bad),/PDF_OUTPUT_XREF_TARGET_INVALID/);
});
test('fake xref stream object without /Type /XRef fails closed',()=>{
 const bad=Buffer.from(stream);
 const offset=ptr(bad);const position=bad.indexOf('/Type/XRef',offset,'latin1');
 assert.ok(position>0);
 bad.write('/Type/Fake',position,'latin1');
 assert.throws(()=>assertCompletePdfBytes(bad),/PDF_OUTPUT_XREF_TARGET_INVALID/);
});
test('xref keyword cannot be a longer fake xref-not-table token',()=>{
 const bad=Buffer.from(classic);
 bad.write('xrefX',ptr(bad),'latin1');
 assert.throws(()=>assertCompletePdfBytes(bad),/PDF_OUTPUT_XREF_TARGET_INVALID/);
});
test('odd chunk sizes spanning actual xref boundaries are supported',()=>{
 for(const source of [classic,stream]){
  const p=ptr(source),splits=[0,8,9,111,p-1,p+1,p+3,source.length-9,source.length];
  const parts=[];let last=0;
  for(const n of splits){if(n>last){parts.push(source.subarray(last,n));last=n;}}
  assert.equal(guardParts(parts).bytes,source.length);
 }
});
test('one-byte chunk streams retain exact absolute xref offset',()=>{
 const parts=Array.from(classic,x=>Uint8Array.of(x));
 assert.equal(guardParts(parts).xrefOffset,ptr(classic));
});
test('streaming xref source mismatch is rejected, not accepted',()=>{
 const g=createPdfOutputGuard();g.append(classic);
 assert.throws(()=>g.finish([classic.subarray(0,-4)]),/PDF_OUTPUT_XREF_SOURCE_MISMATCH/);
});
test('no source is rejected instead of silently skipping xref target validation',()=>{
 const g=createPdfOutputGuard();g.append(classic);
 assert.throws(()=>g.finish(),/PDF_OUTPUT_XREF_SOURCE_REQUIRED/);
});
test('non-Uint8Array source is rejected',()=>{
 const g=createPdfOutputGuard();g.append(classic);
 assert.throws(()=>g.finish([null,Buffer.from(classic)]),/PDF_OUTPUT_XREF_SOURCE_MISMATCH/);
});
test('the PDFKit browser stream enforces xref validation before returning a Blob',async()=>{
 const lib=await backend(),s=new StreamPdf();const pending=lib.toBlob(s);
 s.emit('data',changedPointer(classic,12));s.emit('end');
 await assert.rejects(pending,/PDF_OUTPUT_XREF_TARGET_INVALID/);
 assert.equal(s.listenerCount('data'),0);
});
test('the PDFKit browser stream supports PDF 1.5+ xref stream chunks',async()=>{
 const lib=await backend(),s=new StreamPdf();const pending=lib.toBlob(s);
 for(let pos=0;pos<stream.length;pos+=13)s.emit('data',stream.subarray(pos,pos+13));
 s.emit('end');const blob=await pending;
 assert.equal(blob.size,stream.length);
 assert.deepEqual(Buffer.from(await blob.arrayBuffer()),stream);
});
test('output size cap and cancellation protections are unchanged',async()=>{
 const lib=await backend(),s=new StreamPdf(),pending=lib.toBlob(s,undefined,()=>{},32);
 s.emit('data',classic);
 await assert.rejects(pending,/PDF_STREAM_OUTPUT_BYTES_LIMIT/);
 assert.equal(s.destroyed,true);
});

test('fake xref table with no valid subsection header is not accepted',()=>{
 const bad=Buffer.from(classic);
 bad.write('xref\nA B',ptr(bad),'latin1');
 assert.throws(()=>assertCompletePdfBytes(bad),/PDF_OUTPUT_XREF_TARGET_INVALID/);
});
test('xref stream without required /W widths fails closed',()=>{
 const bad=Buffer.from(stream);
 const index=bad.indexOf('/W[',ptr(bad),'latin1');assert.ok(index>0);
 bad.write('/Q[',index,'latin1');
 assert.throws(()=>assertCompletePdfBytes(bad),/PDF_OUTPUT_XREF_TARGET_INVALID/);
});
test('2 MiB payload can be checked at an adjusted xref offset without copying the full payload',()=>{
 const offset=ptr(classic),filler=Buffer.from('%'+'.'.repeat(1022)+'\n','latin1');
 const old=Buffer.from(classic.subarray(offset)).toString('latin1');
 const marker=old.match(/startxref\s+\d+/);assert.ok(marker);
 const updated=old.replace(/startxref\s+\d+/,`startxref\n${offset+2048*filler.length}`);
 const payload=Buffer.concat([classic.subarray(0,offset),Buffer.concat(Array(2048).fill(filler)),Buffer.from(updated,'latin1')]);
 const chunks=[];for(let i=0;i<payload.length;i+=32769)chunks.push(payload.subarray(i,i+32769));
 assert.equal(guardParts(chunks).bytes,payload.length);
 assert.equal(assertCompletePdfBytes(payload),payload);
});
