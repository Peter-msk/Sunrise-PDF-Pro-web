import {PDFDocument} from 'pdf-lib';
import {verifyOtherHeader,cancelled} from './input-types.js';
import {readDocumentBuffer} from './file-reader.js';
import {assertCompletePdfBytes} from './pdf-output-integrity.mjs';
import {jpegSourceInfo,MAX_JPEG_HEADER_BYTES} from './jpeg-header.mjs';
import {waitForImageOperation} from './svg-safe-grayscale.mjs';

const MAX_DECODE_PIXELS=16_000_000,MAX_CANVAS_SIDE=16_384;
const IMAGE_DECODE_TIMEOUT_MS=35_000,IMAGE_ENCODE_TIMEOUT_MS=35_000;
const IMAGE_PDF_SAVE_TIMEOUT_MS=120_000;
const MAX_IMAGE_INPUT_BYTES=128*1024*1024;
/** Read PNG IHDR without decoding a potentially hundred-megapixel bitmap. */
export function pngDimensions(data){
 const b=data instanceof Uint8Array?data:new Uint8Array(data);
 if(b.length<24||![137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)||
    b[12]!==73||b[13]!==72||b[14]!==68||b[15]!==82)
  return null;
 const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const width=dv.getUint32(16),height=dv.getUint32(20);
 if(!width||!height)return null;
 return {width,height};
}
/** A4 print needs fewer pixels than an enormous source image. A bounded
 * decode target prevents the browser from allocating hundreds of MB. */
export function imageDecodeTarget(width,height){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||
    width>200_000||height>200_000||!Number.isSafeInteger(width*height))
  throw Error('이미지의 실제 가로·세로 크기를 확인할 수 없습니다.');
 const scale=Math.min(1,Math.sqrt(MAX_DECODE_PIXELS/(width*height)),
   MAX_CANVAS_SIDE/width,MAX_CANVAS_SIDE/height);
 const w=Math.max(1,Math.floor(width*scale));
 const h=Math.max(1,Math.floor(height*scale));
 return {width:w,height:h,resized:w!==width||h!==height,
   originalWidth:width,originalHeight:height};
}

export function imagePlacement(width,height){
 if(!(width>0&&height>0)||width*height>80_000_000)throw Error('이미지 크기가 유효하지 않거나 8천만 픽셀을 초과합니다.');
 const paper=width>height?[841.89,595.28]:[595.28,841.89];
 const scale=Math.min((paper[0]-48)/width,(paper[1]-48)/height);
 return {paper,width:width*scale,height:height*scale,x:(paper[0]-width*scale)/2,y:(paper[1]-height*scale)/2};
}
export async function convertImage(file,onProgress,signal,kind,{
  decodeTimeoutMs=IMAGE_DECODE_TIMEOUT_MS,encodeTimeoutMs=IMAGE_ENCODE_TIMEOUT_MS,
  saveTimeoutMs=IMAGE_PDF_SAVE_TIMEOUT_MS
}={}){
 if(![decodeTimeoutMs,encodeTimeoutMs,saveTimeoutMs].every(ms=>
   Number.isFinite(ms)&&ms>0))throw Error('IMAGE_TIMEOUT_CONFIG_INVALID');
 cancelled(signal);
 if(typeof file?.size==='number'&&file.size>MAX_IMAGE_INPUT_BYTES)
  throw Error('IMAGE_INPUT_BYTES_LIMIT');
 verifyOtherHeader(kind,await file.slice(0,8).arrayBuffer());cancelled(signal);
 // Parse only a small image header *before* allocating a full file ArrayBuffer.
 const jpegHeader=kind==='png'?null:await file.slice(0,MAX_JPEG_HEADER_BYTES).arrayBuffer();
 const pngHeader=kind==='png'?await file.slice(0,24).arrayBuffer():null;
 cancelled(signal);
 const jpegInfo=jpegHeader?jpegSourceInfo(new Uint8Array(jpegHeader)):null;
 const rawSize=kind==='png'?pngDimensions(pngHeader):
    {width:jpegInfo.displayWidth,height:jpegInfo.displayHeight};
 if(!rawSize)throw Error('PNG_HEADER_DIMENSIONS_INVALID');
 const decode=imageDecodeTarget(rawSize.width,rawSize.height);
 const data=await readDocumentBuffer(file,signal,p=>onProgress({stage:'load',...p}));cancelled(signal);
 const source=new Blob([data],{type:kind==='png'?'image/png':'image/jpeg'});
 let bitmap;
 try{
  const operation=decode?.resized
   ?createImageBitmap(source,{resizeWidth:decode.width,resizeHeight:decode.height,
     resizeQuality:'high',...(jpegInfo?{imageOrientation:'from-image'}:{})})
   :jpegInfo?createImageBitmap(source,{imageOrientation:'from-image'})
   :createImageBitmap(source);
  // Native codecs may ignore AbortSignal; close a result that arrives late.
  bitmap=await waitForImageOperation(operation,signal,decodeTimeoutMs,
    'IMAGE_DECODE_TIMEOUT',late=>late?.close?.());
 }catch(error){
  if(error?.name==='AbortError'||error?.message==='IMAGE_DECODE_TIMEOUT')throw error;
  throw Error('이미지를 디코딩할 수 없습니다. 원본 크기와 브라우저 가용 메모리를 확인하세요. '+String(error?.message||error));
 }
 try{
  cancelled(signal);
  // Some decoders ignore resize hints; never continue with an enormous bitmap.
  if(decode.resized&&(bitmap.width!==decode.width||bitmap.height!==decode.height))
    throw Error('IMAGE_DECODE_RESIZE_UNVERIFIED');
  // Fail closed rather than silently stretching an EXIF-rotated JPEG if
  // a browser ignores the supplied imageOrientation option.
  if(jpegInfo){
    const expected=jpegInfo.displayWidth/jpegInfo.displayHeight;
    if(Math.abs(bitmap.width/bitmap.height/expected-1)>0.012)
      throw Error('JPEG_EXIF_ORIENTATION_UNVERIFIED');
  }
  const target=imageDecodeTarget(bitmap.width,bitmap.height);
  const resized=Boolean(decode?.resized||target.resized);
  let normalized=data,width=bitmap.width,height=bitmap.height;
  if(kind!=='png'||target.resized||resized){
   width=target.width;height=target.height;
   onProgress({stage:'render',page:1,total:1});
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   try{
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('이미지 크기 조정을 위한 Canvas 2D를 사용할 수 없습니다.');
    ctx.drawImage(bitmap,0,0,width,height);
    const blob=await waitForImageOperation(new Promise((resolve,reject)=>canvas.toBlob(
     b=>b?resolve(b):reject(Error('이미지 크기 조정 후 PNG 생성 실패')),'image/png')),
     signal,encodeTimeoutMs,'IMAGE_ENCODE_TIMEOUT');
    normalized=await waitForImageOperation(blob.arrayBuffer(),signal,
      encodeTimeoutMs,'IMAGE_ENCODE_READ_TIMEOUT');
   }finally{canvas.width=canvas.height=0;}
  }
  cancelled(signal);
  const bytes=await imagePdfBytes(normalized,width,height,signal,saveTimeoutMs);
  onProgress({stage:'pdf',page:1,total:1});cancelled(signal);
  const warnings=['이미지 원본을 A4 용지에 비율을 유지해 배치했습니다.'];
  if(resized){
   const dimensions=rawSize||{width:bitmap.width,height:bitmap.height};
   warnings.push('고해상도 이미지의 메모리 부담을 줄이기 위해 '+
     dimensions.width+'×'+dimensions.height+' → '+width+'×'+height+
     ' 픽셀로 축소하여 PDF에 배치했습니다.');
  }
  return {pdf:new Blob([bytes],{type:'application/pdf'}),preview:source,pages:1,
   bytes:bytes.length,renderMode:'source-image',vectorPages:0,rasterPages:1,
   warnings,substituteFamilies:[]};
 }finally{bitmap.close();}
}

export async function imagePdfBytes(pngBytes,width,height,signal,saveTimeoutMs=IMAGE_PDF_SAVE_TIMEOUT_MS){
 cancelled(signal);const place=imagePlacement(width,height),pdf=await PDFDocument.create();
 const embedded=await pdf.embedPng(pngBytes);
 if(embedded.width!==width||embedded.height!==height)throw Error('이미지 크기와 디코딩 결과가 다릅니다.');
 cancelled(signal);pdf.addPage(place.paper).drawImage(embedded,{x:place.x,y:place.y,width:place.width,height:place.height});
 const bytes=assertCompletePdfBytes(await waitForImageOperation(pdf.save(),signal,saveTimeoutMs,'IMAGE_PDF_SAVE_TIMEOUT'));
 cancelled(signal);return bytes;
}
