/** R66-DEV3: conservative, pre-render resource guards.
 * No SVG parsing or rewriting here. The existing sanitizer remains authoritative.
 * These checks fail closed before especially expensive synchronous PDFKit work.
 */
export const MAX_SVG_SOURCE_CHARS = 64 * 1024 * 1024;
export const MAX_SINGLE_PATH_CHARS = 2 * 1024 * 1024;
export const MAX_PAGE_PATH_CHARS = 8 * 1024 * 1024;

export function assertSvgSourceWithinBudget(source,{maxChars=MAX_SVG_SOURCE_CHARS}={}){
  if(typeof source!=='string')throw Error('SVG_RENDER_INPUT_INVALID');
  if(!Number.isSafeInteger(maxChars)||maxChars<1)throw Error('SVG_RENDER_BUDGET_INVALID');
  if(source.length>maxChars)throw Error('SVG_RENDER_SOURCE_CHARS_LIMIT');
  return source.length;
}

/** Called as SVG elements are already traversed in the existing preflight.
 * Returns failure rather than silently truncating vector path geometry.
 */
export function checkSvgPathBudget(el,total=0,{
  maxSinglePath=MAX_SINGLE_PATH_CHARS,maxPagePaths=MAX_PAGE_PATH_CHARS
}={}){
  if(!Number.isSafeInteger(total)||total<0||
     !Number.isSafeInteger(maxSinglePath)||maxSinglePath<1||
     !Number.isSafeInteger(maxPagePaths)||maxPagePaths<maxSinglePath)
    return {ok:false,reason:'SVG_RENDER_BUDGET_INVALID'};
  if(el?.localName!=='path')return {ok:true,total};
  const d=el.getAttribute?.('d');
  const size=typeof d==='string'?d.length:0;
  if(size>maxSinglePath)return {ok:false,reason:'SVG_RENDER_SINGLE_PATH_LIMIT'};
  if(size>maxPagePaths-total)return {ok:false,reason:'SVG_RENDER_PAGE_PATH_LIMIT'};
  return {ok:true,total:total+size};
}
