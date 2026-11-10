import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {requestLocalFontAccess,requireLocalFonts,svgFontFamilies,loadDocumentLocalFonts} from '../src/local-fonts.js';
globalThis.File ||= File;
class Parser {
 parseFromString(svg){
  const elements=JSON.parse(svg).map(attributes=>({getAttribute:name=>attributes[name]??null}));
  return {documentElement:{localName:'svg'},querySelector:()=>null,querySelectorAll:()=>elements};
 }
}
import {resolveFont} from '../src/pdf-fonts.js';
globalThis.DOMParser=Parser;
test('permission is requested by caller and unsupported browser is explicit',async()=>{
 let called=0;assert.deepEqual(await requestLocalFontAccess({queryLocalFonts(){called++;return Promise.resolve([]);}}),[]);
 assert.equal(called,1);assert.throws(()=>requestLocalFontAccess({}),/지원하지/);
});
test('loads only document-matching faces, keeps original aliases, and reports fallback through existing registry',async()=>{
 let relevant=0,unrelated=0;
 const doc={renderPageSvgWithProfile(){return JSON.stringify([{'font-family':'"HY신문명조", serif'},{style:'font-family: HY견고딕; fill: black'}]);}};
 const available=[{family:'HY신문명조',fullName:'HY신문명조',postscriptName:'example',blob:async()=>{relevant++;return new Blob(['abc']);}},
 {family:'unrelated',blob:async()=>{unrelated++;return new Blob(['def']);}}];
 const parser={create:()=>({familyName:'Example Family',fullName:'Example Family',postscriptName:'example',subfamilyName:'Regular',characterSet:[44032]})};
 const names=svgFontFamilies(doc.renderPageSvgWithProfile());assert.deepEqual([...names.values()],['HY신문명조','HY견고딕']);
 const phases=[];
 const result=await loadDocumentLocalFonts(doc,1,available,parser,undefined,p=>phases.push(p));
 assert.deepEqual(phases.map(p=>p.detail),['scan','scan','read','loaded']);
 assert.deepEqual(phases.filter(p=>p.detail==='read').map(p=>p.processed),[1]);
 assert.equal(relevant,1);assert.equal(unrelated,0);assert.equal(result.faces.length,1);
 assert.deepEqual(result.faces[0].cssAliases,['HY신문명조']);assert(result.faces[0].aliases.includes('hy신문명조'));
});
test('cancellation prevents font bytes from being read',async()=>{
 let called=0;const controller=new AbortController();controller.abort();
 await assert.rejects(loadDocumentLocalFonts({renderPageSvgWithProfile(){called++;}},1,[],{},controller.signal),{name:'AbortError'});assert.equal(called,0);
});

test('inline font family overrides the presentation attribute',()=>{
 const names=svgFontFamilies(JSON.stringify([{'font-family':'wrong',style:'font-family: correct'}]));
 assert.deepEqual([...names.values()],['correct']);
});

test('empty OS enumeration produces a clear error',()=>{
 assert.throws(()=>requireLocalFonts([]),/목록을 읽지 못했습니다/);
 assert.throws(()=>requireLocalFonts(null),/목록을 읽지 못했습니다/);
 const fonts=[{family:'Arial'}];assert.equal(requireLocalFonts(fonts),fonts);
});

test('R63 inherited SVG root font is discovered and embedded PC face wins over bundled fallback',async()=>{
 const oldParser=globalThis.DOMParser;
 class RootParser {
  parseFromString(){
   return {
    documentElement:{localName:'svg',getAttribute:name=>name==='font-family'?'HY신문명조':null},
    querySelector:()=>null,querySelectorAll:()=>[]
   };
  }
 }
 try{
  globalThis.DOMParser=RootParser;
  const found=svgFontFamilies('<svg font-family="HY신문명조"><text>가</text></svg>');
  assert.deepEqual([...found.values()],['HY신문명조']);
  let bytesRead=0;
  const file={family:'HY신문명조',fullName:'HY신문명조',postscriptName:'HYNewspaper',blob:async()=>{bytesRead++;return new Blob(['font']);}};
  const parser={create:()=>({familyName:'HY신문명조',fullName:'HY신문명조',postscriptName:'HYNewspaper',subfamilyName:'Regular',characterSet:[44032]})};
  const doc={renderPageSvgWithProfile:()=>'<svg font-family="HY신문명조"/>'};
  const loaded=await loadDocumentLocalFonts(doc,1,[file],parser);
  assert.equal(bytesRead,1);
  assert.equal(loaded.faces[0].isLocal,true);
  const fallback={name:'BundledFont1',family:'Nanum Myeongjo',aliases:['hy신문명조'],isFallback:true,bold:false,italic:false,characterSet:new Set([44032])};
  assert.equal(resolveFont({faces:[...loaded.faces,fallback]},'HY신문명조','normal','normal','가').name,'LocalFont1');
 }finally{globalThis.DOMParser=oldParser;}
});
