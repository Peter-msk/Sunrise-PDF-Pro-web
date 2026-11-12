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
