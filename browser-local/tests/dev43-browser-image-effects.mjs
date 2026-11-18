/** Real Chromium color comparison + actual browser PDFKit output; generated public pixels only. */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {PDFDocument as PdfLibDocument} from 'pdf-lib';
const server=await createServer({server:{host:'127.0.0.1',port:5179,strictPort:true},configFile:false,appType:'custom'});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.route('http://127.0.0.1:5179/__dev43',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>DEV43 filter QA</title>'}));
 await page.goto('http://127.0.0.1:5179/__dev43');
 const out=await page.evaluate(async()=>{
  const {normalizeSvgGrayscale}=await import('/src/svg-safe-grayscale.mjs');
  const {loadBrowserPdfBackend}=await import('/src/pdfkit-backend.js');
  const {preflightProfessionalSvg}=await import('/src/svg-professional.js');
  const c=document.createElement('canvas');c.width=4;c.height=1;
  const ctx=c.getContext('2d');const data=ctx.createImageData(4,1);
  data.data.set([255,0,0,255,0,255,0,255,0,0,255,128,70,120,180,255]);
  ctx.putImageData(data,0,0);const png=c.toDataURL('image/png');
  const matrix='<feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"/>';
  const transfer='<feComponentTransfer>'+['R','G','B'].map(c=>'<feFunc'+c+' type="linear" slope="1.2" intercept="0"/>').join('')+'</feComponentTransfer>';
  const discrete='<feComponentTransfer>'+['R','G','B'].map(c=>'<feFunc'+c+' type="discrete" tableValues="0 1"/>').join('')+'</feComponentTransfer>';
  const def=(id,body)=>'<filter id="'+id+'">'+body+'</filter>';
  const gray=def('rhwp-img-grayscale',matrix),bc=def('rhwp-img-bc-b10c20',transfer),bw=def('rhwp-img-blackwhite',matrix+discrete);
  const img='<image x="0" y="0" width="4" height="1" preserveAspectRatio="none" href="'+png+'"/>';
  const wrap=(id,body)=>'<g filter="url(#'+id+')">'+body+'</g>';
  const svg=(defs,body)=>'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="2"><defs>'+defs+'</defs>'+body+'<rect x="5" y="0" width="3" height="2" fill="#ef2300"/></svg>';
  async function render(s){
   const loc=URL.createObjectURL(new Blob([s],{type:'image/svg+xml'}));
   try{const image=new Image();image.src=loc;await image.decode();
    const cv=document.createElement('canvas');cv.width=8;cv.height=2;
    const cx=cv.getContext('2d');cx.drawImage(image,0,0);
    return [...cx.getImageData(0,0,8,2).data];
   }finally{URL.revokeObjectURL(loc)}
  }
  const samples=[
   ['gray',svg(gray,wrap('rhwp-img-grayscale',img)),1],
   ['brightness-contrast',svg(bc,wrap('rhwp-img-bc-b10c20',img)),1],
   ['black-white',svg(bw,wrap('rhwp-img-blackwhite',img)),1],
   ['nested',svg(gray+bc,wrap('rhwp-img-grayscale',wrap('rhwp-img-bc-b10c20',img))),2],
  ];
  const results=[];let normalized;
  for(const [name,src,count] of samples){
   const r=await normalizeSvgGrayscale(src);
   if(r.filtersApplied!==count||r.imagesChanged!==1)throw Error('FILTER_COUNT '+name);
   const before=await render(src),after=await render(r.svg);
   const max=Math.max(...before.map((v,i)=>Math.abs(v-after[i])));
   const alpha=Math.max(...before.filter((_,i)=>i%4===3).map((v,i)=>Math.abs(v-after[4*i+3])));
   const pre=preflightProfessionalSvg({svg:r.svg,width:8,height:2});
   if(!pre.ok)throw Error('PREFLIGHT '+name+': '+pre.reason);
   results.push({name,max,alpha,filters:r.filtersApplied,images:r.imagesChanged});
   normalized=r.svg;
  }
  const kit=await loadBrowserPdfBackend();kit.registerStdFonts(kit.Helvetica);
  const doc=new kit.PDFDocument({autoFirstPage:false,margin:0,compress:false,font:null});
  const probe={},terminal={};
  const p=kit.toBlob(doc,undefined,()=>{},undefined,probe,terminal);
  for(let i=0;i<2;i++){
   doc.addPage({size:[160,80],margins:{top:0,bottom:0,left:0,right:0}});
   kit.SVGtoPDF(doc,normalized,0,0,{width:160,height:40,assumePt:false,
    imageCallback:l=>l,fontCallback:()=>'Helvetica',warningCallback:w=>{throw Error(w)}});
   doc.font('Helvetica').fontSize(12).text('DEV43 vector text',5,45);
  }
  doc.end();
  let timeout;
  try{
   const blob=await Promise.race([p,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('REAL_PDFKIT_END_TIMEOUT waiting='+doc._waiting)),15000)})]);
   return {results,bytes:[...new Uint8Array(await blob.arrayBuffer())],endSeen:probe.endSeen,waiting:doc._waiting};
  }finally{clearTimeout(timeout)}
 });
 for(const sample of out.results){
  // Browser filter intermediate buffers can quantize to 8-bit. Compare actual
  // rendered channels, not only formula expectations. Allow a small rounding delta.
  assert.ok(sample.max<=5,JSON.stringify(sample));
  assert.ok(sample.alpha<=1,JSON.stringify(sample));
 }
 const bytes=Uint8Array.from(out.bytes),pdf=await PdfLibDocument.load(bytes);
 assert.equal(pdf.getPageCount(),2);assert.equal(out.endSeen,true);assert.equal(out.waiting,0);
 const raw=Buffer.from(bytes).toString('latin1');
 assert.match(raw,/\/Subtype\s*\/Image/);assert.match(raw,/\bBT\b/);assert.match(raw,/\bTJ\b|\bTj\b/);
 console.log(JSON.stringify({realChromium:out.results,realBrowserPDFKit:{pages:pdf.getPageCount(),bytes:bytes.length,endSeen:out.endSeen,pendingRefs:out.waiting,vectorTextOperators:true}},null,2));
}finally{await browser?.close();await server.close();}
