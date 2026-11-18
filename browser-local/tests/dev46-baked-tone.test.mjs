import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedAdjustedChannel as tone,verifyBakedTone} from './dev46-baked-tone.mjs';
const image=(...data)=>({width:data.length/4,height:1,data:Uint8ClampedArray.from(data)});
test('encoded RGB independent expected values for +10 brightness +20 contrast',()=>{
 assert.deepEqual([0,32,64,128,192,255].map(x=>tone(x,10,20)),[0,36,76,156,236,255]);
});
test('negative contrast, identity, brightness clipping and endpoints',()=>{
 assert.deepEqual([0,128,255].map(x=>tone(x,0,-50)),[63,127,191]);
 assert.deepEqual([0,128,255].map(x=>tone(x,0,0)),[0,128,255]);
 assert.deepEqual([0,128,255].map(x=>tone(x,100,0)),[255,255,255]);
 assert.deepEqual([0,128,129,255].map(x=>tone(x,0,100)),[0,0,255,255]);
 assert.equal(tone(255,0,-100),1);
 assert.throws(()=>tone(0,101,0),/ARGUMENT_INVALID/);
});
test('every RGB channel and alpha independently verified; no-op rejected by changed/mismatch evidence',()=>{
 const src=image(32,64,128,255,192,255,0,255),dst=image(36,76,156,255,236,255,0,255);
 assert.deepEqual(verifyBakedTone(src,dst,10,20),{pixels:2,visible:2,changed:2,mismatched:0,alphaMismatch:0});
 assert.equal(verifyBakedTone(src,src,10,20).mismatched,2);
 assert.equal(verifyBakedTone(src,image(36,75,156,254,236,255,0,255),10,20).mismatched,1);
 assert.equal(verifyBakedTone(src,image(36,76,156,254,236,255,0,255),10,20).alphaMismatch,1);
 assert.throws(()=>verifyBakedTone(src,image(0,0,0,255),10,20),/DIMENSIONS_MISMATCH/);
 assert.throws(()=>verifyBakedTone(image(0,0,0,128),image(0,0,0,128),10,20),/NOT_OPAQUE/);
});
