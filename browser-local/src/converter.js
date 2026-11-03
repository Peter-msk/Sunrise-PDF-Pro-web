import init, { HwpDocument } from '@rhwp/core';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import searchableFontURL from '@fontsource/nanum-gothic/files/nanum-gothic-korean-400-normal.woff?url';
import {extractSvgTextRuns,writeSearchableText} from './searchable-layer.js';
const MAX_FILE=20*1024*1024,MAX_PAGES=120;
const QUALITY_PROFILES=Object.freeze({
 standard:{dpi:300,maxPixels:9_000_000,maxPages:120},
 detail:{dpi:360,maxPixels:16_000_000,maxPages:30}
});
export function qualityProfile(name='standard'){
 if(!(name in QUALITY_PROFILES))throw Error('지원하지 않는 PDF 품질 설정입니다.');
 return QUALITY_PROFILES[name];
}
const OLE=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
function throwIfCancelled(signal){
 if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
}
let wasmPromise=null;
export function verifyFile(file,buf){
 if(!file||file.size<8||file.size>MAX_FILE)throw Error('파일 크기는 8바이트 이상, 20MiB 이하여야 합니다.');
 const b=new Uint8Array(buf,0,8);
 if(/\.hwp$/i.test(file.name)){if(!OLE.every((n,i)=>b[i]===n))throw Error('HWP OLE 파일 서명이 일치하지 않습니다.');}
 else if(/\.hwpx$/i.test(file.name)){if(!(b[0]===80&&b[1]===75&&b[2]===3&&b[3]===4))throw Error('HWPX ZIP 파일 서명이 일치하지 않습니다.');}
 else throw Error('HWP/HWPX만 지원합니다.');
 return true;
}
export function wasmSource(){return new URL('rhwp_bg.wasm',document.baseURI).href;}
export async function prepareWasm(){
 if(!wasmPromise){
   let ctx=null,last='';
   globalThis.measureTextWidth=(font,txt)=>{
     if(!ctx)ctx=document.createElement('canvas').getContext('2d');
     if(!ctx)return 0;
     if(font!==last){ctx.font=font;last=font;}
     return ctx.measureText(txt).width;
   };
   wasmPromise=init({module_or_path:wasmSource()}).catch(e=>{wasmPromise=null;throw e;});
 }
 await wasmPromise;
}
export function checkedSvg(svg){
 const parser=new DOMParser(),doc=parser.parseFromString(svg,'image/svg+xml');
 if(doc.querySelector('parsererror')||doc.documentElement?.localName!=='svg')throw Error('SVG 출력 형식 오류');
 const root=doc.documentElement;
 if(root.querySelector('script,foreignObject,iframe,object,embed'))throw Error('문서에 외부 실행 요소가 포함되어 SVG 변환을 거부했습니다.');
 for(const el of root.querySelectorAll('*')){
  if(['animate','animateMotion','set'].includes(el.localName))el.remove();
  for(const attr of Array.from(el.attributes)){
   const v=attr.value.trim();
   if(/^on/i.test(attr.name))el.removeAttribute(attr.name);
   else if(/(?:href|src)$/i.test(attr.name)&&!v.startsWith('#')&&!/^data:image\//i.test(v))throw Error('문서에 외부 자원 참조가 포함되어 있습니다.');
   else if(/(?:url\s*\(\s*['"]?\s*(?:https?:|\/\/)|@import)/i.test(v))throw Error('문서 SVG에 외부 URL 참조가 포함되어 있습니다.');
  }
 }
 for(const style of root.querySelectorAll('style')){
  if(/@import|url\s*\(\s*['"]?\s*(?:https?:|\/\/)/i.test(style.textContent))throw Error('문서 스타일에 외부 URL이 포함되어 있습니다.');
 }
 const viewBox=root.getAttribute('viewBox');
 let width=794,height=1123;
 if(viewBox){const a=viewBox.trim().split(/[\s,]+/).map(Number);if(a.length===4&&a.every(Number.isFinite)&&a[2]>0&&a[3]>0){width=a[2];height=a[3];}}
 else {
  const w=Number.parseFloat(root.getAttribute('width')),h=Number.parseFloat(root.getAttribute('height'));
  if(Number.isFinite(w)&&w>0)width=w;
  if(Number.isFinite(h)&&h>0)height=h;
 }
 if(width<1||height<1||width>20000||height>20000)throw Error('비정상적인 페이지 크기');
 return {svg:new XMLSerializer().serializeToString(root),width,height};
}
export async function rasterPage(svg,signal,quality='standard',needText=false){
 throwIfCancelled(signal);
 const checked=checkedSvg(svg), profile=qualityProfile(quality);
 const scale=Math.min(profile.dpi/96,Math.sqrt(profile.maxPixels/(checked.width*checked.height)));
 const w=Math.max(1,Math.round(checked.width*scale));
 const h=Math.max(1,Math.round(checked.height*scale));
 if(w*h>profile.maxPixels+10000)throw Error('페이지 이미지 크기 제한 초과');
 const svgUrl=URL.createObjectURL(new Blob([checked.svg],{type:'image/svg+xml;charset=utf-8'}));
 let cvs=null;
 try{
  const img=new Image();
  await new Promise((ok,bad)=>{
   const done=(error)=>{
    img.onload=null;img.onerror=null;
    signal?.removeEventListener('abort',onAbort);
    if(error)bad(error);else ok();
   };
   const onAbort=()=>{
    img.removeAttribute('src');
    done(new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
   };
   img.onload=()=>done();
   img.onerror=()=>done(Error('SVG 이미지를 렌더링할 수 없습니다.'));
   signal?.addEventListener('abort',onAbort,{once:true});
   if(signal?.aborted){onAbort();return;}
   img.src=svgUrl;
  });
  throwIfCancelled(signal);
  cvs=document.createElement('canvas');cvs.width=w;cvs.height=h;
  const ctx=cvs.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Canvas 2D를 사용할 수 없습니다.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  const blob=await new Promise((ok,bad)=>cvs.toBlob(x=>x?ok(x):bad(Error('PNG 생성 실패')),'image/png'));
  throwIfCancelled(signal);
  return {blob,widthPt:Math.max(1,checked.width*72/96),heightPt:Math.max(1,checked.height*72/96),textSvg:needText?checked.svg:null,svgWidth:checked.width,svgHeight:checked.height};
 } finally{
  if(cvs){cvs.width=1;cvs.height=1;}
  URL.revokeObjectURL(svgUrl);
 }
}
export async function convertToPdf(file,onProgress=()=>{},signal,quality='standard',textMode='searchable'){
 throwIfCancelled(signal);
 const profile=qualityProfile(quality);
 if(textMode!=='searchable'&&textMode!=='image')throw Error('지원하지 않는 텍스트 출력 설정입니다.');
 const needText=textMode==='searchable';
 const buf=await file.arrayBuffer();throwIfCancelled(signal);verifyFile(file,buf);
 await prepareWasm();throwIfCancelled(signal);
 let doc=null;
 try{
  doc=new HwpDocument(new Uint8Array(buf));
  const count=doc.pageCount();
  if(!Number.isInteger(count)||count<1||count>Math.min(MAX_PAGES,profile.maxPages))throw Error(`해당 품질 모드의 페이지 수 제한: 1~${profile.maxPages}쪽`);
  const pdf=await PDFDocument.create();let preview=null,searchFont=null,latinFont=null;
  const textSummary={total:0,embedded:0,skipped:0};
  if(needText){
   const response=await fetch(searchableFontURL,{credentials:'same-origin',signal});
   if(!response.ok)throw Error('검색용 한글 폰트 정적 자산을 가져오지 못했습니다.');
   throwIfCancelled(signal);
   pdf.registerFontkit(fontkit);
   searchFont=await pdf.embedFont(await response.arrayBuffer(),{subset:true});
   latinFont=await pdf.embedFont(StandardFonts.Helvetica);
  }
  for(let i=0;i<count;i++){
   throwIfCancelled(signal);
   onProgress({stage:'render',page:i+1,total:count});
   const page=await rasterPage(doc.renderPageSvg(i),signal,quality,needText);
   throwIfCancelled(signal);
   if(i===0)preview=page.blob;
   const png=await pdf.embedPng(await page.blob.arrayBuffer());
   const out=pdf.addPage([page.widthPt,page.heightPt]);
   out.drawImage(png,{x:0,y:0,width:page.widthPt,height:page.heightPt});
   if(searchFont){
    const layer=extractSvgTextRuns(page.textSvg,page.svgWidth,page.svgHeight);
    const stats=writeSearchableText(out,searchFont,layer,latinFont);
    for(const name of ['total','embedded','skipped'])textSummary[name]+=stats[name];
   }
   onProgress({stage:'pdf',page:i+1,total:count});
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  throwIfCancelled(signal);
  const bytes=await pdf.save({useObjectStreams:true});
  throwIfCancelled(signal);
  if(bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70)throw Error('PDF 헤더 확인 실패');
  return {pdf:new Blob([bytes],{type:'application/pdf'}),preview,pages:count,bytes:bytes.byteLength,
    renderMode:needText&&textSummary.embedded>0?'hybrid-searchable':'raster',
    textSummary,quality};
 }finally{if(doc)doc.free();}
}
