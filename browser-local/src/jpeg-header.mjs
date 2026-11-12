/**
 * R66-DEV17: bounded JPEG header preflight for memory-safe image decoding.
 * Only parses pre-SOS metadata; never decodes compressed pixels or follows URLs.
 * Pixel allocation is still governed by the existing imageDecodeTarget().
 */
export const MAX_JPEG_HEADER_BYTES=2*1024*1024;
const SOF_MARKERS=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);

function exifOrientation(bytes,start,end){
  if(end-start<14 || bytes[start]!==69 || bytes[start+1]!==120 ||
      bytes[start+2]!==105 || bytes[start+3]!==102 ||
      bytes[start+4]!==0 || bytes[start+5]!==0) return null;
  const tiff=start+6;
  const le=bytes[tiff]===73&&bytes[tiff+1]===73;
  const be=bytes[tiff]===77&&bytes[tiff+1]===77;
  if(!le&&!be)throw Error('JPEG_EXIF_BYTE_ORDER_INVALID');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=p=>{if(p+2>end)throw Error('JPEG_EXIF_TRUNCATED');return view.getUint16(p,le)};
  const u32=p=>{if(p+4>end)throw Error('JPEG_EXIF_TRUNCATED');return view.getUint32(p,le)};
  if(u16(tiff+2)!==42)throw Error('JPEG_EXIF_TIFF_INVALID');
  const offset=u32(tiff+4);
  if(offset>65536||tiff+offset+2>end)throw Error('JPEG_EXIF_IFD_INVALID');
  const ifd=tiff+offset,count=u16(ifd);
  if(count>512||ifd+2+count*12>end)throw Error('JPEG_EXIF_IFD_INVALID');
  for(let i=0;i<count;i++){
    const entry=ifd+2+i*12;
    if(u16(entry)!==0x0112)continue;
    if(u16(entry+2)!==3||u32(entry+4)!==1)throw Error('JPEG_EXIF_ORIENTATION_INVALID');
    const orientation=u16(entry+8);
    if(orientation<1||orientation>8)throw Error('JPEG_EXIF_ORIENTATION_INVALID');
    return orientation;
  }
  return null;
}

/** @returns {{width:number,height:number,orientation:number,displayWidth:number,displayHeight:number}}
 * Accepts a leading slice of file bytes up to MAX_JPEG_HEADER_BYTES.
 * Fail closed if SOS or SOF is unavailable within the budget.
 */
export function jpegSourceInfo(data){
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)
    throw Error('JPEG_SIGNATURE_INVALID');
  const limit=Math.min(bytes.length,MAX_JPEG_HEADER_BYTES);
  let at=2,width=0,height=0,orientation=1,foundSOF=false;
  while(at<limit){
    if(bytes[at++]!==0xff)throw Error('JPEG_MARKER_INVALID');
    while(at<limit&&bytes[at]===0xff)at++;
    if(at>=limit)break;
    const marker=bytes[at++];
    if(marker===0x00)throw Error('JPEG_MARKER_INVALID');
    if(marker===0xd9)break;
    if(marker===0xda){
      if(!foundSOF)throw Error('JPEG_DIMENSIONS_UNAVAILABLE');
      const rotated=orientation>=5&&orientation<=8;
      return {width,height,orientation,
        displayWidth:rotated?height:width,displayHeight:rotated?width:height};
    }
    if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(at+2>limit)break;
    const segmentLength=(bytes[at]<<8)|bytes[at+1];
    if(segmentLength<2)throw Error('JPEG_SEGMENT_LENGTH_INVALID');
    const start=at+2,end=at+segmentLength;
    if(end>limit)break;
    if(SOF_MARKERS.has(marker)){
      if(segmentLength<8)throw Error('JPEG_SOF_TRUNCATED');
      const h=(bytes[start+1]<<8)|bytes[start+2];
      const w=(bytes[start+3]<<8)|bytes[start+4];
      if(!w||!h)throw Error('JPEG_DIMENSIONS_INVALID');
      if(foundSOF&&(width!==w||height!==h))throw Error('JPEG_MULTIPLE_SOF_MISMATCH');
      width=w;height=h;foundSOF=true;
    }else if(marker===0xe1){
      const value=exifOrientation(bytes,start,end);
      if(value!==null)orientation=value;
    }
    at=end;
  }
  throw Error(limit===MAX_JPEG_HEADER_BYTES?'JPEG_HEADER_SCAN_LIMIT':'JPEG_HEADER_INCOMPLETE');
}
