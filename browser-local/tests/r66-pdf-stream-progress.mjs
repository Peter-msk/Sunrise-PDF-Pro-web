import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
const validPdf=readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url));
function largeValidPdf(){
 const text=validPdf.toString('latin1');
 const m=/startxref\s+(\d+)/.exec(text);if(!m)throw Error('FIXTURE_MISSING_XREF');
 const offset=Number(m[1]);
 const filler=Buffer.from('%'+'x'.repeat(1022)+'\n').toString().repeat(2048);
 const joined=text.slice(0,offset)+filler+text.slice(offset);
 return Buffer.from(joined.replace(/startxref\s+\d+/, 'startxref\n'+(offset+filler.length)),'latin1');
}
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';

class StubPdf extends EventEmitter {}
async function backend(){
 return loadBrowserPdfBackend(async name=>{
  if(name==='pdfkit')return {PDFDocument:StubPdf,registerStdFonts(){}};
  if(name==='svg-to-pdfkit')return {default:()=>{}};
  if(name==='pdfkit/standard-fonts/Helvetica')return {default:{family:'Helvetica'}};
  throw Error('UNEXPECTED_IMPORT');
 });
}
const encoded=s=>new TextEncoder().encode(s);

test('R66-DEV2 PDFKit chunk progress counts real emitted bytes and final end',async()=>{
 const lib=await backend(),pdf=new lib.PDFDocument(),events=[];
 const promise=lib.toBlob(pdf,undefined,data=>events.push(data.bytes));
 const part=validPdf.subarray(0,101);
 pdf.emit('data',part);pdf.emit('data',validPdf.subarray(101));
 pdf.emit('end');
 const blob=await promise;
 assert.equal(blob.size,validPdf.length);
 assert.equal(events.at(-1),blob.size);
 assert.ok(events.every((n,i)=>!i||n>=events[i-1]));
 assert.equal(pdf.listenerCount('data'),0);
 assert.equal(pdf.listenerCount('end'),0);
});
test('R66-DEV2 progress observer error cannot corrupt an otherwise valid PDF stream',async()=>{
 const lib=await backend(),pdf=new lib.PDFDocument();
 const promise=lib.toBlob(pdf,undefined,()=>{throw Error('UI_FAILED');});
 pdf.emit('data',validPdf);pdf.emit('end');
 assert.match(await (await promise).text(),/^%PDF-/);
});
test('R66-DEV2 large chunks produce byte progress without artificial delay',async()=>{
 const lib=await backend(),pdf=new lib.PDFDocument(),progress=[];
 const promise=lib.toBlob(pdf,undefined,meta=>progress.push(meta.bytes));
 const large=largeValidPdf();
 pdf.emit('data',large.subarray(0,1024*1024));
 pdf.emit('data',large.subarray(1024*1024));pdf.emit('end');
 assert.equal((await promise).size,large.length);
 assert.equal(progress.at(-1),large.length);
});
test('R66-DEV2 cancel disposes data/end listeners and rejects',async()=>{
 const lib=await backend(),pdf=new lib.PDFDocument(),controller=new AbortController();
 const promise=lib.toBlob(pdf,controller.signal,()=>{});
 pdf.emit('data',encoded('partial'));
 controller.abort();
 await assert.rejects(promise,error=>error.name==='AbortError');
 assert.equal(pdf.listenerCount('data'),0);
 assert.equal(pdf.listenerCount('end'),0);
});
test('R66-DEV2 malformed PDFKit output chunk fails closed',async()=>{
 const lib=await backend(),pdf=new lib.PDFDocument();
 const promise=lib.toBlob(pdf);
 pdf.emit('data','invalid chunk');
 await assert.rejects(promise,/바이트 형식/);
 assert.equal(pdf.listenerCount('data'),0);
});
