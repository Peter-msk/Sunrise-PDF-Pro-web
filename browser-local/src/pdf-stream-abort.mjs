/** R66-DEV4: own a PDF writer's cancellation lifecycle independently of UI cancellation.
 * PDF_STREAM_TIMEOUT is an internal failure and must release toBlob() listeners
 * even when the user did not press Cancel. This never aborts the user's signal.
 */
export function linkPdfWriterAbort(userSignal){
  const writer=new AbortController();
  let closed=false;
  const forward=()=>writer.abort();
  if(userSignal?.aborted)forward();
  else userSignal?.addEventListener('abort',forward,{once:true});
  return {
    signal:writer.signal,
    abort(){writer.abort();},
    close(){
      if(closed)return;
      closed=true;
      userSignal?.removeEventListener('abort',forward);
    }
  };
}
