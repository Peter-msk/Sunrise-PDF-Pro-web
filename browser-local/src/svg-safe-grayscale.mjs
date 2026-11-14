import {cooperativeYield} from './cooperative-yield.mjs';
/**
 * Sunrise PDF PRO — R48 DEV2, local-only SVG filter normalization.
 *
 * SVG-to-PDFKit does not implement general SVG filters. Only an independently
 * verifiable *pure grayscale colour matrix* can be converted to equivalent
 * vector fills/text and pixel-local embedded-image colour edits. Other filters
 * fail CLOSED; they are never removed silently. The rest of each page stays SVG.
 *
 * Trust boundary: does not fetch external resources, execute style sheets,
 * modify scripts, or substitute an entire SVG/PDF page with a raster.
 */
const NS='http://www.w3.org/2000/svg';
const PIXEL_CAP=9_000_000,IMAGE_LIMIT=128;
const PAGE_IMAGE_PIXEL_CAP=36_000_000;
const PAGE_IMAGE_COMPRESSED_BYTE_CAP=128*1024*1024;
const IMAGE_COMPRESSED_BYTE_CAP=48*1024*1024;
const IMAGE_DECODE_TIMEOUT_MS=25_000;
const IMAGE_ENCODE_TIMEOUT_MS=25_000;
const PIXELS_PER_TICK=131_072;

const LOCAL_FILTER=/^url\(\s*['"]?#([A-Za-z_][\w.-]*)['"]?\s*\)$/;
// CSS grayscale() defaults to 100%; saturate(0) is the same fully desaturated
// sRGB matrix. Do not broaden this to partial saturation or hue rotation.
const CSS_FULL_GRAY_TOKEN=/\s*(?:grayscale\(\s*(?:1(?:\.0+)?|100%)?\s*\)|saturate\(\s*(?:0(?:\.0+)?|0%)\s*\))\s*/giy;
// Only a strict list of provably no-op CSS filter functions can be removed.
// Each function is checked independently; no urls, variables or mixed effects.
const CSS_IDENTITY_TOKEN=/\s*(?:grayscale\(\s*(?:0(?:\.0+)?|0%)\s*\)|saturate\(\s*(?:1(?:\.0+)?|100%)?\s*\)|brightness\(\s*(?:1(?:\.0+)?|100%)?\s*\)|contrast\(\s*(?:1(?:\.0+)?|100%)?\s*\)|opacity\(\s*(?:1(?:\.0+)?|100%)?\s*\)|invert\(\s*(?:0(?:\.0+)?|0%)\s*\)|sepia\(\s*(?:0(?:\.0+)?|0%)\s*\)|hue-rotate\(\s*(?:0(?:\.0+)?(?:deg|rad|turn)?)?\s*\)|blur\(\s*0(?:\.0+)?(?:px)?\s*\))\s*/giy;
function isCssIdentityFilter(value){
 let at=0,n=0;
 while(at<value.length){
  CSS_IDENTITY_TOKEN.lastIndex=at;
  const m=CSS_IDENTITY_TOKEN.exec(value);
  if(!m||m.index!==at||++n>8)return false;
  at=CSS_IDENTITY_TOKEN.lastIndex;
 }
 return n>0;
}
/** A full grayscale effect may be surrounded by provably identity CSS functions.
 * One real effect and at most seven independent identities. Never erase blur,
 * shadows, partial opacity, colour changes, URL filters or unknown functions.
 */
function isSafeCssGrayscaleSequence(value){
 let at=0,functions=0,grays=0;
 while(at<value.length){
  CSS_FULL_GRAY_TOKEN.lastIndex=at;
  const gray=CSS_FULL_GRAY_TOKEN.exec(value);
  if(gray&&gray.index===at){
   grays++;at=CSS_FULL_GRAY_TOKEN.lastIndex;
  }else{
   CSS_IDENTITY_TOKEN.lastIndex=at;
   const noop=CSS_IDENTITY_TOKEN.exec(value);
   if(!noop||noop.index!==at)return false;
   at=CSS_IDENTITY_TOKEN.lastIndex;
  }
  if(++functions>8||grays>1)return false;
 }
 return grays===1;
}
const EMBEDDED_IMAGE=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i;
const NAMED=Object.freeze({black:'#000000',white:'#ffffff',red:'#ff0000',blue:'#0000ff',green:'#008000',lime:'#00ff00',yellow:'#ffff00',navy:'#000080',gray:'#808080',grey:'#808080',silver:'#c0c0c0',maroon:'#800000',purple:'#800080',orange:'#ffa500',teal:'#008080',cyan:'#00ffff',aqua:'#00ffff',magenta:'#ff00ff',fuchsia:'#ff00ff',transparent:'#00000000'});
const DRAWABLE=new Set(['g','svg','rect','path','line','polyline','polygon','circle','ellipse','text','tspan','image','linearGradient','radialGradient','stop','defs','title','desc','clipPath','mask']);
const COMPLEX=new Set(['pattern','use','foreignObject','filter','feColorMatrix','feGaussianBlur','feBlend','feComposite','feOffset','feFlood','feMerge','feImage','feMorphology','feDisplacementMap']);
function fail(reason){throw Error(reason);}
const FILTER_KIND=new Set(['unsafe-identity-target','css-or-external','missing-definition',
 'multi-primitive','blur','blend','composite','displacement','other-primitive']);
/** The category is a fixed vocabulary: no SVG markup, IDs, text or URLs. */
function unsupportedFilter(category){
 const error=Error('SVG_FILTER_EFFECT_UNSUPPORTED');
 error.filterCategory=FILTER_KIND.has(category)?category:'other-primitive';
 throw error;
}
function unsupportedDefinition(def){
 if(!def||def.localName!=='filter')return 'missing-definition';
 if(def.children.length!==1)return 'multi-primitive';
 const primitive=def.children[0].localName;
 if(['feGaussianBlur','feDropShadow'].includes(primitive))return 'blur';
 if(primitive==='feBlend')return 'blend';
 if(primitive==='feComposite')return 'composite';
 if(primitive==='feDisplacementMap')return 'displacement';
 return 'other-primitive';
}
function checkAbort(signal){if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');}
function num(s){const n=Number(s);return Number.isFinite(n)?n:NaN;}
function toByte(n){return Math.max(0,Math.min(255,Math.round(n)));}

/** Small deliberate colour vocabulary; unrecognized CSS colours fail closed. */
export function parseSvgColor(source){
 let raw=String(source).trim().toLowerCase();if(raw in NAMED)raw=NAMED[raw];
 if(raw==='none')return {none:true};
 let r,g,b,a=255,hit;
 if((hit=/^#([0-9a-f]{3,4})$/.exec(raw))){
  const v=[...hit[1]].map(x=>parseInt(x+x,16));[r,g,b]=v;if(v.length===4)a=v[3];
 }else if((hit=/^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(raw))){
  r=parseInt(hit[1].slice(0,2),16);g=parseInt(hit[1].slice(2,4),16);b=parseInt(hit[1].slice(4,6),16);
  if(hit[2])a=parseInt(hit[2],16);
 }else if((hit=/^rgba?\(\s*([^)]*)\s*\)$/.exec(raw))){
  const parts=hit[1].split(/\s*,\s*/);
  if(parts.length!==3&&parts.length!==4)return null;
  const comps=parts.slice(0,3).map(x=>x.endsWith('%')?num(x.slice(0,-1))*2.55:num(x));
  if(comps.some(x=>!Number.isFinite(x)||x<0||x>255))return null;
  [r,g,b]=comps;
  if(parts.length===4){const v=parts[3];const alpha=v.endsWith('%')?num(v.slice(0,-1))/100:num(v);if(!(alpha>=0&&alpha<=1))return null;a=Math.round(alpha*255);}
 }else{return null;}
 return {r:toByte(r),g:toByte(g),b:toByte(b),a};
}
const toLinear=v=>{const n=v/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);};
const toSrgb=v=>{const n=Math.max(0,Math.min(1,v));return toByte(255*(n<=.0031308?12.92*n:1.055*Math.pow(n,1/2.4)-.055));};
// Precomputed transfer curves avoid millions of Math.pow calls for 9MP PNGs.
const LINEAR_LUT=Float64Array.from({length:256},(_,v)=>toLinear(v));
const GAMMA_LUT=Uint8Array.from({length:16385},(_,k)=>toSrgb(k/16384));
export function grayscalePixel(r,g,b,mode='linearRGB'){
 const coeff=[.2126,.7152,.0722];
 if(mode==='sRGB'){
  const v=toByte(r*coeff[0]+g*coeff[1]+b*coeff[2]);return [v,v,v];
 }
 if(mode!=='linearRGB')fail('SVG_FILTER_COLOR_SPACE_UNSUPPORTED');
 const lum=coeff[0]*LINEAR_LUT[toByte(r)]+coeff[1]*LINEAR_LUT[toByte(g)]+coeff[2]*LINEAR_LUT[toByte(b)];
 const v=GAMMA_LUT[Math.max(0,Math.min(16384,Math.round(lum*16384)))];return [v,v,v];
}
export function grayscaleColor(source,mode='linearRGB'){
 const parsed=parseSvgColor(source);
 if(!parsed)return null;
 if(parsed.none)return 'none';
 const [v]=grayscalePixel(parsed.r,parsed.g,parsed.b,mode);
 if(parsed.a!==255)return `rgba(${v},${v},${v},${Math.round(parsed.a/255*1e5)/1e5})`;
 const hex=v.toString(16).padStart(2,'0');return '#'+hex.repeat(3);
}
export function identifyGrayFilter(element){
 if(element?.localName!=='filter')return null;
 // A custom filter region may clip the source graphic. Dropping such a filter
 // would resurrect clipped content even when the color matrix is grayscale.
 // Reject it rather than silently changing geometry. Also reject inheritable
 // filters, styles, animation and primitive-level children.
 if(Array.from(element.attributes||[]).some(a=>
    !['id','color-interpolation-filters'].includes(a.name)))return null;
 const kids=Array.from(element.children||[]);
 if(kids.length!==1||kids[0].localName!=='feColorMatrix')return null;
 const node=kids[0];
 if(node.children?.length)return null;
 if(Array.from(node.attributes||[]).some(a=>!['type','values','in','result','color-interpolation-filters'].includes(a.name)))return null;
 if(node.hasAttribute('in')&&!['SourceGraphic'].includes(node.getAttribute('in')))return null;
 const mode=node.getAttribute('color-interpolation-filters')||element.getAttribute('color-interpolation-filters')||'linearRGB';
 if(!['sRGB','linearRGB'].includes(mode))return null;
 if(node.getAttribute('type')==='saturate'&&num(node.getAttribute('values'))===0)return {mode,kind:'saturate-0'};
 if(node.getAttribute('type')==='matrix'){
  const vals=String(node.getAttribute('values')||'').trim().split(/[\s,]+/).map(Number);
  if(vals.length!==20||vals.some(n=>!Number.isFinite(n)))return null;
  const ref=vals.slice(0,5);if(Math.abs(ref[3])>1e-9||Math.abs(ref[4])>1e-9)return null;
  if(Math.abs(ref[0]+ref[1]+ref[2]-1)>.01)return null;
  if([1,2].some(i=>ref.some((n,k)=>Math.abs(n-vals[i*5+k])>1e-8)))return null;
  if([0,0,0,1,0].some((n,k)=>Math.abs(n-vals[15+k])>1e-8))return null;
  if([.2126,.7152,.0722].some((n,k)=>Math.abs(n-ref[k])>.01))return null;
  return {mode,kind:'gray-matrix'};
 }
 return null;
}
/** SVG feColorMatrix identity, or a channel-wise identity transfer.
 * No explicitly sized filter region, inherited filter, animation or side inputs.
 * Avoid treating SVG Gaussian blur(0) or a custom clipping region as no-ops.
 */
export function identifyIdentitySvgFilter(element){
 if(element?.localName!=='filter'||Array.from(element.attributes||[]).some(a=>
  !['id','color-interpolation-filters'].includes(a.name)))return false;
 if(element.hasAttribute('color-interpolation-filters')&&
  !['sRGB','linearRGB'].includes(element.getAttribute('color-interpolation-filters')))return false;
 const kids=Array.from(element.children||[]);
 if(kids.length!==1)return false;
 const primitive=kids[0];
 if(primitive.hasAttribute('in')&&primitive.getAttribute('in')!=='SourceGraphic')return false;
 if(primitive.localName==='feColorMatrix'){
  if(primitive.hasAttribute('color-interpolation-filters')&&
   !['sRGB','linearRGB'].includes(primitive.getAttribute('color-interpolation-filters')))return false;
  if(primitive.children.length||
   Array.from(primitive.attributes).some(a=>
    !['type','values','in','result','color-interpolation-filters'].includes(a.name)))return false;
  const type=primitive.getAttribute('type')||'matrix';
  const raw=primitive.getAttribute('values');
  if(type==='saturate')return raw===null||/^(?:1(?:\.0+)?|1\.0+)$/u.test(raw.trim());
  if(type==='hueRotate')return raw===null||/^0(?:\.0+)?$/u.test(raw.trim());
  if(type!=='matrix')return false;
  if(raw===null)return true; // SVG default matrix is identity.
  const vals=raw.trim().split(/[\s,]+/);
  const identity=[1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0];
  // SVG number grammar is decimal/scientific, not JavaScript hexadecimal.
  // Require exact matrix identity: a near-identity colour shift is still an effect.
  const svgNumber=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  return vals.length===20&&vals.every((v,i)=>svgNumber.test(v)&&
   Number.isFinite(Number(v))&&Number(v)===identity[i]);
 }
 if(primitive.localName==='feComponentTransfer'){
  if(Array.from(primitive.attributes).some(a=>!['in','result'].includes(a.name)))return false;
  const fs=Array.from(primitive.children);
  if(fs.length!==4)return false;
  return new Set(fs.map(x=>x.localName)).size===4&&
   ['feFuncR','feFuncG','feFuncB','feFuncA'].every(name=>
    fs.some(x=>x.localName===name&&x.children.length===0&&
     x.getAttribute('type')==='identity'&&x.attributes.length===1));
 }
 // The first SVG filter primitive uses SourceGraphic by default. A blur of
 // exactly zero or an offset of zero is mathematically identity. Never infer
 // this for a chain, SourceAlpha input, a custom filter extent or a group;
 // the caller still requires a safe isolated opaque leaf.
 if(primitive.localName==='feGaussianBlur'||primitive.localName==='feOffset'){
  if(primitive.children.length)return false;
  const blur=primitive.localName==='feGaussianBlur';
  const permitted=blur
   ?['stdDeviation','in','result','color-interpolation-filters']
   :['dx','dy','in','result','color-interpolation-filters'];
  if(Array.from(primitive.attributes).some(a=>!permitted.includes(a.name)))return false;
  if(primitive.hasAttribute('color-interpolation-filters')&&
   !['sRGB','linearRGB'].includes(primitive.getAttribute('color-interpolation-filters')))return false;
  // An explicit SourceAlpha may discard colours even at radius/offset zero.
  if(primitive.hasAttribute('in')&&primitive.getAttribute('in')!=='SourceGraphic')
   return false;
  const svgZero=/^\+?(?:0+(?:\.0*)?|\.[0]+)(?:[eE][+-]?\d+)?$/;
  const allZero=value=>{
   if(value===null)return true;
   const terms=value.trim().split(/[\s,]+/);
   return terms.length>0&&terms.length<=2&&terms.every(token=>
    svgZero.test(token)&&Number(token)===0);
  };
  if(blur)return allZero(primitive.getAttribute('stdDeviation'));
  const dx=primitive.getAttribute('dx'),dy=primitive.getAttribute('dy');
  return (dx===null||svgZero.test(dx.trim())&&Number(dx)===0)&&
   (dy===null||svgZero.test(dy.trim())&&Number(dy)===0);
 }
 return false;
}
const IDENTITY_LEAVES=new Set(['rect','circle','ellipse','path','polygon','text']);
function isSafeIdentityTarget(el){
 // A filter acts on a composited layer. Even an identity matrix can change
 // opacity/overlay behavior or filter-region clipping on groups/thick strokes.
 // Restrict this optimization to one unblended, opaque, non-stroked leaf.
 if(!IDENTITY_LEAVES.has(el.localName)||el.children.length||
  el.closest('defs,mask,clipPath,pattern,marker'))return false;
 for(let node=el;node;node=node.parentElement){
  if(node.hasAttribute('class'))return false;
  for(const name of ['mask','clip-path','mix-blend-mode','isolation','filter']){
   if(name==='filter'&&node===el)continue;
   if(node.hasAttribute(name))return false;
  }
  if(node.hasAttribute('stroke')&&node.getAttribute('stroke')!=='none')return false;
  for(const name of ['opacity','fill-opacity','stroke-opacity']){
   if(node.hasAttribute(name)&&!/^(?:1(?:\.0+)?|100%)$/.test(node.getAttribute(name).trim()))
    return false;
  }
  for(const name of ['fill','color']){
   const value=node.getAttribute(name)||'';
   if(/^(?:rgba\(|#[a-f0-9]{4}$|#[a-f0-9]{8}$)/i.test(value.trim()))return false;
  }
  const style=cssProps(node);
  for(const [name,value] of style){
   if(name==='filter'&&node===el)continue;
   if(name==='stroke'&&value.trim()==='none')continue;
   if(name==='opacity'||name==='stroke'||name==='fill-opacity'||
      name==='stroke-opacity'||name==='mix-blend-mode'||name==='isolation'||
      name==='mask'||name==='clip-path'||name==='filter')return false;
   if(['fill','color'].includes(name)&&
      /^(?:rgba\(|#[a-f0-9]{4}$|#[a-f0-9]{8}$)/i.test(value.trim()))return false;
  }
 }
 return true;
}
function cssProps(el){
 const src=el.getAttribute('style');if(src===null)return [];
 const parts=src.split(';').map(x=>x.trim()).filter(Boolean),out=[];
 for(const part of parts){const cut=part.indexOf(':');if(cut<1)fail('SVG_FILTER_CSS_UNSUPPORTED');out.push([part.slice(0,cut).trim().toLowerCase(),part.slice(cut+1).trim()]);}
 return out;
}
function writeCss(el,props){
 if(!props.length)el.removeAttribute('style');
 else el.setAttribute('style',props.map(([k,v])=>k+':'+v).join(';'));
}
function getFilter(el){
 const attr=el.getAttribute('filter');const css=cssProps(el);
 const match=css.filter(([k])=>k==='filter');
 if(attr&&match.length)fail('SVG_FILTER_DUPLICATE_DECLARATION');
 if(match.length>1)fail('SVG_FILTER_DUPLICATE_DECLARATION');
 return {value:attr||match[0]?.[1]||null,attr:attr!==null,css};
}
function setNoFilter(el,from){
 if(from.attr)el.removeAttribute('filter');
 else writeCss(el,cssProps(el).filter(([k])=>k!=='filter'));
}
function nodes(root){return [root,...root.querySelectorAll('*')];}
function localPaint(raw){const hit=/^url\(\s*['"]?#([A-Za-z_][\w.-]*)['"]?\s*\)$/.exec(String(raw).trim());return hit?.[1]||null;}
function escapeId(s){return s.replace(/[^\w.-]/g,'_');}
function rasterUrl(src){const str=String(src||'').trim().replace(/\s+/g,'');return EMBEDDED_IMAGE.exec(str)?str:null;}
/** Verify image dimensions before invoking browser decoder. This is deliberately
 * conservative: we reject malformed/truncated PNG/JPEG rather than attempting
 * to repair an image that could render differently from the source PDF. */
function pngDimensions(bytes){
 if(bytes.length<24||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||
   ![0,0,0,13,73,72,68,82].every((v,i)=>bytes[8+i]===v))fail('SVG_FILTER_IMAGE_HEADER_INVALID');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 return {width:view.getUint32(16),height:view.getUint32(20)};
}
function jpegDimensions(bytes,partial=false){
 if(bytes[0]!==0xff||bytes[1]!==0xd8)fail('SVG_FILTER_IMAGE_HEADER_INVALID');
 let i=2;
 while(i+4<=bytes.length){
  if(bytes[i++]!==0xff)fail('SVG_FILTER_IMAGE_HEADER_INVALID');
  while(i<bytes.length&&bytes[i]===0xff)i++;
  if(i>=bytes.length)return null;
  const marker=bytes[i++];
  if(marker===0xda||marker===0xd9)break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(i+2>bytes.length)break;
  const length=(bytes[i]<<8)|bytes[i+1];
  if(length<2)fail('SVG_FILTER_IMAGE_HEADER_INVALID');
  if(i+length>bytes.length){if(partial)return null;fail('SVG_FILTER_IMAGE_HEADER_INVALID');}
  const sof=marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker);
  if(sof){
   if(length<7)fail('SVG_FILTER_IMAGE_HEADER_INVALID');
   return {height:(bytes[i+3]<<8)|bytes[i+4],width:(bytes[i+5]<<8)|bytes[i+6]};
  }
  i+=length;
 }
 return null;
}
function checkImagePixelBudget(size){
 if(!size?.width||!size?.height||!Number.isSafeInteger(size.width*size.height))
  fail('SVG_FILTER_IMAGE_HEADER_INVALID');
 if(size.width*size.height>PIXEL_CAP)fail('SVG_FILTER_IMAGE_BUDGET_EXCEEDED');
 return size;
}
export function inspectEmbeddedRaster(data,{atobImpl=globalThis.atob}={}){
 const match=EMBEDDED_IMAGE.exec(String(data||''));
 if(!match)fail('SVG_FILTER_IMAGE_EXTERNAL_RESOURCE');
 const encoded=match[2],mime=match[1].toLowerCase(),padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
 const remainder=encoded.length%4;
 if(remainder===1||(padding&&remainder!==0))fail('SVG_FILTER_IMAGE_DATA_INVALID');
 const byteLength=Math.floor(encoded.length/4)*3+(remainder===2?1:remainder===3?2:0)-padding;
 if(byteLength<(mime==='png'?24:16))fail('SVG_FILTER_IMAGE_HEADER_INVALID');
 if(byteLength>IMAGE_COMPRESSED_BYTE_CAP)fail('SVG_FILTER_IMAGE_BYTES_LIMIT');
 // Read only enough header bytes first. A very large source image can be
 // rejected before allocating its entire decoded compressed payload.
 const previewChars=mime==='png'?32:Math.min(encoded.length,131072);
 let preview;
 try{preview=Uint8Array.from(atobImpl(encoded.slice(0,previewChars)),c=>c.charCodeAt(0));}
 catch{fail('SVG_FILTER_IMAGE_DATA_INVALID');}
 let size=mime==='png'?pngDimensions(preview):jpegDimensions(preview,previewChars<encoded.length);
 if(size)checkImagePixelBudget(size);
 let bytes;
 if(previewChars===encoded.length)bytes=preview;
 else{
  try{bytes=Uint8Array.from(atobImpl(encoded),c=>c.charCodeAt(0));}
  catch{fail('SVG_FILTER_IMAGE_DATA_INVALID');}
 }
 if(bytes.byteLength!==byteLength)fail('SVG_FILTER_IMAGE_DATA_INVALID');
 if(!size)size=jpegDimensions(bytes);
 const {width,height}=checkImagePixelBudget(size);
 return {width,height,bytes,byteLength,mime:'image/'+mime};
}

/** Limit a single browser operation without falsely claiming to cancel native
 * codec work. Late decode results are closed, and all listeners/timers removed. */
export async function waitForImageOperation(promise,signal,timeoutMs,code,onLate=()=>{}){
 checkAbort(signal);
 let active=true,timer,abort;
 const tracked=Promise.resolve(promise).then(value=>{
  if(!active){onLate(value);return undefined;}
  return value;
 });
 const guard=new Promise((_,reject)=>{
  abort=()=>reject(new DOMException('변환이 취소되었습니다.','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>reject(Error(code)),timeoutMs);
 });
 try{return await Promise.race([tracked,guard]);}
 finally{active=false;clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

const defaultYield=()=>cooperativeYield();
/** Chunked pixel transform. Alpha is never modified. Yield between chunks so
 * cancellation and the browser UI are not blocked by a multi-million pixel loop. */
export function accumulateGrayImageBytes(total,added,max=PAGE_IMAGE_COMPRESSED_BYTE_CAP){
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(added)||total<0||added<0)
  fail('SVG_FILTER_PAGE_IMAGE_BYTES_EXCEEDED');
 const next=total+added;
 if(!Number.isSafeInteger(next)||next>max)fail('SVG_FILTER_PAGE_IMAGE_BYTES_EXCEEDED');
 return next;
}

export function accumulateGrayImagePixels(total,width,height,max=PAGE_IMAGE_PIXEL_CAP){
 const next=total+width*height;
 if(!Number.isSafeInteger(next)||next>max)fail('SVG_FILTER_PAGE_IMAGE_BUDGET_EXCEEDED');
 return next;
}

export async function grayscaleImageDataRGBA(pixels,width,height,mode,signal,{
 chunkPixels=PIXELS_PER_TICK,yieldControl=defaultYield
}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
    width*height>PIXEL_CAP||pixels?.length!==width*height*4||
    !Number.isSafeInteger(chunkPixels)||chunkPixels<1)fail('SVG_FILTER_IMAGE_DATA_INVALID');
 if(mode!=='sRGB'&&mode!=='linearRGB')fail('SVG_FILTER_COLOR_SPACE_UNSUPPORTED');
 for(let start=0;start<pixels.length;start+=chunkPixels*4){
  checkAbort(signal);
  const end=Math.min(start+chunkPixels*4,pixels.length);
  for(let i=start;i<end;i+=4){
   const [gray]=grayscalePixel(pixels[i],pixels[i+1],pixels[i+2],mode);
   pixels[i]=pixels[i+1]=pixels[i+2]=gray;
  }
  if(end<pixels.length){await yieldControl();checkAbort(signal);}
 }
 return pixels;
}

async function grayImage(data,mode,{
 signal,decode,makeCanvas,toDataURL,cache,preflight,
 decodeTimeoutMs=IMAGE_DECODE_TIMEOUT_MS,encodeTimeoutMs=IMAGE_ENCODE_TIMEOUT_MS,
 yieldControl=defaultYield
}){
 const key=mode+'\0'+data;
 if(cache.has(key))return cache.get(key);
 checkAbort(signal);
 if(typeof decode!=='function')fail('SVG_FILTER_RASTER_DECODE_UNAVAILABLE');
 const checked=preflight||inspectEmbeddedRaster(data);
 let bitmap,canvas;
 try{
  const pending=decode(new Blob([checked.bytes],{type:checked.mime}));
  bitmap=await waitForImageOperation(pending,signal,decodeTimeoutMs,
    'SVG_FILTER_IMAGE_DECODE_TIMEOUT',late=>late?.close?.());
  checkAbort(signal);
  const w=bitmap?.width,h=bitmap?.height;
  if(w!==checked.width||h!==checked.height)fail('SVG_FILTER_IMAGE_DECODE_DIMENSIONS_MISMATCH');
  canvas=makeCanvas();canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)fail('SVG_FILTER_CANVAS_UNAVAILABLE');
  ctx.drawImage(bitmap,0,0);const img=ctx.getImageData(0,0,w,h);
  await grayscaleImageDataRGBA(img.data,w,h,mode,signal,{yieldControl});
  checkAbort(signal);ctx.putImageData(img,0,0);
  const blob=await waitForImageOperation(new Promise((ok,bad)=>
   canvas.toBlob(x=>x?ok(x):bad(Error('SVG_FILTER_IMAGE_ENCODE_FAILED')),'image/png')),
   signal,encodeTimeoutMs,'SVG_FILTER_IMAGE_ENCODE_TIMEOUT');
  checkAbort(signal);
  const url=await waitForImageOperation(toDataURL(blob),signal,encodeTimeoutMs,
   'SVG_FILTER_IMAGE_DATAURL_TIMEOUT');
  checkAbort(signal);
  if(!rasterUrl(url))fail('SVG_FILTER_IMAGE_ENCODE_FAILED');
  cache.set(key,url);return url;
 }finally{bitmap?.close?.();if(canvas){canvas.width=canvas.height=0;}}
}
async function toDataURL(blob){return new Promise((ok,bad)=>{
 const reader=new FileReader();reader.onerror=()=>bad(Error('SVG_FILTER_IMAGE_ENCODE_FAILED'));
 reader.onload=()=>ok(reader.result);reader.readAsDataURL(blob);
});}
/**
 * @returns {svg, filtersApplied, imagesChanged, rejected}
 * Strictly supports 100% grayscale only. No page-wide raster fallback.
 */
export async function normalizeSvgGrayscale(svg,signal,{
 parse=s=>new DOMParser().parseFromString(s,'image/svg+xml'),
 serialize=root=>new XMLSerializer().serializeToString(root),
 decode=globalThis.createImageBitmap,
 makeCanvas=()=>document.createElement('canvas'),
 imageToDataURL=toDataURL
}={}){
 checkAbort(signal);
 const doc=parse(svg);if(doc.querySelector('parsererror')||doc.doctype||doc.documentElement?.localName!=='svg')fail('SVG_FILTER_PARSE_FAILED');
 const root=doc.documentElement,all=nodes(root),seen=new Set(),definitions=new Map();
 if(all.length>60000)fail('SVG_FILTER_ELEMENT_BUDGET');
 for(const el of all){
  if(el.hasAttribute('id')){
   const id=el.getAttribute('id');if(!/^[A-Za-z_][\w.-]*$/.test(id)||seen.has(id))fail('SVG_FILTER_ID_INVALID');
   seen.add(id);definitions.set(id,el);
  }
 }
 const targets=[];
 for(const el of all){
  const descriptor=getFilter(el);if(!descriptor.value||el.localName==='filter')continue;
  if(el.closest('filter'))continue;
  targets.push({el,descriptor});
 }
 if(!targets.length){
  // Any unused SVG filter definition still makes PDFKit preflight fail. If it
  // has no consumer and isn't externally referenced, discard it explicitly.
  const unused=all.filter(el=>el.localName==='filter');
  if(!unused.length)return {svg,filtersApplied:0,imagesChanged:0};
  // Stylesheets may reference a filter without an inline filter attribute.
  // Removing that definition would silently change the rendered document.
  if(root.querySelector('style'))fail('SVG_FILTER_STYLESHEET_UNSUPPORTED');
  const filterIds=new Set(unused.map(el=>el.getAttribute('id')));
  for(const n of all)for(const attr of Array.from(n.attributes||[])){
   if(n.closest('filter'))continue;
   // Every local URL must be inspected, not just the first one; SVG paint
   // fallback lists can contain more than one resource reference.
   for(const match of attr.value.matchAll(/url\(\s*['"]?#([\w.-]+)['"]?\s*\)/gi))
    if(filterIds.has(match[1]))fail('SVG_FILTER_UNRESOLVED_REFERENCE');
   if(/(?:^|:)href$/.test(attr.name)&&attr.value.startsWith('#')&&
    filterIds.has(attr.value.slice(1)))fail('SVG_FILTER_UNRESOLVED_REFERENCE');
  }
  for(const el of unused)el.remove();
  return {svg:serialize(root),filtersApplied:0,imagesChanged:0};
 }
 // CSS tag selectors can override paints even when no class is present.
 // Fail closed instead of applying grayscale to an unobserved computed fill.
 if(root.querySelector('style'))fail('SVG_FILTER_STYLESHEET_UNSUPPORTED');
 let sequence=0,filtersApplied=0,imagesChanged=0,grayImagePixels=0,grayImageBytes=0;
 const imageCache=new Map(),chargedImageKeys=new Set();
 // Commit is atomic: mutations are only serialized if all targets succeeded.
 for(const {el,descriptor} of targets){
  checkAbort(signal);
  if(descriptor.value==='none'){setNoFilter(el,descriptor);continue;}
  const reference=LOCAL_FILTER.exec(descriptor.value);
  const noop= isCssIdentityFilter(descriptor.value)||
   (reference&&identifyIdentitySvgFilter(definitions.get(reference[1])));
  if(noop){
   if(!isSafeIdentityTarget(el))unsupportedFilter('unsafe-identity-target');
   setNoFilter(el,descriptor);filtersApplied++;continue;
  }
  let mode;
  if(isSafeCssGrayscaleSequence(descriptor.value))mode='sRGB';
  else{
   const match=LOCAL_FILTER.exec(descriptor.value);
   if(!match)unsupportedFilter('css-or-external');
   const def=definitions.get(match[1]);const spec=identifyGrayFilter(def);
   if(!spec)unsupportedFilter(unsupportedDefinition(def));
   mode=spec.mode;
  }
  // Paint inherited from outside the filtered object remains coloured.
  // Such cases need a computed-style renderer, not an approximate rewrite.
  for(let parent=el.parentElement;parent;parent=parent.parentElement){
   const inherited=[...['color','fill','stroke'].filter(k=>parent.hasAttribute(k)).map(k=>parent.getAttribute(k)),
    ...cssProps(parent).filter(([k])=>['color','fill','stroke'].includes(k)).map(([,v])=>v)];
   for(const raw of inherited){
    const col=parseSvgColor(raw);
    if(!col||(!col.none&&(col.r!==col.g||col.g!==col.b)))fail('SVG_FILTER_INHERITED_PAINT_UNSUPPORTED');
   }
  }
  const subtree=nodes(el);
  if(subtree.some(n=>n!==el&&!n.closest('defs')&&getFilter(n).value))fail('SVG_FILTER_NESTED_UNSUPPORTED');
  for(const n of subtree){
   // Definitions describe resources; filtering them directly would mutate
   // shared output or reject a valid locally defined filter.
   if(n.closest('defs'))continue;
   if(COMPLEX.has(n.localName)||!DRAWABLE.has(n.localName))fail('SVG_FILTER_ELEMENT_UNSUPPORTED_'+n.localName);
   if(n.hasAttribute('class')||n.querySelector(':scope > style'))fail('SVG_FILTER_STYLESHEET_UNSUPPORTED');
   for(const [name,value] of cssProps(n)){
    if(name==='filter')continue;
    if(['mix-blend-mode','isolation','background-blend-mode','backdrop-filter'].includes(name))fail('SVG_FILTER_BLEND_UNSUPPORTED');
    if(name==='color'||name==='fill'||name==='stroke'||name==='stop-color')continue;
    // Any other allowed style property is untouched by the grayscale mapping.
   }
   for(const attr of Array.from(n.attributes))if(['mix-blend-mode','isolation','backdrop-filter'].includes(attr.name))fail('SVG_FILTER_BLEND_UNSUPPORTED');
  }
  // All gradients referenced by the filtered subtree receive private, scoped
  // grayscale clones. Shared original gradients outside the subtree are intact.
  const gradientCopies=new Map();
  function grayscalePaint(raw){
   if(raw==='currentColor'||raw==='inherit')return raw;
   const ref=localPaint(raw);
   if(!ref){const gray=grayscaleColor(raw,mode);if(gray===null)fail('SVG_FILTER_COLOR_UNSUPPORTED');return gray;}
   if(gradientCopies.has(ref))return 'url(#'+gradientCopies.get(ref)+')';
   const old=definitions.get(ref);
   if(!old||!['linearGradient','radialGradient'].includes(old.localName))fail('SVG_FILTER_PAINT_SERVER_UNSUPPORTED');
   if(old.hasAttribute('href')||old.hasAttribute('xlink:href'))fail('SVG_FILTER_GRADIENT_INHERITANCE_UNSUPPORTED');
   const clone=old.cloneNode(true);
   const newId='sunrise-gray-'+(++sequence)+'-'+escapeId(ref);
   if(definitions.has(newId))fail('SVG_FILTER_ID_COLLISION');
   clone.setAttribute('id',newId);
   for(const stop of Array.from(clone.querySelectorAll('stop'))){
    if(stop.hasAttribute('class'))fail('SVG_FILTER_STYLESHEET_UNSUPPORTED');
    const paint=stop.getAttribute('stop-color')||'black';
    const gray=grayscaleColor(paint,mode);
    if(gray===null)fail('SVG_FILTER_GRADIENT_COLOR_UNSUPPORTED');
    stop.setAttribute('stop-color',gray);
    const props=cssProps(stop).map(([name,val])=>name==='stop-color'?[name,grayscaleColor(val,mode)??fail('SVG_FILTER_COLOR_UNSUPPORTED')]:[name,val]);
    if(props.length)writeCss(stop,props);
   }
   gradientCopies.set(ref,newId);definitions.set(newId,clone);
   old.parentNode.appendChild(clone);
   return 'url(#'+newId+')';
  }
  for(const n of subtree){
   checkAbort(signal);
   if(n.closest('defs'))continue; // never mutate shared paint definitions
   for(const attr of ['color','fill','stroke','stop-color'])if(n.hasAttribute(attr))n.setAttribute(attr,grayscalePaint(n.getAttribute(attr)));
   const style=cssProps(n);if(style.length){
    const mapped=style.map(([name,val])=>['color','fill','stroke','stop-color'].includes(name)?[name,grayscalePaint(val)]:[name,val]);
    writeCss(n,mapped);
   }
   if(n.localName==='image'){
    const attrs=Array.from(n.attributes).filter(a=>['href','src'].includes(a.localName));
    if(attrs.length!==1)fail('SVG_FILTER_IMAGE_SOURCE_UNSUPPORTED');
    const raw=rasterUrl(attrs[0].value);if(!raw)fail('SVG_FILTER_IMAGE_EXTERNAL_RESOURCE');
    const key=mode+'\0'+raw;
    let preflight;
    if(!chargedImageKeys.has(key)){
     preflight=inspectEmbeddedRaster(raw);
     grayImagePixels=accumulateGrayImagePixels(grayImagePixels,preflight.width,preflight.height);
     grayImageBytes=accumulateGrayImageBytes(grayImageBytes,preflight.byteLength);
     chargedImageKeys.add(key);
    }
    // Do not retain every compressed buffer for the whole page. Process one
    // unique image at a time; later references use the converted URL cache.
    attrs[0].value=await grayImage(raw,mode,{signal,decode,makeCanvas,
     toDataURL:imageToDataURL,cache:imageCache,preflight});
    if(++imagesChanged>IMAGE_LIMIT)fail('SVG_FILTER_IMAGE_COUNT_LIMIT');
   }
  }
  setNoFilter(el,descriptor);
  filtersApplied++;
 }
 // Remove now-unused filter definitions; guards against references that PDFKit
 // would ignore. Unsupported refs outside transformed targets stay rejected.
 for(const filter of Array.from(root.querySelectorAll('filter'))){
  const id=filter.getAttribute('id');
  if(!id)fail('SVG_FILTER_UNNAMED_DEFINITION');
  const used=nodes(root).some(n=>n!==filter&&getFilter(n).value&&getFilter(n).value.includes('#'+id));
  if(used)fail('SVG_FILTER_UNRESOLVED_REFERENCE');
  filter.remove();
 }
 return {svg:serialize(root),filtersApplied,imagesChanged};
}
