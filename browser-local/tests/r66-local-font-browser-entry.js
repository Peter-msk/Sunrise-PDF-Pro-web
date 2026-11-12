// Served as a Vite module so bare npm imports resolve inside Chromium.
// This models a user-approved FontData with the bytes of a real OFL font.
import fontkit from '@pdf-lib/fontkit';
import {loadDocumentLocalFonts} from '../src/local-fonts.js';
import {resolveFont,installMeasureFonts} from '../src/pdf-fonts.js';
import {tryProfessionalDocument} from '../src/svg-professional.js';

export async function verifyBilingualLocalFontPdf(){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><text x="20" y="55" font-family="나눔고딕" font-size="22">가나다</text></svg>';
 const doc={renderPageSvgWithProfile:()=>svg};
 const registry=await loadDocumentLocalFonts(doc,1,await window.queryLocalFonts(),fontkit);
 const selected=resolveFont(registry,'나눔고딕','normal','normal','가나다');
 if(!selected?.isLocal)throw Error('Korean font family did not choose the local face');
 const release=await installMeasureFonts(registry);
 let pdf;
 try{
  pdf=await tryProfessionalDocument(doc,1,{
   checkedSvg:()=>({svg,width:794,height:1123}),fontRegistry:registry,
   rasterPage:async()=>{throw Error('raster unexpectedly used')}
  });
 }finally{release();}
 const head=new Uint8Array(await pdf.pdf.slice(0,5).arrayBuffer());
 return {pdfBytes:pdf.pdf.size,signature:String.fromCharCode(...head),
  fontUsage:pdf.fontUsage,missing:registry.unmatchedNames,localFaces:registry.faces.length};
}
