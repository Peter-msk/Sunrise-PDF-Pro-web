/**
 * Recover known, repeatable professional HWP failures without downgrading
 * any other document. The user's per-file click is the explicit consent to
 * create an image PDF: never infer consent from a failure or switch defaults.
 */
const RECOVERABLE_ERROR = /\b(?:SVG_FILTER_EFFECT_UNSUPPORTED|PDF_STREAM_TIMEOUT)\b/;

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

/** Plan a single, user-confirmed recovery or an ordinary batch. */
export function planConversion(items,selectedEngine,requestedRecovery=null) {
 if(!Array.isArray(items))throw Error('CONVERSION_QUEUE_INVALID');
 if(requestedRecovery){
  if(!items.includes(requestedRecovery)||!canRecoverFile(requestedRecovery))
   return {pending:[],engine:selectedEngine,recovery:false,cause:null};
  return {pending:[requestedRecovery],engine:'compat-raster',recovery:true,
   cause:recoveryCode(requestedRecovery.error)};
 }
 return {pending:items.filter(item=>['ready','failed','cancelled'].includes(item.state)),
  engine:selectedEngine,recovery:false,cause:null};
}
