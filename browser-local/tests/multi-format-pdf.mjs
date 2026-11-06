import '../scripts/create-format-fixtures.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';import {PDFDocument} from 'pdf-lib';import fontkit from '@pdf-lib/fontkit';import * as XLSX from 'xlsx';
import {planSheet,drawSheetPages} from '../src/spreadsheet-pdf.js';import {imagePdfBytes} from '../src/image-pdf.js';
const output=resolve(import.meta.dirname,'../../artifacts/multi-format-core');mkdirSync(output,{recursive:true});
test('XLS/XLSX real PDF writer preserves 70 rows, merges and Korean text over several pages',async()=>{
 const fontBytes=readFileSync(new URL('../public/fonts/NanumGothic-Regular.ttf',import.meta.url));
 for(const ext of ['xls','xlsx']){
  const input=resolve(import.meta.dirname,'../../artifacts/multi-format/table.'+ext);
  const wb=XLSX.read(readFileSync(input),{type:'buffer',cellStyles:true,cellNF:true,cellText:true});
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(fontBytes,{subset:false});const plan=[];
  for(let i=0;i<wb.SheetNames.length;i++)if(!wb.Workbook?.Sheets?.[i]?.Hidden){const n=wb.SheetNames[i];plan.push(...planSheet(wb.Sheets[n],n,XLSX,font));}
  await drawSheetPages(pdf,plan,font);const bytes=await pdf.save();const file=resolve(output,'table-'+ext+'.pdf');writeFileSync(file,bytes);
  assert.equal(plan.length,3);const decoded=await PDFDocument.load(bytes);assert.equal(decoded.getPageCount(),3);
  if(!spawnSync('pdftotext',['-v']).error){const result=spawnSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});assert.equal(result.status,0);assert.ok(result.stdout.includes('매출 현황'));assert.ok(result.stdout.includes('서울 70'));assert.ok(result.stdout.includes('2,982,000'));assert.ok(!result.stdout.includes('숨김 내용'));
   const raster=spawnSync('pdftoppm',['-gray','-r','72','-f','1','-singlefile',file],{maxBuffer:4*1024*1024});assert.equal(raster.status,0);
   const header=/^P5\s+\d+\s+\d+\s+255\s/.exec(raster.stdout.toString('latin1'));assert.ok(header);
   const dark=raster.stdout.subarray(header[0].length).reduce((sum,n)=>sum+(n<100?1:0),0);
   assert.ok(dark>1000,'Rendered glyphs disappeared even though text extraction passed');
  }
 }
});
test('image PDF writer keeps alpha image and A4 aspect ratio without producing extra pages',async()=>{
 const bytes=await imagePdfBytes(readFileSync(new URL('../../artifacts/multi-format/alpha-test.png',import.meta.url)),2,1);
 const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);assert.equal(pdf.getPage(0).getWidth(),841.89);writeFileSync(resolve(output,'transparent.pdf'),bytes);
 const c=new AbortController();c.abort();await assert.rejects(imagePdfBytes(new Uint8Array(),1,1,c.signal),{name:'AbortError'});
});
