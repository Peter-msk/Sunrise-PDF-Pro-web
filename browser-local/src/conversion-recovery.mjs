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
