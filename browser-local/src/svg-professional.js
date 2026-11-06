/**
 * Sunrise PDF PRO - R37 DEV5, opt-in high-fidelity vector candidate.
 * SVG-to-PDFKit and PDFKit are MIT dependencies, loaded only when selected.
 * checkedSvg() must sanitize each page before invoking this module.
 */
import {resolveFont,missingCodepoint} from './pdf-fonts.js';
import {validateTextGeometry} from './svg-text-geometry.js';
import {flattenLocalSvgStyles} from './svg-style.js';
import {loadBrowserPdfBackend} from './pdfkit-backend.js';

const PX_TO_PT=72/96;
const SUPPORTED=new Set([
  'svg','g','title','desc','metadata','defs','symbol','use',
  'rect','line','polyline','polygon','path','circle','ellipse',
  'image','text','tspan','textPath','a','clipPath','mask',
  'linearGradient','radialGradient','stop','pattern'
]);
// Only SVG presentation properties known to be supported by the SVG renderer.
// Unknown CSS rejects the default vector conversion before output is published.
const PRESENTATION=new Set([
  'fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-opacity',
  'stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray',
  'stroke-dashoffset','opacity','color','font-family','font-size',
  'font-style','font-weight','letter-spacing','word-spacing','text-anchor',
  'clip-path','mask','stop-color','stop-opacity','display','visibility'
]);
const UNSUPPORTED_ATTRIBUTES=new Set([
  'filter','mix-blend-mode','isolation','paint-order',
  'font-variant','writing-mode','unicode-bidi','shape-rendering',
  'text-rendering','externalResourcesRequired',
  'dominant-baseline','alignment-baseline','baseline-shift','direction' 
]);

function unsafeReference(value){
  for(const match of String(value).matchAll(/url\s*\(\s*([^)]*)\)/gi)){
    const target=match[1].trim().replace(/^['"]|['"]$/g,'');
    if(!/^#[\w.-]+$/.test(target))return true;
  }
  return /@import|expression\s*\(|(?:https?:|ftp:|\/\/)/i.test(value);
}

function inlineStyleToAttributes(el){
  const raw=el.getAttribute('style');
  if(raw===null)return null;
  if(/[{}]|@import|!important/i.test(raw))return 'UNSUPPORTED_INLINE_STYLE';
  const updates=[];
  for(const part of raw.split(';')){
    if(!part.trim())continue;
    const colon=part.indexOf(':');
    if(colon<1)return 'UNSUPPORTED_INLINE_STYLE';
    const name=part.slice(0,colon).trim().toLowerCase();
    const value=part.slice(colon+1).trim();
    if(!PRESENTATION.has(name)||!value||unsafeReference(value))
      return 'UNSUPPORTED_INLINE_STYLE_'+name;
    updates.push([name,value]);
  }
  for(const [key,value] of updates)el.setAttribute(key,value);
  el.removeAttribute('style');
  return null;
}

function textDirectlyIn(el){
  if(el.childNodes){
    let value='';
    for(const node of el.childNodes)if(node.nodeType===3||node.nodeType===4)value+=node.nodeValue||'';
    return value;
  }
  // Test doubles only. Browser SVG elements always have childNodes.
  return el.textContent||'';
}

/**
 * Return a sanitized/normalized SVG string plus an explicit eligibility result.
 * It never executes scripts or loads external images/fonts.
 * @param {{svg:string,width:number,height:number}} checked checkedSvg() output
 * @param {{fontRegistry?:{faces:Array<object>}}} options
 */
export function preflightProfessionalSvg(checked,{fontRegistry={faces:[]}}={}){
  if(!checked||typeof checked.svg!=='string'||!(checked.width>0&&checked.height>0))
    return {ok:false,reason:'SVG_INVALID'};
  const doc=new DOMParser().parseFromString(checked.svg,'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.doctype||doc.documentElement?.localName!=='svg')
    return {ok:false,reason:'SVG_PARSE_ERROR'};
  const root=doc.documentElement;
  const styles=flattenLocalSvgStyles(root);
  if(!styles.ok)return {ok:false,reason:styles.reason};
  let changed=styles.changed,nodes=0,hasText=false,textPages=0,positionedRuns=0;
  const substituteFamilies=new Set();
  // SVG text without a declared family must use the same selected font in
  // the preflight and in SVG-to-PDFKit's fontCallback; no silent divergence.
  if(!root.getAttribute('font-family')&&fontRegistry.faces.length){
    const normal=fontRegistry.faces.find(f=>!f.bold&&!f.italic)||fontRegistry.faces[0];
    root.setAttribute('font-family',normal.family);
    changed=true;
  }
  const stack=[{el:root,family:'',weight:'normal',style:'normal'}];
  while(stack.length){
    const {el,family,weight,style}=stack.pop();
    if(++nodes>60000)return {ok:false,reason:'SVG_COMPLEXITY'};
    if(!SUPPORTED.has(el.localName))return {ok:false,reason:'UNSUPPORTED_'+el.localName};
    if(el.hasAttribute('class'))return {ok:false,reason:'CLASS_STYLE_UNSUPPORTED'};
    const hadInlineStyle=el.hasAttribute('style');
    const styleError=inlineStyleToAttributes(el);
    if(styleError)return {ok:false,reason:styleError};
    changed ||= hadInlineStyle;
    for(const attr of el.attributes){
      const name=attr.name;
      const value=String(attr.value||'').trim();
      if(name==='xmlns'||name==='xmlns:xlink'){
        if(value!==(name==='xmlns'?'http://www.w3.org/2000/svg':'http://www.w3.org/1999/xlink'))
          return {ok:false,reason:'SVG_NAMESPACE_UNSUPPORTED'};
        continue;
      }
      if(/(?:href|src)$/i.test(name)&&value&&!value.startsWith('#')&&
        !/^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(value))
        return {ok:false,reason:'SVG_EXTERNAL_RESOURCE'};
      if(/^on/i.test(name)||UNSUPPORTED_ATTRIBUTES.has(name)||unsafeReference(value))
        return {ok:false,reason:'SVG_UNSAFE_ATTRIBUTE'};
    }
    const geometry=validateTextGeometry(el);
    if(!geometry.ok)return {ok:false,reason:geometry.reason};
    positionedRuns+=geometry.positionedRuns;
    const currentFamily=el.getAttribute('font-family')??family;
    const currentWeight=el.getAttribute('font-weight')??weight;
    const currentStyle=el.getAttribute('font-style')??style;
    if(el.localName==='text'||el.localName==='tspan'||el.localName==='textPath'){
      const value=textDirectlyIn(el);
      if(value.trim()){
        hasText=true;textPages++;
        const face=resolveFont(fontRegistry,currentFamily,currentWeight,currentStyle);
        if(!face)return {ok:false,reason:'FONT_FAMILY_OR_VARIANT_UNAVAILABLE',
          fontFamily:String(currentFamily||'기본 글꼴').slice(0,120),
          fontWeight:String(currentWeight||'normal').slice(0,24),
          fontStyle:String(currentStyle||'normal').slice(0,24)};
        if(face.isFallback)substituteFamilies.add(face.family);
        if(missingCodepoint(face,value)!==null)
          return {ok:false,reason:'FONT_GLYPH_MISSING',
            fontFamily:String(currentFamily||face.family||'기본 글꼴').slice(0,120)};
      }
    }
    for(const child of el.children)stack.push({el:child,family:currentFamily,
      weight:currentWeight,style:currentStyle});
  }
  const normalizedSvg=changed?new XMLSerializer().serializeToString(root):checked.svg;
  return {ok:true,reason:'OK',nodes,hasText,textRuns:textPages,positionedRuns,substituteFamilies:[...substituteFamilies],svg:normalizedSvg};
}

/**
 * PDFKit >= 0.20 accepts Uint8Array images. Avoid a base64 data URL copy:
 * large locally converted pages should not be duplicated as long strings.
 */
export async function localPngBytes(blob,signal){
  if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
  if(blob?.type!=='image/png')throw Error('PNG_IMAGE_TYPE_INVALID');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
  const signature=[137,80,78,71,13,10,26,10];
  if(bytes.length<8||signature.some((n,i)=>bytes[i]!==n))throw Error('PNG_IMAGE_SIGNATURE_INVALID');
  return bytes;
}

/**
 * Preserve page objects by default. Unsupported pages reject the entire draft.
 * An explicit internal compatibility call can opt into page rasterization.
 * Rendering warnings AFTER drawing may have already modified the PDF stream:
 * in that case the entire candidate is discarded. The caller must not silently
 * retry as an image PDF. No partial vector pages are accepted.
 */
export async function tryProfessionalDocument(hwpDoc,count,{
  checkedSvg,rasterPage,signal,fontRegistry={faces:[]},
  onProgress=()=>{},loadLibraries,imageBytes=localPngBytes,allowRasterFallback=false
}={}){
  const cancel=()=>{if(signal?.aborted)
    throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');};
  cancel();
  const loader=loadLibraries||loadBrowserPdfBackend;
  const {PDFDocument,registerStdFonts,Helvetica,toBlob,SVGtoPDF}=await loader();
  cancel();
  if(!PDFDocument||!toBlob||!SVGtoPDF)
    throw Error('PROFESSIONAL_DEPENDENCY_UNAVAILABLE');
  registerStdFonts?.(Helvetica);
  const pdf=new PDFDocument({autoFirstPage:false,margin:0,compress:true,font:null});
  const pending=toBlob(pdf,signal);
  pending.catch(()=>{});
  let ended=false;
  let previewSvg=null,previewBlob=null,textCandidatePages=0;
  let vectorPages=0,rasterPages=0;
  const fallbackPages=[];
  const substituteFamilies=new Set();
  try{
    for(const face of fontRegistry.faces)pdf.registerFont(face.name,face.bytes);
    for(let i=0;i<count;i++){
      cancel();
      onProgress({stage:'professional',page:i+1,total:count});
      const checked=checkedSvg(hwpDoc.renderPageSvgWithProfile(i,'print'));
      const preflight=preflightProfessionalSvg(checked,{fontRegistry});
      const width=checked.width*PX_TO_PT,height=checked.height*PX_TO_PT;
      for(const family of preflight.substituteFamilies||[])substituteFamilies.add(family);
      if(!preflight.ok){
        if(!allowRasterFallback){
          const fontInfo=preflight.fontFamily?' 필요한 글꼴: '+preflight.fontFamily+
            (preflight.fontWeight?' (굵기 '+preflight.fontWeight+', 스타일 '+preflight.fontStyle+')':'')+'.':'';
          throw Error((i+1)+'쪽의 글자·도형 보존 변환을 완료할 수 없습니다 ('+preflight.reason+').'+fontInfo+' 원본 글꼴과 문서 지원 범위를 확인하세요.');
        }
        // This page has not yet modified PDFKit; safe to rasterize just it.
        onProgress({stage:'professional-raster',page:i+1,total:count});
        const raster=await rasterPage(checked.svg,signal);
        cancel();
        const bytes=await imageBytes(raster.blob,signal);
        cancel();
        pdf.addPage({size:[width,height],margins:{top:0,bottom:0,left:0,right:0}});
        pdf.image(bytes,0,0,{width,height});
        if(i===0)previewBlob=raster.blob;
        rasterPages++;
        fallbackPages.push({page:i+1,reason:preflight.reason});
      }else{
        pdf.addPage({size:[width,height],margins:{top:0,bottom:0,left:0,right:0}});
        const warnings=[];
        SVGtoPDF(pdf,preflight.svg,0,0,{
          width,height,assumePt:false,
          fontCallback:(family,bold,italic)=>{
            const face=resolveFont(fontRegistry,family,bold?'bold':'normal',italic?'italic':'normal');
            if(!face)throw Error('FONT_FAMILY_OR_VARIANT_UNAVAILABLE');
            return face.name;
          },
          imageCallback:link=>{
            if(!/^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(link))
              throw Error('SVG_EXTERNAL_RESOURCE');
            return link;
          },
          warningCallback:message=>warnings.push(String(message))
        });
        if(warnings.length)throw Error('PROFESSIONAL_SVG_WARNING_'+warnings[0].slice(0,200));
        if(preflight.hasText)textCandidatePages++;
        if(i===0)previewSvg=checked.svg;
        vectorPages++;
      }
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    cancel();
    ended=true;
    pdf.end();
    const blob=await pending;
    cancel();
    if(!(blob instanceof Blob)||blob.size<100)throw Error('PROFESSIONAL_PDF_EMPTY');
    const header=new Uint8Array(await blob.slice(0,5).arrayBuffer());
    if(header[0]!==37||header[1]!==80||header[2]!==68||header[3]!==70||header[4]!==45)
      throw Error('PROFESSIONAL_PDF_INVALID_HEADER');
    const preview=previewBlob||(await rasterPage(previewSvg,signal)).blob;
    const renderMode=rasterPages===0?'professional':vectorPages===0?'raster':'mixed';
    return {pdf:blob,preview,pages:count,bytes:blob.size,renderMode,
      vectorPages,rasterPages,fallbackPages,textCandidatePages,searchablePages:null,substituteFamilies:[...substituteFamilies]};
  }catch(error){
    if(typeof pdf.destroy==='function')pdf.destroy();
    else if(!ended){ended=true;pdf.end();}
    throw error;
  }
}
