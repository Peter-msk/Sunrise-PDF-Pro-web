/** DEV26 actual PDF FontDescriptor inspection; only bundled OFL fixtures.
 * No proprietary Windows fonts, user documents or private paths in CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import PDFKit from 'pdfkit';
import fontkit from '@pdf-lib/fontkit';
import {inspectPdfFontEmbedding,compareSelectedAndEmbedded} from '../src/pdf-font-audit.mjs';
import {loadPdfFonts,installMeasureFonts} from '../src/pdf-fonts.js';
import {loadDocumentLocalFonts} from '../src/local-fonts.js';
import {JSDOM} from 'jsdom';

globalThis.File ||= File;
const regular=readFileSync(new URL('../public/fonts/NanumGothic-Regular.ttf',import.meta.url));
const bold=readFileSync(new URL('../public/fonts/NanumGothic-Bold.ttf',import.meta.url));
const postscript=fontkit.create(regular).postscriptName;
async function outputPdf({embedded=true,text='한글 ABC',family='SelectedPC'}={}){
 const writer=new PDFKit({autoFirstPage:false,compress:false,margin:0});
 const chunks=[];
 const complete=new Promise((resolve,reject)=>{
  writer.on('data',b=>chunks.push(b));
  writer.on('end',resolve);
  writer.on('error',reject);
 });
 if(embedded)writer.registerFont(family,regular);
 writer.addPage({size:[300,300]});
 if(embedded)writer.font(family);
 else writer.font('Helvetica');
 writer.fontSize(16).text(text,20,20);
 writer.end();
 await complete;
 return new Blob(chunks,{type:'application/pdf'});
}
test('real Korean Nanum font is verifiably embedded in PDF FontDescriptor and page resources',async()=>{
 const pdf=await outputPdf();
 const result=await inspectPdfFontEmbedding(pdf);
 assert.equal(result.pageCount,1);
 assert.ok(result.fonts.length>0);
 assert.ok(result.fonts.some(x=>x.embedded),'FontFile2/3 must be present');
 assert.ok(result.fonts.some(x=>x.pages.includes(1)));
 assert.ok(result.fonts.some(x=>x.baseName.includes('Nanum')));
 const matched=compareSelectedAndEmbedded([{family:'Nanum Gothic',postscriptName:postscript}],result);
 assert.equal(matched.length,1);
 assert.equal(matched[0].pdfResourcePresent,true);
 assert.equal(matched[0].embedded,true);
 assert.deepEqual(matched[0].pages,[1]);
});
test('Helvetica is a page font resource, but is NOT an embedded font program',async()=>{
 const result=await inspectPdfFontEmbedding(await outputPdf({embedded:false,text:'ASCII'}));
 assert.ok(result.fonts.some(f=>f.baseName.includes('Helvetica')));
 assert.equal(result.fonts.some(f=>f.embedded),false);
});
test('font inspection refuses malformed PDF, oversize files and already-cancelled operations',async()=>{
 await assert.rejects(inspectPdfFontEmbedding(new Blob(['not a PDF'],{type:'application/pdf'})));
 await assert.rejects(inspectPdfFontEmbedding(new Blob(['a'],{type:'text/plain'})),/PDF_FONT_AUDIT_INPUT_INVALID/);
 const pdf=await outputPdf();
 await assert.rejects(inspectPdfFontEmbedding(pdf,{maxBytes:8}),/PDF_FONT_AUDIT_TOO_LARGE/);
 const cancelled=new AbortController();cancelled.abort();
 await assert.rejects(inspectPdfFontEmbedding(pdf,{signal:cancelled.signal}),{name:'AbortError'});
});
test('a selected PC face is not called embedded when its PDF resource is absent',async()=>{
 const pdf=await outputPdf({embedded:false,text:'ASCII'});
 const audit=await inspectPdfFontEmbedding(pdf);
 const selected=compareSelectedAndEmbedded([{family:'Nanum Gothic',postscriptName:postscript}],audit);
 assert.equal(selected[0].pdfResourcePresent,false);
 assert.equal(selected[0].embedded,false);
});
test('loaded font retains real PostScript identity for PDF and source-font comparison',async()=>{
 const loaded=await loadPdfFonts([new File([regular],'local-font.ttf')],fontkit);
 assert.equal(loaded.faces[0].postscriptName,postscript);
 assert.equal(loaded.faces[0].bold,false);
});
test('single-face PC TTF never receives a TTC selector, and mismatched PostScript names are rejected',async()=>{
 const seen=[];
 const parser={create(_bytes,...extra){
  seen.push(extra);
  return {familyName:'Nanum Gothic',fullName:'Nanum Gothic',
   postscriptName:postscript,subfamilyName:'Regular',characterSet:[0xac00,65]};
 }};
 const file=new File([regular],'local-font.ttf');
 const correct=await loadPdfFonts([file],parser,undefined,{postscriptName:postscript});
 assert.equal(correct.faces[0].postscriptName,postscript);
 assert.deepEqual(seen,[[]],'non-TTC must never receive fontkit collection selector');
 await assert.rejects(loadPdfFonts([file],parser,undefined,
  {postscriptName:'WrongDifferentFace'}),/PC_FONT_SINGLE_FACE_MISMATCH/);
});
test('TTC exact PDF face never masquerades as same browser FontFace for measurement',async()=>{
 let created=0,loaded=0;
 class FakeFace{
  constructor(){created++;}
  async load(){loaded++;return this;}
 }
 const set={add(){},delete(){}};
 const faces=[
  {name:'ttc',family:'Nanum Gothic',aliases:['nanumgothic'],
   cssAliases:['나눔고딕'],bytes:new Uint8Array([116,116,99,102,1,0,0,0]),
   collectionFontName:'NanumGothicBold',bold:true,italic:false,isLocal:true}
 ];
 const cleanup=await installMeasureFonts({faces},undefined,set,FakeFace,{skipUnavailable:true});
 assert.equal(cleanup.stats.ttcMeasurementUnverified,1);
 assert.equal(created,0);
 assert.equal(loaded,0);
 cleanup();
});
test('explicit PC font selected by bilingual HWP name is carried into a real embedded PDF',async()=>{
 const win=new JSDOM('').window,prior=globalThis.DOMParser;
 globalThis.DOMParser=win.DOMParser;
 try{
  const os=[{
   family:'Nanum Gothic',fullName:'Nanum Gothic',postscriptName:postscript,
   style:'Regular',blob:async()=>new Blob([regular])
  }];
  const document={renderPageSvgWithProfile:()=>
   '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text font-family="나눔고딕">한글</text></svg>'};
  const result=await loadDocumentLocalFonts(document,1,os,fontkit);
  assert.equal(result.faces.length,1,JSON.stringify({required:result.requestedFamilies,matched:result.matchedFontData,unreadable:result.unreadableFonts,unmatched:result.unmatchedNames,parsedName:postscript}));
  const selected=result.faces[0];
  assert.equal(selected.isLocal,true);
  assert.ok(selected.aliases.includes('나눔고딕'));
  const pdf=await outputPdf({family:'SelectedPC'});
  const report=await inspectPdfFontEmbedding(pdf);
  assert.ok(compareSelectedAndEmbedded([selected],report)[0].embedded);
 }finally{globalThis.DOMParser=prior;win.close();}
});
test('a suffix lookalike font name never passes as the requested PC font',()=>{
 const audit={fonts:[{baseName:'ABCDEF+OtherNanumGothic',embedded:true,pages:[1]}]};
 const wrong=compareSelectedAndEmbedded([{family:'Nanum Gothic',postscriptName:'NanumGothic'}],audit);
 assert.equal(wrong[0].embedded,false);
 assert.equal(wrong[0].pdfResourcePresent,false);
});

test('source HWP names remain client-local comparison metadata, never telemetry',()=>{
 const converter=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const telemetry=readFileSync(new URL('../src/pro-telemetry.js',import.meta.url),'utf8');
 assert.match(converter,/result\.sourceFontInventory=/);
 assert.match(ui,/sourceFontInventory\?\.requested/);
 assert.doesNotMatch(telemetry,/sourceFontInventory|requestedNames|matchedFaces/);
});

test('font inspection is local-only, never a network or telemetry operation',()=>{
 const src=readFileSync(new URL('../src/pdf-font-audit.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(ui,/PDF 글꼴 확인/);
 assert.match(ui,/compareSelectedAndEmbedded/);
 assert.doesNotMatch(src,/\bfetch\s*\(|sendBeacon|XMLHttpRequest|emitProEvent/);
 assert.match(ui,/PDF 글꼴 리소스/);
});
