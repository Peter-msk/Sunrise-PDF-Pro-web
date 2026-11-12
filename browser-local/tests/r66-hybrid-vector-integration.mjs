import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {tryProfessionalDocument} from '../src/svg-professional.js';
import {normalizeSvgForPdf,UNSUPPORTED_FILTER} from '../src/svg-filter-hybrid.mjs';

const NS='http://www.w3.org/2000/svg';
const svgPage=(inside)=>`<svg xmlns="${NS}" width="816" height="1056" viewBox="0 0 816 1056">${inside}</svg>`;
const good=svgPage('<rect width="20" height="25" fill="#123456"/>');
const unsupported=svgPage('<defs><filter id="shadow"><feGaussianBlur stdDeviation="3"/></filter></defs><g filter="url(#shadow)"><rect width="25" height="25"/></g>');
function mockDOM(){
 const old={DOMParser:globalThis.DOMParser,XMLSerializer:globalThis.XMLSerializer};
 const window=new JSDOM('').window;
 globalThis.DOMParser=window.DOMParser;globalThis.XMLSerializer=window.XMLSerializer;
 return ()=>{globalThis.DOMParser=old.DOMParser;globalThis.XMLSerializer=old.XMLSerializer;window.close();};
}
function backend(stats){
 let closed=false;
 class PDFDocument {
  registerFont(){}
  addPage(){stats.pages++;return this;}
  image(){stats.imagePages++;}
  end(){closed=true;}
  destroy(){closed=true;}
 }
 return async()=>({PDFDocument,Helvetica:{},registerStdFonts:()=>{},
  SVGtoPDF:()=>{stats.vectorPages++;},
  toBlob:async()=>{assert.equal(closed,false);return new Blob(['%PDF-1.7\n','abc'.repeat(60)],{type:'application/pdf'});}});
}

test('explicit hybrid preserves normal-page vectors and only rasterizes unsupported SVG filter page',async()=>{
 const cleanup=mockDOM();
 try{
  const stats={pages:0,imagePages:0,vectorPages:0};
  const originals=[good,unsupported,good];
  const result=await tryProfessionalDocument({renderPageSvgWithProfile:i=>originals[i]},3,{
   checkedSvg:async raw=>(await normalizeSvgForPdf(raw,async input=>{
    if(input.includes('feGaussianBlur'))throw Error(UNSUPPORTED_FILTER);
    return {svg:input,filtersApplied:0,imagesChanged:0};
   },input=>({svg:input,width:816,height:1056}),{hybrid:true})).checked,
   rasterPage:async source=>{assert.match(source,/feGaussianBlur/);return {blob:new Blob(['png'],{type:'image/png'})};},
   imageBytes:async()=>Uint8Array.from([137,80,78,71,13,10,26,10,0]),
   loadLibraries:backend(stats),allowRasterFallback:true,filterOnlyRasterFallback:true
  });
  assert.deepEqual([stats.pages,stats.imagePages,stats.vectorPages],[3,1,2]);
  assert.equal(result.renderMode,'mixed');
  assert.equal(result.vectorPages,2);assert.equal(result.rasterPages,1);
  assert.deepEqual(result.fallbackPages,[{page:2,reason:UNSUPPORTED_FILTER}]);
 }finally{cleanup();}
});

test('filter-only hybrid never rasterizes unrelated unsupported SVG feature',async()=>{
 const cleanup=mockDOM();
 try{
  const stats={pages:0,imagePages:0,vectorPages:0};
  const raw=svgPage('<unexpected-element/>');
  await assert.rejects(tryProfessionalDocument({renderPageSvgWithProfile:()=>raw},1,{
   checkedSvg:async input=>({svg:input,width:816,height:1056}),
   rasterPage:async()=>{throw Error('RASTER_MUST_NOT_RUN');},
   loadLibraries:backend(stats),allowRasterFallback:true,filterOnlyRasterFallback:true
  }),/UNSUPPORTED_unexpected-element/);
  assert.equal(stats.imagePages,0);
 }finally{cleanup();}
});


test('PDFKit dispose failure never masks the primary stream timeout or publishes partial output',async()=>{
 const cleanup=mockDOM();
 try{
  let closed=0,aborted=0;
  class PDFDocument{
   addPage(){return this;}
   end(){} // Simulate a writer whose final end event never fires.
   destroy(){closed++;throw Error('PDFKIT_DESTROY_FAILURE');}
  }
  const loader=async()=>({
   PDFDocument,Helvetica:{},registerStdFonts:()=>{},
   SVGtoPDF:()=>{},
   toBlob:(_pdf,signal)=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>{
     aborted++;reject(new DOMException('stopped','AbortError'));
    },{once:true});
   })
  });
  await assert.rejects(tryProfessionalDocument({
   renderPageSvgWithProfile:()=>good
  },1,{
   checkedSvg:async input=>({svg:input,width:816,height:1056}),
   rasterPage:async()=>{throw Error('NO_RASTER');},
   loadLibraries:loader,finalizeTimeoutMs:20
  }),/PDF_STREAM_TIMEOUT/);
  assert.equal(closed,1,'faulty writer must still be disposed');
  assert.equal(aborted,1,'collector must be aborted on timeout');
 }finally{cleanup();}
});

test('PDFKit dispose failure cannot mask a rejected SVG before PDF publication',async()=>{
 const cleanup=mockDOM();
 try{
  let closed=0;
  class PDFDocument{
   addPage(){return this;}
   end(){}
   destroy(){closed++;throw Error('PDFKIT_DESTROY_FAILURE');}
  }
  const loader=async()=>({
   PDFDocument,Helvetica:{},registerStdFonts:()=>{},SVGtoPDF:()=>{},
   toBlob:(_pdf,signal)=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('stopped','AbortError')),{once:true});
   })
  });
  await assert.rejects(tryProfessionalDocument({
   renderPageSvgWithProfile:()=>good
  },1,{
   checkedSvg:async()=>{throw Error('SVG_FILTER_EFFECT_UNSUPPORTED');},
   rasterPage:async()=>{throw Error('NO_RASTER');},
   loadLibraries:loader
  }),/SVG_FILTER_EFFECT_UNSUPPORTED/);
  assert.equal(closed,1);
 }finally{cleanup();}
});
