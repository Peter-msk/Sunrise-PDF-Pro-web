import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStaticGif,encodeGifPixels} from '../src/svg-gif.js';
import {inflateSync} from 'node:zlib';
const one=Uint8Array.from(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
test('valid single-frame GIF preserves its logical size',()=>{
 assert.deepEqual(validateStaticGif(one),{width:1,height:1});
});
test('invalid and truncated GIFs are rejected',()=>{
 for(const bytes of [new Uint8Array(),one.slice(0,-1),new Uint8Array(one.length)])
  assert.throws(()=>validateStaticGif(bytes),/GIF/);
});
test('multiple GIF frames are rejected rather than silently dropping animation',()=>{
 const image=one.indexOf(0x2c,13),end=one.length-1;
 const two=new Uint8Array(one.length+(end-image));two.set(one.slice(0,end));two.set(one.slice(image,end),end);two[two.length-1]=0x3b;
 assert.throws(()=>validateStaticGif(two),/움직이는 GIF/);
});
test('GIFs with unreasonable dimensions or out-of-bounds frames are rejected',()=>{
 const huge=one.slice();huge[6]=0xff;huge[7]=0xff;huge[8]=0xff;huge[9]=0xff;
 assert.throws(()=>validateStaticGif(huge),/GIF/);
 const bad=one.slice();const frame=bad.indexOf(0x2c,13);bad[frame+1]=1;
 assert.throws(()=>validateStaticGif(bad),/GIF/);
});


test('transparent GIF pixels become truecolour PNG with an exact colour-key mask',async()=>{
 const url=await encodeGifPixels(Uint8Array.from([12,34,56,255,0,0,0,0]),2,1);
 const bytes=Buffer.from(url.split(',')[1],'base64');assert.equal(bytes[25],2);
 let offset=8,idat=null,mask=null;while(offset<bytes.length){const n=bytes.readUInt32BE(offset),type=bytes.subarray(offset+4,offset+8).toString();const body=bytes.subarray(offset+8,offset+8+n);if(type==='IDAT')idat=body;if(type==='tRNS')mask=body;offset+=12+n;}
 assert.deepEqual([...mask],[0,0,0,0,0,0]);assert.deepEqual([...inflateSync(idat)],[0,12,34,56,0,0,0]);
});
test('partial alpha and too many colours are rejected',async()=>{
 await assert.rejects(()=>encodeGifPixels(Uint8Array.from([0,0,0,128]),1,1),/투명도/);
 const x=new Uint8Array(257*4);for(let i=0;i<257;i++){x[i*4]=i>>8;x[i*4+1]=i&255;x[i*4+3]=255;}
 await assert.rejects(()=>encodeGifPixels(x,257,1),/색상 수/);
});
