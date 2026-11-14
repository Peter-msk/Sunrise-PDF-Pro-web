import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertCompletePdfBlob,assertCompletePdfBytes,assertConvertedPdfResult} from '../src/pdf-output-integrity.mjs';
import {safeConversionProgress} from '../src/conversion-progress.mjs';

const fixture=name=>new Uint8Array(readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const blob=bytes=>new Blob([bytes],{type:'application/pdf'});

test('both classic and xref-stream complete PDFs pass sparse Blob guard',async()=>{
 for(const name of ['r66-validated.pdf','r66-xref-stream.pdf']){
  const b=fixture(name);
  assertCompletePdfBytes(b);
  const output=blob(b);assert.equal(await assertCompletePdfBlob(output),output);
 }
});

test('truncated PDF and false EOF are rejected',async()=>{
 const valid=fixture('r66-validated.pdf');
 const end=Buffer.from(valid).lastIndexOf('%%EOF');
 await assert.rejects(assertCompletePdfBlob(blob(valid.subarray(0,end))),/PDF_OUTPUT_TRAILER_INCOMPLETE/);
 await assert.rejects(assertCompletePdfBlob(blob(Buffer.from('%PDF-1.7\n'+'x'.repeat(150)+'\n%%EOF\n'))),/PDF_OUTPUT_TRAILER_INCOMPLETE/);
});

test('valid PDF xref pointer must reference real xref not PDF body',async()=>{
 const valid=Buffer.from(fixture('r66-validated.pdf'));
 const s=valid.toString('latin1').replace(/startxref\s+\d+/,'startxref\n12');
 await assert.rejects(assertCompletePdfBlob(blob(Buffer.from(s,'latin1'))),/PDF_OUTPUT_XREF_TARGET_INVALID/);
});

test('cancellation and invalid payload fail closed',async()=>{
 await assert.rejects(assertCompletePdfBlob(null),/PDF_OUTPUT_BLOB_REQUIRED/);
 const signal=new AbortController();signal.abort();
 await assert.rejects(assertCompletePdfBlob(blob(fixture('r66-validated.pdf')),signal.signal),{name:'AbortError'});
 await assert.rejects(assertCompletePdfBlob(blob(fixture('r66-validated.pdf')),undefined,70),/PDF_OUTPUT_BYTES_LIMIT/);
});

test('sparse Blob guard never reads entire PDF into one ArrayBuffer',async()=>{
 const bytes=fixture('r66-validated.pdf'),slices=[];
 class MonitoredBlob extends Blob{
  slice(...args){const part=super.slice(...args);slices.push(part.size);return part;}
 }
 const sample=new MonitoredBlob([bytes],{type:'application/pdf'});
 await assertCompletePdfBlob(sample);
 assert.equal(slices.length,3);
 assert.ok(slices.every(size=>size<=4096));
});

test('all format results require self-consistent pages, bytes and complete PDF structure',async()=>{
 const valid=fixture('r66-validated.pdf');
 for(const format of ['professional','mixed','raster-compat','spreadsheet-text','source-image']){
  const b=blob(valid),out={pdf:b,pages:2,bytes:b.size,renderMode:format};
  assert.equal(await assertConvertedPdfResult(out),out);
  await assert.rejects(assertConvertedPdfResult({...out,pages:0}),/PDF_RESULT_PAGE_COUNT_INVALID/);
  await assert.rejects(assertConvertedPdfResult({...out,bytes:b.size+1}),/PDF_RESULT_BYTES_MISMATCH/);
 }
 const corrupt=blob(valid.subarray(0,-20));
 await assert.rejects(assertConvertedPdfResult({pdf:corrupt,pages:2,bytes:corrupt.size}),
  /PDF_OUTPUT_TRAILER_INCOMPLETE/);
});

test('progress display exception never reaches conversion and never logs its content',()=>{
 const seen=[],warnings=[],original=console.warn;
 console.warn=(...args)=>warnings.push(args);
 try{
  const progress=safeConversionProgress(({stage})=>{
   seen.push(stage);
   if(stage==='render')throw new Error('private-example-filename.xlsx');
  });
  for(const stage of ['load','render','pdf'])assert.doesNotThrow(()=>progress({stage}));
  assert.deepEqual(seen,['load','render','pdf']);
  assert.deepEqual(warnings,[['CONVERSION_PROGRESS_OBSERVER_FAILED','Error']]);
 }finally{console.warn=original;}
});
