/** DEV59 real browser acceptance; no mock PDF/font/decoder or production UI. */
import {buildDirectPdf,readDirectPage,inspectDirectPage} from '../src/direct-pdf.mjs';
import {validateDirectFace} from '../src/direct-font.mjs';
import {PNG,JPG} from './fixtures/direct-media-fixture.mjs';
import {directTextOp} from './fixtures/direct-text-fixture.mjs';
import fontkit from '@pdf-lib/fontkit';
import {PDFDocument} from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
const check=(condition,code)=>{if(!condition)throw Error('DEV59_'+code);};
const box=(x,y,width,height)=>({x,y,width,height});
const bounds=box(0,0,240,240),transform={rotation:0,horzFlip:false,vertFlip:false};
const rect=(bbox,fillColor,strokeColor=null,strokeWidth=0)=>({type:'rectangle',bbox,cornerRadius:0,style:{fillColor,strokeColor,strokeWidth,strokeDash:'solid',opacity:1},transform});
const image=(bbox,mime,base64)=>({type:'image',bbox,imagePaintBBox:bbox,mime,base64,effect:'realPic',brightness:0,contrast:0,transform});
const leaf=(ops)=>({kind:'leaf',bounds,ops});
const tree=root=>({schemaVersion:1,schemaMinorVersion:35,resourceTableVersion:1,resourceTableMinorVersion:6,unit:'px',coordinateSystem:'page-top-left-y-down',profile:'print',pageWidth:240,pageHeight:240,resources:{},root});
function source(t){return {pageCount:()=>1,getPageLayerTreeWithProfile:()=>JSON.stringify(t),renderPageSvgWithProfile(){throw Error('SVG_FORBIDDEN');}};}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function pixel(ctx,x,y){return [...ctx.getImageData(x,y,1,1).data];}
function similar(a,b,tolerance=6){return a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=tolerance);}
async function nativeDecode(encoded,mime){
 const b=Uint8Array.from(atob(encoded),s=>s.charCodeAt(0));
 const bitmap=await createImageBitmap(new Blob([b],{type:mime}),{imageOrientation:'none',colorSpaceConversion:'none'});
 try{check(bitmap.width===2&&bitmap.height===2,'NATIVE_IMAGE_DIMENSIONS');const c=canvas(2,2),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return [...ctx.getImageData(0,0,2,2).data];}finally{bitmap.close();}
}
async function parsePdf(bytes,render){
 const parsed=await PDFDocument.load(bytes);
 const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:false});
 try{const d=await task.promise;check(d.numPages===parsed.getPageCount(),'PARSER_PAGE_DISAGREEMENT');
  const texts=[];for(let i=1;i<=d.numPages;i++){const p=await d.getPage(i);texts.push((await p.getTextContent()).items.map(x=>x.str||'').join('').replace(/\s/g,''));}
  if(render){const p=await d.getPage(1),viewport=p.getViewport({scale:2});const c=canvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=c.getContext('2d');await p.render({canvasContext:ctx,canvas:c,viewport}).promise;return {pages:d.numPages,texts,ctx,width:c.width,height:c.height};}
  return {pages:d.numPages,textLengths:texts.map(t=>t.length)};
 }finally{await task.destroy();}
}
export async function runSyntheticReal(fontInput){
 const png=await nativeDecode(PNG,'image/png'),jpg=await nativeDecode(JPG,'image/jpeg');
 check(similar(png,[255,0,0,255,0,255,0,128,0,0,255,255,0,0,0,0],0),'NATIVE_PNG_COLOR_ALPHA');
 const bytes=Uint8Array.from(fontInput),font=fontkit.create(bytes);
 const face={family:font.familyName,postscriptName:font.postscriptName,bytes,embeddingAllowed:true,bold:false,italic:false};
 validateDirectFace(fontkit,face,face.family);
 const root={kind:'group',bounds,children:[
  leaf([rect(box(10,60,40,40),'#ff0000')]),
  {kind:'clipRect',bounds,clip:box(20,70,10,10),clipKind:'generic',child:leaf([rect(box(10,60,40,40),'#00ff00')])},
  leaf([rect(box(70,60,40,40),null,'#0000ff',2),image(box(10,120,40,40),'image/png',PNG),image(box(70,120,40,40),'image/jpeg',JPG),directTextOp('한글',face.family)])
 ]};
 const start=performance.now();
 const out=await buildDirectPdf(source(tree(root)),{allowMedia:true,allowLayers:true,allowSpecial:true,approvedFaces:[face]});
 const elapsedMs=performance.now()-start;
 const result=await parsePdf(out.bytes,true);
 check(result.pages===1&&result.width===360&&result.height===360,'PDF_DIMENSIONS');
 check(result.texts[0]==='한글','HANGUL_EXTRACTION');
 check(out.images===2&&out.uniqueImages===2&&out.glyphCount===2,'OBJECT_COUNTS');
 const p=(x,y)=>pixel(result.ctx,Math.round(x*1.5),Math.round(y*1.5));
 for(const [x,y,color] of [[15,65,[255,0,0,255]],[25,75,[0,255,0,255]],[40,90,[255,0,0,255]],[90,80,[255,255,255,255]],[90,60,[0,0,255,255]],[15,125,[255,0,0,255]],[45,125,[127,255,127,255]],[15,155,[0,0,255,255]],[45,155,[255,255,255,255]]])
  check(similar(p(x,y),color,12),'PIXEL_'+x+'_'+y);
 // JPEG source chroma and opacity survive actual PDF rendering.
 check(similar(p(75,125),jpg.slice(0,4),20),'JPEG_PIXEL');
 const bad=tree(leaf([{type:'equation',bbox:box(0,0,20,20)}]));
 let blocked=false;try{await buildDirectPdf(source(bad),{allowSpecial:true});}catch(e){blocked=String(e.message).includes('EQUATION_LAYOUT_UNSUPPORTED');}
 check(blocked,'UNSUPPORTED_EQUATION');
 return {status:'PASS',pages:result.pages,pdfBytes:out.bytes.length,elapsedMs:Math.round(elapsedMs),pixelChecks:10,hangul:true,images:out.images,nativePng:png,nativeJpeg:jpg,metrics:out.metrics};
}
export async function runPublicRhwp(input,fontInput){
 const {HwpDocument}=await import('@rhwp/core');
 const {prepareWasm}=await import('../src/converter.js');await prepareWasm();
 const bytes=Uint8Array.from(fontInput),font=fontkit.create(bytes);
 const approvedFaces=[{family:font.familyName,postscriptName:font.postscriptName,bytes,embeddingAllowed:true,bold:false,italic:false}];
 const doc=new HwpDocument(Uint8Array.from(input)),diagnostic=[];
 try{for(let i=0;i<doc.pageCount();i++){try{const p=inspectDirectPage(readDirectPage(doc,i),{allowText:true,allowMedia:true,allowLayers:true,allowSpecial:true});diagnostic.push({page:i+1,operations:p.operations,blockers:p.blockers,operationCounts:p.operationCounts});}catch(e){diagnostic.push({page:i+1,error:String(e.message).slice(0,160)});}}
  try{const start=performance.now();const r=await buildDirectPdf(doc,{allowMedia:true,allowLayers:true,allowSpecial:true,approvedFaces});const p=await parsePdf(r.bytes,false);
   check(p.pages===doc.pageCount()&&r.pages===p.pages,'RHWP_PAGE_COUNT');
   return {status:'CONVERTED_UNVERIFIED_VISUAL',pages:p.pages,pdfBytes:r.bytes.length,textLengths:p.textLengths,elapsedMs:Math.round(performance.now()-start),diagnostic};
  }catch(e){return {status:'BLOCKED',error:String(e.message).slice(0,160),diagnostic};}
 }finally{doc.free();}
}
