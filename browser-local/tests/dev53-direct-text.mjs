import test from 'node:test';
import {mockPdfBytes} from './fixtures/direct-mock-pdf.mjs';
import {mockFontBytes} from './fixtures/dev54-font-fixture.mjs';
import assert from 'node:assert/strict';
import {planDirectText,validateIndependentGlyphs} from '../src/direct-text.mjs';
import {validateDirectFace} from '../src/direct-font.mjs';
import {buildDirectPdf,buildDirectGeometryPdf,inspectDirectPage} from '../src/direct-pdf.mjs';
const bounds={x:0,y:0,width:800,height:1000};
function op(text='한글',family='Example'){
 const style={fontFamily:family,fontSize:20,color:'#112233',bold:false,italic:false,ratio:1,
 underline:'none',strikethrough:false,outlineType:0,shadowType:0,emboss:false,engrave:false,
 superscript:false,subscript:false,emphasisDot:0,shadeColor:'#ffffff'};
 let utf8=0;const enc=new TextEncoder();
 const range=(start,end)=>({start,end});
 const clusters=Array.from(text,(ch,i)=>{const end=utf8+enc.encode(ch).length;
 const c={sourceRangeUtf8:range(utf8,end),textRangeUtf8:range(utf8,end),textRangeUtf16:range(i,i+1),
 projection:'verbatim',origin:{x:i*20,y:0},advance:{dx:20,dy:0}};utf8=end;return c;});
 return {type:'textRun',bbox:{x:10,y:20,width:text.length*20,height:24},text,baseline:16,rotation:0,
 isVertical:false,orientation:'horizontal',projectionKind:'verbatim',clusterBasis:'legacyPosition',style,paintStyle:{...style},
 placement:{runToPage:{a:1,b:0,c:0,d:1,e:10,f:36},baselineY:0},
 source:{id:1,utf8Range:range(0,utf8),utf16Range:range(0,text.length)},
 positions:Array.from({length:text.length+1},(_,i)=>i*20),clusters,charOverlap:null,fieldMarker:{kind:'none'}};
}
const tree=ops=>({schemaVersion:1,schemaMinorVersion:35,resourceTableVersion:1,resourceTableMinorVersion:6,unit:'px',
 coordinateSystem:'page-top-left-y-down',profile:'print',pageWidth:800,pageHeight:1000,resources:{},root:{kind:'leaf',bounds,ops}});
const doc=pages=>({pageCount:()=>pages.length,getPageLayerTreeWithProfile:i=>JSON.stringify(pages[i]),renderPageSvgWithProfile(){throw Error('SVG_FORBIDDEN');}});
const rect={type:'rectangle',bbox:{x:20,y:30,width:40,height:50},cornerRadius:0,
 style:{fillColor:'#ffffff',strokeColor:null,strokeWidth:0,strokeDash:'solid',opacity:1},transform:{rotation:0,horzFlip:false,vertFlip:false}};
const fakeFont={familyName:'Example',postscriptName:'Example-Regular',subfamilyName:'Regular',variationAxes:{},
 hasGlyphForCodePoint:()=>true,layout:t=>({glyphs:Array.from(t,c=>({id:c.codePointAt(0),codePoints:[c.codePointAt(0)]})),
 positions:Array.from(t,()=>({xAdvance:1000,yAdvance:0,xOffset:0,yOffset:0}))})};
function face(rights=0){return {bytes:mockFontBytes({rights}),embeddingAllowed:true,postscriptName:'Example-Regular'};}
const kit={create:()=>fakeFont};
test('DEV53 Hangul positions and UTF8/UTF16 ranges are explicit',()=>{
 const p=planDirectText(op());assert.equal(p.text,'한글');assert.deepEqual(p.glyphs,[{ch:'한',x:10,y:36},{ch:'글',x:30,y:36}]);
 const t=op();t.clusters[1].textRangeUtf8.start=1;assert.throws(()=>planDirectText(t),/CLUSTER/);
});
test('DEV53 rejects combining jamo, surrogate, PUA, newlines and unsupported paint',()=>{
 for(const t of ['한','한🙂','\uE000','한\n',''])assert.throws(()=>planDirectText(op(t)),/UNICODE_SCOPE/);
 for(const x of [{rotation:90},{displayText:'다름'},{variant:{}},{projectionKind:'fieldProjection'},{paintTransform:{}}])
 assert.throws(()=>planDirectText({...op(),...x}),/PROJECTION/);
 const t=op();t.style.italic=t.paintStyle.italic=true;assert.throws(()=>planDirectText(t),/STYLE/);
});
test('DEV53 rejects missing/decreasing positions and invalid baseline',()=>{
 const t=op();t.positions[1]=-1;assert.throws(()=>planDirectText(t),/ADVANCE|CLUSTER/);
 const u=op();u.placement.runToPage.f=90;assert.throws(()=>planDirectText(u),/PLACEMENT/);
 const v=op();v.source.utf8Range.end=1;assert.throws(()=>planDirectText(v),/SOURCE/);
});
test('DEV53 exact static family and embedding permission are mandatory',()=>{
 assert.equal(validateDirectFace(kit,face(),'Example').font,fakeFont);
 assert.throws(()=>validateDirectFace(kit,face(),'Another'),/FONT_IDENTITY/);
 assert.throws(()=>validateDirectFace(kit,face(2),'Example'),/FONT_RESTRICTED/);
 assert.throws(()=>validateDirectFace(kit,face(512),'Example'),/FONT_RESTRICTED/);
 assert.throws(()=>validateDirectFace(kit,{...face(),embeddingAllowed:false},'Example'),/FONT_INPUT/);
});
test('DEV53 rejects missing glyph and contextual shaping',()=>{
 const p=planDirectText(op());validateIndependentGlyphs(fakeFont,p);
 assert.throws(()=>validateIndependentGlyphs({...fakeFont,hasGlyphForCodePoint:()=>false},p),/GLYPH/);
 assert.throws(()=>validateIndependentGlyphs({...fakeFont,layout:t=>{const r=fakeFont.layout(t);if(t.length>1)r.positions[0].xOffset=1;return r;}},p),/SHAPING/);
});
test('DEV53 preserves text/rectangle order and exact px-to-point baseline',async()=>{
 const calls=[];let saved=0;
 const pdf={registerFontkit:()=>{},embedFont:async()=>({}),addPage:size=>{calls.push(size);return {drawRectangle:r=>calls.push(['rect',r.x]),drawText:(t,o)=>calls.push([t,o.x,o.y,o.size])};},save:async()=>{saved++;return mockPdfBytes();}};
 const options={resolveFont:async()=>face(),loadFontkit:async()=>kit,loadPdf:async()=>({PDFDocument:{create:async()=>pdf},rgb:(...v)=>v})};
 const r=await buildDirectPdf(doc([tree([op(),rect])]),options);
 assert.deepEqual(calls,[[600,750],['한',7.5,723,15],['글',22.5,723,15],['rect',15]]);
 assert.equal(r.glyphCount,2);assert.equal(r.textRuns,1);assert.equal(saved,1);
 await assert.rejects(buildDirectPdf(doc([tree([op()]),tree([{type:'rawSvg',bbox:bounds}])]),options),/UNSUPPORTED_PAGE_2/);
 assert.equal(saved,1);
 await assert.rejects(buildDirectGeometryPdf(doc([tree([op()])]),options),/UNSUPPORTED_PAGE_1/);
 const abort=new AbortController();abort.abort();
 await assert.rejects(buildDirectPdf(doc([tree([op()])]),{...options,signal:abort.signal}),{name:'AbortError'});
});
test('DEV54 bold text flows through approved registry and geometry wrapper stays disabled',async()=>{
 const regular={...face(),family:'Example',bold:false,italic:false};
 const b={...regular,bold:true,postscriptName:'Example-Bold',bytes:mockFontBytes({name:'Example-Bold',bold:true})};
 const t=op();t.style.bold=t.paintStyle.bold=true;
 const normal=op(),seen=[];let embeds=0;
 const pdf={registerFontkit:()=>{},embedFont:async()=>({id:++embeds}),addPage:()=>({drawText:(ch,o)=>seen.push([ch,o.font.id])}),save:async()=>mockPdfBytes()};
 let parses=0;const loadFontkit=async()=>({create:()=>++parses===1?fakeFont:{...fakeFont,postscriptName:'Example-Bold',subfamilyName:'Bold'}});
 const options={approvedFaces:[regular,b],loadFontkit,loadPdf:async()=>({PDFDocument:{create:async()=>pdf},rgb:(...v)=>v})};
 const r=await buildDirectPdf(doc([tree([normal,t,normal])]),options);
 assert.equal(r.textRuns,3);assert.equal(embeds,2);
 assert.deepEqual(seen,[['한',1],['글',1],['한',2],['글',2],['한',1],['글',1]]);
 await assert.rejects(buildDirectGeometryPdf(doc([tree([t])]),options),/UNSUPPORTED_PAGE_1/);
 await assert.rejects(buildDirectPdf(doc([tree([t])]),{...options,resolveFont:async()=>b}),/FONT_RESOLVER_CONFLICT/);
});
test('DEV53 real fontkit and pdf-lib PDF text extraction and embedded Korean face',{timeout:45000},async()=>{
 const {readFile}=await import('node:fs/promises');
 const fontkit=(await import('@pdf-lib/fontkit')).default;
 const bytes=Uint8Array.from(await readFile(new URL('../public/fonts/HakgyoansimBareondotumR.ttf',import.meta.url)));
 const font=fontkit.create(bytes);
 const r=await buildDirectPdf(doc([tree([op('한글',font.familyName)])]),{resolveFont:async()=>({bytes,postscriptName:font.postscriptName,embeddingAllowed:true})});
 const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.load(r.bytes);
 assert.equal(pdf.getPageCount(),1);assert.deepEqual(pdf.getPage(0).getSize(),{width:600,height:750});
 const {inspectPdfFontEmbedding}=await import('../src/pdf-font-audit.mjs');
 const audit=await inspectPdfFontEmbedding(new Blob([r.bytes],{type:'application/pdf'}));assert.ok(audit.fonts.some(f=>f.embedded));
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const job=pdfjs.getDocument({data:r.bytes.slice(),useSystemFonts:false,disableFontFace:true});
 try{const d=await job.promise;const t=await (await d.getPage(1)).getTextContent();assert.equal(t.items.map(x=>x.str||'').join('').replace(/\s/g,''),'한글');await d.cleanup();}finally{await job.destroy();}
});
