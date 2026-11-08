import fontkit from '@pdf-lib/fontkit';
import {loadDocumentLocalFonts,svgFontFamilies} from '../src/local-fonts.js';
import {installMeasureFonts} from '../src/pdf-fonts.js';
import {tryProfessionalDocument} from '../src/svg-professional.js';

export async function runBrowserFontTest(){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><style>.sample { font-family: Nanum Gothic; }</style><text class="sample" x="30" y="80" font-size="24">한글 PDF</text></svg>';
 const names=svgFontFamilies(svg);
 if(!names.has('nanumgothic'))throw Error('Stylesheet font family was not found');
 const response=await fetch('/fonts/NanumGothic-Regular.ttf');
 if(!response.ok)throw Error('Test font unavailable: '+response.status);
 const blob=await response.blob();
 let accessed=0;
 const doc={renderPageSvgWithProfile:()=>svg};
 const registry=await loadDocumentLocalFonts(doc,1,[
  {family:'Nanum Gothic',fullName:'Nanum Gothic',postscriptName:'NanumGothic',blob:async()=>{accessed++;return blob;}},
  {family:'Unrelated',blob:async()=>{throw Error('Unrelated font must not be read');}}
 ],fontkit);
 if(accessed!==1||registry.faces.length!==1)throw Error('Local font selection failed');
 const release=await installMeasureFonts(registry);
 try{
  const result=await tryProfessionalDocument(doc,1,{
   checkedSvg:()=>({svg,width:794,height:1123}),
   rasterPage:async()=>({blob:new Blob(['preview'],{type:'image/png'})}),
   fontRegistry:registry
  });
  if(result.substituteFamilies.length)throw Error('A substitute font was used');
  return Array.from(new Uint8Array(await result.pdf.arrayBuffer()));
 }finally{release();}
}
