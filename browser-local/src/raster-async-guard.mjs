/** R66-DEV23: bound browser SVG preview image loading and PNG encoding.
 * A deadline does not interrupt synchronous Canvas/native codec work.
 * It only bounds asynchronous waits and leaves the caller owning canvas cleanup.
 */
export const SVG_RASTER_LOAD_TIMEOUT_MS = 25_000;
export const SVG_RASTER_ENCODE_TIMEOUT_MS = 25_000;
const aborted = () => new DOMException('PDF 변환이 취소되었습니다.', 'AbortError');
function duration(ms){
 if(!Number.isSafeInteger(ms) || ms < 1 || ms > 120_000)
  throw Error('SVG_RASTER_TIMEOUT_INVALID');
 return ms;
}
/** Image is not recycled until the caller finishes drawImage. */
export function loadSvgRasterImage(image, url, signal, timeoutMs=SVG_RASTER_LOAD_TIMEOUT_MS){
 duration(timeoutMs);
 return new Promise((resolve,reject)=>{
  let settled=false,timer;
  const finish=(error)=>{
   if(settled)return;
   settled=true;
   clearTimeout(timer);
   image.onload=null;image.onerror=null;
   signal?.removeEventListener('abort',onAbort);
   if(error){try{image.removeAttribute('src');}catch{}reject(error);}else resolve();
  };
  const onAbort=()=>finish(aborted());
  image.onload=()=>finish();
  image.onerror=()=>finish(Error('SVG_RASTER_IMAGE_DECODE_FAILED'));
  signal?.addEventListener('abort',onAbort,{once:true});
  timer=setTimeout(()=>finish(Error('SVG_RASTER_IMAGE_LOAD_TIMEOUT')),timeoutMs);
  if(signal?.aborted){onAbort();return;}
  try{image.src=url;}catch(error){finish(error);}
 });
}
/** A late toBlob callback after timeout/abort must not alter the result. */
export function encodeSvgRasterPng(canvas,signal,timeoutMs=SVG_RASTER_ENCODE_TIMEOUT_MS){
 duration(timeoutMs);
 return new Promise((resolve,reject)=>{
  let settled=false,timer;
  const finish=(error,blob)=>{
   if(settled)return;
   settled=true;
   clearTimeout(timer);
   signal?.removeEventListener('abort',onAbort);
   if(error)reject(error);else resolve(blob);
  };
  const onAbort=()=>finish(aborted());
  signal?.addEventListener('abort',onAbort,{once:true});
  timer=setTimeout(()=>finish(Error('SVG_RASTER_PNG_ENCODE_TIMEOUT')),timeoutMs);
  if(signal?.aborted){onAbort();return;}
  try{canvas.toBlob(blob=>finish(blob?null:Error('SVG_RASTER_PNG_ENCODE_FAILED'),blob),'image/png');}
  catch(error){finish(error);}
 });
}
