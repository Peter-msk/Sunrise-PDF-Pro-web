/** R43 acceptance: a real compressed >80 MP PNG must be decoded at a
 * bounded size, converted to PDF and downloaded in Chromium. No mock canvas. */
import {chromium} from 'playwright';
import {Readable} from 'node:stream';
import {createDeflate} from 'node:zlib';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import assert from 'node:assert/strict';

const width=8200,height=10000;
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(buffer){
 let value=0xffffffff;
 for(const byte of buffer){
  value^=byte;
  for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);
 }
 return (value^0xffffffff)>>>0;
}
function chunk(name,payload){
 const body=Buffer.concat([Buffer.from(name),Buffer.from(payload)]);
 const out=Buffer.alloc(8+body.length);
 out.writeUInt32BE(payload.length,0);body.copy(out,4);
 out.writeUInt32BE(crc32(body),4+body.length);return out;
}
const ihdr=Buffer.alloc(13);
ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
ihdr[8]=8;ihdr[9]=2; // 8-bit RGB; no transparency, filter 0.
const scanline=Buffer.alloc(width*3+1);
async function* scanlines(){for(let y=0;y<height;y++)yield scanline;}
const compressed=[];
for await(const part of Readable.from(scanlines()).pipe(createDeflate({level:1})))compressed.push(part);
const png=Buffer.concat([signature,chunk('IHDR',ihdr),
 chunk('IDAT',Buffer.concat(compressed)),chunk('IEND',Buffer.alloc(0))]);
const site=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:8787/local/';
const output=resolve('r29-browser-real-evidence');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 const jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 await page.goto(site,{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>/변환 준비 완료/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
 await page.locator('#source').setInputFiles({name:'2000x10000-large.png',mimeType:'image/png',buffer:png});
 await page.locator('#convert').click();
 await page.waitForFunction(()=>document.querySelector('#done-count')?.textContent==='1'||
   document.querySelector('#failed-count')?.textContent==='1',null,{timeout:240000});
 const summary=await page.locator('#file-list').innerText();
 assert.equal(await page.locator('#failed-count').innerText(),'0',summary);
 assert.match(summary,/축소/);
 const link=page.locator('#file-list a.download').first();assert.equal(await link.count(),1);
 const wait=page.waitForEvent('download',{timeout:60000});await link.click();
 const dl=await wait,path=resolve(output,'oversize-82mp.pdf');
 await dl.saveAs(path);
 const bytes=readFileSync(path);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);
 assert.equal(jsErrors.length,0,jsErrors.join('; '));
 console.log(JSON.stringify({result:'PASS',sourcePixels:width*height,sourcePngBytes:png.length,
   pdfBytes:bytes.length,onePage:true,resized:true}));
}finally{await browser.close();}
