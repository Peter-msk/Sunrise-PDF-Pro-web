/** User-visible conversion messages. Engine codes remain in local QA logs. */
export function describeConversionError(raw){
 const message=String(raw??'');
 if(/\bDIRECT_PDF_[A-Z0-9_]+\b|\bUNSUPPORTED_PAGE_\d+\b/.test(message))
  return '이 문서의 일부 서식을 정밀 방식으로 출력할 수 없습니다. 기본 출력 방식을 선택해 다시 시도하세요.';
 if(/\b(?:WASM_INIT_FAILED|RHWP_[A-Z0-9_]+|HWP_PAGE_COUNT_FAILED)\b/.test(message))
  return '문서를 열거나 분석하지 못했습니다. 파일 손상 여부를 확인한 뒤 다시 시도하세요.';
 if(/\bPDF_(?:OUTPUT|STREAM|RESULT)_[A-Z0-9_]+\b/.test(message))
  return 'PDF 저장을 완료하지 못했습니다. 다른 출력 방식 또는 개별 파일 재시도를 이용하세요.';
 if(/\b(?:SVG_[A-Z0-9_]+|FONT_[A-Z0-9_]+|XLSX_[A-Z0-9_]+|IMAGE_[A-Z0-9_]+|FILE_READ_[A-Z0-9_]+)\b/.test(message))
  return '문서의 형식 또는 일부 내용 처리에 실패했습니다. 파일을 확인하거나 다른 출력 방식으로 다시 시도하세요.';
 if(/[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}/.test(message))
  return '파일을 처리하는 동안 오류가 발생했습니다. 파일 상태를 확인한 뒤 다시 시도하세요.';
 return message.slice(0,240)||'파일을 변환하지 못했습니다. 다시 시도하세요.';
}
export const outputModeText=Object.freeze({
 'direct-trial':'정밀 변환',
 'professional':'글자·도형 보존',
 'mixed':'혼합 PDF · 일부 페이지는 이미지',
 'raster-compat':'이미지 PDF · 글자 검색 불가',
 'raster':'이미지 PDF · 글자 검색 불가',
 'spreadsheet-text':'표·글자 보존',
 'source-image':'이미지 PDF'
});
