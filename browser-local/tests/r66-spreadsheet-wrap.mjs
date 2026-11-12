import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapSpreadsheetCell} from '../src/spreadsheet-wrap.mjs';

const constantFont={widthOfTextAtSize:(s,size)=>Array.from(s).length*size};
const tokenFont={widthOfTextAtSize:(s,size)=>{
  // Simulate a kerning-aware variable advance with a narrow AV pair.
  return [...s].reduce((sum,c)=>sum+(c==='W'?12:c==='i'?3:8),0)*size/10 -
    (s.match(/AV/g)||[]).length*(2*size/10);
}};

function reference(text,width,font,size=9){
 const out=[];
 for(const paragraph of String(text).split(/\r\n|\r|\n/)){
   let line='';
   for(const c of paragraph){
    if(font.widthOfTextAtSize(c,size)>width)throw Error('narrow');
    if(line&&font.widthOfTextAtSize(line+c,size)>width){out.push(line);line='';}
    line+=c;
   }
   out.push(line);
 }
 return out;
}
test('ordinary ASCII wraps identically to prior algorithm on 70 reference cases',()=>{
 for(let i=0;i<70;i++){
  const text='AB WiiiAV'.repeat(2+(i%9));
  const width=12+i*2;
  assert.deepEqual(wrapSpreadsheetCell(text,width,tokenFont),reference(text,width,tokenFont));
 }
});
test('empty cells and CRLF, CR, LF preserve original paragraph sequence',()=>{
 assert.deepEqual(wrapSpreadsheetCell('',80,constantFont),['']);
 assert.deepEqual(wrapSpreadsheetCell('A\r\n\rB\n\n',10,constantFont,9),['A','','B','','']);
});
test('large single line uses logarithmic instead of per-character font measurements',()=>{
 let calls=0;
 const font={widthOfTextAtSize:s=>{calls++;return s.length;}};
 const s='a'.repeat(20_000);
 assert.deepEqual(wrapSpreadsheetCell(s,20_000,font),[s]);
 assert.ok(calls<22,'measured '+calls+' runs');
});
test('long cell broken across many lines preserves every glyph and never overflows',()=>{
 const text='abc한글W'.repeat(450);
 const wrapped=wrapSpreadsheetCell(text,36,constantFont,9);
 assert.ok(wrapped.length>100);
 assert.equal(wrapped.join(''),text);
 assert.ok(wrapped.every(x=>constantFont.widthOfTextAtSize(x,9)<=36));
});
test('combining sequence is never split across line boundary',()=>{
 const s='A'+'e\u0301'+'B';
 assert.deepEqual(wrapSpreadsheetCell(s,9,{
  widthOfTextAtSize:t=>[...new Intl.Segmenter('und',{granularity:'grapheme'}).segment(t)].length*9
 }),['A','e\u0301','B']);
});
test('ZWJ emoji and flag regional indicators remain one grapheme each',()=>{
 const segmenter=new Intl.Segmenter('und',{granularity:'grapheme'});
 const font={widthOfTextAtSize:t=>[...segmenter.segment(t)].length*10};
 assert.deepEqual(wrapSpreadsheetCell('a👩‍💻🇰🇷b',10,font),['a','👩‍💻','🇰🇷','b']);
});
test('precomposed Korean Hangul syllables are preserved without normalization',()=>{
 const text='가나다라';
 assert.deepEqual(wrapSpreadsheetCell(text,18,constantFont),['가나','다라']);
});
test('single long grapheme triggers explicit narrow-column failure',()=>{
 const font={widthOfTextAtSize:()=>50};
 assert.throws(()=>wrapSpreadsheetCell('🇰🇷',40,font),/열 너비가 글자보다 좁습니다/);
});
test('invalid width and font fail before layout',()=>{
 for(const n of [0,-1,NaN,Infinity]) assert.throws(()=>wrapSpreadsheetCell('A',n,constantFont));
 assert.throws(()=>wrapSpreadsheetCell('A',10,null),/SHEET_FONT_MEASURE_UNAVAILABLE/);
});
test('nondefault font size is forwarded into exact measurements',()=>{
 const observed=[];
 const font={widthOfTextAtSize:(s,size)=>{observed.push(size);return s.length*size;}};
 assert.deepEqual(wrapSpreadsheetCell('ABCD',25,font,12),['AB','CD']);
 assert.ok(observed.every(v=>v===12));
});
test('no Segmenter falls back only for simple text, never splits complex clusters',()=>{
 const prior=Intl.Segmenter;
 try{
  Intl.Segmenter=undefined;
  assert.deepEqual(wrapSpreadsheetCell('AB',9,constantFont),['A','B']);
  assert.throws(()=>wrapSpreadsheetCell('e\u0301',10,constantFont),/SHEET_GRAPHEME_SEGMENTER_REQUIRED/);
  assert.throws(()=>wrapSpreadsheetCell('🇰🇷',10,constantFont),/SHEET_GRAPHEME_SEGMENTER_REQUIRED/);
  assert.throws(()=>wrapSpreadsheetCell('👋🏽',10,constantFont),/SHEET_GRAPHEME_SEGMENTER_REQUIRED/);
  assert.throws(()=>wrapSpreadsheetCell('\u1100\u1161',10,constantFont),/SHEET_GRAPHEME_SEGMENTER_REQUIRED/);
 }finally{Intl.Segmenter=prior;}
});
test('output is deterministic across repeated calls and contains no injected glyphs',()=>{
 const input='서울★경기\n부산';
 const a=wrapSpreadsheetCell(input,27,constantFont),b=wrapSpreadsheetCell(input,27,constantFont);
 assert.deepEqual(a,b);
 assert.equal(a.join(''),'서울★경기부산');
});
