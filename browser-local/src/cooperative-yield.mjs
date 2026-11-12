/**
 * Yield conversion work without relying on a chain of zero-delay timers.
 * Chrome clamps repeated setTimeout callbacks in hidden/minimized tabs.
 * scheduler.yield() is preferred; MessageChannel is a non-timer fallback.
 * A fully frozen/discarded page cannot execute JS; this is not a promise of
 * background execution when the browser suspends the entire document.
 */
export async function cooperativeYield({host=globalThis,signal}={}) {
 if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
 if(typeof host.scheduler?.yield==='function'){
  await host.scheduler.yield();
 }else if(typeof host.MessageChannel==='function'){
  await new Promise((resolve,reject)=>{
   const channel=new host.MessageChannel();let finished=false;
   const finish=(error)=>{
    if(finished)return;finished=true;
    signal?.removeEventListener('abort',onAbort);
    channel.port1.onmessage=null;
    channel.port1.close();channel.port2.close();
    if(error)reject(error);else resolve();
   };
   const onAbort=()=>finish(new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
   channel.port1.onmessage=()=>finish(null);
   signal?.addEventListener('abort',onAbort,{once:true});
   if(signal?.aborted){onAbort();return;}
   try{channel.port2.postMessage(0);}catch(error){finish(error);}
  });
 }else{
  await new Promise(resolve=>host.setTimeout(resolve,0));
 }
 if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
}
