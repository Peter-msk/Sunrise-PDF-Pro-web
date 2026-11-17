import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';
import {tryProfessionalDocument} from '../src/svg-professional.js';
import {buildLocalBatchQaReport,localQaErrorCode,localQaStreamReason,localQaStreamIntegrity}
 from '../src/local-batch-qa.mjs';

const fixture=Uint8Array.from(readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url)));
const file=(i,error,phase)=>({
 file:{name:'sensitive-'+i+'.hwp'},state:'failed',error,lastEngine:'professional',
 _proDiagStage:phase,_proDurationMs:130017,_proSourcePages:201,_proLastPage:1
});

test('DEV42 original real 10-file QA failures now keep stable SVG and page count categories',()=>{
 const report=buildLocalBatchQaReport([
  file(5,'SVG_RENDER_SOURCE_CHARS_LIMIT','svg_build'),
  file(8,'PDF_STREAM_TIMEOUT (FINAL_BYTES_NO_END, emitted=628831B, final=44018B/99chunks) [integrity=PDF_OUTPUT_TRAILER_INCOMPLETE]','pdf_stream'),
  file(10,'HWP_PAGE_COUNT_LIMIT: 페이지 수 제한: 1~200쪽 (실제 233쪽)','hwp_page_count')
 ],{generatedAt:'2026-11-18T00:58:00+09:00'});
 assert.deepEqual(report.totals,{queued:3,done:0,failed:3,ready:0,working:0,cancelled:0,invalid:0});
 assert.deepEqual(report.files.map(x=>x.error_code),
  ['SVG_RENDER_SOURCE_CHARS_LIMIT','PDF_STREAM_TIMEOUT','HWP_PAGE_COUNT_LIMIT']);
 assert.equal(report.files[1].stream_reason,'FINAL_BYTES_NO_END');
 assert.equal(report.files[1].stream_integrity,'PDF_OUTPUT_TRAILER_INCOMPLETE');
 assert.equal(report.files[0].last_page,1);
 assert.equal(report.files[2].source_pages,201);
 assert.equal(report.files[2].phase,'hwp_page_count');
 for(const privatePart of ['sensitive','233쪽','628831','44018','sensitive-5.hwp'])
  assert.equal(JSON.stringify(report).includes(privatePart),false,'no raw private strings');
});

test('DEV42 unknown error and unapproved PDF structural categories stay private',()=>{
 assert.equal(localQaErrorCode('HWP_PAGE_COUNT_LIMIT'), 'HWP_PAGE_COUNT_LIMIT');
 assert.equal(localQaErrorCode('FILE_READ_FAILED: local private path'), 'FILE_READ_FAILED');
 assert.equal(localQaErrorCode('HWP_DOCUMENT_OPEN_FAILED: hidden'), 'HWP_DOCUMENT_OPEN_FAILED');
 assert.equal(localQaErrorCode('SVG_RENDER_SOURCE_CHARS_LIMIT'), 'SVG_RENDER_SOURCE_CHARS_LIMIT');
 assert.equal(localQaErrorCode('user/private/file #2'), 'OTHER_ERROR');
 assert.equal(localQaStreamReason('PDF_STREAM_TIMEOUT (NO_BYTES, emitted=0B)'), 'NO_BYTES');
 assert.equal(localQaStreamIntegrity('PDF_STREAM_TIMEOUT (NO_BYTES) [integrity=PRIVATE_CLIENT_ID]'),null);
 assert.equal(localQaStreamIntegrity('just PDF_OUTPUT_HEADER_INVALID'),null);
});
async function backend(){
 return loadBrowserPdfBackend(async name=>{
  if(name==='pdfkit')return {PDFDocument:EventEmitter,registerStdFonts(){}};
  if(name==='svg-to-pdfkit')return {default:()=>{}};
  if(name==='pdfkit/standard-fonts/Helvetica')return {default:{}};
  throw Error('UNEXPECTED_BACKEND '+name);
 });
}
async function convertWithSilentEnd(bytes){
 const b=await backend();
 class NoEndPdf extends EventEmitter{
  registerFont(){}
  end(){this.emit('data',bytes);}
  destroy(){this.destroyed=true;}
 }
 return tryProfessionalDocument({},0,{loadLibraries:async()=>({...b,PDFDocument:NoEndPdf}),
  finalizeTimeoutMs:28});
}
test('DEV42 final timeout probe rescues a verified PDF even when 1s interval never ran',async()=>{
 const r=await convertWithSilentEnd(fixture);
 assert.equal(r.pdf.size,fixture.byteLength);
 assert.equal(r.warnings.length,1);
 assert.match(r.warnings[0],/PDF 종료 신호/);
});

test('DEV42 final timeout probe rejects a deliberately missing trailer',async()=>{
 const truncated=fixture.subarray(0,fixture.length-6);
 await assert.rejects(convertWithSilentEnd(truncated),error=>{
  assert.match(error.message,/^PDF_STREAM_TIMEOUT \(FINAL_BYTES_NO_END,/);
  assert.match(error.message,/integrity=PDF_OUTPUT_TRAILER_INCOMPLETE/);
  return true;
 });
});

test('DEV42 missing completion emits closed structural status, not text from document',async()=>{
 const truncated=fixture.subarray(0,fixture.length-6);
 const api=await backend(),pdf=new EventEmitter(),stream={},terminal={};
 const promise=api.toBlob(pdf,undefined,()=>{},undefined,stream,terminal);
 pdf.emit('data',truncated);
 assert.equal(terminal.tryFinish(),false);
 assert.equal(terminal.lastValidationError,'PDF_OUTPUT_TRAILER_INCOMPLETE');
 pdf.emit('data',fixture.subarray(fixture.length-6));
 assert.equal(terminal.tryFinish(),true);
 assert.equal(terminal.lastValidationError,null);
 assert.equal((await promise).size,fixture.length);
});
