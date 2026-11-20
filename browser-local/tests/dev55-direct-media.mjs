import test from 'node:test';
import {mockPdfBytes} from './fixtures/direct-mock-pdf.mjs';
import assert from 'node:assert/strict';
import {decodeImageBase64,inspectDirectPng,inspectDirectJpeg,planDirectImage,planDirectShape,verifyDirectPng} from '../src/direct-media.mjs';
import {buildDirectPdf,buildDirectGeometryPdf,inspectDirectPage} from '../src/direct-pdf.mjs';
// Original generated 2x2 RGB/RGBA samples, not user data.
import {PNG,JPG} from './fixtures/direct-media-fixture.mjs';
const bounds={x:0,y:0,width:800,height:1000},box={x:20,y:30,width:40,height:50};
const transform={rotation:0,horzFlip:false,vertFlip:false};
const style={fillColor:'#ff0000',strokeColor:'#0000ff',strokeWidth:2,strokeDash:'solid',opacity:1};
const image=(mime='image/jpeg',base64=JPG)=>({type:'image',bbox:box,imagePaintBBox:box,mime,base64,effect:'realPic',brightness:0,contrast:0,transform});
const line={type:'line',bbox:box,x1:20,y1:30,x2:60,y2:80,style:{color:'#ff0000',width:2,dash:'solid',lineType:'single',startArrow:'none',endArrow:'none',startArrowSize:0,endArrowSize:0},transform};
const ellipse={type:'ellipse',bbox:box,style,transform};
const path={type:'path',bbox:box,style,transform,commands:[{type:'moveTo',x:20,y:30},{type:'lineTo',x:60,y:30},{type:'curveTo',x1:60,y1:40,x2:50,y2:80,x3:20,y3:80},{type:'closePath'}]};
const tree=(ops,resources={})=>({schemaVersion:1,schemaMinorVersion:35,resourceTableVersion:1,resourceTableMinorVersion:6,unit:'px',coordinateSystem:'page-top-left-y-down',profile:'print',pageWidth:800,pageHeight:1000,resources,root:{kind:'leaf',bounds,ops}});
const doc=pages=>({pageCount:()=>pages.length,getPageLayerTreeWithProfile:(i,p,a,b)=>{assert.equal(p,'print');assert.equal(a,false);assert.equal(b,false);return JSON.stringify(pages[i]);},renderPageSvgWithProfile(){throw Error('SVG_FORBIDDEN');}});
test('DEV55 exact color PNG and JPEG binary headers, CRC and canonical base64',()=>{
 const p=inspectDirectPng(decodeImageBase64(PNG));assert.deepEqual([p.width,p.height,p.channels],[2,2,4]);
 assert.deepEqual(inspectDirectJpeg(decodeImageBase64(JPG)),{width:2,height:2,channels:3});
 const bad=decodeImageBase64(PNG);bad[40]^=1;assert.throws(()=>inspectDirectPng(bad),/PNG_CRC/);
 for(const s of ['AAAA=','A===','AB==','A A=','AA=A',''])assert.throws(()=>decodeImageBase64(s),/BASE64/);
 const j=decodeImageBase64(JPG);j[j.length-1]=0;assert.throws(()=>inspectDirectJpeg(j),/JPEG_SIGNATURE/);
});
test('DEV55 no effect loss, transform guess or nonlocal image lookup',()=>{
 for(const changes of [{effect:'blackWhite'},{effect:'grayScale'},{brightness:10},{crop:{}},{wrap:'behindText'},{transform:{...transform,rotation:90}},{mime:'image/svg+xml'},{imageBytesOmitted:true},{imagePrintFrame:[1,2,3,4]}])assert.throws(()=>planDirectImage({...image(),...changes},{}),/DIRECT_PDF_MEDIA_/);
 const keyed={...image(),sourceImageKey:'key'};
 assert.equal(planDirectImage(keyed,{imageKeys:['key'],images:[JPG]}).info.width,2);
 assert.throws(()=>planDirectImage(keyed,{imageKeys:['key'],images:[PNG]}),/IMAGE_RESOURCE_MISMATCH/);
 assert.throws(()=>planDirectImage(keyed,{imageKeys:['key','key'],images:[JPG,JPG]}),/IMAGE_KEY/);
 assert.throws(()=>planDirectImage({...keyed,base64:undefined},{imageKeys:['other'],images:[JPG]}),/IMAGE_BYTES_MISSING/);
});
test('DEV55 only bounded supported vector operations are planned',()=>{
 assert.equal(planDirectShape(line).kind,'line');assert.equal(planDirectShape(ellipse).kind,'ellipse');assert.equal(planDirectShape(path).commands.length,4);
 assert.throws(()=>planDirectShape({...line,style:{...line.style,dash:'dot'}}),/LINE_STYLE/);
 assert.throws(()=>planDirectShape({...ellipse,gradient:{}}),/SHAPE_TRANSFORM/);
 assert.throws(()=>planDirectShape({...path,commands:path.commands.slice(0,-1)}),/PATH_OPEN/);
 assert.throws(()=>planDirectShape({...path,commands:[{type:'arcTo'}, {type:'closePath'}]}),/PATH_COMMAND/);
});
test('DEV55 media remains opt-in and geometry API does not permit it',async()=>{
 assert.deepEqual(inspectDirectPage(tree([image(),line])).blockers,['operation']);
 assert.equal(inspectDirectPage(tree([image(),line]),{allowMedia:true}).mediaCount,2);
 const loadPdf=async()=>({PDFDocument:{create:async()=>({})},rgb:(...c)=>c});
 await assert.rejects(buildDirectGeometryPdf(doc([tree([image()])]),{allowMedia:true,loadPdf}),/UNSUPPORTED_PAGE_1/);
});
test('DEV55 image dedup, native draw order and geometry conversion without SVG',async()=>{
 const calls=[];let saves=0,embeds=0,decodes=0;
 const page={drawImage:(im,o)=>calls.push(['image',o]),drawLine:o=>calls.push(['line',o]),drawEllipse:o=>calls.push(['ellipse',o]),pushOperators:(...o)=>calls.push(['path',o])};
 const pdf={addPage:()=>page,embedJpg:async()=>{embeds++;return {width:2,height:2};},save:async()=>{saves++;return mockPdfBytes();}};
 const lib={PDFDocument:{create:async()=>pdf},rgb:(...v)=>v};
 for(const n of ['pushGraphicsState','popGraphicsState','setFillingColor','setStrokingColor','setLineWidth','moveTo','lineTo','appendBezierCurve','closePath','fillAndStroke','fill','stroke'])lib[n]=(...v)=>[n,...v];
 const options={allowMedia:true,loadPdf:async()=>lib,validateJpeg:async()=>{decodes++;}};
 const r=await buildDirectPdf(doc([tree([image(),line,ellipse,path,image()])]),options);
 assert.deepEqual(calls.map(c=>c[0]),['image','line','ellipse','path','image']);assert.equal(embeds,1);assert.equal(decodes,1);assert.equal(r.images,2);assert.equal(r.shapes,3);assert.equal(r.uniqueImages,1);
 assert.deepEqual(calls[0][1],{x:15,y:690,width:30,height:37.5,opacity:1});
 assert.deepEqual(calls[1][1].start,{x:15,y:727.5});
 assert.deepEqual(calls[2][1].x,30);assert.deepEqual(calls[2][1].y,708.75);
 assert.deepEqual(calls[3][1].find(o=>o[0]==='appendBezierCurve'),['appendBezierCurve',45,720,37.5,690,15,690]);
 await assert.rejects(buildDirectPdf(doc([tree([image()]),tree([{...image(),effect:'blackWhite'}])]),options),/UNSUPPORTED_PAGE_2/);
 assert.equal(saves,1);
});
test('DEV55 embedded image dimensions must match inspected image',async()=>{
 const loadPdf=async()=>({PDFDocument:{create:async()=>({addPage:()=>({}),embedJpg:async()=>({width:1,height:2})})},rgb:(...c)=>c});
 await assert.rejects(buildDirectPdf(doc([tree([image()])]),{allowMedia:true,loadPdf,validateJpeg:async()=>{}}),/IMAGE_EMBED_DIMENSIONS/);
});
test('DEV55 actual platform PNG inflate validates complete scanlines',async()=>{
 const info=inspectDirectPng(decodeImageBase64(PNG));await verifyDirectPng(info);
 await assert.rejects(verifyDirectPng({...info,height:1}),/PNG_EXPANSION/);
 await assert.rejects(verifyDirectPng({...info,height:3}),/PNG_EXPANSION/);
});
test('DEV55 actual pdf-lib PNG plus native vectors produces parsable PDF',async()=>{
 const {PDFDocument,PDFName}=await import('pdf-lib');
 const r=await buildDirectPdf(doc([tree([image('image/png',PNG),line,ellipse,path])]),{allowMedia:true});
 const pdf=await PDFDocument.load(r.bytes);assert.equal(pdf.getPageCount(),1);
 assert.equal(r.images,1);assert.equal(r.shapes,3);
 assert.deepEqual(pdf.getPage(0).getSize(),{width:600,height:750});
 const xobjects=pdf.getPage(0).node.Resources().lookup(PDFName.of('XObject'));assert.ok(xobjects.keys().length>=1);
});
