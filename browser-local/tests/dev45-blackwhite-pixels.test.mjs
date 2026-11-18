import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBakedBlackwhite} from './dev45-blackwhite-pixels.mjs';
const image=(...values)=>({width:values.length/4,height:1,data:Uint8ClampedArray.from(values)});
test('RHWP exact integer cutoff 128/129, BT.601 RGB and both output levels',()=>{
 const src=image(128,128,128,255,129,129,129,255,255,0,0,255,0,255,0,255);
 const dst=image(0,0,0,255,255,255,255,255,0,0,0,255,255,255,255,255);
 assert.deepEqual(verifyBakedBlackwhite(src,dst),{pixels:4,black:2,white:2,changed:4,mismatched:0,alphaMismatch:0});
});
test('unchanged or incorrect grayscale cannot certify blackwhite bake',()=>{
 const src=image(128,128,128,255,129,129,129,255);
 assert.equal(verifyBakedBlackwhite(src,src).mismatched,2);
 assert.equal(verifyBakedBlackwhite(src,image(255,255,255,255,0,0,0,255)).mismatched,2);
});
test('alpha and dimensions independently checked; invisible RGB ignored',()=>{
 const src=image(10,20,30,0,255,255,255,255);
 const dst=image(99,99,99,0,255,255,255,128);
 assert.equal(verifyBakedBlackwhite(src,dst).alphaMismatch,1);
 assert.equal(verifyBakedBlackwhite(src,dst).mismatched,0);
 assert.throws(()=>verifyBakedBlackwhite(src,image(0,0,0,255)),/DIMENSIONS_MISMATCH/);
 assert.throws(()=>verifyBakedBlackwhite(image(20,20,20,128),image(0,0,0,128)),/NOT_OPAQUE/);
});
