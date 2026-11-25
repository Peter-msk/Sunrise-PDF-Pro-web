import {cooperativeYield} from './cooperative-yield.mjs';
import {Zip,ZipPassThrough} from 'fflate';

export function uniquePdfNames(files){
 const used=new Set();
 return files.map((file,index)=>{
  let base=String(file.name||'문서').replace(/\.(?:hwp|hwpx|xls|xlsx|jpg|jpeg|png)$/i,'')
   .replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+|\.+$/g,'').trim().slice(0,150)||'문서';
  let name=base+'.pdf',n=2;
  while(used.has(name.toLocaleLowerCase('ko-KR')))name=base+' ('+(n++)+').pdf';
  used.add(name.toLocaleLowerCase('ko-KR'));
  return name;
 });
}

// One document at a time: rhwp layout and browser font measurement are shared.
export async function runBatch(items,convert,signal,onChange=()=>{}){
 // UI rendering is an observer, not part of document conversion. A failed
 // PDF.js/view update must never prevent the next document from being handled.
 const notify=item=>{
  try{onChange(item);}
  catch(error){console.warn('BATCH_UI_OBSERVER_FAILED',error?.name||'Error');}
 };
 for(const item of items){
  if(item.state==='done')continue;
  if(signal?.aborted)break;
  item.state='working';item.error='';notify(item);
  try{
   const result=await convert(item.file,item);
   if(signal?.aborted)throw new DOMException('작업이 취소되었습니다.','AbortError');
   item.result=result;item.state='done';
  }catch(error){
   if(error?.name==='AbortError'||signal?.aborted){
    item.state='cancelled';item.error='변환이 취소되었습니다.';notify(item);break;
   }
   item.state='failed';item.error=String(error?.message||error).slice(0,500);
  }
  notify(item);
  // Allow the UI thread to release completed document resources before
  // starting the next large HWP; it is not a timeout or an artificial delay.
  if(signal?.aborted)break;
  try{await cooperativeYield({signal});}
  catch(error){
   // Cancellation during the boundary between completed documents is not
   // a failed conversion. Keep the completed PDF and queued files untouched.
   if(error?.name==='AbortError'||signal?.aborted)break;
   throw error;
  }
 }
 return items;
}

// ZIP is generated only for complete PDFs. Store rather than recompress already
// compressed PDF data. Callers retain individual results if archive creation fails.
// Stream each finished PDF into the store-only ZIP writer. Avoid duplicating
// every whole PDF as an ArrayBuffer before handing it to the archive.
export async function makePdfArchive(items,signal,onProgress=()=>{}){
 const ready=items.filter(item=>item.state==='done'&&item.result?.pdf instanceof Blob);
 if(!ready.length)throw Error('다운로드할 변환 결과가 없습니다.');
 // ZIP32's actual format representation range, not a product file-count limit.
 const ZIP32_MAX=0xffffffff;
 // 0xffff is the ZIP64 sentinel, not a valid unambiguous ZIP32 entry count.
 if(ready.length>=0xffff)throw Error('ZIP_FORMAT_LIMIT: 표준 ZIP 파일 수 범위를 초과합니다. PDF를 개별 다운로드하거나 나누어 저장하세요.');
 const names=uniquePdfNames(ready.map(item=>item.file));
 let expectedBytes=22;
 for(let i=0;i<ready.length;i++){
  const nameBytes=new TextEncoder().encode(names[i]).byteLength;
  // The central directory and local entry each contain their own header/name.
  expectedBytes+=ready[i].result.pdf.size+76+nameBytes*2;
  if(ready[i].result.pdf.size>ZIP32_MAX||expectedBytes>ZIP32_MAX)
   throw Error('ZIP_FORMAT_LIMIT: 전체 ZIP이 표준 ZIP 형식의 크기 범위를 초과합니다. PDF를 개별 다운로드하세요.');
 }
 const chunks=[];let zipError=null;
 const zip=new Zip((error,data)=>{
  if(error)zipError=error;
  else if(data?.length)chunks.push(data);
 });
 try{
  for(let index=0;index<ready.length;index++){
   if(signal?.aborted)throw new DOMException('ZIP 생성이 취소되었습니다.','AbortError');
   const entry=new ZipPassThrough(names[index]);zip.add(entry);
   const reader=ready[index].result.pdf.stream().getReader();
   let partCount=0;
   try{
    while(true){
     if(signal?.aborted)throw new DOMException('ZIP 생성이 취소되었습니다.','AbortError');
     const {done,value}=await reader.read();
     if(done)break;
     if(!(value instanceof Uint8Array))throw Error('ZIP_SOURCE_CHUNK_INVALID');
     entry.push(value,false);
     if(zipError)throw zipError;
     // Keep the browser responsive for long local archives without a timer
     // per chunk; backpressure is naturally enforced by awaiting the read.
     if(++partCount%16===0)await cooperativeYield({signal});
    }
    entry.push(new Uint8Array(0),true);
    if(zipError)throw zipError;
   }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
   onProgress(index+1,ready.length);
   await cooperativeYield({signal});
  }
  if(signal?.aborted)throw new DOMException('ZIP 생성이 취소되었습니다.','AbortError');
  zip.end();if(zipError)throw zipError;
  return new Blob(chunks,{type:'application/zip'});
 }catch(error){zip.terminate();throw error;}
}
