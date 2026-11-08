import fontkit from '@pdf-lib/fontkit';
import {loadDocumentLocalFonts} from '../src/local-fonts.js';
import {installMeasureFonts,resolveFont} from '../src/pdf-fonts.js';
import {tryProfessionalDocument} from '../src/svg-professional.js';

export async function verifyInstalledFont(fonts){
 const item=fonts.find(f=>f.postscriptName==='ArialMT')||fonts.find(f=>f.family.toLowerCase()==='arial'&&/^(regular|normal|표준)$/i.test(f.style));
 if(!item)throw Error('Windows Arial Regular unavailable; count='+fonts.length+' Arial variants='+JSON.stringify(fonts.filter(f=>/arial/i.test(f.family)).slice(0,5).map(f=>({family:f.family,style:f.style,postscriptName:f.postscriptName}))));
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><text font-family="Arial" x="30" y="80" font-size="24">Actual Windows font</text></svg>';
 const doc={renderPageSvgWithProfile:()=>svg};
 const registry=await loadDocumentLocalFonts(doc,1,fonts,fontkit);
 const chosen=resolveFont(registry,'Arial','normal','normal','Actual Windows font');
 if(!chosen||chosen.isFallback)throw Error('Installed Arial did not match');
 const release=await installMeasureFonts(registry);
 try{
  const result=await tryProfessionalDocument(doc,1,{checkedSvg:()=>({svg,width:794,height:1123}),
   rasterPage:async()=>({blob:new Blob(['preview'],{type:'image/png'})}),fontRegistry:registry});
  if(result.substituteFamilies.length)throw Error('Unexpected substitute font');
  return {faces:registry.faces.length,bytes:result.pdf.size};
 }finally{release();}
}
