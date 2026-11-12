import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {jpegSourceInfo,MAX_JPEG_HEADER_BYTES} from '../src/jpeg-header.mjs';

// Port of the existing R65 svg-safe-grayscale.mjs waitForImageOperation API;
// the production import is not changed. Tests focus on actual image-pdf.js
// call sites, with native browser/pdf-lib operations replaced by stubs.
async function waitForImageOperation(promise,signal,timeoutMs,code,onLate=()=>{}){
 if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');
 let active=true,timer,abort;
 const tracked=Promise.resolve(promise).then(value=>{
  if(!active){onLate(value);return undefined;}return value;
 });
 const guard=new Promise((_,reject)=>{
  abort=()=>reject(new DOMException('변환이 취소되었습니다.','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>reject(Error(code)),timeoutMs);
 });
 try{return await Promise.race([tracked,guard]);}
 finally{active=false;clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
const jpeg=Uint8Array.from(readFileSync(new URL('./fixtures/jpeg-rgb-800x400.jpg',import.meta.url)));
const src=readFileSync(new URL('../src/image-pdf.js',import.meta.url),'utf8');
const body=src.replace(/^import .+;$/gm,'').replace(/^export /gm,'');
function shim({decode,encode,save,bytes=jpeg}={}){
 let closed=0,cleared=0,decodeArgs=null,canvases=0,fullReads=0;
 const impl=decode||(async(_blob,opts)=>({width:opts.resizeWidth||800,height:opts.resizeHeight||400,close(){closed++;}}));
 const doc={createElement:()=>{
  canvases++;
  let width=0,height=0;
  return {
   get width(){return width},set width(v){width=v;if(v===0)cleared++},
   get height(){return height},set height(v){height=v;},
   getContext:()=>({drawImage(){}}),
   toBlob(cb){if(encode)return encode(cb);cb(new Blob(['png'],{type:'image/png'}));}
  };
 }};
 const pdf={create:async()=>({
  embedPng:async()=>({width:800,height:400}),
  addPage:()=>({drawImage(){}}),
  save:save||(async()=>Uint8Array.from([37,80,68,70,45,49,46,55]))
 })};
 const make=new Function('PDFDocument','verifyOtherHeader','cancelled',
  'readDocumentBuffer','jpegSourceInfo','MAX_JPEG_HEADER_BYTES',
  'waitForImageOperation','createImageBitmap','document','Blob','assertCompletePdfBytes',body+'\nreturn {convertImage,imageDecodeTarget};');
 const api=make(pdf,()=>{},signal=>{if(signal?.aborted)throw new DOMException('취소','AbortError')},
  async file=>{fullReads++;return file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength)},
  jpegSourceInfo,MAX_JPEG_HEADER_BYTES,waitForImageOperation,
  (...args)=>{decodeArgs=args[1];return impl(...args)},doc,Blob,bytes=>bytes);
 const input={bytes,slice:(_from,end)=>({arrayBuffer:async()=>bytes.subarray(0,end).slice().buffer})};
 return {api,input,get closed(){return closed},get cleared(){return cleared},get fullReads(){return fullReads},
  get canvases(){return canvases},get decodeArgs(){return decodeArgs}};
}

test('success path preserves legacy PDF result and closes decoded bitmap',async()=>{
 const x=shim();const r=await x.api.convertImage(x.input,()=>{},undefined,'jpg');
 assert.equal(r.pages,1);assert.equal(r.renderMode,'source-image');assert.equal(x.closed,1);
 assert.equal(x.canvases,1);assert.ok(x.cleared>=1);
});
test('image decoder unresolved promise fails by bounded timeout, no PDF success',async()=>{
 const x=shim({decode:()=>new Promise(()=>{})});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg',{decodeTimeoutMs:25}),/IMAGE_DECODE_TIMEOUT/);
 assert.equal(x.canvases,0);
});
test('late image decode result is closed after timeout',async()=>{
 let late;const x=shim({decode:()=>new Promise(ok=>late=ok)});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg',{decodeTimeoutMs:15}),/IMAGE_DECODE_TIMEOUT/);
 late({width:800,height:400,close(){x._lateClosed=true;}});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(x._lateClosed,true);
});
test('explicit AbortController cancels native decode wait before timeout',async()=>{
 const x=shim({decode:()=>new Promise(()=>{})}),ac=new AbortController();
 const p=x.api.convertImage(x.input,()=>{},ac.signal,'jpg',{decodeTimeoutMs:1000});
 setTimeout(()=>ac.abort(),10);
 await assert.rejects(p,e=>e.name==='AbortError');
});
test('Canvas PNG encoder never replies: bounded timeout and canvas cleanup',async()=>{
 const x=shim({encode:()=>{}});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg',{encodeTimeoutMs:20}),/IMAGE_ENCODE_TIMEOUT/);
 assert.equal(x.closed,1);assert.ok(x.cleared>=1);
});
test('PNG encode blob arrayBuffer hang: bounded timeout and bitmap cleanup',async()=>{
 const x=shim({encode:cb=>cb({arrayBuffer:()=>new Promise(()=>{})})});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg',{encodeTimeoutMs:20}),/IMAGE_ENCODE_READ_TIMEOUT/);
 assert.equal(x.closed,1);assert.ok(x.cleared>=1);
});
test('pdf-lib save pending: bounded async wait, bitmap cleanup',async()=>{
 const x=shim({save:()=>new Promise(()=>{})});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg',{saveTimeoutMs:20}),/IMAGE_PDF_SAVE_TIMEOUT/);
 assert.equal(x.closed,1);
});
test('invalid timeout configuration is rejected before file loading',async()=>{
 const x=shim();
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg',{decodeTimeoutMs:0}),/IMAGE_TIMEOUT_CONFIG_INVALID/);
 assert.equal(x.canvases,0);
});
test('absurd PNG header dimensions cannot bypass target pixel budget',()=>{
 const x=shim();assert.throws(()=>x.api.imageDecodeTarget(2**32-1,2**32-1),/이미지의 실제/);
 assert.throws(()=>x.api.imageDecodeTarget(200001,1),/이미지의 실제/);
});
test('timeout and cancellation errors preserve machine-readable codes',async()=>{
 const x=shim({decode:()=>new Promise(()=>{})});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg',{decodeTimeoutMs:20}),e=>e.message==='IMAGE_DECODE_TIMEOUT');
});
test('actual image source uses existing R65 operation waiter and late close hook',()=>{
 assert.match(src,/from '\.\/svg-safe-grayscale\.mjs'/);
 assert.match(src,/waitForImageOperation\(operation,signal,decodeTimeoutMs/);
 assert.match(src,/late=>late\?\.close\?\.\(\)/);
 assert.match(src,/waitForImageOperation\(pdf\.save\(\),signal,saveTimeoutMs/);
});

function oversizedJpegHeader(){
 // Valid enough for metadata preflight; compressed pixel data is not decoded
 // in this mocked-browser test (the declared 60k×40k size is intentional).
 const bytes=Uint8Array.from([255,216,255,192,0,11,8,156,64,234,96,1,1,17,0,
    255,218,0,8,1,1,0,0,63,0,0,255,217]);
 assert.equal(jpegSourceInfo(bytes).width,60000);
 return bytes;
}
test('browser ignoring downsizing is rejected before canvas creation',async()=>{
 const x=shim({bytes:oversizedJpegHeader(),decode:async()=>({width:60000,height:40000,close(){x._closedIgnored=true}})});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg'),/IMAGE_DECODE_RESIZE_UNVERIFIED/);
 assert.equal(x._closedIgnored,true);
 assert.equal(x.canvases,0);
 assert.ok(x.decodeArgs.resizeWidth<60000);
});
test('malformed PNG dimension header is rejected before any decoder allocation',async()=>{
 const x=shim({bytes:Uint8Array.from([137,80,78,71,13,10,26,10])});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'png'),/PNG_HEADER_DIMENSIONS_INVALID/);
 assert.equal(x.canvases,0);
});

test('oversized image file is rejected before whole-file FileReader allocation',async()=>{
 const x=shim();x.input.size=129*1024*1024;
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'jpg'),/IMAGE_INPUT_BYTES_LIMIT/);
 assert.equal(x.fullReads,0);
});
test('malformed PNG preflight fails without reading full source image bytes',async()=>{
 const x=shim({bytes:Uint8Array.from([137,80,78,71,13,10,26,10])});
 await assert.rejects(x.api.convertImage(x.input,()=>{},undefined,'png'),/PNG_HEADER_DIMENSIONS_INVALID/);
 assert.equal(x.fullReads,0);
});
test('JPEG/PNG size preflight precedes full FileReader allocation in source',()=>{
 assert.ok(src.indexOf('const jpegHeader=')<src.indexOf('await readDocumentBuffer('));
 assert.ok(src.indexOf('const pngHeader=')<src.indexOf('await readDocumentBuffer('));
 assert.ok(src.indexOf('IMAGE_INPUT_BYTES_LIMIT')<src.indexOf('await readDocumentBuffer('));
});
