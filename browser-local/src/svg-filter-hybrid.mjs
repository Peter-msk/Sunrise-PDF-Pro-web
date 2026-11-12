/**
 * Explicit hybrid-only bridge for SVG filters that svg-to-pdfkit cannot render.
 * Never bypass the sanitizing checkedSvg boundary or silently downgrade the
 * professional output. The returned marker is consumed only after opt-in.
 */
export const UNSUPPORTED_FILTER = 'SVG_FILTER_EFFECT_UNSUPPORTED';

export async function normalizeSvgForPdf(svg,normalize,check,{hybrid=false}={}){
  if(typeof svg!=='string'||typeof normalize!=='function'||typeof check!=='function')
    throw Error('HYBRID_SVG_CONTRACT_INVALID');
  let normalized;
  try{
    normalized=await normalize(svg);
  }catch(error){
    if(!hybrid||String(error?.message||error)!==UNSUPPORTED_FILTER)throw error;
    // Sanitization must still happen BEFORE browser rasterization. The
    // SVG may contain a filter, but no active/external resources are allowed.
    const checked=check(svg);
    return {checked:{...checked,forceRasterReason:UNSUPPORTED_FILTER},
      stats:{filtersApplied:0,imagesChanged:0},rasterizedByChoice:true};
  }
  if(!normalized||typeof normalized.svg!=='string')throw Error('HYBRID_SVG_NORMALIZE_INVALID');
  return {checked:check(normalized.svg),stats:normalized,rasterizedByChoice:false};
}
