import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unzipSync,strFromU8} from 'fflate';
import {MAX_CONVERSION_PAGES,MAX_NATIVE_PRINT_PAGES} from '../src/page-limit.mjs';
import {createPdfOutputGuard} from '../src/pdf-output-integrity.mjs';
import {makePdfArchive,runBatch} from '../src/batch.js';
import {planSheet} from '../src/spreadsheet-pdf.js';

test('DEV62 no fixed page count for conversion and native print',()=>{
 assert.equal(MAX_CONVERSION_PAGES,Number.MAX_SAFE_INTEGER);
 assert.equal(MAX_NATIVE_PRINT_PAGES,Number.MAX_SAFE_INTEGER);
 assert.ok(201<MAX_CONVERSION_PAGES);
});
test('DEV62 no default 512MiB ceiling, optional explicit bounds still enforced',()=>{
 assert.equal(createPdfOutputGuard(513*1024*1024).bytes,0);
 assert.throws(()=>createPdfOutputGuard(0),/PDF_OUTPUT_BUDGET_INVALID/);
});
test('DEV62 stream ZIP without reading whole PDF even above previous 256MiB metadata',async()=>{
 class LogicalLargePdf extends Blob{
  get size(){return 270*1024*1024;}
  async arrayBuffer(){throw Error('UNEXPECTED_WHOLE_PDF_COPY');}
 }
 const pdf=new LogicalLargePdf(['original']);
 const items=[{file:{name:'한글.hwpx'},state:'done',result:{pdf}}];
 const archive=await makePdfArchive(items);
 const entries=unzipSync(new Uint8Array(await archive.arrayBuffer()));
 assert.equal(strFromU8(entries['한글.pdf']),'original');
});
test('DEV62 queue processes 240 files in order without a fixed count gate',async()=>{
 const items=Array.from({length:240},(_,i)=>({file:{name:'doc-'+i+'.hwp'},state:'ready'})),calls=[];
 await runBatch(items,async f=>{calls.push(f.name);return {pdf:new Blob([f.name])};});
 assert.equal(calls.length,240);assert.ok(items.every(x=>x.state==='done'));
});
test('DEV62 sheet pagination retains more than 120 pages with no truncation',()=>{
 const xlsx={utils:{
  decode_range:()=>({s:{r:0,c:0},e:{r:4999,c:0}}),
  encode_cell:({r})=>'A'+(r+1),
  format_cell:c=>String(c.v??'')
 }};
 const sheet={'!ref':'A1:A5000',A1:{v:'첫째'},A5000:{v:'끝'}};
 const font={widthOfTextAtSize:(s,size)=>s.length*size*.5};
 const pages=planSheet(sheet,'긴시트',xlsx,font);
 assert.ok(pages.length>120,'actual pages '+pages.length);
 const printed=pages.flatMap(p=>p.cells.flatMap(c=>c.lines));
 assert.ok(printed.includes('첫째')&&printed.includes('끝'));
});
test('DEV62 technical output diagnostics removed, core QA export still available',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="quality-detail"|<div class="notice"><b>출력 안내<\/b>/);
 assert.doesNotMatch(ui,/PDF 글꼴 확인|PDF 벡터 품질 확인|fontAuditMessage|qualityAuditMessage/);
 assert.match(html,/id="preview"/);
 assert.match(html,/id="active-download"/);
 assert.match(html,/id="qa-export"/);
});
