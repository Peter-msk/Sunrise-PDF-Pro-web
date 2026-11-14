/**
 * Local-only PDF PRO Web acceptance snapshot. Never reads original document
 * bytes, PDF contents, font names or complete filenames. No network access.
 */
const EXTENSIONS=new Set(['hwp','hwpx','xls','xlsx','jpg','jpeg','png']);
const STATES=new Set(['ready','working','done','failed','cancelled','invalid']);
const ENGINES=new Set(['professional','hybrid-filter','compat-raster']);
const PHASES=new Set(['load','xlsx_package','xlsx_parse','xlsx_layout','font_read',
 'font_bundle','font_measure','font_scan','fonts','svg_build','svg_normalize',
 'image_gif','image_png','image_filter','svg_sanitize','svg_preflight',
 'svg_vector','svg_vector_done','pdf_finalize','pdf_write','pdf_stream',
 'pdf_done','compat_raster','compat_page_done','compat_save','render']);
const ERROR_CODES=[
 'SVG_FILTER_EFFECT_UNSUPPORTED','PDF_STREAM_TIMEOUT','FONT_GLYPH_MISSING',
 'FONT_FAMILY_OR_VARIANT_UNAVAILABLE','FONT_RUN_SPLIT_UNSUPPORTED',
 'XLSX_PARSE_FAILED','XLSX_ENGINE_UNAVAILABLE','XLSX_INPUT_BYTES_LIMIT',
 'XLS_INPUT_BYTES_LIMIT','FILE_READ_IDLE_TIMEOUT','PDF_RESULT_PAGE_COUNT_INVALID',
 'PDF_OUTPUT_BLOB_REQUIRED','PDF_OUTPUT_HEADER_INVALID',
 'PDF_OUTPUT_TRAILER_INCOMPLETE','PDF_OUTPUT_XREF_TARGET_INVALID',
 'PDF_OUTPUT_XREF_OFFSET_INVALID','PDF_OUTPUT_BYTES_LIMIT',
 'PDF_RESULT_BYTES_MISMATCH'
];
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
function safeCount(n){return Number.isSafeInteger(n)&&n>=0&&n<=120?n:null;}
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
   filter_category:state==='failed'?localQaFilterCategory(item?.error):null,
   pages:safeCount(result?.pages),
   vector_pages:safeCount(result?.vectorPages),
   raster_pages:safeCount(result?.rasterPages)
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
  generated_at:generated.toISOString(),
  privacy:'브라우저에서 직접 저장. 원본 파일명·경로·본문·글꼴·PDF 바이트를 포함하지 않음. 자동 전송 없음.',
  totals,failures_by_code:failureCodes,files:records
 };
}
