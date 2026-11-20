import test from 'node:test';
import {mockPdfBytes} from './fixtures/direct-mock-pdf.mjs';
import assert from 'node:assert/strict';
import {inspectDirectPage,buildDirectPdf,buildDirectGeometryPdf} from '../src/direct-pdf.mjs';
import {prepareDirectText} from '../src/direct-text.mjs';
import {isIdentityShapeTransform,hasOnlyKeys} from '../src/direct-contract.mjs';
import {mockFontBytes} from './fixtures/dev54-font-fixture.mjs';
const bounds={x:0,y:0,width:800,height:1000};
const rect={type:'rectangle',bbox:{x:10,y:20,width:40,height:60},cornerRadius:0,style:{fillColor:'#ffffff',strokeColor:null,strokeWidth:0,strokeDash:'solid',opacity:1},transform:{rotation:0,horzFlip:false,vertFlip:false}};
const tree=root=>({schemaVersion:1,schemaMinorVersion:35,resourceTableVersion:1,resourceTableMinorVersion:6,unit:'px',coordinateSystem:'page-top-left-y-down',profile:'print',pageWidth:800,pageHeight:1000,resources:{},root});
const leaf=ops=>({kind:'leaf',bounds,ops});
const doc=root=>({pageCount:()=>1,getPageLayerTreeWithProfile:()=>JSON.stringify(tree(root))});
test('audit: unsupported group transform rejected even in legacy geometry mode',async()=>{
 const root={kind:'group',bounds,groupKind:{kind:'group',paintTransform:[1,0,0,1,10,0]},children:[leaf([rect])]};
 assert.throws(()=>inspectDirectPage(tree(root)),/GROUP_TRANSFORM/);
 await assert.rejects(buildDirectGeometryPdf(doc(root),{loadPdf:async()=>({PDFDocument:{create:async()=>({})},rgb:()=>({})})}),/GROUP_TRANSFORM/);
});
test('audit: unknown rectangle and transform extensions cannot disappear silently',()=>{
 for(const changed of [{...rect,unknownVisual:true},{...rect,style:{...rect.style,unknownVisual:true}},{...rect,transform:{...rect.transform,scale:2}}]){
  assert.deepEqual(inspectDirectPage(tree(leaf([changed]))).blockers,['rectangle-style']);
 }
 assert.equal(isIdentityShapeTransform(rect.transform),true);
 assert.equal(hasOnlyKeys([],[]),false);
 assert.equal(inspectDirectPage(tree(leaf([rect]))).paint.length,1);
});
test('audit: first font run validated once and cached runs validated independently',async()=>{
 const bytes=mockFontBytes(),face={bytes,postscriptName:'Example-Regular',embeddingAllowed:true};
 let calls=0,embeds=0;
 const font={familyName:'Example',postscriptName:'Example-Regular',subfamilyName:'Regular',variationAxes:{},hasGlyphForCodePoint:()=>true,
 layout(t){calls++;return {glyphs:[...t].map(ch=>({id:ch.codePointAt(0),codePoints:[ch.codePointAt(0)]})),positions:[...t].map(()=>({xAdvance:1000,yAdvance:0,xOffset:0,yOffset:0}))};}};
 const pdf={embedFont:async()=>{embeds++;return {};}};const cache=new Map(),plan={family:'Example',bold:false,text:'한글',glyphs:[{ch:'한'},{ch:'글'}]};
 await prepareDirectText(pdf,plan,async()=>face,{create:()=>font},cache);assert.equal(calls,3);assert.equal(embeds,1);
 await prepareDirectText(pdf,plan,async()=>face,{create:()=>font},cache);assert.equal(calls,6);assert.equal(embeds,1);
});
test('audit: yield hook receives cancellation signal instead of a separate timer',async()=>{
 const signal=new AbortController().signal;let yields=0;
 const pdf={addPage:()=>({drawRectangle(){}}),save:async()=>mockPdfBytes()};
 const r=await buildDirectPdf(doc(leaf(Array.from({length:256},()=>rect))),{signal,loadPdf:async()=>({PDFDocument:{create:async()=>pdf},rgb:()=>({})}),yieldControl:async arg=>{assert.equal(arg.signal,signal);yields++;}});
 assert.equal(yields,1);assert.equal(r.metrics.cooperativeYields,1);
});
