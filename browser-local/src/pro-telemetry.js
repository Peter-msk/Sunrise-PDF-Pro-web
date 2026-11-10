/** Anonymous operational events for Sunrise PDF PRO web.
 * NO document bytes, names, paths, page text, user identifiers, or raw exception messages.
 * This is best-effort telemetry only: failures never block conversion.
 */
const sid=crypto.randomUUID();
let lastActivity=Date.now();
const acceptedFeatures=new Set(['hwp','hwpx','xlsx','xls','png','jpg','batch','ui','other']);
const acceptedStages=new Set(['none','load','fonts','font_scan','font_read','font_bundle','font_measure','parse','render','svg_build','svg_normalize','image_gif','image_png','image_filter','svg_sanitize','svg_preflight','svg_vector','svg_vector_done','pdf_finalize','pdf_stream','pdf_done','pdf','download','open','viewer','unknown']);
/** Classify only the extension. Never return the filename or directory. */
export function proFeature(file){
 const name=typeof file?.name==='string'?file.name:'';
 const m=/\.(hwp|hwpx|xls|xlsx|png|jpg|jpeg)$/i.exec(name);
 if(!m)return 'other';
 return m[1].toLowerCase()==='jpeg'?'jpg':m[1].toLowerCase();
}
export function classifyProError(error){
 const code=typeof error?.code==='string'?error.code:'';
 if(/^[A-Z][A-Z0-9_]{2,63}$/.test(code))return code;
 // Extract ONLY stable machine error tokens, never the surrounding free-text message.
 const match=String(error?.message||error||'').match(/\b(?:SVG|PDF|HWP|HWPX|PNG|FONT|WASM)_[A-Z0-9_]{3,55}\b/);
 return match?match[0]:'CONVERSION_FAILED';
}
export function emitProEvent(kind,{feature='ui',stage='none',error_code='NONE',duration_ms=0}={}){
 try{
  if(!acceptedFeatures.has(feature)||!acceptedStages.has(stage))return;
  const body=JSON.stringify({event_id:crypto.randomUUID(),session_id:sid,kind,feature,stage,
   error_code:/^(?:NONE|[A-Z][A-Z0-9_]{2,63})$/.test(error_code)?error_code:'CONVERSION_FAILED',
   duration_ms:Number.isSafeInteger(duration_ms)?Math.max(0,Math.min(3600000,duration_ms)):0});
  // Keep response opaque to the app; never stop conversion for telemetry failures.
  fetch('/api/public/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,credentials:'same-origin'}).catch(()=>{});
 }catch{}
}
export function startProTelemetry(){
 emitProEvent('visit',{feature:'ui'});
 for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{lastActivity=Date.now();},{passive:true});
 setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastActivity<60000)emitProEvent('active_30s',{feature:'ui',duration_ms:30000});},30000);
}
