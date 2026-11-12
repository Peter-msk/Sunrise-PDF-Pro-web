import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSvgRasterImage,encodeSvgRasterPng} from '../src/raster-async-guard.mjs';

class ImageStub {
  onload=null;onerror=null;removed=0;onSet=null;
  set src(v){this.value=v;this.onSet?.(v,this);}
  get src(){return this.value;}
  removeAttribute(k){if(k==='src'){this.value='';this.removed++;}}
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('successful SVG load retains source for drawImage, then clears handlers',async()=>{
 const img=new ImageStub();img.onSet=()=>queueMicrotask(()=>img.onload?.());
 await loadSvgRasterImage(img,'blob:local',null,100);
 assert.equal(img.src,'blob:local');assert.equal(img.onload,null);assert.equal(img.onerror,null);
});
test('SVG load timeout detaches handlers and clears image source',async()=>{
 const img=new ImageStub();
 await assert.rejects(loadSvgRasterImage(img,'blob:stuck',null,8),/SVG_RASTER_IMAGE_LOAD_TIMEOUT/);
 assert.equal(img.removed,1);assert.equal(img.onload,null);assert.equal(img.onerror,null);
});
test('SVG image onerror rejects and detaches',async()=>{
 const img=new ImageStub();img.onSet=()=>queueMicrotask(()=>img.onerror?.());
 await assert.rejects(loadSvgRasterImage(img,'blob:invalid',null,80),/SVG_RASTER_IMAGE_DECODE_FAILED/);
 assert.equal(img.removed,1);assert.equal(img.onload,null);
});
test('SVG load abort terminates pending await and clears source',async()=>{
 const c=new AbortController(),img=new ImageStub();const p=loadSvgRasterImage(img,'blob:local',c.signal,100);
 c.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(img.removed,1);
});
test('already-aborted SVG load does not set src',async()=>{
 const c=new AbortController();c.abort();const img=new ImageStub();
 await assert.rejects(loadSvgRasterImage(img,'blob:local',c.signal,100),{name:'AbortError'});
 assert.equal(img.src,'');
});
test('image src setter throwing rejects and cleans handlers',async()=>{
 const img=new ImageStub();img.onSet=()=>{throw Error('SET_FAILED');};
 await assert.rejects(loadSvgRasterImage(img,'blob:err',null,100),/SET_FAILED/);
 assert.equal(img.onload,null);
});
test('late image event after timeout does not reopen result',async()=>{
 const img=new ImageStub();const p=loadSvgRasterImage(img,'blob:local',null,7);
 await assert.rejects(p,/SVG_RASTER_IMAGE_LOAD_TIMEOUT/);
 img.onload?.();img.onerror?.();assert.equal(img.removed,1);
});
test('PNG encoder yields resulting blob and cleans listeners',async()=>{
 const blob=new Blob(['png'],{type:'image/png'});
 const returned=await encodeSvgRasterPng({toBlob:(cb,mime)=>{assert.equal(mime,'image/png');cb(blob);}},undefined,100);
 assert.equal(returned,blob);
});
test('PNG toBlob never returns -> bounded timeout',async()=>{
 await assert.rejects(encodeSvgRasterPng({toBlob:()=>{}},null,8),/SVG_RASTER_PNG_ENCODE_TIMEOUT/);
});
test('PNG encoder null result fails, rather than returning invalid PDF preview',async()=>{
 await assert.rejects(encodeSvgRasterPng({toBlob:cb=>cb(null)},null,80),/SVG_RASTER_PNG_ENCODE_FAILED/);
});
test('PNG encoder sync exception is propagated',async()=>{
 await assert.rejects(encodeSvgRasterPng({toBlob:()=>{throw Error('CANVAS_FAIL');}},null,80),/CANVAS_FAIL/);
});
test('PNG encoding abort and late callback are ignored',async()=>{
 const c=new AbortController();let cb;const p=encodeSvgRasterPng({toBlob:f=>{cb=f;}},c.signal,100);
 c.abort();await assert.rejects(p,{name:'AbortError'});cb(new Blob(['late']));await wait(1);
});
test('already-aborted PNG does not call canvas.toBlob',async()=>{
 const c=new AbortController();c.abort();let called=false;
 await assert.rejects(encodeSvgRasterPng({toBlob:()=>{called=true;}},c.signal,100),{name:'AbortError'});
 assert.equal(called,false);
});
test('reject invalid timeout budget (load/encode)',async()=>{
 assert.throws(()=>loadSvgRasterImage(new ImageStub(),'blob:bad',null,0),/SVG_RASTER_TIMEOUT_INVALID/);
 assert.throws(()=>encodeSvgRasterPng({toBlob(){}},null,Infinity),/SVG_RASTER_TIMEOUT_INVALID/);
});
