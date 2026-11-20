/** DEV55 opt-in direct image and vector candidates, pinned RHWP 0.9.0.
 * No external image reads, SVG execution, rasterized pages or silent effects.
 */
const fail=tag=>{throw Error('DIRECT_PDF_MEDIA_'+tag);};
import {isCoordinate as finite,isRgbHex as color,isIdentityShapeTransform as identity,hasOnlyKeys as only} from './direct-contract.mjs';
const sameBox=(a,b)=>['x','y','width','height'].every(k=>finite(a?.[k])&&finite(b?.[k])&&Math.abs(a[k]-b[k])<=.002);
const MAX_BYTES=8*1024*1024,MAX_PIXELS=12_000_000,MAX_DIMENSION=8192;
function size(w,h){if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w>MAX_DIMENSION||h>MAX_DIMENSION||w*h>MAX_PIXELS)fail('IMAGE_DIMENSIONS');}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function decodeImageBase64(s){
 if(typeof s!=='string'||!s.length||s.length%4||s.length>Math.ceil(MAX_BYTES/3)*4||/[^A-Za-z0-9+/=]/.test(s))fail('BASE64');
 const pad=s.endsWith('==')?2:s.endsWith('=')?1:0,end=s.length-pad;
 if(s.slice(0,end).includes('=')||(pad===2&&(alphabet.indexOf(s[end-1])&15))||(pad===1&&(alphabet.indexOf(s[end-1])&3)))fail('BASE64');
 const out=new Uint8Array(s.length/4*3-pad);if(out.length>MAX_BYTES)fail('IMAGE_BYTES');
 for(let i=0,j=0;i<s.length;i+=4){
  const n=(alphabet.indexOf(s[i])<<18)|(alphabet.indexOf(s[i+1])<<12)|(Math.max(0,alphabet.indexOf(s[i+2]))<<6)|Math.max(0,alphabet.indexOf(s[i+3]));
  if(j<out.length)out[j++]=n>>16;if(j<out.length)out[j++]=n>>8;if(j<out.length)out[j++]=n;
 }
 return out;
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes,start,end){let n=0xffffffff;for(let i=start;i<end;i++)n=crcTable[(n^bytes[i])&255]^(n>>>8);return (n^0xffffffff)>>>0;}
export function inspectDirectPng(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<45||v.getUint32(0)!==0x89504e47||v.getUint32(4)!==0x0d0a1a0a)fail('PNG_SIGNATURE');
 let width=0,height=0,channels=0,ended=false;const chunks=[];
 for(let pos=8,n=0;pos<bytes.length;n++){
  if(n>=4096||pos>bytes.length-12)fail('PNG_CHUNK');
  const length=v.getUint32(pos),type=v.getUint32(pos+4),start=pos+8;
  if(length>bytes.length-start-4||crc(bytes,pos+4,start+length)!==v.getUint32(start+length))fail('PNG_CRC');
  if(n===0){
   if(type!==0x49484452||length!==13)fail('PNG_HEADER');
   width=v.getUint32(start);height=v.getUint32(start+4);size(width,height);
   const mode=bytes[start+9];channels=mode===2?3:mode===6?4:0;
   if(bytes[start+8]!==8||!channels||bytes[start+10]||bytes[start+11]||bytes[start+12])fail('PNG_FORMAT');
  }else if(type===0x49444154){chunks.push(bytes.subarray(start,start+length));}
  else if(type===0x49454e44){
   if(length||!chunks.length||start+4!==bytes.length)fail('PNG_END');ended=true;break;
  }else fail('PNG_METADATA_UNSUPPORTED'); // ICC, gamma, animation, palette etc.
  pos=start+length+4;
 }
 if(!ended)fail('PNG_END');
 return {width,height,channels,chunks};
}
// Stream and cap decoded scanline bytes before the PDF library decodes again.
// Reject malformed filter bytes and oversized expansion, not just header size.
export async function verifyDirectPng(info,signal){
 if(typeof DecompressionStream!=='function')fail('PNG_DECODER_UNAVAILABLE');
 const stride=info.width*info.channels+1,expected=stride*info.height;
 const reader=new Blob(info.chunks).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 let count=0,complete=false;
 try{
  for(;;){
   if(signal?.aborted)throw new DOMException('취소됨','AbortError');
   const {done,value}=await reader.read();if(done){complete=true;break;}
   if(count+value.length>expected)fail('PNG_EXPANSION');
   for(let p=(stride-count%stride)%stride;p<value.length;p+=stride)if(value[p]>4)fail('PNG_FILTER');
   count+=value.length;
  }
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(count!==expected)fail('PNG_EXPANSION');
}
export function inspectDirectJpeg(b){
 if(b.length<20||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)fail('JPEG_SIGNATURE');
 let p=2,frame=null,jfif=false;
 const u16=i=>(b[i]<<8)|b[i+1];
 for(let n=0;n<1024&&p<b.length-2;n++){
  if(b[p++]!==255)fail('JPEG_MARKER');while(b[p]===255)p++;
  const marker=b[p++];if(p+2>b.length)fail('JPEG_MARKER');
  const len=u16(p),end=p+len,start=p+2;
  if(len<2||end>b.length-2)fail('JPEG_SEGMENT');
  if(marker===0xe0){
   if(jfif||len!==16||String.fromCharCode(...b.subarray(start,start+5))!=='JFIF\0'||b[end-1]!==0||b[end-2]!==0)fail('JPEG_METADATA');
   jfif=true;
  }else if(marker===0xc0){
   if(frame||len<11||b[start]!==8)fail('JPEG_FRAME');
   const height=u16(start+1),width=u16(start+3),components=b[start+5];size(width,height);
   if(components!==3||len!==8+3*components)fail('JPEG_COLOR');
   for(let i=0;i<3;i++)if(b[start+6+3*i]!==i+1)fail('JPEG_COLOR');
   frame={width,height,channels:3};
  }else if(marker===0xda){
   if(!frame||!jfif||b[start]!==3||len!==12||b[end-3]!==0||b[end-2]!==63||b[end-1]!==0)fail('JPEG_SCAN');
   for(let i=0;i<3;i++)if(b[start+1+2*i]!==i+1)fail('JPEG_SCAN');
   // Baseline single interleaved scan. Only byte stuffing/restart markers
   // are accepted in entropy data; no extra frames or hidden trailing bytes.
   for(let i=end;i<b.length-2;i++)if(b[i]===255){
    const m=b[++i];if(i>=b.length-2||(m!==0&&(m<0xd0||m>0xd7)))fail('JPEG_SCAN');
   }
   if(end>=b.length-2)fail('JPEG_SCAN');
   return frame;
  }else if(![0xdb,0xc4,0xdd].includes(marker))fail('JPEG_METADATA_UNSUPPORTED');
  p=end;
 }
 fail('JPEG_SCAN');
}
export function planDirectImage(op,resources,{allowLayers=false}={}){
 const allowed=['type','bbox','imagePaintBBox','mime','base64','sourceImageKey','fillMode','originalSize','originalSizeHu','effect','brightness','contrast','opacity','wrap','transform'];
 if(!only(op,allowed)||!identity(op.transform)||!sameBox(op.bbox,op.imagePaintBBox)||op.bbox.width<=0||op.bbox.height<=0||
   op.effect!=='realPic'||op.brightness!==0||op.contrast!==0||
   ![undefined,'none','fitToSize'].includes(op.fillMode)||
   ![undefined,'square','tight','through','topAndBottom',...(allowLayers?['behindText','inFrontOfText']:[])].includes(op.wrap)||
   (op.opacity!==undefined&&(!finite(op.opacity)||op.opacity<=0||op.opacity>1)))fail('IMAGE_EFFECT_OR_GEOMETRY');
 if(!['image/png','image/jpeg'].includes(op.mime))fail('IMAGE_MIME');
 let encoded=op.base64;
 // RHWP's JSON exposes inline emitted pixels. Only exact matching resource
 // key entries may supplement a missing payload; never infer from index or URL.
 if(op.sourceImageKey!==undefined){
  if(typeof op.sourceImageKey!=='string'||!op.sourceImageKey||op.sourceImageKey.length>256)fail('IMAGE_KEY');
  if(Array.isArray(resources?.imageKeys)&&Array.isArray(resources?.images)&&resources.imageKeys.length===resources.images.length&&resources.imageKeys.length<=4096){
   const matches=resources.imageKeys.map((k,i)=>k===op.sourceImageKey?i:-1).filter(i=>i>=0);
   if(matches.length>1)fail('IMAGE_KEY');
   if(matches.length===1){
    const value=resources.images[matches[0]];
    if(typeof value!=='string'||(encoded!==undefined&&encoded!==value))fail('IMAGE_RESOURCE_MISMATCH');
    encoded=value;
   }
  }
 }
 if(typeof encoded!=='string')fail('IMAGE_BYTES_MISSING');
 const bytes=decodeImageBase64(encoded);
 const info=op.mime==='image/png'?inspectDirectPng(bytes):inspectDirectJpeg(bytes);
 return {plane:1,kind:'image',x:op.bbox.x,y:op.bbox.y,width:op.bbox.width,height:op.bbox.height,mime:op.mime,encoded,bytes,info,opacity:op.opacity??1};
}
export function planDirectShape(op){
 if(!identity(op.transform)||op.gradient!=null||op.arrowHeads!=null||op.connectorEndpoints!=null||op.lineStyle!=null)fail('SHAPE_TRANSFORM');
 const s=op.style,b=op.bbox;
 if(op.type==='line'){
  if(!only(op,['type','bbox','x1','y1','x2','y2','style','transform'])||
   !only(s,['color','width','dash','lineType','startArrow','endArrow','startArrowSize','endArrowSize','preserveFractionalPosition'])||
   !color(s.color)||!finite(s.width)||s.width<=0||s.dash!=='solid'||s.lineType!=='single'||s.startArrow!=='none'||s.endArrow!=='none'||
   !['x1','y1','x2','y2'].every(k=>finite(op[k]))||(op.x1===op.x2&&op.y1===op.y2))fail('LINE_STYLE');
  return {plane:1,kind:'line',x1:op.x1,y1:op.y1,x2:op.x2,y2:op.y2,stroke:s.color,strokeWidth:s.width};
 }
 if(!only(op,op.type==='ellipse'?['type','bbox','style','transform']:['type','bbox','commands','style','transform'])||
  !only(s,['fillColor','strokeColor','strokeWidth','strokeDash','opacity'])||
  !(s.fillColor===null||color(s.fillColor))||!(s.strokeColor===null||color(s.strokeColor))||
  (!s.fillColor&&!s.strokeColor)||!finite(s.strokeWidth)||s.strokeWidth<0||(s.strokeColor&&s.strokeWidth===0)||s.strokeDash!=='solid'||s.opacity!==1)fail('SHAPE_STYLE');
 const plan={plane:1,kind:op.type,x:b.x,y:b.y,width:b.width,height:b.height,fill:s.fillColor,stroke:s.strokeColor,strokeWidth:s.strokeWidth};
 if(op.type==='ellipse'){if(b.width<=0||b.height<=0)fail('SHAPE_BOUNDS');return plan;}
 if(op.type!=='path'||!Array.isArray(op.commands)||op.commands.length<2||op.commands.length>4096)fail('PATH_COMMANDS');
 let open=false,segments=0;const commands=[];
 for(const c of op.commands){
  const keys={moveTo:['x','y'],lineTo:['x','y'],curveTo:['x1','y1','x2','y2','x3','y3'],closePath:[]}[c?.type];
  if(!Array.isArray(keys)||!only(c,['type',...keys])||!keys.every(k=>finite(c[k])))fail('PATH_COMMAND');
  if(c.type==='moveTo'){if(open)fail('PATH_OPEN');open=true;segments=0;}
  else if(c.type==='closePath'){if(!open||segments<1)fail('PATH_SEQUENCE');open=false;}
  else{if(!open)fail('PATH_SEQUENCE');segments++;}
  commands.push(c);
 }
 if(open)fail('PATH_OPEN');
 return {...plan,commands};
}
