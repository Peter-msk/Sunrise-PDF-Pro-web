/** Genuine OFL fonts packed as an in-memory TTC; no fixture font is uploaded.
 * Tests the fontkit face selector AND PDFKit collection face argument.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import {resolve} from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import PDFDocument from 'pdfkit';
import {loadPdfFonts} from '../src/pdf-fonts.js';

globalThis.File ||= File;
const source=resolve(import.meta.dirname,'../public/fonts');
const aligned=value=>(value+3)&~3;
function makeCollection(buffers){
 const entries=buffers.map(buf=>Buffer.from(buf));
 const offsets=[];let size=aligned(12+entries.length*4);
 for(const f of entries){offsets.push(size);size=aligned(size+f.length);}
 const out=Buffer.alloc(size);
 out.write('ttcf',0,4,'ascii');out.writeUInt32BE(0x00010000,4);out.writeUInt32BE(entries.length,8);
 for(let i=0;i<entries.length;i++){
  const entry=entries[i],where=offsets[i];out.writeUInt32BE(where,12+i*4);entry.copy(out,where);
  const tables=entry.readUInt16BE(4);
  if(tables<1||tables>100)throw Error('Invalid SFNT table directory');
  for(let k=0;k<tables;k++){
   const rec=12+k*16,local=entry.readUInt32BE(rec+8);
   if(local>=entry.length)throw Error('Invalid source font offset');
   out.writeUInt32BE(where+local,where+rec+8);
  }
 }
 return out;
}

test('a genuine two-face TTC selects the exact face and PDFKit embeds it',async()=>{
 const plain=[readFileSync(resolve(source,'NanumGothic-Regular.ttf')),
  readFileSync(resolve(source,'NanumGothic-Bold.ttf'))];
 const regular=fontkit.create(plain[0]);
 const bold=fontkit.create(plain[1]);
 assert.notEqual(regular.postscriptName,bold.postscriptName);
 const ttc=makeCollection(plain);
 const collection=fontkit.create(ttc);
 assert(Array.isArray(collection.fonts)&&collection.fonts.length===2);
 const input=new File([ttc],'local-font.ttf');
 const loaded=await loadPdfFonts([input],fontkit,undefined,{postscriptName:bold.postscriptName});
 const face=loaded.faces[0];
 assert.equal(face.collectionFontName,bold.postscriptName);
 assert.equal(face.bold,true);
 const pdf=new PDFDocument({autoFirstPage:false,compress:false});
 const chunks=[];
 const finished=new Promise((res,rej)=>{
  pdf.on('data',buf=>chunks.push(buf));pdf.on('end',res);pdf.on('error',rej);
 });
 pdf.registerFont('SelectedTtc',face.bytes,face.collectionFontName);
 pdf.addPage().font('SelectedTtc').fontSize(12).text('한글123');pdf.end();
 await finished;
 const bytes=Buffer.concat(chunks);
 assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
 assert(bytes.length>1000);
 console.log('REAL_TTC_PDFKIT_EMBED_PASS '+JSON.stringify({faces:collection.fonts.length,selected:bold.postscriptName,pdfBytes:bytes.length}));
});
