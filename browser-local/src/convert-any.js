import {convertToPdf} from './converter.js';
import {inputKind,isHwp,cancelled} from './input-types.js';
export async function convertAnyToPdf(file,onProgress=()=>{},signal,options={}){
 cancelled(signal);const kind=inputKind(file);if(!kind)throw Error('지원하지 않는 파일 형식입니다.');
 if(isHwp(file))return convertToPdf(file,onProgress,signal,options);
 if(['png','jpg','jpeg'].includes(kind))return (await import('./image-pdf.js')).convertImage(file,onProgress,signal,kind);
 return (await import('./spreadsheet-pdf.js')).convertSpreadsheet(file,onProgress,signal,kind);
}
