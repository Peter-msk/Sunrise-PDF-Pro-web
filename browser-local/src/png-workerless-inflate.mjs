/** PNG IDAT inflate without a blob Worker. Exact row-size bound prevents expansion bombs.
 * Use the original pinned png-js pixel reconstruction and PDFKit alpha/SMask code.
 */
import {Unzlib} from 'fflate';
export function pngScanlineBytes({width,height,pixelBitlength,interlaceMethod}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
 width>8192||height>8192||width*height>9_000_000||
 ![1,2,4,8,16,24,32,48,64].includes(pixelBitlength)||
 ![0,1].includes(interlaceMethod))throw Error('PNG_PDF_DECODE_BUDGET');
 const passes=interlaceMethod===1?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
 let total=0;
 for(const [x,y,dx,dy] of passes){
  const w=Math.max(0,Math.ceil((width-x)/dx)),h=Math.max(0,Math.ceil((height-y)/dy));
  if(w&&h)total+=h*(1+Math.ceil(w*pixelBitlength/8));
 }
 return total;
}
export function inflatePngWithoutWorker(input,callback){
 const expected=pngScanlineBytes(this);
 if(!(input instanceof Uint8Array)||input.length<6||input.length>48*1024*1024)throw Error('PNG_PDF_IDAT_INVALID');
 const output=new Uint8Array(expected);let written=0,finished=false;
 const decoder=new Unzlib((chunk,final)=>{
  if(chunk.length>expected-written)throw Error('PNG_PDF_IDAT_LENGTH_MISMATCH');
  output.set(chunk,written);written+=chunk.length;finished=final;
 });
 // Small input chunks also bound temporary expansion inside fflate.
 for(let i=0;i<input.length;i+=4096){
  const end=Math.min(input.length,i+4096);
  decoder.push(input.subarray(i,end),end===input.length);
 }
 if(!finished||written!==expected)throw Error('PNG_PDF_IDAT_LENGTH_MISMATCH');
 // PNG IDAT uses a zlib stream; verify the Adler-32 trailer independently.
 let a=1,b=0;for(let i=0;i<output.length;i++){a=(a+output[i])%65521;b=(b+a)%65521;}
 const adler=new DataView(input.buffer,input.byteOffset,input.byteLength).getUint32(input.length-4);
 if(((b*65536+a)>>>0)!==adler)throw Error('PNG_PDF_IDAT_CHECKSUM');
 return callback(null,output);
}
