import {localQaFilterReason} from './svg-filter-diagnostics.mjs';
/**
 * Local-only PDF PRO Web acceptance snapshot. Never reads original document
 * bytes, PDF contents, font names or complete filenames. No network access.
 */
// Explicit app marker: older v1 reports lack this field, even if saved later.
import {getVerifiedRhwpVersion} from './rhwp-wasm-loader.mjs';
export const QA_BUILD_REVISION='DEV49';
export function qaDeploymentChannel(host=globalThis.location?.hostname){
 if(host==='sunrise-pdf-pro-web-dev41-qa.ko-pg.workers.dev')return 'qa';
 if(host==='sunrise-pdf-pro-web.ko-pg.workers.dev')return 'production';
 if(['localhost','127.0.0.1','::1','[::1]'].includes(host))return 'local';
 return 'other';
}
const EXTENSIONS=new Set(['hwp','hwpx','xls','xlsx','jpg','jpeg','png']);
const STATES=new Set(['ready','working','done','failed','cancelled','invalid']);
const ENGINES=new Set(['professional','hybrid-filter','compat-raster']);
const PHASES=new Set(['load','xlsx_package','xlsx_parse','xlsx_layout','font_read',
 'font_bundle','font_measure','font_scan','fonts','file_read','hwp_open','hwp_page_count','svg_build','svg_normalize',
 'image_gif','image_png','image_filter','svg_sanitize','svg_preflight',
 'svg_vector','svg_vector_done','pdf_finalize','pdf_write','pdf_stream',
 'pdf_done','compat_raster','compat_page_done','compat_save','render']);
const ERROR_CODES=[
 'SVG_FILTER_EFFECT_UNSUPPORTED','SVG_RENDER_SOURCE_CHARS_LIMIT',
 'SVG_RENDER_SINGLE_PATH_LIMIT','SVG_RENDER_PAGE_PATH_LIMIT',
 'PDF_STREAM_TIMEOUT','FONT_GLYPH_MISSING',
 'HWP_PAGE_COUNT_LIMIT','HWP_PAGE_COUNT_INVALID','HWP_PAGE_COUNT_FAILED',
 'HWP_DOCUMENT_OPEN_FAILED','FILE_READ_FAILED',
 'FONT_FAMILY_OR_VARIANT_UNAVAILABLE','FONT_RUN_SPLIT_UNSUPPORTED',
 'XLSX_PARSE_FAILED','XLSX_ENGINE_UNAVAILABLE','XLSX_INPUT_BYTES_LIMIT',
 'XLS_INPUT_BYTES_LIMIT','FILE_READ_IDLE_TIMEOUT','PDF_RESULT_PAGE_COUNT_INVALID',
 'PDF_OUTPUT_BLOB_REQUIRED','PDF_OUTPUT_HEADER_INVALID',
 'PDF_OUTPUT_TRAILER_INCOMPLETE','PDF_OUTPUT_XREF_TARGET_INVALID',
 'PDF_OUTPUT_XREF_OFFSET_INVALID','PDF_OUTPUT_BYTES_LIMIT',
 'PDF_RESULT_BYTES_MISMATCH','FONT_FACE_SELECTION_AMBIGUOUS',
 'PNG_PDF_DECODE_BUDGET','PNG_PDF_IDAT_INVALID','PNG_PDF_IDAT_LENGTH_MISMATCH',
 'PNG_PDF_IDAT_CHECKSUM','PNG_IMAGE_DIMENSIONS_INVALID','PNG_EMBEDDED_DATA_INVALID',
 'PNG_EMBEDDED_BYTES_LIMIT','PNG_EMBEDDED_PAGE_TIMEOUT',
 'PNG_EMBEDDED_PAGE_INPUT_BUDGET_EXCEEDED','PNG_EMBEDDED_PAGE_PIXEL_BUDGET_EXCEEDED',
 'PNG_EMBEDDED_PAGE_BYTES_BUDGET_EXCEEDED','PNG_EMBEDDED_IMAGE_COUNT_LIMIT',
 'PNG_RESIZE_DECODE_TIMEOUT','PNG_RESIZE_ENCODE_TIMEOUT','PNG_RESIZE_DATAURL_TIMEOUT',
 'PNG_RESIZE_DECODE_DIMENSIONS_MISMATCH','PNG_RESIZE_ENCODE_FAILED','PNG_RESIZE_CANVAS_UNAVAILABLE',
 'SVG_EXTERNAL_RESOURCE','SVG_COMPLEXITY','WASM_INIT_FAILED','PROFESSIONAL_PDF_EMPTY',
 'PROFESSIONAL_PDF_INVALID_HEADER','PROFESSIONAL_DEPENDENCY_UNAVAILABLE'
];
const FONT_REASONS=new Set(['unsupported-style','glyph-not-in-registry','unsafe-mixed-run','no-single-covered-face','ambiguous-nested-face']);
const STYLE_REASONS=new Set(['weight-unsupported','style-unsupported']);
const WRITER_REASONS=new Set(['font-callback','resource-callback','renderer-warning','image-decode','recursion-limit','numeric-geometry','type-error','reference-error','unclassified']);
export function localQaFontStyleReason(error){
 return safeReason(error,/\[font_style_reason=([a-z-]+)\]/,STYLE_REASONS);
}
export function localQaWriterReason(error){
 return safeReason(error,/\[writer_reason=([a-z-]+)\]/,WRITER_REASONS);
}
const WRITER_STEPS=new Set(['font-register','page-add','image-embed','svg-render','pdf-end','pdf-collect']);
function safeReason(error,pattern,allowed){
 const value=pattern.exec(String(error||''))?.[1];
 return allowed.has(value)?value:null;
}
export function localQaFontReason(error){
 return safeReason(error,/\[font_reason=([a-z-]+)\]/,FONT_REASONS);
}
export function localQaWriterStep(error){
 return safeReason(error,/\[writer_step=([a-z-]+)\]/,WRITER_STEPS);
}
const STREAM_REASONS=new Set(['NO_BYTES','NO_FINAL_BYTES','FINAL_BYTES_NO_END','END_SEEN_NO_COMPLETION']);
const PDF_INTEGRITY=new Set(['PDF_OUTPUT_HEADER_INVALID','PDF_OUTPUT_TRAILER_INCOMPLETE',
 'PDF_OUTPUT_XREF_TARGET_INVALID','PDF_OUTPUT_XREF_OFFSET_INVALID',
 'PDF_OUTPUT_XREF_SOURCE_MISMATCH','PDF_OUTPUT_UNVERIFIED',
 'PDF_OUTPUT_VALIDATION_NOT_RUN']);
export function localQaStreamReason(error){
 const match=/\bPDF_STREAM_TIMEOUT \((NO_BYTES|NO_FINAL_BYTES|FINAL_BYTES_NO_END|END_SEEN_NO_COMPLETION)\b/.exec(String(error||''));
 return match&&STREAM_REASONS.has(match[1])?match[1]:null;
}
export function localQaStreamIntegrity(error){
 if(!localQaStreamReason(error))return null;
 const match=/\bintegrity=(PDF_OUTPUT_[A-Z_]+)\b/.exec(String(error||''));
 return match&&PDF_INTEGRITY.has(match[1])?match[1]:null;
}
export function localQaWriterPendingRefs(error){
 if(!localQaStreamReason(error))return null;
 const m=/\bref_waiting=(\d{1,6})\b/.exec(String(error||''));
 return m?safeCount(Number(m[1])):null;
}
const FILTER_PRIMITIVES=new Set(['color-matrix','component-transfer','chain','blur','blend','composite','displacement','other']);
export function localQaFilterPrimitive(error){
 if(!/\bSVG_FILTER_EFFECT_UNSUPPORTED\b/.test(String(error||'')))return null;
 const m=/\bprimitive=([a-z-]+)\b/.exec(String(error||''));
 return m&&FILTER_PRIMITIVES.has(m[1])?m[1]:null;
}
const FILTER_CATEGORIES=[
 ['unsafe-identity-target','합성·불투명도·클리핑 안전성'],
 ['css-or-external','미지원 CSS 또는 외부 필터 참조'],
 ['missing-definition','필터 정의 없음'],
 ['multi-primitive','복합 필터 체인'],
 ['blur','흐림 또는 그림자'],
 ['blend','색상 혼합'],
 ['composite','합성'],
 ['displacement','위치 변형'],
 ['other-primitive','기타 SVG 필터 효과']
];
export function localQaFilterCategory(error){
 const value=String(error||'');
 if(!/\bSVG_FILTER_EFFECT_UNSUPPORTED\b/.test(value))return null;
 const match=/분류:\s*([^);.\r\n]+)/.exec(value);
 if(!match)return 'unspecified';
 return FILTER_CATEGORIES.find(([,label])=>label===match[1].trim())?.[0]||'unspecified';
}
function extension(file){
 const m=/\.([a-z0-9]{2,5})$/i.exec(String(file?.name||''));
 const value=m?.[1].toLowerCase();
 return EXTENSIONS.has(value)?value:'other';
}
// Reporting must not erase page counts for legitimate 121+ page HWP/HWPX files.
export const LOCAL_QA_MAX_PAGES=100_000;
function safeCount(n){return Number.isSafeInteger(n)&&n>=0&&n<=LOCAL_QA_MAX_PAGES?n:null;}
function safeDuration(n){return Number.isFinite(n)&&n>=0&&n<=86400000?Math.round(n):null;}
export function localQaErrorCode(error){
 const value=String(error||'');
 for(const code of ERROR_CODES){
  // Never export arbitrary error messages, source names, paths, or original text.
  if(new RegExp('\\b'+code+'\\b').test(value))return code;
 }
 if(/\bXLSX_ZIP_[A-Z0-9_]+\b/.test(value))return 'XLSX_ZIP_ERROR';
 if(/\bPDF_OUTPUT_[A-Z0-9_]+\b/.test(value))return 'PDF_OUTPUT_ERROR';
 if(/\bFILE_READ_[A-Z0-9_]+\b/.test(value))return 'FILE_READ_ERROR';
 if(/\bPROFESSIONAL_SVG_WARNING_/.test(value))return 'PROFESSIONAL_SVG_WARNING';
 const writerStep=localQaWriterStep(value);
 if(writerStep)return 'PDF_WRITER_'+writerStep.replace(/-/g,'_').toUpperCase()+'_FAILED';
 return value?'OTHER_ERROR':null;
}
/** The caller downloads this in the same browser tab. No automatic upload. */
export function buildLocalBatchQaReport(items,{generatedAt=new Date().toISOString()}={}){
 if(!Array.isArray(items))throw Error('LOCAL_QA_QUEUE_INVALID');
 const generated=new Date(generatedAt);
 if(!Number.isFinite(generated.getTime()))throw Error('LOCAL_QA_TIME_INVALID');
 const records=items.map((item,i)=>{
  const state=STATES.has(item?.state)?item.state:'invalid';
  const engine=ENGINES.has(item?.lastEngine)?item.lastEngine:null;
  const phase=PHASES.has(item?._proDiagStage)?item._proDiagStage:null;
  const result=item?.result;
  return {
   index:i+1,format:extension(item?.file),state,engine,
   duration_ms:safeDuration(item?._proDurationMs),phase,
   error_code:state==='failed'?localQaErrorCode(item?.error):null,
   font_reason:state==='failed'?localQaFontReason(item?.error):null,
   font_style_reason:state==='failed'?localQaFontStyleReason(item?.error):null,
   writer_step:state==='failed'?localQaWriterStep(item?.error):null,
   writer_reason:state==='failed'?localQaWriterReason(item?.error):null,
   stream_reason:state==='failed'?localQaStreamReason(item?.error):null,
   stream_integrity:state==='failed'?localQaStreamIntegrity(item?.error):null,
   stream_pending_refs:state==='failed'?localQaWriterPendingRefs(item?.error):null,
   source_pages:safeCount(item?._proSourcePages),
   last_page:safeCount(item?._proLastPage),
   filter_category:state==='failed'?localQaFilterCategory(item?.error):null,
   filter_primitive:state==='failed'?localQaFilterPrimitive(item?.error):null,
   filter_reason:state==='failed'?localQaFilterReason(item?.error):null,
   pages:safeCount(result?.pages),
   vector_pages:safeCount(result?.vectorPages),
   raster_pages:safeCount(result?.rasterPages),
   // Numeric evidence only. Font family names and document content remain local.
   substituted_font_families:Array.isArray(result?.substituteFamilies)
    ?safeCount(result.substituteFamilies.length):null,
   bundled_font_faces:safeCount(result?.fontUsage?.bundled),
   pc_font_faces:safeCount(result?.fontUsage?.local),
   manual_font_faces:safeCount(result?.fontUsage?.selected),
   unmatched_pc_font_families:Array.isArray(result?.sourceFontInventory?.missing)
    ?safeCount(result.sourceFontInventory.missing.length):null
  };
 });
 const totals={queued:records.length,done:0,failed:0,ready:0,working:0,cancelled:0,invalid:0};
 const failureCodes={};
 for(const record of records){
  totals[record.state]++;
  if(record.state==='failed'){
   const code=record.error_code||'OTHER_ERROR';
   failureCodes[code]=(failureCodes[code]||0)+1;
  }
 }
 return {
  schema:'sunrise-pdf-pro-web-local-qa/v1',
  rhwp_version:getVerifiedRhwpVersion(),
  build_revision:QA_BUILD_REVISION,deployment_channel:qaDeploymentChannel(),
  generated_at:generated.toISOString(),
  privacy:'브라우저에서 직접 저장. 원본 파일명·경로·본문·글꼴·PDF 바이트를 포함하지 않음. 자동 전송 없음.',
  totals,failures_by_code:failureCodes,files:records
 };
}
