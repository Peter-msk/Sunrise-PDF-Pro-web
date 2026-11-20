import test from 'node:test';
import {mockPdfBytes} from './fixtures/direct-mock-pdf.mjs';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {readDirectPage,inspectDirectPage,buildDirectGeometryPdf} from '../src/direct-pdf.mjs';
const bounds={x:0,y:0,width:800,height:1000};
const rectangle={type:'rectangle',bbox:{x:20,y:30,width:40,height:50},cornerRadius:0,
 style:{fillColor:'#ffffff',strokeColor:'#000000',strokeWidth:2,strokeDash:'solid',opacity:1},
 transform:{rotation:0,horzFlip:false,vertFlip:false}};
const tree=ops=>({schemaVersion:1,schemaMinorVersion:35,resourceTableVersion:1,resourceTableMinorVersion:6,unit:'px',
 coordinateSystem:'page-top-left-y-down',profile:'print',pageWidth:800,pageHeight:1000,resources:{},root:{kind:'leaf',bounds,ops}});
const doc=pages=>({pageCount:()=>pages.length,getPageLayerTreeWithProfile(i,profile,img,font){assert.equal(profile,'print');assert.equal(img,false);assert.equal(font,false);return JSON.stringify(pages[i]);},renderPageSvgWithProfile(){throw Error('SVG_FORBIDDEN');}});
test('direct API calls print with exact pinned schema, not SVG',()=>{
 const t=readDirectPage(doc([tree([rectangle])]),0);
 assert.equal(inspectDirectPage(t).operations,1);
 assert.throws(()=>readDirectPage(doc([{...t,schemaMinorVersion:36}]),0),/DIRECT_PDF_SCHEMA/);
 assert.throws(()=>readDirectPage({pageCount:()=>1},0),/DIRECT_PDF_API_UNAVAILABLE/);
 assert.throws(()=>readDirectPage(doc([t]),1),/DIRECT_PDF_PAGE_INDEX/);
});
test('text, rawSvg and unsupported rectangle style are explicit blockers',()=>{
 const t=tree([rectangle,{type:'textRun',bbox:bounds,style:{fontFamily:'Original'}},{type:'rawSvg',bbox:bounds},{...rectangle,style:{...rectangle.style,opacity:.5}}]);
 const r=inspectDirectPage(readDirectPage(doc([t]),0));
 assert.equal(r.textRuns,1);assert.equal(r.svgReferences,1);
 assert.deepEqual(r.fontFamilies,['Original']);assert.deepEqual(r.blockers,['operation','rectangle-style']);
});
test('nested clipping and non-flow plane are never silently omitted',()=>{
 const t=tree([]);t.root={kind:'clipRect',bounds,clip:bounds,layer:{textWrap:'behindText'},child:{kind:'leaf',bounds,ops:[rectangle]}};
 const r=inspectDirectPage(readDirectPage(doc([t]),0));
 assert.deepEqual(r.blockers,['paint-plane','clip']);assert.equal(r.operations,1);
});
test('direct painter coordinates and cancellation; no partial publication',async()=>{
 const call=[];const fake={addPage:size=>{call.push(size);return {drawRectangle:r=>call.push(r)};},save:async()=>mockPdfBytes()};
 const loadPdf=async()=>({PDFDocument:{create:async()=>fake},rgb:(...v)=>v});
 const result=await buildDirectGeometryPdf(doc([tree([rectangle])]),{loadPdf});
 assert.equal(result.pages,1);assert.deepEqual(call[0],[600,750]);
 assert.equal(call[1].x,15);assert.equal(call[1].y,690);assert.equal(call[1].borderWidth,1.5);
 await assert.rejects(buildDirectGeometryPdf(doc([tree([rectangle]),tree([{type:'textRun',bbox:bounds}])]),{loadPdf}),/UNSUPPORTED_PAGE_2/);
 const c=new AbortController();c.abort();await assert.rejects(buildDirectGeometryPdf(doc([tree([rectangle])]),{loadPdf,signal:c.signal}),{name:'AbortError'});
});
test('real pdf-lib: direct geometry produces parseable vector pages without SVG',async()=>{
 const result=await buildDirectGeometryPdf(doc([tree([rectangle]),tree([rectangle])]));
 const pdf=await PDFDocument.load(result.bytes);assert.equal(pdf.getPageCount(),2);
 assert.deepEqual(pdf.getPage(0).getSize(),{width:600,height:750});
 assert.equal(result.rectangles,2);
});
