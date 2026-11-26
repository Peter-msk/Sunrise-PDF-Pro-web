/** Browser-only Direct PDF trial. Explicit opt-in; never use a fallback font or raster PDF. */
import fontkit from '@pdf-lib/fontkit';
import {buildDirectPdf} from './direct-pdf.mjs';
import {directFamilyKey,validateDirectFace} from './direct-font.mjs';
import {loadPdfFonts,installMeasureFonts} from './pdf-fonts.js';
import {loadBundledFonts} from './bundled-fonts.js';
import {boundedFontStep} from './font-timeout.mjs';
const MAX_FACE=Number.MAX_SAFE_INTEGER,MAX_TOTAL=Number.MAX_SAFE_INTEGER;
const abort=signal=>{if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');};
const exact=(face,family,bold)=>directFamilyKey(face?.family)===directFamilyKey(family)&&face.bold===bold&&face.italic===false;
export function selectExactDirectFace(faces,family,bold){
 const matches=faces.filter(f=>exact(f,family,bold));
 if(matches.length>1)throw Error('DIRECT_PDF_TEXT_FONT_AMBIGUOUS');
 return matches[0]||null;
}
export async function convertDirectTrial({buffer,openDocument,readPageCount,fontFiles=[],localFonts=[],signal,onProgress=()=>{}}){
 abort(signal);
 const files=Array.from(fontFiles||[]);
 if(files.some(f=>!Number.isSafeInteger(f.size)||f.size>MAX_FACE)||files.reduce((a,f)=>a+f.size,0)>MAX_TOTAL)throw Error('DIRECT_PDF_TEXT_FONT_BUDGET');
 onProgress({stage:'fonts',detail:'bundled',page:0,total:1});
 const selected=files.length?(await loadPdfFonts(files,fontkit,signal)).faces:[];
 const bundled=(await loadBundledFonts(fontkit,signal)).faces;
 // Exact original family only. Bundled aliases are NOT accepted as original.
 const cssFaces=[...selected,...bundled].filter(f=>f.italic===false).map(f=>({...f,cssAliases:[]}));
 const release=await installMeasureFonts({faces:cssFaces},signal,undefined,undefined,{skipUnavailable:true,maxTotalMs:18000,perFaceMs:3500});
 let doc=null;
 try{
  abort(signal);onProgress({stage:'load',detail:'hwp_open',loaded:1,total:1});
  doc=openDocument(buffer);const count=readPageCount(doc,onProgress);
  const resolved=new Map();let retained=0,localReads=0;
  const usage={selected:0,local:0,bundled:0};
  const resolveFont=async({family,bold,italic})=>{
   abort(signal);if(italic!==false)throw Error('DIRECT_PDF_TEXT_FONT_STYLE');
   const key=directFamilyKey(family)+'|'+(bold?'bold':'regular');
   if(resolved.has(key))return resolved.get(key);
   if(resolved.size>=16)throw Error('DIRECT_PDF_TEXT_FONT_BUDGET');
   let face=selectExactDirectFace(selected,family,bold),source='selected';
   if(!face){
    const candidates=(localFonts||[]).filter(f=>directFamilyKey(f.family)===directFamilyKey(family)&&typeof f.blob==='function');
    if(candidates.length>8)throw Error('DIRECT_PDF_TEXT_FONT_AMBIGUOUS');
    const matches=[];let candidateBytes=0;
    for(const entry of candidates){
     abort(signal);if(++localReads>32)throw Error('DIRECT_PDF_TEXT_FONT_BUDGET');
     try{
      const blob=await boundedFontStep(()=>entry.blob(),{signal,timeoutMs:4000,code:'DIRECT_PDF_TEXT_FONT_TIMEOUT'});
      if(blob.size>MAX_FACE||retained+candidateBytes+blob.size>MAX_TOTAL)throw Error('DIRECT_PDF_TEXT_FONT_BUDGET');
      const arr=await boundedFontStep(()=>loadPdfFonts([new File([blob],'local-font.ttf')],fontkit,signal,{postscriptName:entry.postscriptName||null}),{signal,timeoutMs:4000,code:'DIRECT_PDF_TEXT_FONT_TIMEOUT'});
      const f=arr.faces[0];if(exact(f,family,bold)){matches.push(f);candidateBytes+=f.bytes.length;if(matches.length>1)throw Error('DIRECT_PDF_TEXT_FONT_AMBIGUOUS');}
     }catch(e){if(signal?.aborted||e?.name==='AbortError'||/FONT_(?:BUDGET|AMBIGUOUS)/.test(String(e?.message)))throw e;}
    }
    face=selectExactDirectFace(matches,family,bold);source='local';
   }
   if(!face){face=selectExactDirectFace(bundled,family,bold);source='bundled';}
   if(!face)throw Error('DIRECT_PDF_TEXT_FONT_MISSING');
   // Explicit trial plus manual selection or local access is not a license override:
   // validateDirectFace enforces actual SFNT fsType and exact static face identity.
   const approved={...face,embeddingAllowed:true};
   validateDirectFace(fontkit,approved,family,bold);
   if(retained+face.bytes.length>MAX_TOTAL)throw Error('DIRECT_PDF_TEXT_FONT_BUDGET');
   retained+=face.bytes.length;usage[source]++;resolved.set(key,approved);return approved;
  };
  const r=await buildDirectPdf(doc,{signal,resolveFont,allowMedia:true,allowLayers:true,allowSpecial:true,
   onProgress:info=>onProgress({stage:'professional',detail:'direct_page_done',page:info.page,total:info.total})});
  abort(signal);
  return {pdf:new Blob([r.bytes],{type:'application/pdf'}),pages:count,bytes:r.bytes.length,
   renderMode:'direct-trial',vectorPages:count,rasterPages:0,fontUsage:usage,
   warnings:['실기 검증용 Direct PDF입니다. 원본과 글자·줄바꿈·표·그림의 위치 및 색상을 비교하세요. 서체 대체와 전체 페이지 이미지화는 하지 않습니다.'],
   directMetrics:r.metrics};
 }finally{try{doc?.free();}finally{release();}}
}
