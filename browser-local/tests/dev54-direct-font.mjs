import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDirectFontBytes,createDirectFontResolver,validateDirectFace} from '../src/direct-font.mjs';
import {prepareDirectText} from '../src/direct-text.mjs';
import {mockFontBytes,mockCollection} from './fixtures/dev54-font-fixture.mjs';
const reg='Example-Regular',bold='Example-Bold';
const face=(name=reg,isBold=false,more={})=>({family:'Example',postscriptName:name,bold:isBold,italic:false,embeddingAllowed:true,bytes:mockFontBytes({name,bold:isBold}),...more});
function kitFor(name=reg,b=false){
 return {create:()=>({familyName:'Example',postscriptName:name,subfamilyName:b?'Bold':'Regular',variationAxes:{},
 hasGlyphForCodePoint:()=>true,layout:t=>({glyphs:Array.from(t,c=>({id:c.codePointAt(0),codePoints:[c.codePointAt(0)]})),positions:Array.from(t,()=>({xAdvance:1000,yAdvance:0,xOffset:0,yOffset:0}))})})};
}
test('DEV54 actual SFNT selection and weight bits enforce requested regular/bold',()=>{
 assert.equal(validateDirectFace(kitFor(),face(),'Example').weight,400);
 assert.equal(validateDirectFace(kitFor(bold,true),face(bold,true),'Example',true).weight,700);
 assert.throws(()=>validateDirectFace(kitFor(),face(),'Example',true),/FONT_STYLE/);
 assert.throws(()=>validateDirectFace(kitFor('Wrong'),face(),'Example'),/FONT_IDENTITY/);
 assert.throws(()=>validateDirectFace(kitFor(),face(),'Other'),/FONT_IDENTITY/);
});
test('DEV54 embedding rights and static format exclusions are fail-closed',()=>{
 for(const rights of [2,4,6,512,0x8000])assert.throws(()=>prepareDirectFontBytes(mockFontBytes({rights}),reg),/FONT_RESTRICTED/);
 for(const rights of [0,8,256,264])assert.equal(prepareDirectFontBytes(mockFontBytes({rights}),reg).weight,400);
 for(const t of ['fvar','CFF2','COLR','SVG '])assert.throws(()=>prepareDirectFontBytes(mockFontBytes({extra:[t]}),reg),/FONT_VARIANT_UNSUPPORTED/);
 const ot=mockFontBytes();new DataView(ot.buffer).setUint32(0,0x4f54544f);assert.throws(()=>prepareDirectFontBytes(ot,reg),/FONT_CFF_UNSUPPORTED/);
 assert.throws(()=>validateDirectFace(kitFor(),face(reg,false,{bytes:mockFontBytes({italic:true})}),'Example'),/FONT_STYLE/);
});
test('DEV54 TTC exact PostScript face extraction creates standalone checksum-correct TTF',()=>{
 const ttc=mockCollection([mockFontBytes(),mockFontBytes({name:bold,bold:true})]);
 const r=prepareDirectFontBytes(ttc,bold),v=new DataView(r.bytes.buffer);
 assert.equal(r.collection,true);assert.equal(r.weight,700);assert.equal(v.getUint32(0),0x10000);
 let sum=0;for(let i=0;i<r.bytes.length;i+=4)sum=(sum+v.getUint32(i))>>>0;
 assert.equal(sum,0xb1b0afba);assert.equal(prepareDirectFontBytes(r.bytes,bold).weight,700);
 assert.throws(()=>prepareDirectFontBytes(ttc,'Missing'),/FONT_COLLECTION_FACE/);
 assert.throws(()=>prepareDirectFontBytes(mockCollection([mockFontBytes(),mockFontBytes()]),reg),/FONT_AMBIGUOUS/);
});
test('DEV54 malformed collection and table pointers are rejected',()=>{
 const ttc=mockCollection([mockFontBytes(),mockFontBytes({name:bold,bold:true})]),v=new DataView(ttc.buffer);
 v.setUint32(16,v.getUint32(12));assert.throws(()=>prepareDirectFontBytes(ttc,reg),/FONT_COLLECTION/);
 const a=mockFontBytes();new DataView(a.buffer).setUint32(20,0xfffffffc);assert.throws(()=>prepareDirectFontBytes(a,reg),/FONT_TABLE/);
 const b=mockCollection([mockFontBytes({extra:['DSIG']})]);assert.throws(()=>prepareDirectFontBytes(b,reg),/FONT_SIGNED_COLLECTION/);
});
test('DEV54 approved registry rejects fallback, ambiguous same style and unapproved faces',async()=>{
 const a=face(),b=face(bold,true),request={family:'Example',bold:false,italic:false};
 const resolver=createDirectFontResolver([a,b,face('Ignored',false,{isFallback:true}),face('No',false,{embeddingAllowed:false})]);
 assert.equal(await resolver(request),a);assert.equal(await resolver({...request,bold:true}),b);
 const c=face('Other-Regular');await assert.rejects(createDirectFontResolver([a,c])(request),/FONT_AMBIGUOUS/);
 assert.equal(await createDirectFontResolver([a,c],{selections:{'example|regular':'Other-Regular'}})(request),c);
 await assert.rejects(resolver({...request,family:'Missing'}),/FONT_MISSING/);
 await assert.rejects(resolver({...request,italic:true}),/FONT_STYLE/);
});
test('DEV54 regular and bold embed once per document and remain separate',async()=>{
 const cache=new Map(),calls=[],regular=face(),b=face(bold,true);
 const pdf={embedFont:async bytes=>{calls.push(bytes);return {id:calls.length};}};
 const resolver=createDirectFontResolver([regular,b]);
 const kit={create:bytes=>{try{prepareDirectFontBytes(bytes,bold);return kitFor(bold,true).create();}catch{return kitFor().create();}}};
 const plan={family:'Example',bold:false,text:'한',glyphs:[{ch:'한'}]};
 const a=await prepareDirectText(pdf,plan,resolver,kit,cache);
 const a2=await prepareDirectText(pdf,plan,resolver,kit,cache);
 const c=await prepareDirectText(pdf,{...plan,bold:true},resolver,kit,cache);
 assert.equal(a,a2);assert.notEqual(a,c);assert.equal(calls.length,2);assert.equal(cache.size,2);
});
test('DEV54 real approved TTF and TTC roundtrip using installed safe font',{timeout:45000},async()=>{
 const {readFile}=await import('node:fs/promises');
 const fontkit=(await import('@pdf-lib/fontkit')).default,{PDFDocument}=await import('pdf-lib');
 const bytes=Uint8Array.from(await readFile(new URL('../public/fonts/HakgyoansimBareondotumR.ttf',import.meta.url)));
 const original=fontkit.create(bytes),name=original.postscriptName;
 // Construct a one-member TTC with absolute table offsets using the actual
 // approved font; verify reconstruction and actual PDF library embedding.
 const ttc=mockCollection([bytes]),out=prepareDirectFontBytes(ttc,name);
 const parsed=fontkit.create(out.bytes);
 assert.equal(parsed.postscriptName,name);assert.equal(parsed.familyName,original.familyName);
 for(const ch of '한글')assert.equal(parsed.glyphForCodePoint(ch.codePointAt(0)).id,original.glyphForCodePoint(ch.codePointAt(0)).id);
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const embedded=await pdf.embedFont(out.bytes,{subset:false});pdf.addPage([300,200]).drawText('한글',{font:embedded,x:10,y:100,size:16});
 const data=await pdf.save(),reopened=await PDFDocument.load(data);assert.equal(reopened.getPageCount(),1);
 const {inspectPdfFontEmbedding}=await import('../src/pdf-font-audit.mjs');
 assert.ok((await inspectPdfFontEmbedding(new Blob([data],{type:'application/pdf'}))).fonts.some(f=>f.embedded));
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),job=pdfjs.getDocument({data:data.slice(),useSystemFonts:false,disableFontFace:true});
 try{const d=await job.promise;const t=await(await d.getPage(1)).getTextContent();assert.equal(t.items.map(x=>x.str||'').join('').replace(/\s/g,''),'한글');await d.cleanup();}finally{await job.destroy();}
});
