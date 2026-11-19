import test from 'node:test';
import assert from 'node:assert/strict';
import {directLayer,directPlane,directClip} from '../src/direct-layer.mjs';
import {inspectDirectPage,buildDirectPdf} from '../src/direct-pdf.mjs';
const b={x:10,y:20,width:40,height:60},bounds={x:0,y:0,width:800,height:1000};
const layer=(textWrap,masterPage=false)=>({textWrap,zOrder:0,stableIndex:0,masterPage});
const rect=(x=10)=>({type:'rectangle',bbox:{...b,x},cornerRadius:0,style:{fillColor:'#ffffff',strokeColor:null,strokeWidth:0,strokeDash:'solid',opacity:1},transform:{rotation:0,horzFlip:false,vertFlip:false}});
const leaf=(ops,l)=>({kind:'leaf',bounds,ops,...(l?{layer:l}:{})});
const group=(children,groupKind={kind:'generic'})=>({kind:'group',bounds,groupKind,children});
const clip=child=>({kind:'clipRect',bounds,clip:b,clipKind:'tableCell',child});
const pathClip=child=>({kind:'clipPath',bounds,paths:[{even_odd:true,commands:[{Move:[10,20]},{Line:[50,20]},{Cubic:[50,30,50,60,10,80]},'Close']}],child});
const tree=root=>({schemaVersion:1,schemaMinorVersion:35,resourceTableVersion:1,resourceTableMinorVersion:6,unit:'px',coordinateSystem:'page-top-left-y-down',profile:'print',pageWidth:800,pageHeight:1000,resources:{},root});
const doc=root=>({pageCount:()=>1,getPageLayerTreeWithProfile:()=>JSON.stringify(tree(root))});
test('DEV56 pinned planes, image wrap override and master cap',()=>{
 assert.deepEqual([directPlane({type:'pageBackground'},layer('inFrontOfText')),directPlane({type:'image',wrap:'behindText'},null),directPlane({type:'image',wrap:'behindText'},layer('square')),directPlane({type:'rectangle'},layer('inFrontOfText',true)),directPlane({type:'rectangle'},layer('inFrontOfText'))],[0,1,2,1,3]);
 assert.throws(()=>directLayer(layer('unknown')),/METADATA/);
});
test('DEV56 table and merged cell metadata retain upstream leaf sequence',()=>{
 const root=group([group([clip(leaf([rect(10),rect(20)]))],{kind:'tableCell',row:0,col:0,rowSpan:1,colSpan:2}),leaf([rect(30)])],{kind:'table',rowCount:1,colCount:2});
 const p=inspectDirectPage(tree(root),{allowLayers:true});assert.deepEqual([p.tableCount,p.cellCount,p.mergedCells],[1,1,1]);
 assert.deepEqual(p.paint.map(r=>[r.x,r.clips.length]),[[10,1],[20,1],[30,0]]);
 assert.deepEqual(inspectDirectPage(tree(root)).blockers,['clip']);
});
test('DEV56 clip path, malformed and unsupported clips fail closed',()=>{
 const p=directClip(pathClip(leaf([])));assert.equal(p.evenOdd,true);assert.equal(p.cost,4);
 assert.throws(()=>directClip({...pathClip(leaf([])),paths:[]}),/CLIP_PATH_COUNT/);
 assert.throws(()=>directClip({...clip(leaf([])),clipKind:'printBitmapFill'}),/CLIP_RECT/);
 assert.throws(()=>directClip({...pathClip(leaf([])),paths:[{even_odd:false,commands:[{Move:[0,0]},{Line:[1,1]}]}]}),/CLIP/);
});
test('DEV56 four planes and nested clip scope replay exact operator coordinates',async()=>{
 const calls=[];const page={drawRectangle:o=>calls.push(['draw',o.x]),pushOperators:(...v)=>calls.push(...v)};
 const lib={PDFDocument:{create:async()=>({addPage:()=>page,save:async()=>new Uint8Array([1])})},rgb:(...v)=>v};
 for(const n of ['pushGraphicsState','popGraphicsState','rectangle','clip','clipEvenOdd','endPath','moveTo','lineTo','appendBezierCurve','closePath'])lib[n]=(...v)=>[n,...v];
 const root=group([leaf([rect(70)],layer('inFrontOfText')),clip(pathClip(leaf([rect(30)]))),leaf([rect(20)],layer('behindText')),leaf([rect(40)])]);
 const result=await buildDirectPdf(doc(root),{allowLayers:true,loadPdf:async()=>lib});
 assert.equal(result.rectangles,4);assert.deepEqual(calls.filter(c=>c[0]==='draw'),[['draw',15],['draw',22.5],['draw',30],['draw',52.5]]);
 assert.deepEqual(calls.find(c=>c[0]==='rectangle'),['rectangle',7.5,690,30,45]);
 assert.equal(calls.filter(c=>c[0]==='pushGraphicsState').length,2);assert.equal(calls.filter(c=>c[0]==='popGraphicsState').length,2);
 assert.equal(calls.filter(c=>c[0]==='clipEvenOdd').length,1);
});
test('DEV56 transformed groups and clip depth do not silently render',()=>{
 assert.throws(()=>inspectDirectPage(tree(group([leaf([rect()])],{kind:'group',paintTransform:[1,0,0,1,10,0]})),{allowLayers:true}),/GROUP_TRANSFORM/);
 let root=leaf([rect()]);for(let i=0;i<17;i++)root=clip(root);
 assert.throws(()=>inspectDirectPage(tree(root),{allowLayers:true}),/CLIP_BUDGET/);
});
test('DEV56 actual clipped native PDF page',{timeout:45000},async()=>{
 const {PDFDocument}=await import('pdf-lib');
 const r=await buildDirectPdf(doc(clip(pathClip(leaf([rect()])))),{allowLayers:true});
 const pdf=await PDFDocument.load(r.bytes);assert.equal(pdf.getPageCount(),1);
 assert.deepEqual(pdf.getPage(0).getSize(),{width:600,height:750});
});
