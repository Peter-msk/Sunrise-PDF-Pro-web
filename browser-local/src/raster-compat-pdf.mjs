/**
 * Explicit, opt-in compatibility export for documents that the professional
 * SVG/PDFKit path cannot complete. It deliberately uses a DIFFERENT PDF writer
 * and browser-rendered pages so unsupported SVG filter effects remain visible.
 *
 * This output is page images, not selectable/vector text. Never call this from
 * the professional path as an automatic fallback or claim fidelity equivalence.
 * No file bytes are uploaded to the server.
 */
import {cooperativeYield} from './cooperative-yield.mjs';
import {assertCompletePdfBytes} from './pdf-output-integrity.mjs';
import {waitForImageOperation} from './svg-safe-grayscale.mjs';

const MAX_PAGES=120;
const MAX_OUTPUT_BYTES=512*1024*1024;
const PDF_SAVE_TIMEOUT_MS=120_000;
const cancelled=signal=>{
 if(signal?.aborted)throw new DOMException('호환 PDF 변환이 취소되었습니다.','AbortError');
};

export async function buildRasterCompatibilityPdf(hwpDoc,count,{
 signal,onProgress=()=>{},preprocessSvg,rasterPage,
 loadPdfLib=()=>import('pdf-lib')
}={}){
 if(!Number.isSafeInteger(count)||count<1||count>MAX_PAGES)
  throw Error('COMPAT_PAGE_COUNT_INVALID');
 if(typeof hwpDoc?.renderPageSvgWithProfile!=='function'||
    typeof preprocessSvg!=='function'||typeof rasterPage!=='function')
  throw Error('COMPAT_RENDERER_UNAVAILABLE');
 cancelled(signal);
 const library=await loadPdfLib();
 if(typeof library?.PDFDocument?.create!=='function')throw Error('COMPAT_PDF_DEPENDENCY_UNAVAILABLE');
 const pdf=await library.PDFDocument.create();
 cancelled(signal);
 for(let i=0;i<count;i++){
  cancelled(signal);
  const page=i+1;
  onProgress({stage:'professional',detail:'svg_build',page,total:count});
  // rhwp is synchronous. Yield before the WASM call, without claiming that
  // cancellation can interrupt a synchronous SVG render already in progress.
  await cooperativeYield({signal});cancelled(signal);
  const svg=hwpDoc.renderPageSvgWithProfile(i,'print');
  onProgress({stage:'professional',detail:'image_filter',page,total:count});
  const checked=await preprocessSvg(svg,page,count);
  cancelled(signal);
  onProgress({stage:'professional',detail:'compat_raster',page,total:count});
  // SVG filters are rendered by Chromium's SVG engine, not discarded or
  // approximated by PDFKit. rasterPage enforces the per-page pixel budget.
  const image=await rasterPage(checked,signal);
  cancelled(signal);
  if(!(image?.blob instanceof Blob)||image.blob.type!=='image/png'||
    !Number.isFinite(image.widthPt)||!Number.isFinite(image.heightPt)||
    image.widthPt<=0||image.heightPt<=0||image.widthPt>20000||image.heightPt>20000)
   throw Error('COMPAT_PAGE_IMAGE_INVALID');
  const bytes=new Uint8Array(await image.blob.arrayBuffer());
  cancelled(signal);
  const png=await pdf.embedPng(bytes);
  cancelled(signal);
  const sheet=pdf.addPage([image.widthPt,image.heightPt]);
  sheet.drawImage(png,{x:0,y:0,width:image.widthPt,height:image.heightPt});
  onProgress({stage:'professional',detail:'compat_page_done',page,total:count});
  await cooperativeYield({signal});
 }
 cancelled(signal);
 onProgress({stage:'professional',detail:'compat_save',page:count,total:count});
 const bytes=await waitForImageOperation(pdf.save({useObjectStreams:true}),
  signal,PDF_SAVE_TIMEOUT_MS,'COMPAT_PDF_SAVE_TIMEOUT');
 cancelled(signal);
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_OUTPUT_BYTES)
  throw Error('COMPAT_PDF_OUTPUT_BYTES_LIMIT');
 assertCompletePdfBytes(bytes,MAX_OUTPUT_BYTES);
 onProgress({stage:'professional',detail:'pdf_done',page:count,total:count});
 return {
  pdf:new Blob([bytes],{type:'application/pdf'}),pages:count,bytes:bytes.byteLength,
  renderMode:'raster-compat',vectorPages:0,rasterPages:count,
  warnings:[
   '호환 방식으로 전체 페이지를 고해상도 이미지 PDF로 저장했습니다. 글자 검색·선택 및 벡터 객체 편집은 지원하지 않습니다.',
   '복잡한 필터 및 글꼴 차이가 있을 수 있으므로 원본과 모든 페이지를 눈으로 비교하세요.'
  ]
 };
}
