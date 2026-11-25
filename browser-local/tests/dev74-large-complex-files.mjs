import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSvgSourceWithinBudget,MAX_SVG_SOURCE_CHARS,checkSvgPathBudget} from '../src/svg-render-guard.mjs';
import {waitForPdfStreamIdle} from '../src/pdf-stream-idle.mjs';
import {makePdfArchive,shouldAutoArchive} from '../src/batch.js';
import {planSheet} from '../src/spreadsheet-pdf.js';
test('large SVG admission and path complexity remain independent',()=>{
 const svg='<svg>'+ 'A'.repeat(75*1024*1024)+'</svg>';
 assert.equal(MAX_SVG_SOURCE_CHARS,192*1024*1024);
 assert.equal(assertSvgSourceWithinBudget(svg),svg.length);
 assert.throws(()=>assertSvgSourceWithinBudget(svg,{maxChars:64*1024*1024}),/SVG_RENDER_SOURCE_CHARS_LIMIT/);
 assert.equal(checkSvgPathBudget({localName:'path',getAttribute:()=> 'A'.repeat(2*1024*1024+1)}).ok,false);
});
test('240000 data cells across three sheets retain every final marker and merged header',()=>{
 const xlsx={utils:{decode_range:()=>({s:{r:0,c:0},e:{r:10001,c:7}}),encode_cell:({r,c})=>String.fromCharCode(65+c)+(r+1),format_cell:c=>String(c.v??'')}};
 const font={widthOfTextAtSize:(s,size)=>[...s].length*size*.55};
 let count=0;
 for(let i=1;i<=3;i++){
  const sheet={'!ref':'A1:H10002','!merges':[{s:{r:0,c:0},e:{r:0,c:7}}],A1:{v:'환경 조사'}};
  for(let c=0;c<8;c++)sheet[String.fromCharCode(65+c)+'2']={v:'헤더'};
  for(let n=1;n<=10000;n++)for(let c=0;c<8;c++)sheet[String.fromCharCode(65+c)+(n+2)]={v:c===7&&n===10000?'LAST-'+i:n};
  const pages=planSheet(sheet,'조사표'+i,xlsx,font);
  count+=pages.reduce((n,p)=>n+p.cells.length,0);
  assert.ok(pages.some(p=>p.cells.some(c=>c.lines.join('')==='LAST-'+i)));
  assert.equal(pages[0].cells[0].endC,7);
 }
 assert.equal(count,240027);
});
test('auto ZIP threshold only defers packaging; explicit ZIP remains available',async()=>{
 const item=(pdf,name)=>({state:'done',file:{name},result:{pdf}});
 const small=[item(new Blob(['a']),'a.hwp'),item(new Blob(['b']),'b.hwp')];
 assert.equal(shouldAutoArchive(small,2),true);
 assert.equal(shouldAutoArchive(small,1),false);
 assert.ok((await makePdfArchive(small)).size>2);
 assert.equal(shouldAutoArchive([small[0]]),false);
});
test('ZIP32 entry count fails closed rather than corrupting archive',async()=>{
 const item={state:'done',file:{name:'a.hwp'},result:{pdf:new Blob(['a'])}};
 await assert.rejects(makePdfArchive(Array(65535).fill(item)),/ZIP_FORMAT_LIMIT/);
});
test('continuously progressing output may exceed idle interval',async()=>{
 const probe={},started=Date.now();let ticks=0,timer;
 const pending=new Promise(resolve=>{timer=setInterval(()=>{probe.lastChunkAt=Date.now();if(++ticks===6){clearInterval(timer);resolve('complete');}},35);});
 try{assert.equal(await waitForPdfStreamIdle(pending,undefined,120,probe),'complete');assert.ok(Date.now()-started>=120);}finally{clearInterval(timer);}
});
test('stalled output rejects',async()=>{await assert.rejects(waitForPdfStreamIdle(new Promise(()=>{}),undefined,20),/PDF_STREAM_TIMEOUT/);});
test('cancellation remains effective',async()=>{const c=new AbortController();const p=waitForPdfStreamIdle(new Promise(()=>{}),c.signal,500);c.abort();await assert.rejects(p,{name:'AbortError'});});
test('writer errors propagate',async()=>{await assert.rejects(waitForPdfStreamIdle(Promise.reject(Error('writer failed')),undefined,100),/writer failed/);});
test('invalid idle interval rejected',async()=>{await assert.rejects(waitForPdfStreamIdle(Promise.resolve(1),undefined,0),/PDF_STREAM_TIMEOUT_INVALID/);});
