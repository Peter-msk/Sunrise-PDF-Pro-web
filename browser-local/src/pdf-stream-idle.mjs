/** A writer that keeps emitting real bytes is not stalled. No fixed total runtime
 * for large output; retain cancellation and a finite idle watchdog. */
export function waitForPdfStreamIdle(pending,signal,idleMs,probe={}){
 if(!Number.isFinite(idleMs)||idleMs<=0)return Promise.reject(Error('PDF_STREAM_TIMEOUT_INVALID'));
 return new Promise((resolve,reject)=>{
  const started=Date.now();let timer=null,settled=false;
  const finish=(error,value)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   signal?.removeEventListener('abort',abort);
   if(error)reject(error);else resolve(value);
  };
  const abort=()=>finish(new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
  const tick=()=>{
   if(settled)return;
   if(signal?.aborted){abort();return;}
   const last=Number.isFinite(probe.lastChunkAt)?Math.max(started,probe.lastChunkAt):started;
   const elapsed=Math.max(0,Date.now()-last);
   if(elapsed>=idleMs){finish(Error('PDF_STREAM_TIMEOUT'));return;}
   timer=setTimeout(tick,Math.max(1,Math.min(idleMs,idleMs-elapsed)));
  };
  Promise.resolve(pending).then(value=>finish(null,value),error=>finish(error||Error('PDF_STREAM_FAILED')));
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();else timer=setTimeout(tick,idleMs);
 });
}
