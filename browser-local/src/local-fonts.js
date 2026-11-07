import {familyKey,splitFontFamilies,loadPdfFonts} from './pdf-fonts.js';

// Capture permission during the actual button click; keep font bytes in memory only.
export function requestLocalFontAccess(host=globalThis){
 if(typeof host.queryLocalFonts!=='function')
  throw Error('이 브라우저는 PC 글꼴 접근을 지원하지 않습니다. Chrome 또는 Edge PC 버전을 사용하거나 옵션을 해제하세요.');
 return host.queryLocalFonts();
}

export function svgFontFamilies(svg,Parser=globalThis.DOMParser){
 const doc=new Parser().parseFromString(svg,'image/svg+xml');
 if(doc.querySelector('parsererror'))throw Error('문서의 글꼴 정보를 확인할 수 없습니다.');
 const names=new Map();
 for(const el of doc.querySelectorAll('[font-family],[style]')){
  const style=el.getAttribute('style')||'';
  const match=/(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(style);
  for(const name of splitFontFamilies(el.getAttribute('font-family')||match?.[1]||'')){
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
 for(const item of available){
  const keys=[item.family,item.fullName,item.postscriptName].filter(Boolean).map(familyKey);
  const requested=[...new Set(keys.filter(key=>needed.has(key)))];
  if(!requested.length)continue;
  if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');
  const blob=await item.blob();
  const file=new File([blob],'local-font.ttf',{type:'font/ttf'});
  let loaded;
  try{loaded=await loadPdfFonts([file],parser,signal);}
  catch(error){if(error?.name==='AbortError')throw error;continue;}
  const face=loaded.faces[0];
  const identity=familyKey(item.postscriptName||item.fullName||item.family)+'|'+face.bold+'|'+face.italic;
  if(seen.has(identity))continue;
  seen.add(identity);
  face.name='LocalFont'+(faces.length+1);
  face.cssAliases=requested.map(key=>needed.get(key));
  face.aliases=[...new Set([...face.aliases,...keys,...requested])];
  faces.push(face);
 }
 return {faces};
}
