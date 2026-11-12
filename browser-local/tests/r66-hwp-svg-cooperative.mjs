import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {encodeGifPixels} from '../src/svg-gif.js';

function pngContent(uri){
  assert.match(uri,/^data:image\/png;base64,/);
  const data=Buffer.from(uri.slice(uri.indexOf(',')+1),'base64');
  assert.deepEqual(Array.from(data.subarray(0,8)),[137,80,78,71,13,10,26,10]);
  let at=8, compressed=[],transparency=null;
  while(at+12<=data.length){
    const count=data.readUInt32BE(at),kind=data.toString('ascii',at+4,at+8);
    const payload=data.subarray(at+8,at+8+count);
    if(kind==='IDAT')compressed.push(payload);
    if(kind==='tRNS')transparency=Array.from(payload);
    at+=12+count;
    if(kind==='IEND')break;
  }
  assert.equal(at,data.length);
  return {data,rows:inflateSync(Buffer.concat(compressed)),transparency};
}

test('cooperative GIF encoder preserves opaque RGB pixels in a real PNG',async()=>{
  const src=Uint8Array.from([255,0,0,255, 0,255,0,255, 0,0,255,255, 1,2,3,255]);
  const {data,rows,transparency}=pngContent(await encodeGifPixels(src,2,2));
  assert.equal(data.readUInt32BE(16),2);assert.equal(data.readUInt32BE(20),2);
  assert.deepEqual(Array.from(rows),[0,255,0,0,0,255,0,0,0,0,255,1,2,3]);
  assert.equal(transparency,null);
});

test('binary GIF transparency is preserved in PNG tRNS',async()=>{
  const src=Uint8Array.from([0,0,0,0, 255,0,0,255]);
  const {transparency,rows}=pngContent(await encodeGifPixels(src,2,1));
  assert.ok(transparency&&transparency.length===6);
  assert.deepEqual(Array.from(rows.subarray(4,7)),[255,0,0]);
});

test('partial transparency is refused rather than silently changing content',async()=>{
  await assert.rejects(encodeGifPixels(new Uint8Array([1,2,3,64]),1,1),/투명도를 보존/);
});

test('unsupported excessive GIF colour palette is rejected',async()=>{
  const src=new Uint8Array(257*4);
  for(let j=0;j<257;j++){src[j*4]=j&255;src[j*4+1]=j>>>8;src[j*4+3]=255;}
  await assert.rejects(encodeGifPixels(src,257,1),/색상 수/);
});

test('external AbortSignal interrupts the cooperative encoder scan',async()=>{
  const controller=new AbortController();
  const width=1024,height=1024,src=new Uint8Array(width*height*4);
  for(let i=3;i<src.length;i+=4)src[i]=255;
  const processing=encodeGifPixels(src,width,height,controller.signal);
  setTimeout(()=>controller.abort(),0);
  await assert.rejects(processing,e=>e?.name==='AbortError');
});

test('an already cancelled conversion does not produce a PNG',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(encodeGifPixels(new Uint8Array([0,0,0,255]),1,1,controller.signal),e=>e?.name==='AbortError');
});
