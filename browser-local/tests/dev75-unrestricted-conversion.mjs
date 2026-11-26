import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_SVG_SOURCE_CHARS,checkSvgPathBudget,assertSvgSourceWithinBudget} from '../src/svg-render-guard.mjs';
import {createSvgVectorBudget} from '../src/svg-vector-budget.mjs';
import {planRasterBudget} from '../src/svg-embedded-raster-budget.mjs';
import {imageDecodeTarget,imagePlacement} from '../src/image-pdf.js';
import {readJpegSourceInfo} from '../src/jpeg-header.mjs';
import {waitForPdfStreamIdle} from '../src/pdf-stream-idle.mjs';
import {waitForImageOperation} from '../src/svg-safe-grayscale.mjs';
import {planSheet,drawSheetPages} from '../src/spreadsheet-pdf.js';
test('production vector defaults accept former oversized paths; explicit test budgets still reject',()=>{
 assert.equal(MAX_SVG_SOURCE_CHARS,Number.MAX_SAFE_INTEGER);
 const p={localName:'path',getAttribute:()=> 'L'.repeat(2100000)};
 assert.equal(checkSvgPathBudget(p).ok,true);
 assert.equal(checkSvgPathBudget(p,0,{maxSinglePath:10,maxPagePaths:10}).ok,false);
 assert.equal(createSvgVectorBudget().element({localName:'path',getAttribute:()=> 'M'+'L0'.repeat(160000)}),null);
 assert.throws(()=>assertSvgSourceWithinBudget('abc',{maxChars:2}),/SVG_RENDER_SOURCE_CHARS_LIMIT/);
});
test('embedded PNG and standalone image preserve original pixels',()=>{
 const p=planRasterBudget(5300,5060);assert.equal(p.resized,false);assert.equal(p.width,5300);assert.equal(p.height,5060);
 const q=imageDecodeTarget(20000,10000);assert.equal(q.resized,false);assert.equal(q.width*q.height,200000000);
 assert.ok(imagePlacement(q.width,q.height).width>0);
 assert.throws(()=>imageDecodeTarget(0,100));
});
test('JPEG metadata parser grows beyond 2 MiB without silently resizing',async()=>{
 const seg=new Uint8Array(65537);seg.set([255,226,255,255]);
 const tail=Uint8Array.from([255,192,0,11,8,1,144,3,32,1,1,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);
 const data=new Uint8Array(2+34*seg.length+tail.length);data.set([255,216]);
 for(let i=0;i<34;i++)data.set(seg,2+i*seg.length);data.set(tail,2+34*seg.length);
 assert.ok(data.length>2097152);
 const info=await readJpegSourceInfo(new Blob([data]));
 assert.deepEqual([info.width,info.height],[800,400]);
});
test('unbounded async wait can complete or be explicitly cancelled',async()=>{
 for(const fn of [waitForPdfStreamIdle,waitForImageOperation]){
  assert.equal(await fn(Promise.resolve(7),undefined,Infinity),7);
  const c=new AbortController(),pending=fn(new Promise(()=>{}),c.signal,Infinity);c.abort();
  await assert.rejects(pending,{name:'AbortError'});
 }
});
test('very wide and tall XLSX layout keeps final column and scales PDF media box',async()=>{
 const xlsx={utils:{decode_range:()=>({s:{r:0,c:0},e:{r:0,c:239}}),encode_cell:({r,c})=>r+':'+c,format_cell:c=>String(c.v??'')}};
 const font={widthOfTextAtSize:(s,n)=>[...s].length*n*.55};
 const ws={'!ref':'mock','!rows':[{hpt:25000}],'!cols':Array(240).fill({wch:100}),'0:0':{v:'시작'},'0:239':{v:'끝'}};
 const plan=planSheet(ws,'대형 시트',xlsx,font);assert.equal(plan.length,1);assert.equal(plan[0].cells.length,240);
 let bounds,texts=[];
 const pdf={addPage:paper=>{bounds=paper;return {drawText:(t,o)=>texts.push({t,o}),drawRectangle:o=>assert.ok(o.x>=0&&o.y>=0&&o.x+o.width<=paper[0]+.00001&&o.y+o.height<=paper[1]+.00001)};}};
 await drawSheetPages(pdf,plan,font,undefined,()=>{},'mock',{makePreviewSvg:false});
 assert.ok(Math.max(...bounds)<=14400.00001);
 assert.ok(texts.some(x=>x.t==='끝'));
 assert.ok(texts.every(({o})=>o.x>=0&&o.y>=0&&o.x<=bounds[0]&&o.y<=bounds[1]));
});
