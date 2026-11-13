import {cooperativeYield} from './cooperative-yield.mjs';
import init, { HwpDocument } from '@rhwp/core';
import { tryProfessionalDocument } from './svg-professional.js';
import { loadPdfFonts, installMeasureFonts, familyKey } from './pdf-fonts.js';
import { readDocumentBuffer } from './file-reader.js';
import { svgPageSize } from './page-geometry.js';
import {loadSvgRasterImage,encodeSvgRasterPng} from './raster-async-guard.mjs';
import { parseDocumentSvg } from './svg-embedded.js';
import { loadBundledFonts } from './bundled-fonts.js';
import { loadDocumentLocalFonts } from './local-fonts.js';
import { normalizeGifSvg } from './svg-gif.js';
import { normalizeEmbeddedPngSvg } from './svg-embedded-raster-budget.mjs';
import { normalizeSvgGrayscale } from './svg-safe-grayscale.mjs';
import { buildRasterCompatibilityPdf } from './raster-compat-pdf.mjs';
import {normalizeSvgForPdf} from './svg-filter-hybrid.mjs';

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
  await loadSvgRasterImage(img,svgUrl,signal);
  throwIfCancelled(signal);
  cvs=document.createElement('canvas');cvs.width=w;cvs.height=h;
  const ctx=cvs.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Canvas 2D를 사용할 수 없습니다.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  const blob=await encodeSvgRasterPng(cvs,signal);
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
 if(!['professional','compat-raster','hybrid-filter'].includes(options.engine))throw Error('HWP/HWPX 출력 방식을 확인하세요.');
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
  if(options.engine==='professional'||options.engine==='hybrid-filter'){
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
   onProgress({stage:'fonts',page:1,total:1,detail:'bundled'});
   const bundled=await loadBundledFonts(fontkit,signal);
   const localOnly=local.faces.filter(face=>!selected.faces.some(chosen=>chosen.bold===face.bold&&chosen.italic===face.italic&&face.aliases.some(alias=>chosen.aliases.includes(alias))));
   // Do not register every alias of six bundled fonts as a separate CSS face.
   // Only load aliases actually named in the HWP SVG. PDF face aliases remain
   // intact for embedding, while measurement avoids dozens of redundant loads.
   const required=new Set((local.requestedNames||[]).map(familyKey));
   const tailoredBundled=options.localFonts
    ?bundled.faces.map(face=>({...face,cssAliases:(face.cssAliases||[]).filter(name=>required.has(familyKey(name)))}))
    :bundled.faces;
   pcFontStats=options.localFonts?{
     listed:options.localFonts.length,selected:localOnly.length,
     required:local.requestedFamilies||0,matched:local.matchedFontData||0,
     // Local browser-only comparison evidence. Never include source family
     // names in anonymous Cloudflare telemetry or application logs.
     requestedNames:(local.requestedNames||[]).slice(0,120),
     matchedFaces:localOnly.slice(0,120).map(face=>({
       family:face.family,postscriptName:face.postscriptName||'',
       bold:face.bold,italic:face.italic
     })),
     unmatchedNames:local.unmatchedNames||[],unreadable:local.unreadableFonts||0,
     timedOut:local.timedOutFonts||0,budgetSkipped:local.skippedByBudget||0
   }:null;
   fontRegistry={faces:[...selected.faces,...localOnly,...tailoredBundled]};
   onProgress({stage:'fonts',page:1,total:1,detail:'measure'});
   releaseMeasureFonts=await installMeasureFonts(fontRegistry,signal,
    undefined,undefined,{skipUnavailable:true,maxTotalMs:18000,perFaceMs:3500});
   onProgress({stage:'fonts',page:1,total:1,detail:'complete'});
  }
  if(!doc)doc=new HwpDocument(new Uint8Array(buf));
  const count=doc.pageCount();
  if(!Number.isInteger(count)||count<1||count>MAX_PAGES)throw Error('페이지 수 제한: 1~120쪽');
  if(options.engine==='compat-raster'){
   // This option must be explicitly selected in the UI. It is never an
   // automatic downgrade of the original object-preserving PDF route.
   // Keep the WASM document alive until every asynchronous raster page is finished.
   // Returning an unawaited Promise would run the enclosing finally immediately,
   // freeing the document and causing "null pointer passed to rust".
   return await buildRasterCompatibilityPdf(doc,count,{signal,onProgress,rasterPage,
    preprocessSvg:async(rawSvg)=>{
     const hasImage=typeof rawSvg==='string'&&/image/i.test(rawSvg);
     const gifSvg=hasImage?await normalizeGifSvg(rawSvg,signal):rawSvg;
     const png=hasImage?await normalizeEmbeddedPngSvg(gifSvg,signal):{svg:gifSvg};
     return checkedSvg(png.svg).svg;
    }});
  }
  if(options.engine==='professional'||options.engine==='hybrid-filter'){
   // Explicit hybrid renders only SVG-filter-incompatible pages as images.
   // The normal high-fidelity mode still rejects any such filter.
   const resizedPngs=[],svgFilterStats=[];
   const result=await tryProfessionalDocument(doc,count,{
    checkedSvg:async(svg,meta={})=>{
     const progress=detail=>onProgress({
      stage:'professional',page:meta.page||1,total:meta.total||count,detail
     });
     // No embedded <image> can exist without the literal "image" in SVG.
     // A false positive only costs time. Parsing/security validation still run
     // in grayscale normalization and checkedSvg, even on this fast path.
     const hasImage=typeof svg==='string' && /image/i.test(svg);
     progress('image_gif');
     const gifSvg=hasImage?await normalizeGifSvg(svg,signal):svg;
     progress('image_png');
     const pngResult=hasImage?await normalizeEmbeddedPngSvg(gifSvg,signal):{svg:gifSvg,resized:[]};
     resizedPngs.push(...pngResult.resized);
     progress('image_filter');
     // No grayscale filter can act when the source contains neither a filter
     // declaration nor a stylesheet. Keep the normalizer for ambiguous CSS.
     // checkedSvg() still performs the full SVG security and geometry checks.
     const reviewFilters=/filter|<\s*style\b|\bstyle\s*=/i.test(pngResult.svg);
     let normalized;
     try{normalized=await normalizeSvgForPdf(pngResult.svg,
       reviewFilters?s=>normalizeSvgGrayscale(s,signal)
         :async s=>({svg:s,filtersApplied:0,imagesChanged:0}),
       checkedSvg,{hybrid:options.engine==='hybrid-filter'});}
     catch(error){
      if(String(error?.message||error)==='SVG_FILTER_EFFECT_UNSUPPORTED'){
       // A local-only, fixed-category diagnostic. Do not report SVG markup,
       // CSS values, filter IDs or source text to Cloudflare telemetry.
       const names={
        'unsafe-identity-target':'합성·불투명도·클리핑 안전성',
        'css-or-external':'미지원 CSS 또는 외부 필터 참조',
        'missing-definition':'필터 정의 없음',
        'multi-primitive':'복합 필터 체인',
        'blur':'흐림 또는 그림자',
        'blend':'색상 혼합',
        'composite':'합성',
        'displacement':'위치 변형',
        'other-primitive':'기타 SVG 필터 효과'
       };
       const category=Object.hasOwn(names,error?.filterCategory)
         ?names[error.filterCategory]:'미확인 효과';
       throw Error((meta.page||1)+'쪽에서 미지원 SVG 필터가 발견됐습니다 (SVG_FILTER_EFFECT_UNSUPPORTED; 분류: '+category+'). 혼합 출력 또는 이미지 PDF를 명시적으로 선택하세요.');
      }
      throw error;
     }
     if(normalized.stats.filtersApplied)svgFilterStats.push(normalized.stats);
     progress('svg_sanitize');
     return normalized.checked;
    },rasterPage,signal,fontRegistry,onProgress,
    ...(options.engine==='hybrid-filter'
      ?{allowRasterFallback:true,filterOnlyRasterFallback:true}
      :{allowRasterFallback:false})
   });
   if(options.engine==='hybrid-filter'&&result.rasterPages){
    result.warnings=[...(result.warnings||[]),
      '선택한 혼합 출력에서 미지원 SVG 필터가 있는 '+result.rasterPages+'쪽을 이미지로 변환했습니다. 나머지 쪽은 벡터입니다. 이미지 쪽의 글자 선택·검색은 불가능하며 원본과 대조해야 합니다.'];
   }
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
    result.sourceFontInventory={
      requested:pcFontStats.requestedNames,registered:pcFontStats.matchedFaces,
      missing:pcFontStats.unmatchedNames
    };
    const used=result.fontUsage?.local||0;
    const bundledUsed=result.fontUsage?.bundled||0;
    const pcNote=used>0
     ?'PC 설치 글꼴 '+used+'개를 PDF 벡터 출력 단계에서 선택했습니다. PDF 내부 글꼴 프로그램의 임베딩은 결과의 PDF 글꼴 확인 기능으로 별도 검사하세요.'
     :pcFontStats.selected>0
      ?'PC 글꼴 후보 '+pcFontStats.selected+'개를 준비했지만 출력 단계에서 선택한 PC 글꼴은 0개입니다. 원본의 글꼴 이름·굵기·기울임을 확인하세요.'
      :'이번 문서에서 PC 글꼴 후보를 등록하지 못했습니다. 원본 지정 서체와 PC 설치 서체의 이름을 확인하세요.';
    const bundledNote=bundledUsed?' 내장 대체 글꼴 '+bundledUsed+'개가 PDF 출력에 사용됐습니다.':'';
    const missing=pcFontStats.unmatchedNames||[];
    const matchNote=' 문서 지정 글꼴 '+pcFontStats.required+'종 중 PC 글꼴 후보 '+
     pcFontStats.matched+'개를 찾았으며 '+pcFontStats.selected+'개를 등록했습니다.';
    const missingNote=missing.length?' PC 글꼴에서 일치하는 서체를 등록하지 못한 이름: '+
     missing.slice(0,5).join(', ')+(missing.length>5?' 외 '+(missing.length-5)+'종':'')+'.':'';
    const readNote=pcFontStats.unreadable>0?' PC 글꼴 '+pcFontStats.unreadable+'개는 읽거나 분석할 수 없어 건너뛰었습니다.':'';
    const fontTimeoutNote=pcFontStats.timedOut||pcFontStats.budgetSkipped
     ?' 글꼴 읽기 지연 '+(pcFontStats.timedOut+pcFontStats.budgetSkipped)+'건으로 일부 PC 서체를 사용하지 못했습니다.':'';
    const measure=releaseMeasureFonts.stats;
    const measureNote=measure?.skipped
     ?' 측정용 글꼴 '+measure.skipped+'건을 제시간에 불러오지 못해 줄바꿈에 차이가 있을 수 있습니다.':'';
    // PDFKit resolves the exact named TTC face; FontFace(ArrayBuffer)
    // cannot select a specific member of a collection for layout measurement.
    const ttcNote=measure?.ttcMeasurementUnverified
     ?' TTC 컬렉션 '+measure.ttcMeasurementUnverified+'건은 브라우저 측정에서 정확한 face 지정이 불가능하여 OS 설치 글꼴 해석을 유지했습니다. PDF 임베딩과 줄바꿈을 직접 비교하세요.':'';
    result.warnings=[...(result.warnings||[]),pcNote+matchNote+bundledNote+missingNote+readNote+fontTimeoutNote+measureNote+ttcNote];
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
   onProgress({stage:'fonts',page:1,total:1,detail:'bundled'});
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
   await cooperativeYield({signal});
  }
  throwIfCancelled(signal);
  return {pages,fontRegistry};
 }finally{try{doc?.free();}finally{release();}}
}


