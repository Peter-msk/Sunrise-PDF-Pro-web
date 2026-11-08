import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStaticGif} from '../src/svg-gif.js';
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
