/**
 * Browser-local, cancellable file read. HwpDocument requires a contiguous
 * ArrayBuffer, so streaming into JS chunks only adds a second in-memory copy.
 * FileReader has an actual abort primitive while Blob.arrayBuffer() does not.
 * No arbitrary input-file byte limit is imposed here.
 */
/**
 * @param {Blob} file user-provided local HWP/HWPX
 * @param {AbortSignal} [signal] cancellation
 * @param {(progress:{loaded:number,total:number})=>void} [onProgress]
 */
export function readDocumentBuffer(file, signal, onProgress=()=>{}) {
  if(signal?.aborted) return Promise.reject(new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
  if(!file || typeof file.size!=='number' || file.size<8)
    return Promise.reject(Error('HWP/HWPX 파일을 선택하세요.'));
  if(typeof FileReader!=='function')
    return Promise.reject(Error('브라우저에서 FileReader API를 사용할 수 없습니다.'));
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    let settled=false;
    function cleanup(){
      reader.onload=null;
      reader.onprogress=null;
      reader.onerror=null;
      reader.onabort=null;
      signal?.removeEventListener('abort',onCancel);
    }
    function finish(error,buffer){
      if(settled)return;
      settled=true;
      cleanup();
      if(error)reject(error);
      else resolve(buffer);
    }
    function onCancel(){
      // Abort the OS/browser read, not merely reject after it finishes.
      try {if(reader.readyState===reader.LOADING)reader.abort();}
      catch { /* The abort result still must be propagated below. */ }
      finish(new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
    }
    reader.onprogress=event=>{
      if(settled||signal?.aborted)return;
      if(event.lengthComputable)onProgress({loaded:event.loaded,total:event.total});
    };
    reader.onload=()=>{
      if(signal?.aborted){onCancel();return;}
      if(!(reader.result instanceof ArrayBuffer)){
        finish(Error('파일 읽기 결과가 올바른 ArrayBuffer가 아닙니다.'));
        return;
      }
      finish(null,reader.result);
    };
    reader.onerror=()=>finish(reader.error||Error('문서 파일 읽기 오류'));
    reader.onabort=()=>finish(new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
    signal?.addEventListener('abort',onCancel,{once:true});
    try{
      onProgress({loaded:0,total:file.size});
      reader.readAsArrayBuffer(file);
    }catch(error){finish(error);}
    if(signal?.aborted)onCancel();
  });
}
