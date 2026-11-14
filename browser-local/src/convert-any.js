import {convertToPdf} from './converter.js';
import {inputKind,isHwp,cancelled} from './input-types.js';
import {safeConversionProgress} from './conversion-progress.mjs';
import {assertConvertedPdfResult} from './pdf-output-integrity.mjs';
export async function convertAnyToPdf(file,onProgress=()=>{},signal,options={}){
 cancelled(signal);const kind=inputKind(file);if(!kind)throw Error('지원하지 않는 파일 형식입니다.');
 const progress=safeConversionProgress(onProgress);
 let result;
 if(isHwp(file))result=await convertToPdf(file,progress,signal,options);
 else if(['png','jpg','jpeg'].includes(kind))
  result=await (await import('./image-pdf.js')).convertImage(file,progress,signal,kind);
 else result=await (await import('./spreadsheet-pdf.js')).convertSpreadsheet(file,progress,signal,kind);
 cancelled(signal);
 // Format-neutral release gate: never publish a partial PDF as successful.
 return await assertConvertedPdfResult(result,signal);
}
