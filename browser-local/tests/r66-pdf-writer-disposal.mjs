import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {linkPdfWriterAbort} from '../src/pdf-stream-abort.mjs';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';

async function backend(){
 return loadBrowserPdfBackend(async name=>{
  if(name==='pdfkit')return {PDFDocument:EventEmitter,registerStdFonts(){}};
  if(name==='svg-to-pdfkit')return {default:()=>{}};
  if(name==='pdfkit/standard-fonts/Helvetica')return {default:{family:'Helvetica'}};
  throw Error('UNEXPECTED_IMPORT '+name);
 });
}

test('DEV4 internal error abort releases PDFKit byte/end listeners without user cancellation',async()=>{
 const pdf=new EventEmitter();
 const api=await backend();
 const writer=linkPdfWriterAbort(undefined);
 const pending=api.toBlob(pdf,writer.signal);
 pdf.emit('data',new Uint8Array(1024));
 writer.abort();
 await assert.rejects(pending,e=>e.name==='AbortError');
 assert.equal(pdf.listenerCount('data'),0);
 assert.equal(pdf.listenerCount('end'),0);
 writer.close();
});

test('DEV4 external user abort propagates to linked writer, but not vice versa',()=>{
 const user=new AbortController();
 const writer=linkPdfWriterAbort(user.signal);
 writer.abort();
 assert.equal(writer.signal.aborted,true);
 assert.equal(user.signal.aborted,false);
 writer.close();
 const another=linkPdfWriterAbort(user.signal);
 user.abort();
 assert.equal(another.signal.aborted,true);
 another.close();
});

test('DEV4 already-aborted user signal creates an already-aborted writer signal',()=>{
 const user=new AbortController();user.abort();
 const writer=linkPdfWriterAbort(user.signal);
 assert.equal(writer.signal.aborted,true);
 writer.close();
});

test('DEV4 successful PDF stream does not abort the external signal or writer',async()=>{
 const pdf=new EventEmitter();
 const api=await backend();
 const user=new AbortController();
 const writer=linkPdfWriterAbort(user.signal);
 const pending=api.toBlob(pdf,writer.signal);
 pdf.emit('data',new Uint8Array(readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url))));
 pdf.emit('end');
 const blob=await pending;
 assert.ok(blob.size>0);
 assert.equal(writer.signal.aborted,false);
 assert.equal(user.signal.aborted,false);
 writer.close();
});

test('DEV4 close is idempotent, and previous signal no longer controls writer',()=>{
 const user=new AbortController();
 const writer=linkPdfWriterAbort(user.signal);
 writer.close();writer.close();
 user.abort();
 assert.equal(writer.signal.aborted,false);
});
