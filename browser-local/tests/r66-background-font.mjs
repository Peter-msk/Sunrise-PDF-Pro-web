import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import {cooperativeYield} from '../src/cooperative-yield.mjs';
import {loadPdfFonts} from '../src/pdf-fonts.js';
import {loadDocumentLocalFonts} from '../src/local-fonts.js';

globalThis.File ||= File;

test('scheduler.yield wins over clamped zero-delay timers in background',async()=>{
 let calls=0;
 const host={scheduler:{async yield(){calls++;}},setTimeout(){throw Error('timer must not run');}};
 for(let n=0;n<80;n++)await cooperativeYield({host});
 assert.equal(calls,80);
});

test('MessageChannel fallback completes, even when setTimeout is prohibited',async()=>{
 const host={MessageChannel, setTimeout(){throw Error('timer must not run');}};
 for(let n=0;n<30;n++)await cooperativeYield({host});
});

test('cancelled conversion stops a queued MessageChannel yield',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(cooperativeYield({host:{MessageChannel},signal:controller.signal}),{name:'AbortError'});
});

test('exact named TTC face is passed to fontkit and PDFKit and not guessed',async()=>{
 const data=Uint8Array.of(116,116,99,102,0,1,2,3);
 const file=new File([data],'local-font.ttf');
 const seen=[];
 const parser={create(bytes,postscriptName){
  seen.push(postscriptName);
  return postscriptName==='KnownPS'?{
   familyName:'확인된 글꼴',fullName:'확인된 글꼴',postscriptName:'KnownPS',
   subfamilyName:'Regular',characterSet:[44032,65]
  }:{fonts:[]};
 }};
 const result=await loadPdfFonts([file],parser,undefined,{postscriptName:'KnownPS'});
 assert.deepEqual(seen,['KnownPS']);
 assert.equal(result.faces[0].collectionFontName,'KnownPS');
 assert.deepEqual([...result.faces[0].characterSet],[44032,65]);
 await assert.rejects(loadPdfFonts([file],parser,undefined,{postscriptName:'OtherPS'}),/PC_FONT_COLLECTION_FACE_UNAVAILABLE/);
 await assert.rejects(loadPdfFonts([file],parser),/PC_FONT_COLLECTION_FACE_UNAVAILABLE/);
});

test('document-local TTC conversion passes FontData PostScript name and retains HWP alias',async()=>{
 const oldDOM=globalThis.DOMParser;
 globalThis.DOMParser=class{parseFromString(){return {
  documentElement:{localName:'svg',getAttribute:k=>k==='font-family'?'굴림체':null},
  querySelector:()=>null,querySelectorAll:()=>[]
 };}};
 try{
  let parsedName=null;
  const parser={create(_bytes,name){parsedName=name;return {
   familyName:'GulimChe',fullName:'GulimChe',postscriptName:name,
   subfamilyName:'Regular',characterSet:[44032]
  };}};
  const font={family:'GulimChe',fullName:'GulimChe',postscriptName:'GulimChePS',
   style:'Regular',blob:async()=>new Blob([Uint8Array.of(116,116,99,102,1,2,3,4)])};
  const doc={renderPageSvgWithProfile:()=>'<svg font-family="굴림체"/>'};
  const result=await loadDocumentLocalFonts(doc,1,[font],parser);
  assert.equal(parsedName,'GulimChePS');
  assert.equal(result.faces.length,1);
  assert.equal(result.faces[0].collectionFontName,'GulimChePS');
  assert(result.faces[0].aliases.includes('굴림체'));
 }finally{globalThis.DOMParser=oldDOM;}
});

test('font access verification is retained for actual conversion, with honest background limitation',()=>{
 const src=new URL('../src/',import.meta.url);
 const main=readFileSync(new URL('main.js',src),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('svg-professional.js',src),'utf8');
 assert.match(main,/verifiedPcFontData=result\.fonts/);
 assert.match(main,/verifiedPcFontData\?\.length\?Promise\.resolve\(verifiedPcFontData\):requestLocalFontAccess\(\)/);
 assert.match(main,/document\.addEventListener\('visibilitychange'/);
 assert.match(html,/id="background-policy"/);
 assert.match(pdf,/registerFont\(face\.name,face\.bytes,face\.collectionFontName\|\|undefined\)/);
});

test('abort interrupts clamped timer fallback without waiting for a timer tick',async()=>{
 const controller=new AbortController(),cleared=[];
 const host={setTimeout(){return 91;},clearTimeout:id=>cleared.push(id)};
 const pending=cooperativeYield({host,signal:controller.signal});
 controller.abort();
 await assert.rejects(pending,{name:'AbortError'});
 assert.deepEqual(cleared,[91]);
});

test('timer-only fallback still resolves without an abort',async()=>{
 let scheduled=0;
 const host={setTimeout(fn){scheduled++;queueMicrotask(fn);return 12;},
  clearTimeout(){throw Error('normal yield must not clear the timer');}};
 await cooperativeYield({host});
 assert.equal(scheduled,1);
});

test('synchronous abort during fallback timer registration clears late timer',async()=>{
 const controller=new AbortController(),cleared=[];
 const host={setTimeout(){controller.abort();return 4;},clearTimeout:id=>cleared.push(id)};
 await assert.rejects(cooperativeYield({host,signal:controller.signal}),{name:'AbortError'});
 assert.deepEqual(cleared,[4]);
});
