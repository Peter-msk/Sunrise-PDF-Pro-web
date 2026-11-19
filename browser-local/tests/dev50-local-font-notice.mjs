import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedFontSnapshot} from '../src/local-font-policy.mjs';
import {resolveFont,keepLocalFontFaces} from '../src/pdf-fonts.js';
import {loadDocumentLocalFonts} from '../src/local-fonts.js';
import {updatesMarkup,updatesCSS,updatesScript} from '../../src/site-updates.js';
import {sitePage} from '../../src/site-home.js';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
globalThis.File ||= File;
const face=(name,family,chars,extra={})=>({name,family,aliases:[family.toLowerCase()],bold:false,italic:false,characterSet:new Set([...chars].map(c=>c.codePointAt(0))),...extra});
test('successful font verification is one-shot, expires, and can be invalidated',()=>{
 let clock=0;const v=createVerifiedFontSnapshot({maxAgeMs:100,now:()=>clock});const data=[{}];
 v.set(data);assert.equal(v.take(),data);assert.equal(v.take(),null);
 v.set(data);clock=101;assert.equal(v.take(),null);
 v.set(data);v.clear();assert.equal(v.take(),null);
 v.set([]);assert.equal(v.take(),null);
});
test('matching PC family with alternate style outranks unrelated bundled substitute only in opt-in mode',()=>{
 const pc=face('Local1','Original','AB'),bundled=face('Bundled1','Bundled','AB',{bold:true,isFallback:true}),other=face('Local2','Other','AB',{bold:true});
 const registry={faces:[pc,bundled,other],allowCoverageFallback:true};
 assert.equal(resolveFont(registry,'Original','bold','normal','A'),pc);
 assert.equal(resolveFont(registry,'Original, Other','bold','normal','A'),other);
 assert.equal(resolveFont({faces:registry.faces},'Original','bold','normal','A'),bundled);
 assert.equal(resolveFont(registry,'Unknown','bold','normal','A'),bundled);
});
test('manual font cannot discard PC face with additional glyphs',()=>{
 const a=face('Manual','Original','A'),b=face('Local','Original','AB'),c=face('ManualFull','Original','AB');
 assert.deepEqual(keepLocalFontFaces([a],[b]),[b]);
 assert.deepEqual(keepLocalFontFaces([c],[b]),[]);
});
test('failed first duplicate PC font does not suppress a valid duplicate',async()=>{
 const old=globalThis.DOMParser;let reads=0;
 globalThis.DOMParser=class{parseFromString(){return {documentElement:{localName:'svg',getAttribute:k=>k==='font-family'?'Original':null},querySelector:()=>null,querySelectorAll:()=>[]};}};
 try{
 const data={family:'Original',fullName:'Original',postscriptName:'OriginalPS',style:'Regular'};
 const list=[{...data,blob:async()=>{reads++;throw Error('unreadable');}},{...data,blob:async()=>{reads++;return new Blob(['SFNT']);}}];
 const parser={create:()=>({familyName:'Original',fullName:'Original',postscriptName:'OriginalPS',subfamilyName:'Regular',characterSet:[65]})};
 const r=await loadDocumentLocalFonts({renderPageSvgWithProfile:()=>'<svg/>'},1,list,parser);
 assert.equal(reads,2);assert.equal(r.faces.length,1);assert.equal(r.unreadableFonts,1);assert.deepEqual(r.unmatchedNames,[]);
 }finally{globalThis.DOMParser=old;}
});
test('home and converter share safe announcement rail with responsive non-overlap policy',()=>{
 const local=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(local.includes(updatesMarkup));assert.ok(sitePage('home').includes(updatesMarkup));
 assert.match(updatesCSS,/min-width:1920px/);assert.match(updatesCSS,/min-width:1640px/);
 assert.match(updatesScript,/fetch\('\/api\/public\/updates'/);assert.match(updatesScript,/textContent=value/);
 assert.doesNotMatch(updatesScript,/innerHTML|insertAdjacentHTML|eval\(/);
 new Function(updatesScript);
});
