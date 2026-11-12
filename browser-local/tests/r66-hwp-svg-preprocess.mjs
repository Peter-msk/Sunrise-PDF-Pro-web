import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// These are focused compilation fixtures for exact source anchors in R65.
// They do not claim that the full R65 application has been installed here.
// Hermetic, source-anchor-matched fixtures. The Python planner checks the
// exact R65 anchors on the real checkout before installing product changes.
const fastSource="// Exact checkedSvg callback anchors from R65 converter.js\nconst checkedSvgCallback=async(svg,meta={})=>{\n     const progress=detail=>onProgress({\n      stage:'professional',page:meta.page||1,total:meta.total||count,detail\n     });\n     // No embedded <image> can exist without the literal \"image\" in SVG.\n     // A false positive only costs time. Parsing/security validation still run\n     // in grayscale normalization and checkedSvg, even on this fast path.\n     const hasImage=typeof svg==='string' && /image/i.test(svg);\n     progress('image_gif');\n     const gifSvg=hasImage?await normalizeGifSvg(svg,signal):svg;\n     progress('image_png');\n     const pngResult=hasImage?await normalizeEmbeddedPngSvg(gifSvg,signal):{svg:gifSvg,resized:[]};\n     resizedPngs.push(...pngResult.resized);\n     progress('image_filter');\n     const grayResult=await normalizeSvgGrayscale(pngResult.svg,signal);\n     if(grayResult.filtersApplied)svgFilterStats.push(grayResult);\n     progress('svg_sanitize');\n     return checkedSvg(grayResult.svg);\n};\n";
const gifSource="// A minimal compilation scaffold of the actual R65 normalizeGifSvg method.\n// The planner targets the exact R65 function anchors, not this fixture.\nimport {waitForImageOperation} from './svg-safe-grayscale.mjs';\nconst MAX_BYTES=4_194_304,MAX_PIXELS=9_000_000,MAX_IMAGES=128;\nconst GIF_STEP_TIMEOUT_MS=25_000,GIF_PAGE_TIMEOUT_MS=90_000;\nconst GIF=/^data:image\\/gif;base64,([a-z0-9+/\\s]+={0,2})$/i;\nexport async function normalizeGifSvg(svg,signal,{decode=globalThis.createImageBitmap,documentRef=globalThis.document}={}){\n // Deadline covers all async GIF operations on this page, not just one image.\n // Synchronous XML parsing and WASM work cannot be interrupted by JS timers.\n const deadline=Date.now()+GIF_PAGE_TIMEOUT_MS;\n const bounded=(operation,code,onLate)=>{\n  if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');\n  const remaining=deadline-Date.now();\n  if(remaining<=0)throw Error('GIF_PAGE_TIMEOUT');\n  const timeout=Math.min(GIF_STEP_TIMEOUT_MS,remaining);\n  return waitForImageOperation(operation(),signal,timeout,\n    remaining<GIF_STEP_TIMEOUT_MS?'GIF_PAGE_TIMEOUT':code,onLate);\n };\n const parser=new DOMParser(),doc=parser.parseFromString(svg,'image/svg+xml');\n if(doc.querySelector('parsererror')||doc.doctype||doc.documentElement?.localName!=='svg')throw Error('SVG 출력 형식 오류');\n const images=Array.from(doc.querySelectorAll('image'));let count=0,total=0,changed=false;\n for(const image of images){\n  if(Date.now()>=deadline)throw Error('GIF_PAGE_TIMEOUT');\n  const refs=Array.from(image.attributes).filter(a=>(a.localName||a.name.split(':').at(-1))==='href');\n  if(refs.length!==1)continue;\n  const match=GIF.exec(refs[0].value.trim());if(!match)continue;\n  if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');\n  if(++count>MAX_IMAGES||match[1].length>Math.ceil(MAX_BYTES*4/3)+8)throw Error('GIF 그림 처리 범위를 초과했습니다.');\n  let bytes;try{const raw=atob(match[1].replace(/\\s+/g,''));bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));}catch{throw Error('GIF 그림의 인코딩이 잘못되었습니다.');}\n  total+=bytes.length;if(total>MAX_BYTES)throw Error('GIF 그림 처리 범위를 초과했습니다.');\n  const {width,height}=validateStaticGif(bytes);\n  if(typeof decode!=='function'||!documentRef?.createElement)throw Error('이 브라우저는 GIF 그림 변환을 지원하지 않습니다.');\n  let bitmap,canvas;\n  try{\n   bitmap=await bounded(()=>decode(new Blob([bytes],{type:'image/gif'})),\n    'GIF_DECODE_TIMEOUT',late=>late?.close?.());\n   if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');\n   if(bitmap.width!==width||bitmap.height!==height)throw Error('GIF 그림 크기가 일치하지 않습니다.');\n   canvas=documentRef.createElement('canvas');canvas.width=width;canvas.height=height;\n   const context=canvas.getContext('2d');if(!context)throw Error('GIF 그림을 처리할 수 없습니다.');\n   context.drawImage(bitmap,0,0);const pixels=context.getImageData(0,0,width,height).data;\n   refs[0].value=await bounded(()=>encodeGifPixels(pixels,width,height,signal),\n    'GIF_ENCODE_TIMEOUT');changed=true;\n  }finally{bitmap?.close?.();if(canvas){canvas.width=1;canvas.height=1;}}\n }\n return changed?new XMLSerializer().serializeToString(doc.documentElement):svg;\n}\n";
// When installed in the real checkout, also assert that the product files
// actually include the integrated code (not merely this local fixture).
const productConverter=new URL('../src/converter.js',import.meta.url);
const productGif=new URL('../src/svg-gif.js',import.meta.url);
if(fs.existsSync(productConverter)&&fs.existsSync(productGif)){
 const c=fs.readFileSync(productConverter,'utf8');
 const g=fs.readFileSync(productGif,'utf8');
 assert.match(c,/hasImage\?await normalizeGifSvg\(svg,signal\):svg/);
 assert.match(g,/GIF_DECODE_TIMEOUT/);
 assert.match(g,/GIF_ENCODE_TIMEOUT/);
}
function fastEnv(svg){
 const steps=[],calls=[];
 const env={onProgress:p=>steps.push(p.detail),count:1,signal:null,resizedPngs:[],svgFilterStats:[],
  normalizeGifSvg:async src=>{calls.push('gif');return src+'|gif';},
  normalizeEmbeddedPngSvg:async src=>{calls.push('png');return {svg:src+'|png',resized:[]};},
  normalizeSvgGrayscale:async src=>{calls.push('gray');return {svg:src+'|gray',filtersApplied:0};},
  checkedSvg:src=>{calls.push('checked');return src;}};
 vm.runInNewContext(fastSource.replace('const checkedSvgCallback=','globalThis.callback='),env);
 return {fn:env.callback,calls,steps};
}
function fakeImage(){
 const attr={name:'href',value:'data:image/gif;base64,'+Buffer.from('GIF89a').toString('base64')};
 return {attributes:[attr],attr};
}
function gifEnv({imgs=[fakeImage()],decode,encode,stepMs=30,pageMs=95,signal}={}){
 let closed=0,canvasCleared=0;
 const bitmap={width:1,height:1,close(){closed++;}};
 const ctx={drawImage(){},getImageData(){return {data:new Uint8Array([0,0,0,255])}}};
 const documentRef={createElement(){const canvas={width:1,height:1,getContext(){return ctx}};return canvas;}};
 class DOMParser{parseFromString(){return {documentElement:{localName:'svg'},doctype:null,querySelector(){return null},querySelectorAll(){return imgs;}};}}
 class XMLSerializer{serializeToString(){return '<svg>converted</svg>';}}
 const realWait=(promise,abort,timeout,code,onLate=()=>{})=>{
  if(abort?.aborted)return Promise.reject(new DOMException('취소','AbortError'));
  let active=true,id,remove;
  const result=Promise.resolve(promise).then(value=>{if(!active){onLate(value);return undefined;}return value;});
  const timeoutPromise=new Promise((_,reject)=>{id=setTimeout(()=>reject(Error(code)),timeout);if(abort){remove=()=>reject(new DOMException('취소','AbortError'));abort.addEventListener('abort',remove,{once:true});}});
  return Promise.race([result,timeoutPromise]).finally(()=>{active=false;clearTimeout(id);if(remove)abort.removeEventListener('abort',remove);});
 };
 const env={DOMParser,XMLSerializer,Blob,Uint8Array,atob,DOMException,Date,Error,console,
  validateStaticGif:()=>({width:1,height:1}),
  waitForImageOperation:realWait,
  encodeGifPixels:encode??(async()=> 'data:image/png;base64,abc'),
  setTimeout,clearTimeout};
 const script=gifSource.replace(/^import .*?;\s*$/gm,'').replace('export async function normalizeGifSvg','async function normalizeGifSvg')
  .replace('GIF_STEP_TIMEOUT_MS=25_000,GIF_PAGE_TIMEOUT_MS=90_000',`GIF_STEP_TIMEOUT_MS=${stepMs},GIF_PAGE_TIMEOUT_MS=${pageMs}`)+'\nglobalThis.normalize=normalizeGifSvg;';
 vm.runInNewContext(script,env);
 const run=(svg='<svg/>')=>env.normalize(svg,signal,{decode:decode??(async()=>bitmap),documentRef});
 return {run,bitmap,getClosed:()=>closed,getAttr:()=>imgs[0]?.attr.value,canvasCleared:()=>canvasCleared};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));

test('text-only SVG skips two redundant image XML parsing passes',async()=>{
 const e=fastEnv('<svg><text>한글 표</text></svg>');
 const result=await e.fn('<svg><text>한글 표</text></svg>');
 assert.equal(result,'<svg><text>한글 표</text></svg>|gray');
 assert.deepEqual(e.calls,['gray','checked']);
 assert.deepEqual(e.steps,['image_gif','image_png','image_filter','svg_sanitize']);
});
test('embedded PNG and GIF images still receive both normalizers',async()=>{
 const e=fastEnv('<svg><image href="data:image/png;base64,a"/></svg>');
 await e.fn('<svg><image href="data:image/png;base64,a"/></svg>');
 assert.deepEqual(e.calls,['gif','png','gray','checked']);
});
test('namespaced image element is not skipped',async()=>{
 const e=fastEnv('<svg><s:image href="data:image/gif;base64,x"/></svg>');
 await e.fn('<svg><s:image href="data:image/gif;base64,x"/></svg>');
 assert.deepEqual(e.calls,['gif','png','gray','checked']);
});
test('conservative substring false-positive falls back to full checks',async()=>{
 const e=fastEnv('<svg><text>image</text></svg>');
 await e.fn('<svg><text>image</text></svg>');
 assert.deepEqual(e.calls,['gif','png','gray','checked']);
});
test('malformed no-image SVG still reaches downstream validation',async()=>{
 const e=fastEnv('<svg><text>broken');
 await e.fn('<svg><text>broken');
 assert.equal(e.calls.at(-1),'checked');
});
test('valid embedded GIF remains a PNG and bitmap is closed',async()=>{
 const g=gifEnv();
 const output=await g.run();
 assert.equal(output,'<svg>converted</svg>');
 assert.match(g.getAttr(),/^data:image\/png/);
 assert.equal(g.getClosed(),1);
});
test('non-GIF pages preserve original SVG and do not decode',async()=>{
 const g=gifEnv({imgs:[]});
 assert.equal(await g.run('<svg><text>text</text></svg>'),'<svg><text>text</text></svg>');
 assert.equal(g.getClosed(),0);
});
test('never-settling GIF decoder is timed out within the async budget',async()=>{
 const g=gifEnv({decode:()=>new Promise(()=>{}),stepMs:12});
 await assert.rejects(g.run(),/GIF_DECODE_TIMEOUT/);
});
test('late GIF decoder result gets disposed after timeout',async()=>{
 let release;const wait=new Promise(r=>{release=r;});
 const g=gifEnv({decode:()=>wait,stepMs:12});
 await assert.rejects(g.run(),/GIF_DECODE_TIMEOUT/);
 release(g.bitmap);await delay(10);
 assert.equal(g.getClosed(),1);
});
test('never-settling GIF PNG encoder is timed out and bitmap closed',async()=>{
 const g=gifEnv({encode:()=>new Promise(()=>{}),stepMs:12});
 await assert.rejects(g.run(),/GIF_ENCODE_TIMEOUT/);
 assert.equal(g.getClosed(),1);
});
test('cancelled signal avoids starting GIF decoder',async()=>{
 const ctrl=new AbortController();ctrl.abort();let count=0;
 const g=gifEnv({signal:ctrl.signal,decode:async()=>{count++;return {width:1,height:1,close(){}};}});
 await assert.rejects(g.run(),e=>e?.name==='AbortError');
 assert.equal(count,0);
});
test('whole GIF page deadline caps sequential async image operations',async()=>{
 const imgs=[fakeImage(),fakeImage(),fakeImage()];
 const g=gifEnv({imgs,stepMs:75,pageMs:55,decode:async()=>{await delay(20);return {width:1,height:1,close(){}};},encode:async()=>{await delay(20);return 'data:image/png;base64,aa';}});
 await assert.rejects(g.run(),/GIF_PAGE_TIMEOUT/);
});

test('real product module recognizes GIF diagnostic codes when installed',async()=>{
 const diagUrl=new URL('../src/pro-telemetry.js',import.meta.url);
 if(!fs.existsSync(diagUrl))return; // isolated source-fragment harness
 const {classifyProError}=await import(diagUrl.href);
 assert.equal(classifyProError(new Error('변환 실패 GIF_DECODE_TIMEOUT')), 'GIF_DECODE_TIMEOUT');
 assert.equal(classifyProError(new Error('변환 실패 GIF_ENCODE_TIMEOUT')), 'GIF_ENCODE_TIMEOUT');
 assert.equal(classifyProError(new Error('고객문서 abc.pdf')), 'CONVERSION_FAILED');
});
