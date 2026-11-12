/** DEV26 synthetic high-density table/diagram + real PDFKit + PDF.js structure QA.
 * Uses no user documents; visual parity with Hancom is NOT claimed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import PDFKit from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import {JSDOM} from 'jsdom';
import {deflateSync} from 'node:zlib';
import {tryProfessionalDocument} from '../src/svg-professional.js';
import {normalizeSvgForPdf} from '../src/svg-filter-hybrid.mjs';
import {normalizeSvgGrayscale} from '../src/svg-safe-grayscale.mjs';
import {parseSafeSvg} from '../src/svg-security.js';
import {inspectPdfVectorQuality,summarizeVectorPreservation} from '../src/pdf-vector-quality.mjs';

const ns='http://www.w3.org/2000/svg';
const page=body=>'<svg xmlns="'+ns+'" width="816" height="1056" viewBox="0 0 816 1056" font-family="Helvetica">'+body+'</svg>';
const table=()=>{
 let s='<rect x="32" y="32" width="740" height="630" fill="#eeeeee"/>';
 for(let row=0;row<18;row++)for(let col=0;col<10;col++){
  const x=40+col*72,y=40+row*33;
  s+='<rect x="'+x+'" y="'+y+'" width="70" height="31" fill="#ffffff" stroke="#334455" stroke-width=".7"/>';
  if(col<5)s+='<text x="'+(x+3)+'" y="'+(y+16)+'" font-size="9" fill="#222222">'+row+'-'+col+'</text>';
 }
 return page(s);
};
const filtered=()=>page('<defs><filter id="shadow"><feGaussianBlur stdDeviation="4"/></filter></defs>'+
  '<g filter="url(#shadow)"><rect x="60" y="90" width="300" height="230" fill="#aaccff"/>'+
  '<rect x="380" y="140" width="220" height="160" fill="#aaffcc"/></g>');
const diagram=()=>{
 let s='<text x="50" y="65" font-size="18">FLOW DIAGRAM</text>';
 for(let i=0;i<30;i++){
  const x=60+(i%6)*108,y=100+Math.floor(i/6)*120;
  s+='<rect x="'+x+'" y="'+y+'" width="82" height="45" fill="#eef5ff" stroke="#113388"/>';
  s+='<path d="M '+(x+82)+' '+(y+20)+' h 18" fill="none" stroke="#111111" stroke-width="2"/>';
  s+='<text x="'+(x+5)+'" y="'+(y+27)+'" font-size="11">NODE '+i+'</text>';
 }
 return page(s);
};
const safe=()=>page('<defs><filter id="keep"><feColorMatrix type="saturate" values="1"/></filter></defs>'+
  '<rect x="20" y="20" width="700" height="600" fill="#bbddff" filter="url(#keep)"/>'+
  '<path d="M 30 610 L 720 50" stroke="#ff7700" stroke-width="3" fill="none"/>');
const pages=[table(),filtered(),diagram(),safe()];
const onceDom=async fn=>{
 const win=new JSDOM('').window,parser=globalThis.DOMParser,serializer=globalThis.XMLSerializer;
 globalThis.DOMParser=win.DOMParser;globalThis.XMLSerializer=win.XMLSerializer;
 try{return await fn();}finally{
  globalThis.DOMParser=parser;globalThis.XMLSerializer=serializer;win.close();
 }
};
function makePng(){
 const width=16,height=16;
 const pixel=Buffer.alloc(height*(width*3+1));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=y*(width*3+1)+1+3*x;
  pixel[offset]=x*14;pixel[offset+1]=y*14;pixel[offset+2]=160;
 }
 const crc32=buf=>{
  let v=-1;for(const b of buf){v^=b;for(let n=0;n<8;n++)
   v=v&1?(v>>>1)^0xedb88320:v>>>1;
  }return (v^-1)>>>0;
 };
 const chunk=(type,buf)=>{
  const name=Buffer.from(type,'ascii'),data=Buffer.concat([name,buf]);
  const out=Buffer.alloc(12+buf.length);
  out.writeUInt32BE(buf.length,0);data.copy(out,4);
  out.writeUInt32BE(crc32(data),8+buf.length);
  return out;
 };
 const ihdr=Buffer.alloc(13);
 ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
 ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixel)),chunk('IEND',Buffer.alloc(0))]);
}
async function realBackend(){
 return {PDFDocument:PDFKit,Helvetica:{},registerStdFonts:()=>{},SVGtoPDF,
  toBlob:(pdf,signal)=>{
   const chunks=[];
   return new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException('cancelled','AbortError'));
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    signal?.addEventListener('abort',abort,{once:true});
    pdf.on('data',chunk=>chunks.push(chunk));
    pdf.once('end',()=>{cleanup();resolve(new Blob(chunks,{type:'application/pdf'}));});
    pdf.once('error',error=>{cleanup();reject(error);});
   });
  }};
}
async function renderSynthetic(hybrid){
 const png=makePng();
 return onceDom(()=>tryProfessionalDocument({
  renderPageSvgWithProfile:index=>pages[index]
 },pages.length,{
  checkedSvg:async(raw)=>{
   const normalized=await normalizeSvgForPdf(raw,
    x=>normalizeSvgGrayscale(x),
    x=>{const root=parseSafeSvg(x);return {svg:new XMLSerializer().serializeToString(root),width:816,height:1056};},
    {hybrid});
   return normalized.checked;
  },
  rasterPage:async()=>({blob:new Blob([png],{type:'image/png'})}),
  imageBytes:async()=>new Uint8Array(png),
  fontRegistry:{faces:[]},
  allowRasterFallback:hybrid,filterOnlyRasterFallback:hybrid,
  loadLibraries:realBackend
 }));
}
let cached=null;
async function generated(){
 if(!cached)cached=renderSynthetic(true);
 return cached;
}
test('metadata defines page-level vector preservation, not path or pixel-area ratio',()=>{
 const x=summarizeVectorPreservation({pages:4,vectorPages:3,rasterPages:1,
  fallbackPages:[{page:2,reason:'SVG_FILTER_EFFECT_UNSUPPORTED'}],renderMode:'mixed'});
 assert.equal(x.vectorPagePercent,75);
 assert.deepEqual(x.rasterizedPageNumbers,[2]);
 assert.equal(x.scope,'page-disposition-not-vector-object-or-pixel-area');
});
test('metadata rejects missing/duplicate/out-of-range fallback pages and false modes',()=>{
 const base={pages:3,vectorPages:2,rasterPages:1,renderMode:'mixed',
  fallbackPages:[{page:2,reason:'SVG_FILTER_EFFECT_UNSUPPORTED'}]};
 for(const bad of [
  {...base,fallbackPages:[]},
  {...base,fallbackPages:[{page:4,reason:'SVG_FILTER_EFFECT_UNSUPPORTED'}]},
  {...base,renderMode:'professional'},
  {...base,vectorPages:3},
  {...base,pages:0},
  {...base,fallbackPages:[{page:2,reason:''}]}
 ])assert.throws(()=>summarizeVectorPreservation(bad),/PDF_VECTOR_/);
});
test('real complex 18x10 SVG table and 30-node diagram remain vector, blur page alone rasterizes',async()=>{
 const result=await generated();
 assert.equal(result.pdf.type,'application/pdf');
 assert.ok(result.pdf.size>1000);
 assert.equal(result.renderMode,'mixed');
 assert.deepEqual([result.vectorPages,result.rasterPages],[3,1]);
 assert.deepEqual(result.fallbackPages,[{page:2,reason:'SVG_FILTER_EFFECT_UNSUPPORTED'}]);
 const report=await inspectPdfVectorQuality(result.pdf,result);
 assert.equal(report.structuralPass,true,JSON.stringify(report.findings));
 assert.equal(report.vectorPagePercent,75);
 assert.equal(report.pages.length,4);
 assert.equal(report.pages[1].mode,'raster-fallback');
 assert.ok(report.pages[1].imagePaints>=1,'the filtered page must contain a real PDF image');
 assert.equal(report.pages[1].textPaintOps,0,'raster page should not pretend to be searchable');
 assert.ok(report.pages[0].vectorPathOps>=100,'complex table retains vector rectangles');
 assert.ok(report.pages[0].textPaintOps>=40,'table cells retain selectable PDF text');
 assert.ok(report.pages[2].vectorPathOps>=40,'diagram paths remain vector');
 assert.ok(report.pages[2].textPaintOps>=10,'diagram labels remain searchable');
 assert.ok(report.pages[3].vectorPathOps>=1,'safe identity SVG filter preserves vectors');
 assert.equal(report.rasterizedPageNumbers.join(','),'2');
});
test('default professional mode refuses unsupported filter, never silently downgrades page',async()=>{
 await assert.rejects(renderSynthetic(false),/SVG_FILTER_EFFECT_UNSUPPORTED/);
});
test('content audit detects false claimed raster page with no actual embedded image',async()=>{
 const result=await generated();
 const incorrect={...result,pages:4,vectorPages:3,rasterPages:1,
  fallbackPages:[{page:3,reason:'SVG_FILTER_EFFECT_UNSUPPORTED'}]};
 const report=await inspectPdfVectorQuality(result.pdf,incorrect);
 assert.equal(report.structuralPass,false);
 assert.ok(report.findings.some(x=>x.page===3&&x.code==='RASTER_FALLBACK_IMAGE_MISSING'));
});
test('content audit detects wrong PDF page count and refuses oversized file',async()=>{
 const result=await generated();
 const wrong={...result,pages:3,vectorPages:2,rasterPages:1,
  fallbackPages:[{page:2,reason:'SVG_FILTER_EFFECT_UNSUPPORTED'}]};
 await assert.rejects(inspectPdfVectorQuality(result.pdf,wrong),
  /PDF_VECTOR_PDF_PAGE_COUNT_MISMATCH/);
 await assert.rejects(inspectPdfVectorQuality(result.pdf,result,{maxBytes:1}),
  /PDF_VECTOR_AUDIT_TOO_LARGE/);
});
test('aborted, invalid PDF input and old metadata fail closed without publishing a score',async()=>{
 const result=await generated();
 const abort=new AbortController();abort.abort();
 await assert.rejects(inspectPdfVectorQuality(result.pdf,result,{signal:abort.signal}),
  {name:'AbortError'});
 await assert.rejects(inspectPdfVectorQuality(new Blob(['x']),result),
  /PDF_VECTOR_AUDIT_INPUT_INVALID/);
 assert.throws(()=>summarizeVectorPreservation({pages:3}),/PDF_VECTOR_/);
});
test('vector page with a genuine embedded image is not falsely counted as fully rasterized',async()=>{
 const png=makePng();
 const pdf=new PDFKit({autoFirstPage:false,margin:0,compress:false});
 const chunks=[],ended=new Promise((resolve,reject)=>{
  pdf.on('data',b=>chunks.push(b));pdf.on('end',resolve);pdf.on('error',reject);
 });
 pdf.addPage({size:[340,260],margin:0});
 pdf.rect(10,10,260,150).stroke();
 pdf.font('Helvetica').fontSize(13).text('TABLE PHOTO COMPOSITE',12,32);
 pdf.image(png,150,80,{width:40,height:40});
 pdf.end();await ended;
 const blob=new Blob(chunks,{type:'application/pdf'});
 const report=await inspectPdfVectorQuality(blob,{
  pages:1,vectorPages:1,rasterPages:0,fallbackPages:[],renderMode:'professional'
 });
 assert.equal(report.structuralPass,true);
 assert.equal(report.vectorPagePercent,100);
 assert.ok(report.pages[0].imagePaints>=1,'normal embedded photo remains a PDF image');
 assert.ok(report.pages[0].vectorPathOps>=1,'other drawing retains vector form');
 assert.ok(report.pages[0].textPaintOps>=1,'text is still PDF text');
});
