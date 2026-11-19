import test from 'node:test';
import assert from 'node:assert/strict';
import {planDirectSpecial} from '../src/direct-special.mjs';
import {inspectDirectPage,buildDirectPdf} from '../src/direct-pdf.mjs';
const bounds={x:0,y:0,width:800,height:1000},bbox={x:10,y:20,width:100,height:40};
const form={type:'formObject',bbox,formType:'checkBox',caption:'',text:'',foreColor:'#000000',backColor:'#ffffff',value:1,enabled:true,drawing:{label:null,primitives:[{kind:'rect',bbox,color:'#ffffff'},{kind:'circle',x:20,y:35,radius:4,color:'#ff0000'},{kind:'polyline',points:[[10,20],[20,30],[30,20]],color:'#000000',width:2,closed:false}]}};
const label={text:'한',x:30,baseline:40,fontFamily:'Example',fontSize:12,bold:false,italic:false,color:'#000000'};
const tree=ops=>({schemaVersion:1,schemaMinorVersion:35,resourceTableVersion:1,resourceTableMinorVersion:6,unit:'px',coordinateSystem:'page-top-left-y-down',profile:'print',pageWidth:800,pageHeight:1000,resources:{},root:{kind:'leaf',bounds,ops}});
const doc=ops=>({pageCount:()=>1,getPageLayerTreeWithProfile:()=>JSON.stringify(tree(ops))});
test('DEV57 authoritative form primitives and single positioned label',()=>{
 const p=planDirectSpecial({...form,drawing:{...form.drawing,label}});
 assert.deepEqual(p.map(x=>x.kind),['rectangle','ellipse','path','text']);assert.deepEqual(p[3].glyphs,[{ch:'한',x:30,y:40}]);
 const a=planDirectSpecial({...form,drawing:{label:null,primitives:[{kind:'polyline',points:[[0,0],[4,0],[2,3]],color:'#000000',width:0,closed:true}]}})[0];
 assert.equal(a.fill,'#000000');assert.equal(a.stroke,null);
});
test('DEV57 equations, absent objects, complex labels and unknown primitives block',()=>{
 for(const type of ['equation','placeholder','footnoteMarker','textControlMark','textDecoration','tabLeader','charOverlap'])assert.throws(()=>planDirectSpecial({type,bbox}),/DIRECT_PDF_SPECIAL_/);
 assert.throws(()=>planDirectSpecial({...form,drawing:{...form.drawing,label:{...label,text:'여러 글자'}}}),/FORM_LABEL_LAYOUT/);
 assert.throws(()=>planDirectSpecial({...form,drawing:{...form.drawing,primitives:[{kind:'image',color:'#000000'}]}}),/FORM_PRIMITIVE/);
 assert.throws(()=>planDirectSpecial({...form,drawing:{primitives:[],label:null}}),/FORM_EMPTY/);
});
test('DEV57 opt-in special planning and text permission are explicit',()=>{
 assert.deepEqual(inspectDirectPage(tree([form])).blockers,['operation']);
 const p=inspectDirectPage(tree([form]),{allowSpecial:true,allowLayers:true});assert.equal(p.specialCount,1);assert.equal(p.specialItems,3);assert.deepEqual(p.paint.map(r=>r.plane),[2,2,2]);
 assert.throws(()=>inspectDirectPage(tree([{...form,drawing:{...form.drawing,label}}]),{allowSpecial:true}),/SPECIAL_TEXT_DISABLED/);
});
test('DEV57 static form vector native draw order and no partial equation output',async()=>{
 const calls=[];let saves=0;const page={drawRectangle:()=>calls.push('rect'),drawEllipse:()=>calls.push('circle'),pushOperators:()=>calls.push('path')};
 const lib={PDFDocument:{create:async()=>({addPage:()=>page,save:async()=>{saves++;return new Uint8Array([1]);}})},rgb:(...v)=>v};
 for(const n of ['pushGraphicsState','popGraphicsState','setStrokingColor','setLineWidth','moveTo','lineTo','stroke'])lib[n]=(...v)=>[n,...v];
 const options={allowSpecial:true,loadPdf:async()=>lib};
 const result=await buildDirectPdf(doc([form]),options);assert.deepEqual(calls,['rect','circle','path']);assert.equal(result.specialItems,3);assert.equal(saves,1);
 await assert.rejects(buildDirectPdf(doc([form,{type:'equation',bbox}]),options),/EQUATION_LAYOUT_UNSUPPORTED/);assert.equal(saves,1);
});
test('DEV57 actual static form PDF',{timeout:45000},async()=>{
 const {PDFDocument}=await import('pdf-lib');const r=await buildDirectPdf(doc([form]),{allowSpecial:true});assert.equal((await PDFDocument.load(r.bytes)).getPageCount(),1);
});
