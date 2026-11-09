import fontkit from '@pdf-lib/fontkit';
import {loadDocumentLocalFonts,svgFontFamilies} from '../src/local-fonts.js';
import {installMeasureFonts} from '../src/pdf-fonts.js';
import {tryProfessionalDocument} from '../src/svg-professional.js';
import {normalizeGifSvg} from '../src/svg-gif.js';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';
import {loadBundledFonts} from '../src/bundled-fonts.js';
import {resolveFontRuns} from '../src/pdf-fonts.js';

export async function runBrowserFontTest(){
 const response=await fetch('/fonts/NanumGothic-Regular.ttf');
 if(!response.ok)throw Error('Test font unavailable: '+response.status);
 const blob=await response.blob();
 const contents=['한글 PDF','한글 문서','ABC 123','표 한글 ABC'];
 const styles=['attribute','inline','stylesheet','inherit'];
 const sizes=[[794,1123],[1123,794]];
 let output=null,completed=0;
 for(const value of contents)for(const kind of styles)for(const [width,height] of sizes){
  let defs='',text='';
  if(kind==='attribute')text=`<text font-family="Nanum Gothic" x="30" y="80" font-size="24">${value}</text>`;
  if(kind==='inline')text=`<text style="font-family:Nanum Gothic" x="30" y="80" font-size="24">${value}</text>`;
  if(kind==='stylesheet'){defs='<style>.sample { font-family: Nanum Gothic; }</style>';text=`<text class="sample" x="30" y="80" font-size="24">${value}</text>`;}
  if(kind==='inherit')text=`<g font-family="Nanum Gothic"><text x="30" y="80" font-size="24">${value}</text></g>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${defs}${text}</svg>`;
  const names=svgFontFamilies(svg);if(!names.has('nanumgothic'))throw Error(`Font missing case ${kind} ${value}`);
  let accessed=0;const doc={renderPageSvgWithProfile:()=>svg};
  const registry=await loadDocumentLocalFonts(doc,1,[
   {family:'Nanum Gothic',fullName:'Nanum Gothic',postscriptName:'NanumGothic',blob:async()=>{accessed++;return blob;}},
   {family:'Unrelated',blob:async()=>{throw Error('Unrelated font must not be read');}}
  ],fontkit);
  if(accessed!==1||registry.faces.length!==1)throw Error(`Font selection failed ${kind} ${value}`);
  const release=await installMeasureFonts(registry);
  try{
   const result=await tryProfessionalDocument(doc,1,{
    checkedSvg:()=>({svg,width,height}),rasterPage:async()=>({blob:new Blob(['preview'],{type:'image/png'})}),fontRegistry:registry
   });
   if(result.substituteFamilies.length||result.vectorPages!==1||result.pdf.size<100)throw Error(`PDF failed ${kind} ${value}`);
   if(!output)output=Array.from(new Uint8Array(await result.pdf.arrayBuffer()));
   completed++;
  }finally{release();}
 }
 if(completed!==32)throw Error('Expected 32 cases, got '+completed);
 const bundled=await loadBundledFonts(fontkit);
 const runs=resolveFontRuns(bundled,'미설치 글꼴','normal','normal','한㎡글');
 if(!runs||runs.map(r=>r.text).join('')!=='한㎡글'||!runs.some(r=>r.face.family==='Sunrise Symbols'))throw Error('Symbol font fallback did not resolve mixed text');
 const marks=resolveFontRuns(bundled,'미설치 글꼴','normal','normal','한․∼글');
 if(!marks||marks.map(r=>r.text).join('')!=='한․∼글'||!marks.some(r=>r.face.family==='Sunrise Marks'))throw Error('Marks fallback did not resolve text');
 const gif='R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
 const gifSvg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image href="data:image/gif;base64,'+gif+'" x="0" y="0" width="20" height="20"/></svg>';
 const normalized=await normalizeGifSvg(gifSvg);
 if(!normalized.includes('data:image/png;base64,')||normalized.includes('data:image/gif'))throw Error('Static GIF conversion failed');
 const imageDoc={renderPageSvgWithProfile:()=>gifSvg};
 const stages=[];
 const debugLoader=async()=>{const libs=await loadBrowserPdfBackend();const Original=libs.PDFDocument;
  class Tracked extends Original{constructor(...args){super(...args);this.on('end',()=>stages.push('stream-end'));this.on('error',()=>stages.push('stream-error'));}end(...args){stages.push('pdf-end');return super.end(...args);}}
  return {...libs,PDFDocument:Tracked,SVGtoPDF:(...args)=>{stages.push('svg-start');const r=libs.SVGtoPDF(...args);stages.push('svg-end');return r;},toBlob:(...args)=>{stages.push('blob-start');return libs.toBlob(...args).then(x=>{stages.push('blob-end');return x;});}};
 };
 const imagePdf=await Promise.race([tryProfessionalDocument(imageDoc,1,{checkedSvg:async()=>({svg:normalized,width:100,height:100}),rasterPage:async()=>({blob:new Blob(['preview'])}),fontRegistry:{faces:[]},loadLibraries:debugLoader,onProgress:()=>stages.push('page')}),new Promise((_,reject)=>setTimeout(()=>reject(Error('GIF PDF test timeout: '+stages.join(','))),15000))]);
 if(imagePdf.pdf.size<100||imagePdf.vectorPages!==1)throw Error('GIF picture PDF conversion failed');
 console.log('PASS 32 SVG/PDF cases: text 4 x font declarations 4 x page sizes 2');
 return output;
}

