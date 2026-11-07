import test from 'node:test';import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';import {inputKind,verifyOtherHeader} from '../src/input-types.js';
import {uniquePdfNames} from '../src/batch.js';import {imagePlacement,imageDecodeTarget,pngDimensions} from '../src/image-pdf.js';import {planSheet} from '../src/spreadsheet-pdf.js';
const font={widthOfTextAtSize:(text,size)=>Array.from(text).length*size*.55};
test('formats and magic signatures do not trust extensions alone',()=>{
 assert.equal(inputKind({name:'A.XLSX'}),'xlsx');assert.equal(inputKind({name:'a.exe'}),null);
 verifyOtherHeader('png',Uint8Array.from([137,80,78,71,13,10,26,10]).buffer);
 assert.throws(()=>verifyOtherHeader('xls',new Uint8Array(8).buffer));assert.throws(()=>verifyOtherHeader('jpg',new Uint8Array(8).buffer));
 assert.deepEqual(uniquePdfNames(['a.xls','a.png','a.xlsx','a.jpg'].map(name=>({name}))),['a.pdf','a (2).pdf','a (3).pdf','a (4).pdf']);
});
test('image placement preserves aspect ratio and margins in portrait and landscape',()=>{
 for(const [w,h] of [[1000,500],[500,1000],[10,10]]){const p=imagePlacement(w,h);assert.ok(Math.abs(p.width/p.height-w/h)<.0001);assert.ok(p.x>=23.99&&p.y>=23.99);}
 assert.throws(()=>imagePlacement(100000,100000));
});
test('R43 huge PNG IHDR is resized before decode instead of failing at 80 megapixels',()=>{
 const header=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,
   0,0,78,32,0,0,39,16]);
 const dims=pngDimensions(header);assert.deepEqual(dims,{width:20000,height:10000});
 const plan=imageDecodeTarget(dims.width,dims.height);
 assert.equal(plan.resized,true);assert.ok(plan.width*plan.height<=16_000_000);
 assert.ok(Math.abs(plan.width/plan.height-2)<.01);
 assert.ok(imagePlacement(plan.width,plan.height).width>0);
 assert.equal(imageDecodeTarget(2000,1000).resized,false);
 assert.equal(pngDimensions(new Uint8Array(24)),null);
});

test('real XLS and XLSX encoding preserves formatted cells and merged cell width in parser',()=>{
 const sheet=XLSX.utils.aoa_to_sheet([['매출표',null],['항목','금액'],['서울',1200]]);sheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:1}}];sheet.B3.z='#,##0';
 for(const bookType of ['biff8','xlsx']){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'매출');const data=XLSX.write(wb,{type:'array',bookType});const parsed=XLSX.read(data,{type:'array',cellStyles:true});const plan=planSheet(parsed.Sheets['매출'],'매출',XLSX,font);assert.equal(plan.length,1);assert.equal(plan[0].cells[0].endC,1);assert.equal(plan[0].cells.at(-1).lines.join(''),'1,200');}
});
test('long sheet paginates without losing a row and row-span merges stay together',()=>{
 const rows=Array.from({length:100},(_,i)=>['R'+i,'값'+i]);const s=XLSX.utils.aoa_to_sheet(rows);s['!merges']=[{s:{r:31,c:0},e:{r:34,c:0}}];for(let r=32;r<=34;r++)delete s['A'+(r+1)];
 const plan=planSheet(s,'긴 시트',XLSX,font);assert.ok(plan.length>1);const values=plan.flatMap(p=>p.cells.flatMap(c=>c.lines));for(let i=0;i<100;i++)assert.ok(values.includes('값'+i));assert.ok(plan.some(p=>p.cells.some(c=>c.lines.includes('R31')&&c.endR-c.r===3)));
});
test('uncomputed formulas, too-wide sheets and oversize merged blocks fail instead of clipping',()=>{
 const s=XLSX.utils.aoa_to_sheet([['수식']]);s.A1={t:'n',f:'SUM(B1:B2)'};assert.throws(()=>planSheet(s,'수식',XLSX,font),/계산값/);
 const wide=XLSX.utils.aoa_to_sheet([Array(40).fill('값')]);assert.throws(()=>planSheet(wide,'넓은 시트',XLSX,font),/열이 너무/);
 const tall=XLSX.utils.aoa_to_sheet([['긴글']]);tall['!rows']=[{hpt:2000}];assert.throws(()=>planSheet(tall,'높은 행',XLSX,font),/한 쪽보다/);
});
