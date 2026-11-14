/** A UI/telemetry observer must never abort PDF conversion in any format.
 * Error contents may include document information: log only the error class. */
export function safeConversionProgress(observer=()=>{}){
 return info=>{
  try{observer(info);}
  catch(error){console.warn('CONVERSION_PROGRESS_OBSERVER_FAILED',error?.name||'Error');}
 };
}
