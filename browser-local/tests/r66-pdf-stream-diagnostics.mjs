/** R66 PDF stream lifecycle: local-only byte evidence, leak-free cleanup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';
import {tryProfessionalDocument} from '../src/svg-professional.js';
import {recoveryCode} from '../src/conversion-recovery.mjs';

const fixture=new Uint8Array(readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url)));
async function backend(PdfType=EventEmitter){
 return loadBrowserPdfBackend(async name=>{
  if(name==='pdfkit')return {PDFDocument:PdfType,registerStdFonts(){}};
  if(name==='svg-to-pdfkit')return {default:()=>{}};
  if(name==='pdfkit/standard-fonts/Helvetica')return {default:{}};
  throw Error('UNEXPECTED_PDF_MODULE '+name);
 });
}
test('complete PDF records exact bytes and chunks; success clears all listeners',async()=>{
 const api=await backend(),pdf=new EventEmitter(),state={};
 const pending=api.toBlob(pdf,undefined,()=>{},undefined,state);
 const cut=53;pdf.emit('data',fixture.subarray(0,cut));pdf.emit('data',fixture.subarray(cut));
 pdf.emit('end');
 const blob=await pending;
 assert.equal(blob.size,fixture.byteLength);
 assert.equal(state.bytes,fixture.byteLength);
 assert.equal(state.chunks,2);
 assert.equal(state.endSeen,true);
 assert.equal(state.errorSeen,false);
 assert.equal(state.abortSeen,false);
 assert.ok(state.lastChunkAt>0);
 for(const event of ['data','end','error'])assert.equal(pdf.listenerCount(event),0);
});

test('a failed PDF releases original error callback and retains only one shared terminal listener',async()=>{
 const api=await backend(),pdf=new EventEmitter(),abort=new AbortController(),state={};
 const pending=api.toBlob(pdf,abort.signal,()=>{},undefined,state);
 pdf.emit('data',new Uint8Array([1,2,3,4]));
 abort.abort();
 await assert.rejects(pending,{name:'AbortError'});
 assert.equal(state.bytes,4);assert.equal(state.chunks,1);
 assert.equal(state.abortSeen,true);assert.equal(state.endSeen,false);
 assert.equal(pdf.listenerCount('data'),0);assert.equal(pdf.listenerCount('end'),0);
 assert.equal(pdf.listenerCount('error'),1);
 assert.doesNotThrow(()=>pdf.emit('error',new Error('LATE_PDFKIT_DESTROY_ERROR')));
});

test('a writer error is not mistaken for a missing end and late teardown cannot throw',async()=>{
 const api=await backend(),pdf=new EventEmitter(),state={};
 const pending=api.toBlob(pdf,undefined,()=>{},undefined,state);
 pdf.emit('error',new Error('PDF_WRITER_ERROR'));
 await assert.rejects(pending,/PDF_WRITER_ERROR/);
 assert.equal(state.errorSeen,true);
 assert.equal(state.endSeen,false);
 assert.equal(pdf.listenerCount('data'),0);assert.equal(pdf.listenerCount('end'),0);
 assert.doesNotThrow(()=>pdf.emit('error',new Error('LATE_ERROR')));
});

test('invalid internal stream probe rejected before attaching writer listeners',async()=>{
 const api=await backend(),pdf=new EventEmitter();
 await assert.rejects(api.toBlob(pdf,undefined,undefined,undefined,7),/PDF_STREAM_PROBE_INVALID/);
 assert.equal(pdf.listenerCount('data'),0);
 assert.equal(pdf.listenerCount('end'),0);
});

async function incomplete(mode){
 let instance;
 class StalledPdf extends EventEmitter{
  constructor(){super();instance=this;this.wasDestroyed=false;}
  on(name,callback){
   const result=super.on(name,callback);
   // This models bytes emitted while rendering a page, before pdf.end().
   if(mode==='before-end'&&name==='end')
    this.emit('data',new Uint8Array([7,8,9,10,11]));
   return result;
  }
  end(){
   if(mode==='after-end')this.emit('data',new Uint8Array([1,2,3,4,5,6,7]));
   // Deliberately omit the end event to reproduce an actual stream stall.
  }
  destroy(){
   this.wasDestroyed=true;
   this.emit('error',new Error('LATE_TEARDOWN_ERROR'));
  }
 }
 const lib=await backend(StalledPdf);
 const result=tryProfessionalDocument({},0,{
  loadLibraries:async()=>lib,
  finalizeTimeoutMs:22
 });
 const error=await result.then(
  ()=>{throw Error('INCOMPLETE_STREAM_WAS_ACCEPTED');},e=>e
 );
 assert.equal(instance.wasDestroyed,true);
 assert.equal(instance.listenerCount('data'),0);
 assert.equal(instance.listenerCount('end'),0);
 assert.equal(instance.listenerCount('error'),1);
 assert.equal(recoveryCode(error),'PDF_STREAM_TIMEOUT');
 assert.doesNotMatch(error.message,/LATE_TEARDOWN_ERROR/);
 return error;
}
test('no streamed bytes before timeout reports NO_BYTES and preserves recovery code',async()=>{
 const error=await incomplete('never');
 assert.match(error.message,/PDF_STREAM_TIMEOUT \(NO_BYTES, emitted=0B, final=0B\/0chunks\)/);
});
test('bytes before pdf.end but no final bytes are explicitly distinguished',async()=>{
 const error=await incomplete('before-end');
 assert.match(error.message,/PDF_STREAM_TIMEOUT \(NO_FINAL_BYTES, emitted=5B, final=0B\/0chunks/);
});
test('bytes from pdf.end without terminal end event are explicitly distinguished',async()=>{
 const error=await incomplete('after-end');
 assert.match(error.message,/PDF_STREAM_TIMEOUT \(FINAL_BYTES_NO_END, emitted=7B, final=7B\/1chunks/);
});
test('unsanitized document identifiers never become part of stream error classification',async()=>{
 const error=await incomplete('never');
 const keys=Object.keys(error);
 assert.ok(!keys.includes('fileName')&&!keys.includes('documentText'));
 assert.equal(recoveryCode(error),'PDF_STREAM_TIMEOUT');
});
