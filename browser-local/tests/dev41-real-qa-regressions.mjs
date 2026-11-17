/** DEV41 regression for actual 10-file browser QA failure classes.
 * This test never reports 132-page visual fidelity or renders customer input:
 * it validates independent conversion gates, explicit recovery planning and
 * a PDFKit terminal-event workaround based on real xref/%%EOF bytes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {MAX_CONVERSION_PAGES,MAX_NATIVE_PRINT_PAGES} from '../src/page-limit.mjs';
import {assertConvertedPdfResult,createPdfOutputGuard} from '../src/pdf-output-integrity.mjs';
import {buildRasterCompatibilityPdf} from '../src/raster-compat-pdf.mjs';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';
import {canRecoverFile,recoveryCode,recoveryEngine,planConversion,localFailureAdvice} from '../src/conversion-recovery.mjs';

const valid=Uint8Array.from(readFileSync(new URL('./fixtures/r66-validated.pdf',import.meta.url)));
const asBlob=()=>new Blob([valid],{type:'application/pdf'});
const failed=(name,error)=>({file:{name},error,state:'failed',lastEngine:'professional'});

test('DEV41 132-page HWP no longer blocked by inconsistent metadata limits',async()=>{
 assert.equal(MAX_CONVERSION_PAGES,200);
 assert.equal(MAX_NATIVE_PRINT_PAGES,120);
 const candidate={pages:132,pdf:asBlob(),bytes:valid.byteLength};
 assert.equal(await assertConvertedPdfResult(candidate),candidate);
 await assert.rejects(assertConvertedPdfResult({...candidate,pages:201}),/PDF_RESULT_PAGE_COUNT_INVALID/);
 const converter=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
 assert.match(converter,/const MAX_PAGES=MAX_CONVERSION_PAGES/);
 assert.match(converter,/pages>MAX_NATIVE_PRINT_PAGES/);
});

test('DEV41 opt-in raster converter accepts 132 bounded pages, blocks page 201',async()=>{
 const pages=[],bytes=new Blob([Uint8Array.of(137,80,78,71,13,10,26,10,0)],{type:'image/png'});
 const doc={renderPageSvgWithProfile:i=>'<svg data-page="'+i+'"/>'};
 const mockPdf={
  embedPng:async()=>({name:'image'}),
  addPage:size=>{pages.push(size);return {drawImage:()=>{}};},
  save:async()=>valid
 };
 const options={
  loadPdfLib:async()=>({PDFDocument:{create:async()=>mockPdf}}),
  preprocessSvg:async svg=>svg,
  rasterPage:async()=>({blob:bytes,widthPt:500,heightPt:700})
 };
 const output=await buildRasterCompatibilityPdf(doc,132,options);
 assert.equal(output.pages,132);
 assert.equal(output.rasterPages,132);
 assert.equal(output.vectorPages,0);
 assert.equal(pages.length,132);
 assert.equal(output.pdf.type,'application/pdf');
 await assert.rejects(buildRasterCompatibilityPdf(doc,201,options),/COMPAT_PAGE_COUNT_INVALID/);
});

test('DEV41 large SVG offers one-file explicit image recovery but no automatic downgrade',()=>{
 const bad=failed('large.hwp','SVG_RENDER_SOURCE_CHARS_LIMIT');
 const done={state:'done',file:{name:'completed.hwp'}};
 assert.equal(recoveryCode(bad.error),'SVG_RENDER_SOURCE_CHARS_LIMIT');
 assert.equal(canRecoverFile(bad),true);
 assert.equal(recoveryEngine(bad),'compat-raster');
 const ordinary=planConversion([done,bad],'professional');
 assert.equal(ordinary.engine,'professional');
 assert.equal(ordinary.recovery,false);
 const requested=planConversion([done,bad],'professional',bad);
 assert.equal(requested.recovery,true);
 assert.equal(requested.engine,'compat-raster');
 assert.deepEqual(requested.pending,[bad]);
 assert.match(localFailureAdvice(bad.error),/메모리/);
});

async function mockedBackend(){
 return loadBrowserPdfBackend(async name=>{
  if(name==='pdfkit')return {PDFDocument:EventEmitter,registerStdFonts(){}};
  if(name==='svg-to-pdfkit')return {default:()=>{}};
  if(name==='pdfkit/standard-fonts/Helvetica')return {default:{}};
  throw Error('Unexpected module '+name);
 });
}
test('DEV41 missing PDFKit end event can recover complete and verified PDF only',async()=>{
 const backend=await mockedBackend(),pdf=new EventEmitter(),progress={},terminal={};
 const result=backend.toBlob(pdf,undefined,()=>{},undefined,progress,terminal);
 pdf.emit('data',valid.subarray(0,150));
 assert.equal(terminal.tryFinish(),false,'truncated stream must stay pending');
 pdf.emit('data',valid.subarray(150));
 assert.equal(terminal.tryFinish(),true,'must validate final startxref/%%EOF first');
 const out=await result;
 assert.deepEqual(Buffer.from(await out.arrayBuffer()),Buffer.from(valid));
 assert.equal(progress.validatedWithoutEnd,true);
 assert.equal(progress.endSeen,false);
 assert.equal(pdf.listenerCount('data'),0);
 assert.equal(pdf.listenerCount('end'),0);
 assert.equal(Object.hasOwn(terminal,'tryFinish'),false,'must not retain closed buffers');
});

test('DEV41 fake complete-looking PDF without valid EOF must not be emitted',async()=>{
 const backend=await mockedBackend(),pdf=new EventEmitter(),ctrl=new AbortController(),terminal={};
 const result=backend.toBlob(pdf,ctrl.signal,()=>{},undefined,null,terminal);
 const broken=Buffer.from(valid);
 const end=broken.lastIndexOf('%%EOF','latin1');assert.ok(end>0);
 broken.write('%%BAD',end,'latin1');
 pdf.emit('data',broken);
 assert.equal(terminal.tryFinish(),false);
 ctrl.abort();
 await assert.rejects(result,{name:'AbortError'});
 assert.equal(Object.hasOwn(terminal,'tryFinish'),false);
});

test('DEV41 normal PDFKit end event still wins and leaves no terminal probe',async()=>{
 const backend=await mockedBackend(),pdf=new EventEmitter(),probe={};
 const result=backend.toBlob(pdf,undefined,()=>{},undefined,null,probe);
 pdf.emit('data',valid);
 pdf.emit('end');
 assert.equal((await result).size,valid.byteLength);
 assert.equal(Object.hasOwn(probe,'tryFinish'),false);
});

test('DEV41 output guard is retryable only after incomplete data, not after success',()=>{
 const part=valid.subarray(0,valid.byteLength-7),tail=valid.subarray(valid.byteLength-7);
 const guard=createPdfOutputGuard();
 guard.append(part);
 assert.throws(()=>guard.finish([part]),/PDF_OUTPUT_TRAILER_INCOMPLETE/);
 guard.append(tail);
 assert.equal(guard.finish([part,tail]).bytes,valid.byteLength);
 assert.throws(()=>guard.finish([part,tail]),/PDF_OUTPUT_ALREADY_FINISHED/);
});

test('DEV41 terminal-polling only starts after pdf.end and requires 2.5s idle',()=>{
 const s=readFileSync(new URL('../src/svg-professional.js',import.meta.url),'utf8');
 const end=s.indexOf('    pdf.end();');
 const start=s.indexOf('terminalCheckTimer=setInterval(');
 assert.ok(end>=0&&start>end);
 assert.match(s,/idle>=2500/);
 assert.match(s,/terminalProbe\.tryFinish\(\)/);
 assert.match(s,/clearInterval\(terminalCheckTimer\)/);
 assert.match(s,/warnings:streamProbe\.validatedWithoutEnd/);
 assert.match(s,/원본 페이지 수·내용·줄바꿈을 확인하세요/);
});
