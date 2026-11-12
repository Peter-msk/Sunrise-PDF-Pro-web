/**
 * Sunrise PDF PRO R48 local-only prototype.
 * Pre-resizes oversized, self-contained PNG pictures inside rhwp SVG output.
 * Never fetches a URL, strips an image, or rasterizes the surrounding page.
 * Must run before parseDocumentSvg() and the PDFKit vector renderer.
 */
import {waitForImageOperation} from './svg-safe-grayscale.mjs';
const PNG_DATA = /^data:image\/png;base64,([a-z0-9+/]+={0,2})$/i;
const IMAGE_OPERATION_TIMEOUT_MS = 20_000;
const PNG_SIGNATURE = [137,80,78,71,13,10,26,10];
const MAX_RASTER_PIXELS = 9_000_000;
const MAX_CANVAS_SIDE = 8192;
const MAX_ENCODED_BYTES = 48 * 1024 * 1024;
const MAX_UNIQUE_OVERSIZE_PNGS_PER_PAGE = 128;
// A per-object limit alone allowed up to 128 decoded 9MP images in one page.
// Bound total pixels and compressed input to keep work predictable and fail
// visibly on documents that cannot be safely handled on a browser device.
const MAX_PAGE_OUTPUT_PIXELS = 36_000_000;
const MAX_PAGE_DECODE_BYTES = 128 * 1024 * 1024;
// Count every unique embedded PNG, including those small enough not to resize.
// This bounds aggregate base64 payload held in SVG strings before PDFKit runs.
const MAX_PAGE_EMBEDDED_SOURCE_BYTES = 128 * 1024 * 1024;

function cancelled(signal){
  if(signal?.aborted) throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
}

export function readPngHeader(bytes){
  if(!(bytes instanceof Uint8Array) || bytes.length<24) return null;
  if(!PNG_SIGNATURE.every((b,i)=>bytes[i]===b)) return null;
  if(bytes[8]!==0||bytes[9]!==0||bytes[10]!==0||bytes[11]!==13) return null;
  if(bytes[12]!==73||bytes[13]!==72||bytes[14]!==68||bytes[15]!==82) return null; // IHDR
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width=view.getUint32(16),height=view.getUint32(20);
  if(!width||!height||width>200_000||height>200_000) return null;
  return {width,height};
}

/** The returned size is the *encoded* PDF picture, not the SVG viewport. */
export function planRasterBudget(width,height,{
  maxPixels=MAX_RASTER_PIXELS,maxSide=MAX_CANVAS_SIDE
}={}){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
     width>200_000||height>200_000) throw Error('PNG_IMAGE_DIMENSIONS_INVALID');
  const scale=Math.min(1,Math.sqrt(maxPixels/(width*height)),maxSide/width,maxSide/height);
  if(!Number.isFinite(scale)||scale<=0) throw Error('PNG_IMAGE_DIMENSIONS_INVALID');
  const w=Math.max(1,Math.floor(width*scale));
  const h=Math.max(1,Math.floor(height*scale));
  return {width:w,height:h,resized:w!==width||h!==height,sourceWidth:width,sourceHeight:height};
}

function decodeDataPng(dataUrl,atobImpl){
  const match=PNG_DATA.exec(dataUrl);
  if(!match) throw Error('PNG_EMBEDDED_DATA_INVALID');
  const encoded=match[1];
  if(encoded.length>Math.ceil(MAX_ENCODED_BYTES*4/3)+8) throw Error('PNG_EMBEDDED_BYTES_LIMIT');
  let raw;
  try{raw=atobImpl(encoded);}catch{throw Error('PNG_EMBEDDED_DATA_INVALID');}
  if(raw.length>MAX_ENCODED_BYTES)throw Error('PNG_EMBEDDED_BYTES_LIMIT');
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}

async function browserDataURL(blob){
  const reader=new FileReader();
  return new Promise((resolve,reject)=>{
    reader.onerror=()=>reject(Error('PNG_IMAGE_ENCODE_FAILED'));
    reader.onload=()=>resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {string} svg rhwp print SVG; may include local base64-encoded PNG images.
 * @param {AbortSignal} signal
 * @param {object} deps injectable browser primitives for focused, offline tests.
 * @returns {{svg:string,resized:Array<object>}} recorded downsampling only.
 */
export async function normalizeEmbeddedPngSvg(svg,signal,{
  parse=(xml)=>new DOMParser().parseFromString(xml,'image/svg+xml'),
  serialize=(node)=>new XMLSerializer().serializeToString(node),
  decode=globalThis.createImageBitmap,
  makeCanvas=()=>document.createElement('canvas'),
  toDataURL=browserDataURL,
  atobImpl=globalThis.atob,
  maxPixels=MAX_RASTER_PIXELS,
  maxPageEmbeddedSourceBytes=MAX_PAGE_EMBEDDED_SOURCE_BYTES,
  imageTimeoutMs=IMAGE_OPERATION_TIMEOUT_MS,
  // Injectable clock keeps deadline invariants testable without host CPU timing.
  now=Date.now,
  // Per-image watchdogs alone may accumulate into minutes for one page.
  // Bound the whole PNG-normalization phase, not PDF/SVG/WASM rendering.
  pageTimeoutMs=180_000
}={}){
  cancelled(signal);
  if(!Number.isFinite(imageTimeoutMs)||imageTimeoutMs<=0||
     !Number.isFinite(pageTimeoutMs)||pageTimeoutMs<=0)
    throw Error('PNG_IMAGE_TIMEOUT_INVALID');
  const pageDeadline=now()+pageTimeoutMs;
  const pageImageStep=(start,code,onLate)=>{
    cancelled(signal);
    const remaining=pageDeadline-now();
    if(remaining<=0)throw Error('PNG_EMBEDDED_PAGE_TIMEOUT');
    const ms=Math.max(1,Math.min(imageTimeoutMs,Math.ceil(remaining)));
    return waitForImageOperation(start(),signal,ms,
      ms<imageTimeoutMs?'PNG_EMBEDDED_PAGE_TIMEOUT':code,onLate);
  };
  const doc=parse(svg);
  if(doc.querySelector('parsererror')||doc.doctype||doc.documentElement?.localName!=='svg')
    throw Error('SVG_PARSE_ERROR');
  const images=Array.from(doc.querySelectorAll('image'));
  const resized=[],cache=new Map();
  let oversizeCount=0,totalOutputPixels=0,totalDecodedBytes=0,totalEmbeddedSourceBytes=0;
  let changed=false;
  for(const image of images){
    cancelled(signal);
    if(now()>=pageDeadline)throw Error('PNG_EMBEDDED_PAGE_TIMEOUT');
    const refs=Array.from(image.attributes).filter(a=>(a.localName||a.name.split(':').at(-1))==='href');
    if(refs.length!==1)continue; // external/ambiguous references remain for security rejection
    const raw=refs[0].value.trim().replace(/\s+/g,'');
    if(!/^data:image\/png;base64,/i.test(raw))continue;
    if(cache.has(raw)){
      const record=cache.get(raw);
      if(record.replacement!==raw){refs[0].value=record.replacement;changed=true;resized.push(record.report);}
      continue;
    }
    // Decode only a PNG header first. The full compressed PNG is decoded only
    // when its declared dimensions exceed the page raster budget.
    const match=PNG_DATA.exec(raw);
    if(!match)throw Error('PNG_EMBEDDED_DATA_INVALID');
    if(match[1].length>Math.ceil(MAX_ENCODED_BYTES*4/3)+8)
      throw Error('PNG_EMBEDDED_BYTES_LIMIT');
    // Base64 always uses four encoded characters per three source bytes.
    // Every referenced, distinct image is counted (even when no resize occurs).
    // The check precedes source decoding and does not allocate image pixels.
    const encoded=match[1];
    const padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
    const remainder=encoded.length%4;
    const sourceBytes=Math.floor(encoded.length/4)*3+(remainder===2?1:remainder===3?2:0)-padding;
    if(remainder===1||(padding&&remainder!==0)||!Number.isSafeInteger(sourceBytes)||sourceBytes<24)
      throw Error('PNG_EMBEDDED_DATA_INVALID');
    totalEmbeddedSourceBytes+=sourceBytes;
    if(totalEmbeddedSourceBytes>maxPageEmbeddedSourceBytes)
      throw Error('PNG_EMBEDDED_PAGE_INPUT_BUDGET_EXCEEDED');
    let header;
    try{header=Uint8Array.from(atobImpl(match[1].slice(0,32)),c=>c.charCodeAt(0));}
    catch{throw Error('PNG_EMBEDDED_DATA_INVALID');}
    const dimensions=readPngHeader(header);
    if(!dimensions)throw Error('PNG_IMAGE_DIMENSIONS_INVALID');
    const target=planRasterBudget(dimensions.width,dimensions.height,{maxPixels});
    // Count EVERY unique PNG on this page, including those requiring no
    // resizing.  Otherwise many individually safe images could expand far
    // beyond the page-wide memory budget in the downstream PDF renderer.
    // Repeated references are already served by cache and count only once.
    totalOutputPixels+=target.width*target.height;
    if(totalOutputPixels>MAX_PAGE_OUTPUT_PIXELS)throw Error('PNG_EMBEDDED_PAGE_PIXEL_BUDGET_EXCEEDED');
    if(!target.resized){cache.set(raw,{replacement:raw});continue;}
    if(++oversizeCount>MAX_UNIQUE_OVERSIZE_PNGS_PER_PAGE)
      throw Error('PNG_EMBEDDED_IMAGE_COUNT_LIMIT');
    const full=decodeDataPng(raw,atobImpl);
    totalDecodedBytes+=full.length;
    if(totalDecodedBytes>MAX_PAGE_DECODE_BYTES)throw Error('PNG_EMBEDDED_PAGE_BYTES_BUDGET_EXCEEDED');
    let bitmap=null,canvas=null;
    try{
      cancelled(signal);
      if(typeof decode!=='function')throw Error('PNG_RESIZE_NOT_SUPPORTED');
      // Request the bounded decoded bitmap size. Do not first create a giant bitmap.
      bitmap=await pageImageStep(()=>decode(new Blob([full],{type:'image/png'}),{
        resizeWidth:target.width,resizeHeight:target.height,resizeQuality:'high'
      }),'PNG_RESIZE_DECODE_TIMEOUT',late=>late?.close?.());
      cancelled(signal);
      if(bitmap.width!==target.width||bitmap.height!==target.height)
        throw Error('PNG_RESIZE_DECODE_DIMENSIONS_MISMATCH');
      canvas=makeCanvas();canvas.width=target.width;canvas.height=target.height;
      const context=canvas.getContext('2d');
      if(!context)throw Error('PNG_RESIZE_CANVAS_UNAVAILABLE');
      context.clearRect(0,0,target.width,target.height);
      context.drawImage(bitmap,0,0,target.width,target.height);
      const blob=await pageImageStep(()=>new Promise((ok,bad)=>canvas.toBlob(
        result=>result?ok(result):bad(Error('PNG_RESIZE_ENCODE_FAILED')),'image/png')),
        'PNG_RESIZE_ENCODE_TIMEOUT');
      cancelled(signal);
      const replacement=await pageImageStep(()=>toDataURL(blob),
        'PNG_RESIZE_DATAURL_TIMEOUT');
      if(!PNG_DATA.test(replacement))throw Error('PNG_RESIZE_ENCODE_FAILED');
      const report={...target,pictureType:'embedded PNG',alphaPreservedBy:'PNG'};
      cache.set(raw,{replacement,report});
      refs[0].value=replacement;changed=true;resized.push(report);
    }finally{
      bitmap?.close?.();
      if(canvas){canvas.width=0;canvas.height=0;}
    }
  }
  cancelled(signal);
  return {svg:changed?serialize(doc.documentElement):svg,resized};
}
