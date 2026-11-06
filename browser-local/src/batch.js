import {Zip,ZipPassThrough} from 'fflate';

export function uniquePdfNames(files){
 const used=new Set();
 return files.map((file,index)=>{
  let base=String(file.name||'문서').replace(/\.hwpx?$/i,'')
   .replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+|\.+$/g,'').trim().slice(0,150)||'문서';
  let name=base+'.pdf',n=2;
  while(used.has(name.toLocaleLowerCase('ko-KR')))name=base+' ('+(n++)+').pdf';
  used.add(name.toLocaleLowerCase('ko-KR'));
  return name;
 });
}

// One document at a time: rhwp layout and browser font measurement are shared.
export async function runBatch(items,convert,signal,onChange=()=>{}){
 for(const item of items){
  if(item.state==='done')continue;
  if(signal?.aborted)break;
  item.state='working';item.error='';onChange(item);
  try{
   const result=await convert(item.file,item);
   if(signal?.aborted)throw new DOMException('작업이 취소되었습니다.','AbortError');
   item.result=result;item.state='done';
  }catch(error){
   if(error?.name==='AbortError'||signal?.aborted){
    item.state='cancelled';item.error='변환이 취소되었습니다.';onChange(item);break;
   }
   item.state='failed';item.error=String(error?.message||error).slice(0,500);
  }
  onChange(item);
 }
 return items;
}

// ZIP is generated only for complete PDFs. Store rather than recompress already
// compressed PDF data. Callers retain individual results if archive creation fails.
export async function makePdfArchive(items,signal,onProgress=()=>{}){
 const ready=items.filter(item=>item.state==='done'&&item.result?.pdf instanceof Blob);
 if(!ready.length)throw Error('다운로드할 변환 결과가 없습니다.');
 const bytes=ready.reduce((sum,item)=>sum+item.result.pdf.size,0);
 if(bytes>256*1024*1024)throw Error('전체 ZIP이 너무 큽니다. 개별 PDF를 다운로드하세요.');
 const names=uniquePdfNames(ready.map(item=>item.file));
 const chunks=[];
 let zipError=null;
 const zip=new Zip((error,data)=>{
  if(error)zipError=error;
  else if(data?.length)chunks.push(data);
 });
 try{
  for(let index=0;index<ready.length;index++){
   if(signal?.aborted)throw new DOMException('ZIP 생성이 취소되었습니다.','AbortError');
   const file=new ZipPassThrough(names[index]);zip.add(file);
   file.push(new Uint8Array(await ready[index].result.pdf.arrayBuffer()),true);
   if(zipError)throw zipError;
   onProgress(index+1,ready.length);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(signal?.aborted)throw new DOMException('ZIP 생성이 취소되었습니다.','AbortError');
  zip.end();if(zipError)throw zipError;
  return new Blob(chunks,{type:'application/zip'});
 }catch(error){zip.terminate();throw error;}
}
