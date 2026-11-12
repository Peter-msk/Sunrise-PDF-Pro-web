import test from 'node:test';
import assert from 'node:assert/strict';
import {planSheet,drawSheetPages} from '../src/spreadsheet-pdf.js';

// Use only stable documented SheetJS utils shapes.  This synthetic helper
// allows identical tests with the real installed SheetJS or offline stubs.
const letters=c=>{let out='';for(let n=c+1;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
const column=s=>[...s].reduce((v,ch)=>v*26+ch.charCodeAt(0)-64,0)-1;
const cellAddress=address=>{const m=/^([A-Z]+)([1-9][0-9]*)$/.exec(address);if(!m)throw Error('BAD_CELL');return {r:Number(m[2])-1,c:column(m[1])};};
const xlsx={utils:{
  decode_range(value){const [s,e=s]=value.split(':');return {s:cellAddress(s),e:cellAddress(e)};},
  encode_cell({r,c}){return letters(c)+(r+1);},
  format_cell(cell){return String(cell.w??cell.v??'');}
}};
const font={widthOfTextAtSize:(s,size)=>[...s].length*size*.55};
const range=(a,b)=>({s:cellAddress(a),e:cellAddress(b)});
const sheet=(ref='A1',text='내용')=>({'!ref':ref,A1:{t:'s',v:text}});
function finiteLayout(pages){
  for(const page of pages){
    assert.ok(page.paper.every(Number.isFinite));
    assert.ok(page.cols.every(v=>Number.isFinite(v)&&v>0));
    assert.ok(page.rows.every(v=>Number.isFinite(v)&&v>=0));
    for(const cell of page.cells){
      assert.ok(Number.isFinite(cell.width)&&cell.width>0);
      assert.ok(cell.endC>=cell.c&&cell.endR>=cell.r);
      assert.ok(cell.endC<page.cols.length&&cell.endR<page.rows.length);
    }
  }
}

test('normal single cell remains one page with finite positions',()=>{
  const p=planSheet(sheet(),'정상',xlsx,font);
  assert.equal(p.length,1);assert.equal(p[0].cells[0].lines.join(''),'내용');finiteLayout(p);
});
test('merge beyond !ref right edge is fully preserved instead of truncated',()=>{
  const s=sheet('A1','병합 제목');s['!merges']=[range('A1','C1')];
  const pages=planSheet(s,'병합',xlsx,font);
  assert.equal(pages[0].cols.length,3);
  assert.equal(pages[0].cells[0].endC,2);finiteLayout(pages);
});
test('merge beyond !ref lower edge preserves all visible rows',()=>{
  const s=sheet('A1','세로 병합');s['!merges']=[range('A1','A3')];
  const pages=planSheet(s,'병합',xlsx,font);
  assert.equal(pages[0].rows.length,3);
  assert.equal(pages[0].cells[0].endR,2);finiteLayout(pages);
});
test('merge anchor outside stale !ref is not omitted',()=>{
  const s=sheet('B2:B2');delete s.A1;s.A1={t:'s',v:'외부 병합'};s['!merges']=[range('A1','B2')];
  const pages=planSheet(s,'병합',xlsx,font);
  assert.equal(pages[0].cells[0].lines.join(''),'외부 병합');
  assert.equal(pages[0].cells[0].endC,1);assert.equal(pages[0].cells[0].endR,1);
});
test('multiple disjoint merges do not alter existing text or pagination',()=>{
  const s=sheet('A1:C40','헤더');s.B15={v:'중간'};s.C40={v:'끝'};
  s['!merges']=[range('A1','B2'),range('B10','C12')];
  const p=planSheet(s,'표',xlsx,font);finiteLayout(p);
  const texts=p.flatMap(page=>page.cells.flatMap(c=>c.lines));
  for(const word of ['헤더','중간','끝'])assert.ok(texts.includes(word),word);
});
test('long sheet still paginates without losing rows',()=>{
  const s=sheet('A1:B100','첫 행');
  for(let i=2;i<=100;i++)s['A'+i]={v:'행'+i};
  s['!merges']=[range('A31','A34')];
  for(let i=32;i<=34;i++)delete s['A'+i];
  const p=planSheet(s,'긴 표',xlsx,font);finiteLayout(p);
  assert.ok(p.length>=3);
  assert.ok(p.some(page=>page.cells.some(c=>c.lines.includes('행31')&&c.endR-c.r===3)));
  assert.ok(p.flatMap(page=>page.cells.flatMap(c=>c.lines)).includes('행100'));
});
test('invalid row height values are rejected before output',()=>{
  for(const val of [NaN,Infinity,-1,'auto','24',-Infinity]){
    const s=sheet();s['!rows']=[{hpt:val}];
    assert.throws(()=>planSheet(s,'행',xlsx,font),/행 높이가 유효하지/,String(val));
  }
});
test('invalid column widths are rejected before output',()=>{
  for(const val of [NaN,Infinity,-1,'auto','20',-Infinity]){
    const s=sheet();s['!cols']=[{wch:val}];
    assert.throws(()=>planSheet(s,'열',xlsx,font),/열 너비가 유효하지/,String(val));
  }
});
test('zero hpt and wch use existing minimum printable geometry',()=>{
  const s=sheet();s['!rows']=[{hpt:0}];s['!cols']=[{wch:0}];
  const pages=planSheet(s,'0',xlsx,font);finiteLayout(pages);
  assert.ok(pages[0].rows[0]>=20&&pages[0].cols[0]>=18);
});
test('invalid reversed or fractional merge bounds rejected',()=>{
  const s=sheet();
  for(const merge of [range('C1','A2'),range('A3','C1'),
      {s:{r:0,c:0.3},e:{r:0,c:2}},
      {s:{r:-1,c:0},e:{r:2,c:2}},
      {s:{r:0,c:0},e:{r:Infinity,c:1}},
      null,{s:{r:0,c:0}}]){
    s['!merges']=[merge];
    assert.throws(()=>planSheet(s,'병합',xlsx,font),/병합 셀 범위가 유효하지/);
  }
});
test('merge expanding to huge rectangle fails by existing cell budget',()=>{
  const s=sheet();s['!merges']=[range('A1','XFD1048576')];
  assert.throws(()=>planSheet(s,'거대병합',xlsx,font),/20만 셀/);
});
test('invalid SheetJS !ref indices fail without entering row loops',()=>{
  for(const bad of ['C3:A1','A1:A1048577','A1:XFE1']){
    const s=sheet(bad);
    assert.throws(()=>planSheet(s,'범위',xlsx,font),/셀 범위가 유효하지/);
  }
});
test('preexisting merge overlap rejection remains active',()=>{
  const s=sheet('A1:C2');s['!merges']=[range('A1','B2'),range('B1','C2')];
  assert.throws(()=>planSheet(s,'겹침',xlsx,font),/병합 셀이 겹칩니다/);
});
test('merge starts hidden remains explicit error',()=>{
  const s=sheet('A1:B2');s['!merges']=[range('A1','B2')];s['!rows']=[{hidden:true}];
  assert.throws(()=>planSheet(s,'숨김',xlsx,font),/병합 셀의 시작 위치가 숨겨져/);
});
test('empty sheet retains no-page behavior',()=>{
  assert.deepEqual(planSheet({'!ref':'A1'},'빈표',xlsx,font),[]);
  assert.deepEqual(planSheet({},'빈표',xlsx,font),[]);
});
test('merge range with a visible stored formula without cached value is still rejected',()=>{
  const s=sheet('A1:B2');s.A1={f:'SUM(B1:B2)',t:'n'};s['!merges']=[range('A1','B2')];
  assert.throws(()=>planSheet(s,'수식',xlsx,font),/계산값이 없는 수식/);
});

function fakePdf(){
 const drawn=[];return {drawn,addPage(paper){
  const out={paper,rects:[],texts:[],
   drawRectangle(value){this.rects.push(value);},
   drawText(text,value){this.texts.push({text,...value});}};
  drawn.push(out);return out;
 }};
}
test('actual PDF drawing command geometry remains finite and page-bounded',async()=>{
 const s=sheet('A1:C100','머리');
 for(let r=2;r<=100;r++)s['A'+r]={v:'행'+r};
 s['!merges']=[range('A30','B33')];
 const plan=planSheet(s,'위치검사',xlsx,font);
 const pdf=fakePdf();const stages=[];
 const svg=await drawSheetPages(pdf,plan,{},null,p=>stages.push(p));
 assert.equal(pdf.drawn.length,plan.length);
 assert.equal(stages.length,plan.length);
 for(const page of pdf.drawn){
  for(const rect of page.rects){
   for(const v of [rect.x,rect.y,rect.width,rect.height])assert.ok(Number.isFinite(v));
   assert.ok(rect.x>=0&&rect.y>=0);
   assert.ok(rect.x+rect.width<=page.paper[0]+.001);
   assert.ok(rect.y+rect.height<=page.paper[1]+.001);
  }
  for(const text of page.texts){
   assert.ok(Number.isFinite(text.x)&&Number.isFinite(text.y));
   assert.ok(text.x>=0&&text.y>=0&&text.y<=page.paper[1]);
  }
 }
 assert.match(svg,/위치검사/);
});
test('SVG preview escapes user cell text but PDF text commands retain characters',async()=>{
 const s=sheet('A1','<>&"\'');
 const plan=planSheet(s,'미리보기',xlsx,font);
 const pdf=fakePdf();const svg=await drawSheetPages(pdf,plan,{},null);
 assert.ok(svg.includes('&lt;&gt;&amp;&quot;&apos;'));
 assert.ok(pdf.drawn[0].texts.some(t=>t.text==='<>&"\''));
});
