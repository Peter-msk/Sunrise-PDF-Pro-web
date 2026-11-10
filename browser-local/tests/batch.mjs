import {test} from 'node:test';import assert from 'node:assert/strict';import {unzipSync,strFromU8} from 'fflate';import {runBatch,makePdfArchive,uniquePdfNames} from '../src/batch.js';
test('file names are safe and duplicates are unique',()=>{assert.deepEqual(uniquePdfNames([{name:'가.hwp'},{name:'가.hwpx'},{name:'../가.hwp'}]),['가.pdf','가 (2).pdf','_가.pdf']);});
test('batch continues after an individual failure and preserves successful results',async()=>{const items=['a','bad','c'].map(name=>({file:{name},state:'ready'})), order=[];await runBatch(items,async f=>{order.push(f.name);if(f.name==='bad')throw Error('bad');return {pdf:new Blob([f.name])};});assert.deepEqual(order,['a','bad','c']);assert.deepEqual(items.map(i=>i.state),['done','failed','done']);});
test('cancellation stops next item and retains earlier PDF',async()=>{const c=new AbortController(),items=['a','b','c'].map(name=>({file:{name},state:'ready'}));await runBatch(items,async f=>{if(f.name==='b')c.abort();return {pdf:new Blob([f.name])};},c.signal);assert.deepEqual(items.map(i=>i.state),['done','cancelled','ready']);assert.equal(await items[0].result.pdf.text(),'a');});
test('ZIP contains complete PDFs with unique names and excludes failures',async()=>{const items=[{file:{name:'same.hwp'},state:'done',result:{pdf:new Blob(['PDF1'])}},{file:{name:'same.hwpx'},state:'done',result:{pdf:new Blob(['PDF2'])}},{file:{name:'bad.hwp'},state:'failed'}];const blob=await makePdfArchive(items);const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));assert.deepEqual(Object.keys(files),['same.pdf','same (2).pdf']);assert.equal(strFromU8(files['same.pdf']),'PDF1');assert.equal(strFromU8(files['same (2).pdf']),'PDF2');});

test('R63 a UI observer error after the first successful file cannot stop subsequent files',async()=>{
 const items=['first','second','third'].map(name=>({file:{name},state:'ready'})),order=[];
 await runBatch(items,async file=>{order.push(file.name);return {pdf:new Blob([file.name])};},undefined,item=>{
  if(item.file.name==='first'&&item.state==='done')throw Error('PDF viewer paint error');
 });
 assert.deepEqual(order,['first','second','third']);
 assert.deepEqual(items.map(x=>x.state),['done','done','done']);
 assert.equal(await items[1].result.pdf.text(),'second');
});
test('R63 initial file-row render error cannot block the conversion loop',async()=>{
 const items=['a','b'].map(name=>({file:{name},state:'ready'}));
 let calls=0;
 await runBatch(items,async f=>{calls++;return {pdf:new Blob([f.name])};},undefined,item=>{
  if(item.state==='working')throw Error('file-list mutation failure');
 });
 assert.equal(calls,2);
 assert.deepEqual(items.map(x=>x.state),['done','done']);
});
