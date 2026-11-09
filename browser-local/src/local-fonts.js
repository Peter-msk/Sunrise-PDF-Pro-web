import {familyKey,splitFontFamilies,loadPdfFonts} from './pdf-fonts.js';
import {flattenLocalSvgStyles} from './svg-style.js';

// Capture permission during the actual button click; keep font bytes in memory only.
export function requestLocalFontAccess(host=globalThis){
 if(typeof host.queryLocalFonts!=='function')
  throw Error('이 브라우저는 PC 글꼴 접근을 지원하지 않습니다. Chrome 또는 Edge PC 버전을 사용하거나 옵션을 해제하세요.');
 return host.queryLocalFonts();
}

export function requireLocalFonts(fonts){
 if(!Array.isArray(fonts)||!fonts.length)throw Error('PC 글꼴 목록을 읽지 못했습니다. 브라우저 설정과 글꼴 설치 상태를 확인하세요.');
 return fonts;
}

export function svgFontFamilies(svg,Parser=globalThis.DOMParser){
 const doc=new Parser().parseFromString(svg,'image/svg+xml');
 if(doc.querySelector('parsererror')||doc.documentElement?.localName!=='svg')throw Error('문서의 글꼴 정보를 확인할 수 없습니다.');
 if(doc.querySelector('style')){
  const result=flattenLocalSvgStyles(doc.documentElement);
  if(!result.ok)throw Error('문서 글꼴 스타일을 확인할 수 없습니다: '+result.reason);
 }
 const names=new Map();
 for(const el of doc.querySelectorAll('[font-family],[style]')){
  const style=el.getAttribute('style')||'';
  const match=/(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(style);
  for(const name of splitFontFamilies(match?.[1]||el.getAttribute('font-family')||'')){
   const clean=name.trim().replace(/^['"]|['"]$/g,'');
   const key=familyKey(clean);
   if(key&&!['serif','sans-serif','monospace','system-ui'].includes(key))names.set(key,clean);
  }
 }
 return names;
}

export async function loadDocumentLocalFonts(doc,count,available,parser,signal,onProgress=()=>{}){
 const needed=new Map();
 for(let i=0;i<count;i++){
  if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');
  const page=svgFontFamilies(doc.renderPageSvgWithProfile(i,'print'));
  for(const [key,name] of page)needed.set(key,name);
  onProgress({stage:'fonts',page:i+1,total:count});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 const faces=[],seen=new Set();
 let unreadable=0,matched=0;
 for(const item of available){
  const keys=[item.family,item.fullName,item.postscriptName].filter(Boolean).map(familyKey);
  const requested=[...new Set(keys.filter(key=>needed.has(key)))];
  if(!requested.length)continue;
  matched++;
  if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');
  let loaded;
  try{
   const blob=await item.blob();
   const file=new File([blob],'local-font.ttf',{type:'font/ttf'});
   loaded=await loadPdfFonts([file],parser,signal);
  }catch(error){
   if(error?.name==='AbortError'||signal?.aborted)throw error;
   unreadable++;continue;
  }
  const face=loaded.faces[0];
  const identity=familyKey(item.postscriptName||item.fullName||item.family)+'|'+face.bold+'|'+face.italic;
  if(seen.has(identity))continue;
  seen.add(identity);
  face.name='LocalFont'+(faces.length+1);
  face.cssAliases=requested.map(key=>needed.get(key));
  face.aliases=[...new Set([...face.aliases,...keys,...requested])];
  faces.push(face);
 }
 return {faces,requestedFamilies:needed.size,matchedFontData:matched,unreadableFonts:unreadable};
}
