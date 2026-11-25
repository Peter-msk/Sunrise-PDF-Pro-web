import {inputKind} from './input-types.js';

/**
 * Recover known, repeatable professional HWP failures without downgrading
 * any other document. The user's per-file click is the explicit consent to
 * create an image PDF: never infer consent from a failure or switch defaults.
 */
const RECOVERABLE_ERROR = /\b(?:SVG_FILTER_EFFECT_UNSUPPORTED|SVG_FILTER_PIPELINE_FAILED|SVG_VECTOR_RENDER_FAILED|PDF_STREAM_TIMEOUT|FONT_GLYPH_MISSING|SVG_RENDER_SOURCE_CHARS_LIMIT)\b/;

export function recoveryCode(error) {
 const message=String(error||'');
 const match=message.match(RECOVERABLE_ERROR);
 return match?.[0]||null;
}

export function canRecoverFile(item) {
 return !!item&&item.state==='failed'&&
  /\.(?:hwp|hwpx)$/i.test(String(item.file?.name||''))&&
  ['professional','hybrid-filter'].includes(item.lastEngine)&&!!recoveryCode(item.error);
}

/** Choose the least destructive explicit retry for the observed failure.
 * A first unsupported SVG filter only needs a per-page hybrid raster.
 * A PDF writer timeout needs the independent pdf-lib image writer.
 * If hybrid itself failed, do not offer the same hybrid loop again.
 */
export function recoveryEngine(item) {
 if(!canRecoverFile(item))return null;
 return recoveryCode(item.error)==='SVG_FILTER_EFFECT_UNSUPPORTED'&&
  item.lastEngine==='professional'?'hybrid-filter':'compat-raster';
}

/** Plan a single, user-confirmed recovery or an ordinary batch. */
export function planConversion(items,selectedEngine,requestedRecovery=null) {
 if(!Array.isArray(items))throw Error('CONVERSION_QUEUE_INVALID');
 if(requestedRecovery){
  if(!items.includes(requestedRecovery)||!canRecoverFile(requestedRecovery))
   return {pending:[],engine:selectedEngine,recovery:false,cause:null};
  return {pending:[requestedRecovery],engine:recoveryEngine(requestedRecovery),recovery:true,
   cause:recoveryCode(requestedRecovery.error)};
 }
 return {pending:items.filter(item=>['ready','failed','cancelled'].includes(item.state)),
  engine:selectedEngine,recovery:false,cause:null};
}

/** An explicit user click may recover several failed HWP/HWPX files at once.
 * No ready/cancelled/done file is included; each failure keeps its own least-
 * destructive engine choice. Never change the default professional engine.
 */
export function planBulkRecovery(items) {
 if(!Array.isArray(items))throw Error('CONVERSION_QUEUE_INVALID');
 const targets=items.filter(canRecoverFile).map(item=>({
  item,engine:recoveryEngine(item),cause:recoveryCode(item.error)
 }));
 return {pending:targets.map(target=>target.item),engine:null,
  recovery:targets.length>0,bulk:true,targets};
}

/** Retry a single failed/cancelled supported document without changing the
 * selected engine, retrying other failures, or downgrading output quality.
 * This only creates a plan after a direct per-file user action. */
export function planSingleRetry(items,selectedEngine,target){
 if(!Array.isArray(items))throw Error('CONVERSION_QUEUE_INVALID');
 const permitted=items.includes(target)&&['failed','cancelled'].includes(target?.state)&&
  !!inputKind(target?.file);
 return {pending:permitted?[target]:[],engine:selectedEngine,recovery:false,cause:null,
  singleRetry:permitted};
}

/** Fixed vocabulary guidance only. Never include raw document data or errors
 * in external reports; the file-row already shows the original local error. */
export function localFailureAdvice(error){
 const message=String(error||'');
 if(/\bXLSX_ZIP_[A-Z0-9_]+\b/.test(message))
  return '엑셀 파일을 읽을 수 없습니다. 파일 손상·암호화 여부를 확인하고 일반 엑셀 파일로 다시 저장하세요.';
 if(/\bXLSX_PARSE_FAILED\b/.test(message))
  return '엑셀 시트를 읽지 못했습니다. Excel 또는 호환 프로그램에서 다시 저장한 뒤 해당 파일만 재시도하세요.';
 if(/\bXLSX_ENGINE_UNAVAILABLE\b/.test(message))
  return '엑셀 처리 모듈 로드 실패: 네트워크 상태를 확인하고 페이지를 새로고침한 뒤 해당 파일을 다시 시도하세요.';
 if(/\b(?:FILE_READ_IDLE_TIMEOUT|FILE_READ_[A-Z0-9_]+)\b/.test(message))
  return '파일 읽기 실패: 파일 잠금·브라우저 메모리·저장장치 접근 상태를 확인하고 해당 파일만 다시 시도하세요.';
 if(/\b(?:SVG_FILTER_PIPELINE_FAILED|SVG_VECTOR_RENDER_FAILED)\b/.test(message))
  return '이 문서의 그림·도형을 기본 출력 방식으로 끝까지 처리하지 못했습니다. 이 파일만 이미지 PDF로 다시 변환할 수 있습니다. 이미지 PDF는 글자 검색이 불가능하며 원본과 결과를 비교해야 합니다.';
 if(/\bSVG_FILTER_EFFECT_UNSUPPORTED\b/.test(message))
  return '문서에 기본 출력 방식으로 처리할 수 없는 그림 효과가 있습니다. 혼합 방식으로 재시도하면 일부 페이지가 이미지로 저장되어 글자 검색이 제한될 수 있습니다. 저장 후 원본과 비교해 주세요.';
 if(/\bFONT_FAMILY_OR_VARIANT_UNAVAILABLE\b/.test(message))
  return '원본 글꼴 또는 굵기·기울임 스타일을 찾지 못했습니다. 해당 TTF/OTF를 추가한 뒤 기본 방식으로 재시도하세요. 글꼴이 없는 상태의 이미지 변환도 원본 모양을 보장하지 못하므로 자동 복구 대상에서 제외합니다.';
 if(/\bPDF_STREAM_TIMEOUT\b/.test(message))
  return 'PDF 저장 완료 신호를 받지 못했습니다. 불완전한 PDF는 제공하지 않습니다. 해당 파일만 이미지 PDF로 다시 시도할 수 있습니다.';
 if(/\bFONT_GLYPH_MISSING\b/.test(message))
  return '원본 글꼴이 부족해 일부 문자를 출력하지 못했습니다. 원본 글꼴을 추가하거나 이미지 방식으로 재시도하세요. 이미지 방식은 글자 검색을 지원하지 않습니다.';
 if(/\bSVG_RENDER_SOURCE_CHARS_LIMIT\b/.test(message))
  return '일부 페이지의 이미지·도형 데이터가 브라우저 렌더링 안전 범위를 초과했습니다. 문서 전체 용량 제한은 아닙니다. 해당 파일만 이미지 방식으로 다시 시도하거나 원본에서 큰 그림을 최적화하세요.';
 if(/\bWASM_INIT_FAILED\b/.test(message))
  return '변환 기능을 시작하지 못했습니다. 브라우저 메모리와 인터넷 연결을 확인한 뒤 다시 시도하세요.';
 if(/\bPDF_OUTPUT_[A-Z0-9_]+\b/.test(message))
  return '완성된 PDF를 확인하지 못했습니다. 불완전한 파일은 제공하지 않으며, 해당 파일을 다시 시도해 주세요.';
 return null;
}
