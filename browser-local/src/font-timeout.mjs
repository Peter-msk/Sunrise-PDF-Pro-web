/**
 * Bound individual browser local-font operations. FontData.blob() and
 * FontFace.load() have no reliable cancellation primitive in some browsers.
 * A timeout prevents them from keeping the entire batch pending indefinitely.
 *
 * This does not interrupt synchronous fontkit or rhwp/WASM CPU work.
 */
export function boundedFontStep(task,{signal,timeoutMs=4000,code='LOCAL_FONT_STEP_TIMEOUT'}={}){
 if(signal?.aborted)return Promise.reject(new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)
   return Promise.reject(Object.assign(new Error(code),{name:'TimeoutError',code}));
 return new Promise((resolve,reject)=>{
  let finished=false,timer;
  const finish=(callback,value)=>{
   if(finished)return;
   finished=true;clearTimeout(timer);
   signal?.removeEventListener('abort',abort);
   callback(value);
  };
  const abort=()=>finish(reject,new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>finish(reject,Object.assign(new Error(code),{name:'TimeoutError',code})),timeoutMs);
  Promise.resolve().then(()=>typeof task==='function'?task():task).then(
   value=>finish(resolve,value),error=>finish(reject,error)
  );
  if(signal?.aborted)abort();
 });
}
