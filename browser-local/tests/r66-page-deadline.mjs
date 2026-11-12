import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEmbeddedPngSvg} from '../src/svg-embedded-raster-budget.mjs';

function fakePng(index=0,width=10_000,height=10_000){
 const bytes=new Uint8Array(28);
 bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
 const view=new DataView(bytes.buffer);
 view.setUint32(16,width);view.setUint32(20,height);bytes[24]=index;
 return 'data:image/png;base64,'+Buffer.from(bytes).toString('base64');
}
function fixture(n=1,overrides={}){
 const imageRefs=Array.from({length:n},(_,i)=>({localName:'href',name:'href',value:fakePng(i)}));
 const doc={documentElement:{localName:'svg'},doctype:null,querySelector:()=>null,
  querySelectorAll:()=>imageRefs.map(ref=>({attributes:[ref]}))};
 return {parse:()=>doc,serialize:()=>'<svg/>',imageRefs,maxPixels:100,
   makeCanvas:()=>({getContext:()=>({clearRect(){},drawImage(){}}),
     toBlob:callback=>callback(new Blob(['converted'],{type:'image/png'}))}),
   toDataURL:async()=>fakePng(255,10,10),
   decode:async(_blob,options)=>({width:options.resizeWidth,height:options.resizeHeight,close(){}}),
   ...overrides};
}

test('R66 successful single embedded PNG stays vector-page compatible',async()=>{
 const opts=fixture();const result=await normalizeEmbeddedPngSvg('<svg/>',undefined,opts);
 assert.equal(result.resized.length,1);assert.equal(result.svg,'<svg/>');
 assert.match(opts.imageRefs[0].value,/^data:image\/png;base64,/);
});

test('R66 cumulative per-page deadline is not N x per-image timeout',async()=>{
 // Controlled logical work time proves that five PNGs cannot each obtain a
 // fresh per-image budget. Wall-clock elapsed time is not a valid assertion in
 // contended CI runners: a 55ms timer may be delivered hundreds of ms late.
 let decoded=0,logicalMs=0;
 const opts=fixture(5,{imageTimeoutMs:120,pageTimeoutMs:55,
   now:()=>logicalMs,
   decode:async(_blob,options)=>{
     decoded++;logicalMs+=22;
     return {width:options.resizeWidth,height:options.resizeHeight,close(){}};
   }});
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,opts),
   /PNG_EMBEDDED_PAGE_TIMEOUT/);
 assert.equal(decoded,3,'the shared deadline must stop the fourth image');
 assert.equal(logicalMs,66,'the shared deadline must consume cumulative decode work');
});

test('R66 pending decoder inherits page deadline and closes late bitmap',async()=>{
 let resolveDecode,closed=0;
 const opts=fixture(1,{pageTimeoutMs:25,imageTimeoutMs:500,
   decode:()=>new Promise(resolve=>{resolveDecode=resolve;})});
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,opts),
   /PNG_EMBEDDED_PAGE_TIMEOUT/);
 resolveDecode({width:10,height:10,close(){closed++;}});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(closed,1,'late bitmap must be disposed');
});

test('R66 individual operation timeout still uses the original error code',async()=>{
 const opts=fixture(1,{pageTimeoutMs:1000,imageTimeoutMs:20,
   decode:()=>new Promise(()=>{})});
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,opts),
   /PNG_RESIZE_DECODE_TIMEOUT/);
});

test('R66 invalid timeout configuration fails before touching document',async()=>{
 let parsed=false;
 const opts=fixture(1,{pageTimeoutMs:0,parse:()=>{parsed=true;throw Error('parsed');}});
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,opts),
   /PNG_IMAGE_TIMEOUT_INVALID/);
 assert.equal(parsed,false);
});

test('R66 AbortSignal abort remains authoritative',async()=>{
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',ctrl.signal,fixture()),
   error=>error?.name==='AbortError');
});

test('R66 pending canvas encoder consumes shared page deadline',async()=>{
 const opts=fixture(1,{pageTimeoutMs:25,imageTimeoutMs:500,
   makeCanvas:()=>({getContext:()=>({clearRect(){},drawImage(){}}),toBlob:()=>{}})});
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,opts),
   /PNG_EMBEDDED_PAGE_TIMEOUT/);
});

test('R66 pending PNG dataURL conversion consumes shared page deadline',async()=>{
 const opts=fixture(1,{pageTimeoutMs:25,imageTimeoutMs:500,
   toDataURL:()=>new Promise(()=>{})});
 await assert.rejects(normalizeEmbeddedPngSvg('<svg/>',undefined,opts),
   /PNG_EMBEDDED_PAGE_TIMEOUT/);
});
