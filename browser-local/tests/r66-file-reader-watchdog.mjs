import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocumentBuffer} from '../src/file-reader.js';

class StubFileReader {
  LOADING=1;
  DONE=2;
  readyState=0;
  aborted=false;
  static current;
  constructor(){StubFileReader.current=this;}
  readAsArrayBuffer(){this.readyState=this.LOADING;}
  abort(){this.aborted=true;this.readyState=this.DONE;this.onabort?.();}
  progress(bytes){this.onprogress?.({lengthComputable:true,loaded:bytes,total:64});}
  complete(bytes=new ArrayBuffer(64)){
    this.readyState=this.DONE;this.result=bytes;this.onload?.();
  }
}
const oldReader=globalThis.FileReader;
globalThis.FileReader=StubFileReader;
process.on('exit',()=>{globalThis.FileReader=oldReader;});
const file={size:64};
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));

test('R66-DEV2 FileReader normal completion retains the full ArrayBuffer',async()=>{
 const progress=[];
 const pending=readDocumentBuffer(file,undefined,p=>progress.push(p),{idleTimeoutMs:50});
 const reader=StubFileReader.current; reader.progress(32);reader.complete();
 const bytes=await pending;
 assert.equal(bytes.byteLength,64);
 assert.deepEqual(progress,[{loaded:0,total:64},{loaded:32,total:64}]);
 assert.equal(reader.onprogress,null);
});
test('R66-DEV2 stalled FileReader is really aborted and reports timeout',async()=>{
 const pending=readDocumentBuffer(file,undefined,()=>{},{idleTimeoutMs:15});
 const reader=StubFileReader.current;
 await assert.rejects(pending,/FILE_READ_IDLE_TIMEOUT/);
 assert.equal(reader.aborted,true);
 assert.equal(reader.onload,null);
 reader.complete(); // late callback cannot reopen the result
});
test('R66-DEV2 progress event refreshes idle watchdog',async()=>{
 const pending=readDocumentBuffer(file,undefined,()=>{},{idleTimeoutMs:45});
 const reader=StubFileReader.current;
 await delay(20);reader.progress(10);
 await delay(20);reader.progress(20);
 await delay(20);reader.complete();
 assert.equal((await pending).byteLength,64);
 assert.equal(reader.aborted,false);
});
test('R66-DEV2 explicit user cancellation stays AbortError',async()=>{
 const controller=new AbortController();
 const pending=readDocumentBuffer(file,controller.signal,()=>{},{idleTimeoutMs:100});
 const reader=StubFileReader.current;controller.abort();
 await assert.rejects(pending,error=>error.name==='AbortError');
 assert.equal(reader.aborted,true);
});
test('R66-DEV2 malformed timeout configuration rejects before FileReader creation',async()=>{
 const prev=StubFileReader.current;
 await assert.rejects(readDocumentBuffer(file,undefined,()=>{},{idleTimeoutMs:0}),/FILE_READ_IDLE_TIMEOUT_INVALID/);
 assert.equal(StubFileReader.current,prev);
});
test('R66-DEV2 broken UI observer does not block native reader completion',async()=>{
 const pending=readDocumentBuffer(file,undefined,()=>{throw Error('UI_NOT_READY');},{idleTimeoutMs:50});
 StubFileReader.current.complete();
 assert.equal((await pending).byteLength,64);
});
test('R66-DEV2 completed FileReader cleans timeout timer',async()=>{
 const pending=readDocumentBuffer(file,undefined,()=>{},{idleTimeoutMs:10});
 const reader=StubFileReader.current;reader.complete();
 await pending;await delay(35);
 assert.equal(reader.aborted,false);
});

test('R66-DEV2 repeated unchanged progress cannot postpone idle timeout',async()=>{
 const pending=readDocumentBuffer(file,undefined,()=>{},{idleTimeoutMs:35});
 const reader=StubFileReader.current;
 reader.progress(5);
 await delay(15);reader.progress(5);
 await delay(15);reader.progress(5);
 await assert.rejects(pending,/FILE_READ_IDLE_TIMEOUT/);
 assert.equal(reader.aborted,true);
});
