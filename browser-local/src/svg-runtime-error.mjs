/** Normalize unclassified browser/SVG errors without exporting source text.
 * An original Error (including its cause and stack) stays only in the browser.
 * Explicitly supported diagnostics and cancellation keep their original identity.
 */
const MACHINE_CODE=/\b(?:SVG|PDF|HWPX|HWP|XLSX|XLS|FILE|ZIP|PNG|GIF|FONT|PC_FONT|CSS_FONT|WASM)_[A-Z0-9_]{3,55}\b/;
const PHASE_CODES=Object.freeze({
 image_filter:'SVG_FILTER_PIPELINE_FAILED',
 svg_sanitize:'SVG_SANITIZE_PIPELINE_FAILED',
 svg_vector:'SVG_VECTOR_RENDER_FAILED'
});
export function stableSvgPipelineFailure(error,{stage='image_filter',page=0}={}){
 if(error?.name==='AbortError')return error;
 const message=String(error?.message||error||'');
 if(MACHINE_CODE.test(message)||MACHINE_CODE.test(String(error?.code||'')))return error;
 const code=PHASE_CODES[stage]||'SVG_RENDER_PIPELINE_FAILED';
 const index=Number.isSafeInteger(page)&&page>0&&page<=100000?page:null;
 const detail=index?index+'쪽 ':'';
 const failure=new Error(code+': '+detail+'문서의 그림·도형 처리 중 오류가 발생했습니다. 이 파일만 다른 출력 방식으로 다시 시도하세요.',{cause:error});
 failure.code=code;
 return failure;
}
