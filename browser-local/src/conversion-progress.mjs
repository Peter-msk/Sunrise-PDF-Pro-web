/** A UI/telemetry observer must never abort PDF conversion in any format.
 * Error contents may include document information: log only the error class. */
export function safeConversionProgress(observer=()=>{}){
 return info=>{
  try{observer(info);}
  catch(error){
   const kind=/^(?:Error|TypeError|RangeError|ReferenceError|SyntaxError|AbortError|TimeoutError)$/.test(error?.name)?error.name:'Error';
   console.warn('CONVERSION_PROGRESS_OBSERVER_FAILED',kind);
  }
 };
}
