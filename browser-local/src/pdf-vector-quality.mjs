/**
 * DEV26 — Opt-in, browser-local PDF vector/raster verification.
 * Counts *pages* retained in vector mode, then inspects actual PDF.js drawing
 * operators. A vector page may legitimately contain photos. Operator counts
 * are structural evidence, NOT a pixel-area ratio or Hancom fidelity score.
 *
 * Never upload PDF bytes or source document details.
 */
const abortError=()=>new DOMException('PDF 품질 검사가 취소되었습니다.','AbortError');
const ensure=(condition,code)=>{if(!condition)throw Error(code);};
const IMAGE_OPS=[
 'paintImageXObject','paintJpegXObject','paintInlineImageXObject',
 'paintImageXObjectRepeat','paintInlineImageXObjectGroup',
 'paintImageMaskXObject','paintImageMaskXObjectRepeat',
 'paintImageMaskXObjectGroup','paintSolidColorImageMask'
];
const PATH_OPS=['constructPath'];
const PAINT_OPS=['stroke','closeStroke','fill','eoFill','fillStroke',
 'eoFillStroke','closeFillStroke','closeEOFillStroke'];
const TEXT_OPS=['showText','showSpacedText','nextLineShowText',
 'nextLineSetSpacingShowText'];

/** Validate the *converter's* disposition record without parsing PDF bytes. */
export function summarizeVectorPreservation(result){
 const count=result?.pages;
 ensure(Number.isSafeInteger(count)&&count>0&&count<=120,'PDF_VECTOR_PAGE_COUNT_INVALID');
 const vector=result.vectorPages,raster=result.rasterPages;
 ensure(Number.isSafeInteger(vector)&&vector>=0&&
  Number.isSafeInteger(raster)&&raster>=0&&vector+raster===count,
  'PDF_VECTOR_COUNTS_INCONSISTENT');
 const fallback=result.fallbackPages||[];
 ensure(Array.isArray(fallback)&&fallback.length===raster,
  'PDF_VECTOR_FALLBACK_COUNT_MISMATCH');
 const seen=new Set();
 for(const item of fallback){
  ensure(Number.isSafeInteger(item?.page)&&item.page>=1&&
    item.page<=count&&!seen.has(item.page),'PDF_VECTOR_FALLBACK_PAGE_INVALID');
  ensure(typeof item.reason==='string'&&item.reason.length>0&&
    item.reason.length<=120,'PDF_VECTOR_FALLBACK_REASON_INVALID');
  seen.add(item.page);
 }
 const expectedMode=vector===count?'professional':raster===count?'raster':'mixed';
 ensure(result.renderMode===expectedMode,'PDF_VECTOR_RENDER_MODE_MISMATCH');
 const percent=Math.round(vector/count*1000)/10;
 return {pageCount:count,vectorPages:vector,rasterPages:raster,
  vectorPagePercent:percent,
  // No claim about the proportion of vector *objects, area or glyphs*.
  rasterizedPageNumbers:[...seen].sort((a,b)=>a-b),
  rasterizedPages:fallback.map(x=>({page:x.page,reason:x.reason}))
    .sort((a,b)=>a.page-b.page),
  scope:'page-disposition-not-vector-object-or-pixel-area'};
}

/**
 * Reload a completed PDF using the same PDF.js parser as the preview.
 * A successful audit confirms page count, drawing structure and whether each
 * explicitly rasterized page truly contains an image-paint operator. It cannot
 * establish pixel equivalence to original HWP or correctness of all fonts.
 */
export async function inspectPdfVectorQuality(pdfBlob,converted,{
 signal,maxBytes=96*1024*1024,loadPdfJs=()=>import('pdfjs-dist/build/pdf.mjs'),
 workerSrc=null,maxPageOperators=750_000
}={}){
 if(signal?.aborted)throw abortError();
 const summary=summarizeVectorPreservation(converted);
 ensure(pdfBlob instanceof Blob&&pdfBlob.type==='application/pdf',
  'PDF_VECTOR_AUDIT_INPUT_INVALID');
 ensure(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=256*1024*1024,
  'PDF_VECTOR_AUDIT_BUDGET_INVALID');
 ensure(pdfBlob.size<=maxBytes,'PDF_VECTOR_AUDIT_TOO_LARGE');
 const lib=await loadPdfJs();
 if(workerSrc!==null)lib.GlobalWorkerOptions.workerSrc=workerSrc;
 if(signal?.aborted)throw abortError();
 const data=new Uint8Array(await pdfBlob.arrayBuffer());
 if(signal?.aborted)throw abortError();
 let task=null,aborted=false;
 const cancel=()=>{
  aborted=true;
  // PDF.js destruction cancels worker parsing and releases decoded images.
  if(task)Promise.resolve(task.destroy()).catch(()=>{});
 };
 signal?.addEventListener('abort',cancel,{once:true});
 const check=()=>{if(aborted||signal?.aborted)throw abortError();};
 const rasterSet=new Set(summary.rasterizedPageNumbers);
 const findings=[],pages=[];
 try{
  check();
  task=lib.getDocument({data,isEvalSupported:false,useSystemFonts:false,
   stopAtErrors:true,disableFontFace:true});
  const doc=await task.promise;check();
  ensure(doc.numPages===summary.pageCount,'PDF_VECTOR_PDF_PAGE_COUNT_MISMATCH');
  const ops=lib.OPS;
  for(let index=1;index<=doc.numPages;index++){
   check();
   const page=await doc.getPage(index);
   check();
   const vp=page.getViewport({scale:1});
   ensure(vp.width>0&&vp.height>0&&Number.isFinite(vp.width)&&
     Number.isFinite(vp.height),'PDF_VECTOR_PAGE_GEOMETRY_INVALID');
   const list=await page.getOperatorList();check();
   ensure(list.fnArray.length<=maxPageOperators,
     'PDF_VECTOR_OPERATOR_BUDGET_EXCEEDED');
   const count=new Map();
   for(const fn of list.fnArray)count.set(fn,(count.get(fn)||0)+1);
   const sum=names=>names.reduce((n,name)=>n+(count.get(ops[name])||0),0);
   const expectedRaster=rasterSet.has(index);
   const images=sum(IMAGE_OPS),paths=sum(PATH_OPS),
    paints=sum(PAINT_OPS),textPaints=sum(TEXT_OPS);
   if(expectedRaster&&images===0)
    findings.push({page:index,code:'RASTER_FALLBACK_IMAGE_MISSING',severity:'error'});
   if(!expectedRaster&&paths===0&&textPaints===0)
    findings.push({page:index,code:'VECTOR_DRAWING_EVIDENCE_ABSENT',severity:'review'});
   if(expectedRaster&&(paths>0||textPaints>0))
    findings.push({page:index,code:'RASTER_PAGE_HAS_OTHER_DRAWING',severity:'review'});
   pages.push({page:index,mode:expectedRaster?'raster-fallback':'vector',
    widthPt:Math.round(vp.width*100)/100,
    heightPt:Math.round(vp.height*100)/100,
    imagePaints:images,vectorPathOps:paths,vectorPaintOps:paints,
    textPaintOps:textPaints,operatorCount:list.fnArray.length,
    fallbackReason:expectedRaster?
      summary.rasterizedPages.find(x=>x.page===index)?.reason:null});
   page.cleanup();
  }
  return {...summary,pages,findings,
   structuralPass:!findings.some(x=>x.severity==='error'),
   definition:'페이지별 벡터 처리율 및 PDF 실제 그리기 명령을 확인합니다. 픽셀 면적·한컴 출력과의 시각적 동일성은 측정하지 않습니다.'};
 }finally{
  signal?.removeEventListener('abort',cancel);
  if(task)await Promise.resolve(task.destroy()).catch(()=>{});
 }
}
