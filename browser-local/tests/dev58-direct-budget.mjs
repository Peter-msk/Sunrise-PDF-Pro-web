import test from 'node:test';
import {mockPdfBytes} from './fixtures/direct-mock-pdf.mjs';
import assert from 'node:assert/strict';
import {buildDirectPdf} from '../src/direct-pdf.mjs';
const bounds={x:0,y:0,width:800,height:1000},b={x:10,y:20,width:40,height:60};
const rect=()=>({type:'rectangle',bbox:b,cornerRadius:0,style:{fillColor:'#ffffff',strokeColor:null,strokeWidth:0,strokeDash:'solid',opacity:1},transform:{rotation:0,horzFlip:false,vertFlip:false}});
const leaf=(n,l)=>({kind:'leaf',bounds,ops:Array.from({length:n},rect),...(l?{layer:l}:{})});
const clip=child=>({kind:'clipRect',bounds,clip:b,clipKind:'tableCell',child});
const group=children=>({kind:'group',bounds,children});
const tree=root=>({schemaVersion:1,schemaMinorVersion:35,resourceTableVersion:1,resourceTableMinorVersion:6,unit:'px',coordinateSystem:'page-top-left-y-down',profile:'print',pageWidth:800,pageHeight:1000,resources:{},root});
const doc=roots=>({pageCount:()=>roots.length,getPageLayerTreeWithProfile:i=>JSON.stringify(tree(roots[i]))});
function harness(){
 let draws=0,saves=0,pages=0,opens=0,closes=0,depth=0;
 const page={drawRectangle:()=>{draws++;},pushOperators:(...ops)=>{for(const o of ops){if(o==='pushGraphicsState'){opens++;depth++;}if(o==='popGraphicsState'){closes++;depth--;if(depth<0)throw Error('STACK');}}}};
 const pdf={addPage:()=>{pages++;return page;},save:async()=>{saves++;return mockPdfBytes();}};
 const lib={PDFDocument:{create:async()=>pdf},rgb:(...v)=>v};
 for(const n of ['pushGraphicsState','popGraphicsState','rectangle','clip','endPath'])lib[n]=()=>n;
 return {options:{loadPdf:async()=>lib,yieldControl:async()=>{},allowLayers:true},stats:()=>({draws,saves,pages,opens,closes,depth})};
}
test('DEV58 shared clip prefix opens once for consecutive operations and restores state',async()=>{
 const h=harness(),r=await buildDirectPdf(doc([clip(leaf(1000))]),h.options);
 assert.deepEqual(h.stats(),{draws:1000,saves:1,pages:1,opens:1,closes:1,depth:0});
 assert.equal(r.metrics.clipTransitions,2);assert.equal(r.metrics.operations,1000);assert.equal(r.metrics.cooperativeYields,3);
});
test('DEV58 shared parent clip retained through sibling nested scopes',async()=>{
 const h=harness(),r=await buildDirectPdf(doc([clip(group([clip(leaf(2)),clip(leaf(3)),leaf(1)]))]),h.options);
 assert.equal(h.stats().draws,6);assert.equal(h.stats().opens,3);assert.equal(h.stats().closes,3);assert.equal(h.stats().depth,0);assert.equal(r.metrics.clipTransitions,6);
});
test('DEV58 clip state resets at each paint plane and page',async()=>{
 const h=harness(),front={textWrap:'inFrontOfText',zOrder:1,stableIndex:1};
 const r=await buildDirectPdf(doc([clip(group([leaf(1),leaf(1,front)])),clip(leaf(1))]),h.options);
 assert.equal(h.stats().opens,3);assert.equal(h.stats().closes,3);assert.equal(h.stats().pages,2);assert.equal(r.metrics.clipTransitions,6);
});
test('DEV58 cooperative cancellation restores open clip and never saves partial PDF',async()=>{
 const h=harness(),controller=new AbortController();
 await assert.rejects(buildDirectPdf(doc([clip(leaf(1000))]),{...h.options,signal:controller.signal,yieldControl:async()=>{controller.abort();}}),{name:'AbortError'});
 assert.equal(h.stats().draws,255);assert.equal(h.stats().saves,0);assert.equal(h.stats().depth,0);assert.equal(h.stats().opens,h.stats().closes);
});
test('DEV62 Direct PDF processes document operations beyond former 200k aggregate cap',async()=>{
 const h=harness(),root=leaf(10000);
 const r=await buildDirectPdf(doc(Array.from({length:21},()=>root)),h.options);
 assert.equal(h.stats().pages,21);assert.equal(h.stats().saves,1);
 assert.equal(r.metrics.operations,210000);
});
test('DEV58 invalid yield hook rejected before PDF allocation',async()=>{
 const h=harness();await assert.rejects(buildDirectPdf(doc([leaf(1)]),{...h.options,yieldControl:null}),/YIELD_CONTROL/);assert.equal(h.stats().pages,0);
});

test('DEV58 special form polyline expansion obeys shared vector command budget',async()=>{
 const h=harness(),form={type:'formObject',bbox:b,formType:'radioButton',caption:'',text:'',foreColor:'#000000',backColor:'#ffffff',value:1,enabled:true,drawing:{label:null,primitives:Array.from({length:100},()=>({kind:'polyline',points:Array.from({length:256},(_,i)=>[i,i]),width:1,color:'#000000',closed:false}))}};
 await assert.rejects(buildDirectPdf(doc([{kind:'leaf',bounds,ops:[form]}]),{...h.options,allowSpecial:true}),/PATH_PAGE_BUDGET/);
 assert.equal(h.stats().pages,0);assert.equal(h.stats().saves,0);
});
