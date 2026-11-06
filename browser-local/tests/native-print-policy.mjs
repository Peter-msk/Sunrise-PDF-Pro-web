import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativePrint} from '../src/native-print.js';
test('mixed page sizes do not silently become page images',async()=>{
 let frameCreated=false;
 const ownerDocument={createElement(){frameCreated=true;throw Error('unexpected frame');}};
 await assert.rejects(()=>prepareNativePrint([
  {width:794,height:1123,svg:'<svg/>'},{width:1123,height:794,svg:'<svg/>'}
 ],ownerDocument,{faces:[]}),/혼합 용지.*자동 대체하지 않았습니다/);
 assert.equal(frameCreated,false);
});
