/** R66-DEV9 — browser own-engine stream phase contract; no native COM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/svg-professional.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const hit=source.match(/pending=toBlob\(pdf,writerAbort\.signal,\(\{bytes\}\)=>\{([\s\S]*?)\n    \}\);/);
assert(hit,'R66_DEV9_PDF_BYTE_CALLBACK_MISSING');
// Evaluate the actual callback body, without loading PDFKit, rhwp or the DOM.
const callback=(observer,{count=12,page=12,finalizing=false}={})=>
  new Function('onProgress','count','currentPdfPage','reportingFinalStream',
    `return ({bytes})=>{${hit[1]}\n};`)
    (observer,count,page,finalizing);

test('PDF bytes during final page drawing have pdf_write phase',()=>{
  const output=[];
  callback(e=>output.push(e))({bytes:1_048_576});
  assert.deepEqual(output,[{stage:'professional',page:12,total:12,detail:'pdf_write',bytes:1_048_576}]);
});
test('only finalization bytes have pdf_stream phase',()=>{
  const output=[];
  callback(e=>output.push(e),{finalizing:true})({bytes:2_048_576});
  assert.deepEqual(output,[{stage:'professional',page:12,total:12,detail:'pdf_stream',bytes:2_048_576}]);
});
test('byte events retain the current SVG page',()=>{
  const output=[];
  callback(e=>output.push(e),{page:3})({bytes:200});
  assert.equal(output[0].page,3);
});
test('a broken UI callback must not fail PDFKit emission',()=>{
  assert.doesNotThrow(()=>callback(()=>{throw Error('UI_FAIL')})({bytes:1024}));
});
test('conversion stage labels distinguish write and finalization',()=>{
  assert.match(ui,/pdf_write:'페이지 PDF 작성 중'/);
  assert.match(ui,/pdf_stream:'PDF 바이트 생성 중'/);
  assert.match(ui,/info\.detail==='pdf_write'/);
});
test('PDF completion event remains after header validation',()=>{
  assert.ok(source.indexOf("PROFESSIONAL_PDF_INVALID_HEADER")<
    source.lastIndexOf("detail:'pdf_done'"));
});
