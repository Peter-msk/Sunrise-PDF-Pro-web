import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {readFileSync} from 'node:fs';
import {localFamilyKeys,loadDocumentLocalFonts} from '../src/local-fonts.js';
import {resolveFont} from '../src/pdf-fonts.js';

globalThis.File ||= File;
const svg=family=>`<svg xmlns="http://www.w3.org/2000/svg" font-family="${family}"/>`;
class FakeParser {
 parseFromString(source){
  const name=/font-family="([^"]+)"/.exec(source)?.[1]||'';
  return {documentElement:{localName:'svg',getAttribute:k=>k==='font-family'?name:null},
   querySelector:()=>null,querySelectorAll:()=>[]};
 }
}
const oldParser=globalThis.DOMParser;
globalThis.DOMParser=FakeParser;
const fontkit={create:bytes=>({familyName:'Malgun Gothic',fullName:'Malgun Gothic',
 postscriptName:'MalgunGothic',subfamilyName:'Regular',characterSet:[0xac00,0xb098,65]})};
const font=(family,blob=async()=>new Blob(['SFNT']))=>({family,fullName:family,postscriptName:null,style:'Regular',blob});

test('Korean and English names of verified Windows faces are equivalent, not fuzzy matched',()=>{
 assert(localFamilyKeys('Malgun Gothic').has('맑은고딕'));
 assert(localFamilyKeys('맑은 고딕').has('malgungothic'));
 assert(localFamilyKeys('GulimChe').has('굴림체'));
 assert(!localFamilyKeys('Malgun Gothic UI').has('맑은고딕'));
 assert(!localFamilyKeys('GulimChe').has('굴림'));
});

test('Windows English metadata is registered as original Korean font family for PDF glyphs',async()=>{
 const original=globalThis.DOMParser;globalThis.DOMParser=FakeParser;
 try{
  let readCount=0;
  const doc={renderPageSvgWithProfile:()=>svg('맑은 고딕')};
  const fonts=[font('Malgun Gothic',async()=>{readCount++;return new Blob(['BINARY'])}),
   font('Other Font',async()=>{throw Error('unrelated never read')})];
  const result=await loadDocumentLocalFonts(doc,1,fonts,fontkit);
  assert.equal(readCount,1);
  assert.equal(result.faces.length,1);
  assert.deepEqual(result.faces[0].cssAliases,['맑은 고딕']);
  assert(result.faces[0].aliases.includes('맑은고딕'));
  assert.equal(result.unmatchedNames.length,0);
  assert.equal(resolveFont({faces:result.faces},'맑은 고딕','normal','normal','가').isLocal,true);
 }finally{globalThis.DOMParser=original;}
});

test('frequently used HWP families are read before alphabetic OS font enumeration',async()=>{
 const original=globalThis.DOMParser;globalThis.DOMParser=FakeParser;
 try{
  let page=0;const read=[];
  const doc={renderPageSvgWithProfile:()=>svg(['Rare','Most Frequent','Most Frequent'][page++])};
  const available=[font('Rare',async()=>{read.push('Rare');return new Blob(['R'])}),
   font('Most Frequent',async()=>{read.push('Most Frequent');return new Blob(['F'])})];
  const result=await loadDocumentLocalFonts(doc,3,available,fontkit);
  assert.deepEqual(read,['Most Frequent','Rare']);
  assert.equal(result.matchedFontData,2);
 }finally{globalThis.DOMParser=original;}
});

test('unsupported or unreadable families are counted and named locally without lying about installed fonts',async()=>{
 const original=globalThis.DOMParser;globalThis.DOMParser=FakeParser;
 try{
  const doc={renderPageSvgWithProfile:()=>svg('미등록특수글꼴')};
  const absent=await loadDocumentLocalFonts(doc,1,[font('Malgun Gothic')],fontkit);
  assert.equal(absent.requestedFamilies,1);
  assert.equal(absent.matchedFontData,0);
  assert.deepEqual(absent.unmatchedNames,['미등록특수글꼴']);
  const unreadable=await loadDocumentLocalFonts(doc,1,[font('미등록특수글꼴',async()=>{throw Error('access denied to bytes')})],fontkit);
  assert.equal(unreadable.matchedFontData,1);
  assert.equal(unreadable.unreadableFonts,1);
  assert.deepEqual(unreadable.unmatchedNames,['미등록특수글꼴']);
 }finally{globalThis.DOMParser=original;}
});

test('explicit PC font status and compatibility raster must not request irrelevant local fonts',()=>{
 const src=new URL('../src/',import.meta.url);
 const main=readFileSync(new URL('main.js',src),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(main,/const needsFonts=pending\.some\(item=>isHwp\(item\.file\)/);
 assert.match(main,/\(recoverySpecs\.get\(item\)\?\.engine\|\|engine\)!=='compat-raster'/);
 assert.match(main,/if\(USE_PC_FONTS_BY_DEFAULT&&needsFonts\)/);
 assert.match(main,/font-check'\)\?\.addEventListener\('click'/);
 assert.match(main,/fontStatus\(access\.status==='ready'/);
 assert.match(html,/id="font-check"/);
 assert.match(html,/id="pc-font-status"/);
});
