import {PDFDocument} from 'pdf-lib';
import {verifyOtherHeader,cancelled} from './input-types.js';
import {readDocumentBuffer} from './file-reader.js';

const MAX_DECODE_PIXELS=16_000_000,MAX_CANVAS_SIDE=16_384;
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
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)
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
export async function convertImage(file,onProgress,signal,kind){
 cancelled(signal);verifyOtherHeader(kind,await file.slice(0,8).arrayBuffer());
 const data=await readDocumentBuffer(file,signal,p=>onProgress({stage:'load',...p}));cancelled(signal);
 const source=new Blob([data],{type:kind==='png'?'image/png':'image/jpeg'});
 // PNG dimensions are read before decode. Use createImageBitmap resizing so
 // oversized images do not allocate a full-resolution ImageBitmap on mobile.
 const rawSize=kind==='png'?pngDimensions(data):null;
 const decode=rawSize?imageDecodeTarget(rawSize.width,rawSize.height):null;
 let bitmap;
 try{
  bitmap=decode?.resized
   ?await createImageBitmap(source,{resizeWidth:decode.width,resizeHeight:decode.height,resizeQuality:'high'})
   :await createImageBitmap(source);
 }catch(error){
  throw Error('이미지를 디코딩할 수 없습니다. 원본 크기와 브라우저 가용 메모리를 확인하세요. '+String(error?.message||error));
 }
 try{
  cancelled(signal);
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
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(
     b=>b?resolve(b):reject(Error('이미지 크기 조정 후 PNG 생성 실패')),'image/png'));
    normalized=await blob.arrayBuffer();
   }finally{canvas.width=canvas.height=0;}
  }
  cancelled(signal);
  const bytes=await imagePdfBytes(normalized,width,height,signal);
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

export async function imagePdfBytes(pngBytes,width,height,signal){
 cancelled(signal);const place=imagePlacement(width,height),pdf=await PDFDocument.create();
 const embedded=await pdf.embedPng(pngBytes);
 if(embedded.width!==width||embedded.height!==height)throw Error('이미지 크기와 디코딩 결과가 다릅니다.');
 cancelled(signal);pdf.addPage(place.paper).drawImage(embedded,{x:place.x,y:place.y,width:place.width,height:place.height});
 const bytes=await pdf.save();cancelled(signal);return bytes;
}
