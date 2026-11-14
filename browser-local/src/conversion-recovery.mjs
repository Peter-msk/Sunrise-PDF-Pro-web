import {inputKind} from './input-types.js';

/**
 * Recover known, repeatable professional HWP failures without downgrading
 * any other document. The user's per-file click is the explicit consent to
 * create an image PDF: never infer consent from a failure or switch defaults.
 */
const RECOVERABLE_ERROR = /\b(?:SVG_FILTER_EFFECT_UNSUPPORTED|PDF_STREAM_TIMEOUT|FONT_GLYPH_MISSING)\b/;

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
  return 'XLSX 내부 ZIP 구조 검증 실패: 파일 손상·압축 구조·암호화 여부를 확인하고 정상 XLSX로 다시 저장하세요. 안전 검사는 생략하지 않습니다.';
 if(/\bXLSX_PARSE_FAILED\b/.test(message))
  return 'XLSX 시트 해석 실패: Excel 또는 호환 프로그램에서 일반 XLSX로 다시 저장한 후 해당 파일만 다시 시도하세요.';
 if(/\bXLSX_ENGINE_UNAVAILABLE\b/.test(message))
  return '엑셀 처리 모듈 로드 실패: 네트워크 상태를 확인하고 페이지를 새로고침한 뒤 해당 파일을 다시 시도하세요.';
 if(/\b(?:FILE_READ_IDLE_TIMEOUT|FILE_READ_[A-Z0-9_]+)\b/.test(message))
  return '파일 읽기 실패: 파일 잠금·브라우저 메모리·저장장치 접근 상태를 확인하고 해당 파일만 다시 시도하세요.';
 if(/\bSVG_FILTER_EFFECT_UNSUPPORTED\b/.test(message))
  return 'SVG 그림 효과가 기본 벡터 출력 엔진에서 지원되지 않습니다. 이 파일만 혼합 PDF로 복구하면 해당 쪽만 이미지가 되어 글자 검색이 제한됩니다. 혼합 출력도 실패한 경우 호환 이미지 PDF를 직접 선택하세요. 원본과 출력 결과를 확인하세요.';
 if(/\bFONT_GLYPH_MISSING\b/.test(message))
  return '원본 서체의 일부 문자를 PDF에 넣을 수 없습니다. 원본 글꼴을 추가하거나 글자 검색이 불가능한 이미지 PDF 복구를 직접 선택하세요.';
 if(/\bPDF_OUTPUT_[A-Z0-9_]+\b/.test(message))
  return '생성된 PDF의 완전성 검사 실패: 잘린 파일은 제공하지 않습니다. 해당 파일만 다시 시도하세요.';
 return null;
}
