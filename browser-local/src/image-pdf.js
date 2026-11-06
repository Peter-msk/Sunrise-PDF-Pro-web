import {PDFDocument} from 'pdf-lib';
import {verifyOtherHeader,cancelled} from './input-types.js';
import {readDocumentBuffer} from './file-reader.js';

export function imagePlacement(width,height){
 if(!(width>0&&height>0)||width*height>80_000_000)throw Error('이미지 크기가 유효하지 않거나 8천만 픽셀을 초과합니다.');
 const paper=width>height?[841.89,595.28]:[595.28,841.89];
 const scale=Math.min((paper[0]-48)/width,(paper[1]-48)/height);
 return {paper,width:width*scale,height:height*scale,x:(paper[0]-width*scale)/2,y:(paper[1]-height*scale)/2};
}
export async function convertImage(file,onProgress,signal,kind){
 cancelled(signal);verifyOtherHeader(kind,await file.slice(0,8).arrayBuffer());
 const data=await readDocumentBuffer(file,signal,p=>onProgress({stage:'load',...p}));cancelled(signal);
 // Browser decoding applies EXIF orientation and gives the preview dimensions.
 // JPEGs with non-default orientation are normalized before embedding.
 const source=new Blob([data],{type:kind==='png'?'image/png':'image/jpeg'});
 const bitmap=await createImageBitmap(source);
 try{
  cancelled(signal);imagePlacement(bitmap.width,bitmap.height);
  let normalized=data;
  if(kind!=='png'){
   const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   try{const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지를 처리할 수 없습니다.');ctx.drawImage(bitmap,0,0);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('이미지 방향 처리 실패')),'image/png'));
    normalized=await blob.arrayBuffer();
   }finally{canvas.width=canvas.height=0;}
  }
  cancelled(signal);const bytes=await imagePdfBytes(normalized,bitmap.width,bitmap.height,signal);
  onProgress({stage:'pdf',page:1,total:1});cancelled(signal);
  return {pdf:new Blob([bytes],{type:'application/pdf'}),preview:source,pages:1,bytes:bytes.length,renderMode:'source-image',vectorPages:0,rasterPages:1,warnings:['이미지 원본을 A4 용지에 비율을 유지해 배치했습니다.'],substituteFamilies:[]};
 }finally{bitmap.close();}
}

export async function imagePdfBytes(pngBytes,width,height,signal){
 cancelled(signal);const place=imagePlacement(width,height),pdf=await PDFDocument.create();
 const embedded=await pdf.embedPng(pngBytes);
 if(embedded.width!==width||embedded.height!==height)throw Error('이미지 크기와 디코딩 결과가 다릅니다.');
 cancelled(signal);pdf.addPage(place.paper).drawImage(embedded,{x:place.x,y:place.y,width:place.width,height:place.height});
 const bytes=await pdf.save();cancelled(signal);return bytes;
}
