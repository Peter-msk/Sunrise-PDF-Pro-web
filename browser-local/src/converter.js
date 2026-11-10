import init, { HwpDocument } from '@rhwp/core';
import { tryProfessionalDocument } from './svg-professional.js';
import { loadPdfFonts, installMeasureFonts } from './pdf-fonts.js';
import { readDocumentBuffer } from './file-reader.js';
import { svgPageSize } from './page-geometry.js';
import { parseDocumentSvg } from './svg-embedded.js';
import { loadBundledFonts } from './bundled-fonts.js';
import { loadDocumentLocalFonts } from './local-fonts.js';
import { normalizeGifSvg } from './svg-gif.js';
import { normalizeEmbeddedPngSvg } from './svg-embedded-raster-budget.mjs';
import { normalizeSvgGrayscale } from './svg-safe-grayscale.mjs';

// File-size limits are intentionally absent. Runtime memory and page pixels
// remain bounded by the browser/device; those are not upload-size limits.
const MAX_PAGES=120,MAX_PIXELS=9_000_000,DETAIL_MAX_PIXELS=12_000_000;
const TARGET_DPI=300,DETAIL_DPI=360;
const OLE=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
function throwIfCancelled(signal){
 if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
}
let wasmPromise=null;

export function verifyFile(file,buf){
 if(!file || !Number.isFinite(file.size) || file.size<8 || buf.byteLength<8)
  throw Error('유효한 HWP/HWPX 파일을 선택하세요(최소 8바이트).');
 const b=new Uint8Array(buf,0,8);
 if(/\.hwp$/i.test(file.name)){
  if(!OLE.every((n,i)=>b[i]===n))throw Error('HWP OLE 파일 서명이 일치하지 않습니다.');
 }else if(/\.hwpx$/i.test(file.name)){
  if(!(b[0]===80&&b[1]===75&&b[2]===3&&b[3]===4))throw Error('HWPX ZIP 파일 서명이 일치하지 않습니다.');
 }else throw Error('HWP/HWPX만 지원합니다.');
 return true;
}
export function wasmSource(){return new URL('rhwp_bg.wasm',document.baseURI).href;}
export async function prepareWasm(){
 if(!wasmPromise){
  let ctx=null,last='';
  globalThis.measureTextWidth=(font,txt)=>{
   if(!ctx)ctx=document.createElement('canvas').getContext('2d');
   if(!ctx)return 0;
   if(font!==last){ctx.font=font;last=font;}
   return ctx.measureText(txt).width;
  };
  wasmPromise=init({module_or_path:wasmSource()}).catch(e=>{wasmPromise=null;throw e;});
 }
 await wasmPromise;
}
export function checkedSvg(svg){
 const root=parseDocumentSvg(svg);
 // Physical SVG viewport (mm, pt, in, px) determines paper size. The
 // viewBox only determines the drawing coordinate system inside that page.
 const {width,height}=svgPageSize({
  width:root.getAttribute('width'),height:root.getAttribute('height'),
  viewBox:root.getAttribute('viewBox')
 });
 return {svg:new XMLSerializer().serializeToString(root),width,height};
}
export function pageRenderProfile(checked){
 const parser=new DOMParser();
 const root=parser.parseFromString(checked.svg,'image/svg+xml').documentElement;
 const shapes=root.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse').length;
 const text=root.querySelectorAll('text,tspan').length;
 const denseDrawing=shapes>=180 && shapes>=text*2;
 const pixelLimit=denseDrawing?DETAIL_MAX_PIXELS:MAX_PIXELS;
 const targetDpi=denseDrawing?DETAIL_DPI:TARGET_DPI;
 const scale=Math.min(targetDpi/96,Math.sqrt(pixelLimit/(checked.width*checked.height)));
 return {shapes,text,denseDrawing,pixelLimit,targetDpi,scale};
}
export async function rasterPage(svg,signal){
 throwIfCancelled(signal);
 const checked=checkedSvg(svg);
 const {scale,pixelLimit}=pageRenderProfile(checked);
 const w=Math.max(1,Math.round(checked.width*scale));
 const h=Math.max(1,Math.round(checked.height*scale));
 if(w*h>pixelLimit+10000)throw Error('페이지 이미지 크기 제한 초과');
 const svgUrl=URL.createObjectURL(new Blob([checked.svg],{type:'image/svg+xml;charset=utf-8'}));
 let cvs=null;
 try{
  const img=new Image();
  await new Promise((ok,bad)=>{
   const done=(error)=>{
    img.onload=null;img.onerror=null;
    signal?.removeEventListener('abort',onAbort);
    if(error)bad(error);else ok();
   };
   const onAbort=()=>{
    img.removeAttribute('src');
    done(new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
   };
   img.onload=()=>done();
   img.onerror=()=>done(Error('SVG 이미지를 렌더링할 수 없습니다.'));
   signal?.addEventListener('abort',onAbort,{once:true});
   if(signal?.aborted){onAbort();return;}
   img.src=svgUrl;
  });
  throwIfCancelled(signal);
  cvs=document.createElement('canvas');cvs.width=w;cvs.height=h;
  const ctx=cvs.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Canvas 2D를 사용할 수 없습니다.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  const blob=await new Promise((ok,bad)=>cvs.toBlob(x=>x?ok(x):bad(Error('PNG 생성 실패')),'image/png'));
  throwIfCancelled(signal);
  return {blob,widthPt:Math.max(1,checked.width*72/96),heightPt:Math.max(1,checked.height*72/96)};
 }finally{
  if(cvs){cvs.width=1;cvs.height=1;}
  URL.revokeObjectURL(svgUrl);
 }
}

/**
 * @param {File} file HWP/HWPX, no arbitrary size ceiling.
 * @param {(progress: {stage:string,page:number,total:number})=>void} onProgress
 * @param {AbortSignal} [signal]
 * @param {{fontFile?:File,fontFiles?:File[]|FileList,engine?:'professional'}} [options]
 */
export async function convertToPdf(file,onProgress=()=>{},signal,options={}){
 options={engine:'professional',...options};
 if(options.engine!=='professional')throw Error('HWP/HWPX는 글자·도형 보존 출력만 지원합니다. 이미지 PDF 변환은 허용하지 않습니다.');
 throwIfCancelled(signal);
 // Check the first bytes before allocating a whole large file in browser RAM.
 // This removes the former 20MiB rejection without eliminating magic checks.
 const header=await file.slice(0,8).arrayBuffer();
 throwIfCancelled(signal);verifyFile(file,header);
 await prepareWasm();throwIfCancelled(signal);
 let buf;
 try{
  buf=await readDocumentBuffer(file,signal,progress=>
   onProgress({stage:'load',...progress}));
 }catch(e){
  if(e?.name==='AbortError')throw e;
  throw Error('파일 읽기 실패: 브라우저 가용 메모리 또는 파일 접근 상태를 확인하세요. '+String(e?.message||e));
 }
 throwIfCancelled(signal);
 let doc=null,releaseMeasureFonts=()=>{},pcFontStats=null;
 try{
  // A professional PDF must use the same faces during rhwp line measurement
  // and during PDFKit glyph embedding, or text wraps can drift.
  const selectedFonts=options.fontFiles!==undefined
    ?Array.from(options.fontFiles):options.fontFile?[options.fontFile]:[];
  let fontRegistry={faces:[]};
  if(options.engine==='professional'){
   const {default:fontkit}=await import('@pdf-lib/fontkit');
   throwIfCancelled(signal);
   const selected=selectedFonts.length?await loadPdfFonts(selectedFonts,fontkit,signal):{faces:[]};
   let local={faces:[]};
   if(options.localFonts){
    // Reuse the same rhwp document for font discovery AND PDF generation.
    // A second HwpDocument could reparse hundreds of MB of input on the UI thread.
    doc=new HwpDocument(new Uint8Array(buf));
    const pages=doc.pageCount();
    if(!Number.isInteger(pages)||pages<1||pages>MAX_PAGES)throw Error('페이지 수 제한: 1~120쪽');
    local=await loadDocumentLocalFonts(doc,pages,options.localFonts,fontkit,signal,onProgress);
   }
   const bundled=await loadBundledFonts(fontkit,signal);
   const localOnly=local.faces.filter(face=>!selected.faces.some(chosen=>chosen.bold===face.bold&&chosen.italic===face.italic&&face.aliases.some(alias=>chosen.aliases.includes(alias))));
   pcFontStats=options.localFonts?{
     listed:options.localFonts.length,selected:localOnly.length,
     required:local.requestedFamilies||0,unreadable:local.unreadableFonts||0
   }:null;
   fontRegistry={faces:[...selected.faces,...localOnly,...bundled.faces]};
   releaseMeasureFonts=await installMeasureFonts(fontRegistry,signal);
  }
  if(!doc)doc=new HwpDocument(new Uint8Array(buf));
  const count=doc.pageCount();
  if(!Number.isInteger(count)||count<1||count>MAX_PAGES)throw Error('페이지 수 제한: 1~120쪽');
  if(options.engine==='professional'){
   // A failed object-preserving export must stay failed, never become an image PDF.
   const resizedPngs=[],svgFilterStats=[];
   const result=await tryProfessionalDocument(doc,count,{
    checkedSvg:async svg=>{
     const gifSvg=await normalizeGifSvg(svg,signal);
     const pngResult=await normalizeEmbeddedPngSvg(gifSvg,signal);
     resizedPngs.push(...pngResult.resized);
     const grayResult=await normalizeSvgGrayscale(pngResult.svg,signal);
     if(grayResult.filtersApplied)svgFilterStats.push(grayResult);
     return checkedSvg(grayResult.svg);
    },rasterPage,signal,fontRegistry,onProgress,allowRasterFallback:false
   });
   if(resizedPngs.length){
    const unique=[...new Map(resizedPngs.map(img=>[
     img.sourceWidth+'x'+img.sourceHeight+'>'+img.width+'x'+img.height,img])).values()];
    result.warnings=[...(result.warnings||[]),...unique.map(img=>
     '문서의 대형 PNG '+img.sourceWidth+'×'+img.sourceHeight+' → '+
     img.width+'×'+img.height+' 픽셀로 축소했습니다. 글자·도형은 SVG로 유지됩니다.')];
   }
   if(svgFilterStats.length){
    const count=svgFilterStats.reduce((sum,page)=>sum+page.filtersApplied,0);
    const pictures=svgFilterStats.reduce((sum,page)=>sum+page.imagesChanged,0);
    result.warnings=[...(result.warnings||[]),
     '지원되는 회색조 SVG 필터 '+count+'개를 벡터 색상으로 보존·정규화했습니다'+
     (pictures?' (해당 필터의 내장 그림 '+pictures+'개는 객체 단위 픽셀 색상 변환)':'')+'.'];
   }
   if(pcFontStats){
    const used=result.fontUsage?.local||0;
    const bundledUsed=result.fontUsage?.bundled||0;
    const pcNote=used>0
     ?'PC 설치 글꼴 '+used+'개를 PDF 출력에서 실제 선택했습니다. 원본 줄바꿈과 서체를 확인하세요.'
     :pcFontStats.selected>0
      ?'PC 글꼴 후보 '+pcFontStats.selected+'개를 준비했지만 출력 단계에서 선택한 PC 글꼴은 0개입니다. 원본의 글꼴 이름·굵기·기울임을 확인하세요.'
      :'이번 문서에서 PC 글꼴 후보를 등록하지 못했습니다. 원본 지정 서체와 PC 설치 서체의 이름을 확인하세요.';
    const bundledNote=bundledUsed?' 내장 대체 글꼴 '+bundledUsed+'개가 PDF 출력에 사용됐습니다.':'';
    const readNote=pcFontStats.unreadable>0?' PC 글꼴 '+pcFontStats.unreadable+'개는 읽을 수 없어 건너뛰었습니다.':'';
    result.warnings=[...(result.warnings||[]),pcNote+bundledNote+readNote];
   }
   return result;
  }
 }catch(error){
  if(error instanceof RangeError || /out of memory|memory allocation|allocation failed/i.test(String(error?.message))){
   throw Error('브라우저 메모리 부족으로 변환하지 못했습니다. 파일 크기 제한은 없지만 기기 RAM 용량에 따라 변환이 어려울 수 있습니다.');
  }
  throw error;
 }finally{
  try{if(doc)doc.free();}
  finally{releaseMeasureFonts();}
 }
}

/** Prepare native browser-print SVG pages, without loading a PDF library.
 * The caller owns the returned pages and must free their DOM/print job when done.
 * This is not a background server conversion and does not impose a file-byte cap.
 */
export async function renderNativePrintPages(file,onProgress=()=>{},signal,fontFiles=[],localFonts=null){
 throwIfCancelled(signal);
 const header=await file.slice(0,8).arrayBuffer();
 verifyFile(file,header);
 await prepareWasm();throwIfCancelled(signal);
 let buffer;
 try{buffer=await readDocumentBuffer(file,signal,progress=>
   onProgress({stage:'load',...progress}));}
 catch(error){
  if(error?.name==='AbortError')throw error;
  throw Error('문서 메모리 읽기 실패: '+String(error?.message||error));
 }
 throwIfCancelled(signal);
 let doc,release=()=>{},fontRegistry={faces:[]};
 try{
  {
   const {default:fontkit}=await import('@pdf-lib/fontkit');
   throwIfCancelled(signal);
   const selected=fontFiles.length?await loadPdfFonts(fontFiles,fontkit,signal):{faces:[]};
   let local={faces:[]};
   if(localFonts){
    const probe=new HwpDocument(new Uint8Array(buffer));
    try{const pages=probe.pageCount();if(!Number.isInteger(pages)||pages<1||pages>MAX_PAGES)throw Error('페이지 수 제한: 1~120쪽');
     local=await loadDocumentLocalFonts(probe,pages,localFonts,fontkit,signal,onProgress);
    }finally{probe.free();}
   }
   const bundled=await loadBundledFonts(fontkit,signal);
   const localOnly=local.faces.filter(face=>!selected.faces.some(chosen=>chosen.bold===face.bold&&chosen.italic===face.italic&&face.aliases.some(alias=>chosen.aliases.includes(alias))));
   fontRegistry={faces:[...selected.faces,...localOnly,...bundled.faces]};
   release=await installMeasureFonts(fontRegistry,signal);
  }
  throwIfCancelled(signal);
  doc=new HwpDocument(new Uint8Array(buffer));
  const count=doc.pageCount();
  if(!Number.isInteger(count)||count<1||count>MAX_PAGES)
   throw Error('페이지 수 제한: 1~120쪽');
  const pages=[];
  for(let i=0;i<count;i++){
   throwIfCancelled(signal);
   pages.push(checkedSvg(await normalizeGifSvg(doc.renderPageSvgWithProfile(i,'print'),signal)));
   onProgress({stage:'print',page:i+1,total:count});
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  throwIfCancelled(signal);
  return {pages,fontRegistry};
 }finally{try{doc?.free();}finally{release();}}
}


