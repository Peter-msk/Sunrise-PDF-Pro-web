export const SUPPORTED_EXTENSIONS=['hwp','hwpx','xls','xlsx','jpg','jpeg','png'];
export function inputKind(file){const ext=String(file?.name||'').split('.').pop().toLowerCase();return SUPPORTED_EXTENSIONS.includes(ext)?ext:null;}
export const isHwp=file=>['hwp','hwpx'].includes(inputKind(file));
export function verifyOtherHeader(kind,bytes){
 const b=new Uint8Array(bytes);const ole=[208,207,17,224,161,177,26,225];
 const valid=kind==='xls'?ole.every((v,i)=>b[i]===v):kind==='xlsx'?b[0]===80&&b[1]===75&&b[2]===3&&b[3]===4:kind==='png'?[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v):['jpg','jpeg'].includes(kind)?b[0]===255&&b[1]===216&&b[2]===255:false;
 if(!valid)throw Error('확장자와 파일 내용이 일치하지 않습니다: '+kind.toUpperCase());
}
export function cancelled(signal){if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');}
