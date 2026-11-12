import {cooperativeYield} from './cooperative-yield.mjs';
import {familyKey,splitFontFamilies,loadPdfFonts} from './pdf-fonts.js';
import {flattenLocalSvgStyles} from './svg-style.js';
import {boundedFontStep} from './font-timeout.mjs';

// Only verified bilingual family names, never a fuzzy/fingerprint-based match.
// Windows exposes a different localized family name to Local Font Access than
// the Korean HWP file sometimes names. Treat these spellings as the SAME family
// while retaining the HWP's original name for CSS measurement and PDF output.
const BILINGUAL_FAMILIES=[
 ['맑은 고딕','Malgun Gothic'],['굴림','Gulim'],['굴림체','GulimChe'],
 ['돋움','Dotum'],['돋움체','DotumChe'],['바탕','Batang'],
 ['바탕체','BatangChe'],['궁서','Gungsuh'],['궁서체','GungsuhChe'],
 ['함초롬바탕','HCR Batang'],['함초롬돋움','HCR Dotum'],
 ['나눔고딕','Nanum Gothic'],['나눔명조','Nanum Myeongjo']
];
const bilingual=new Map();
for(const [korean,english] of BILINGUAL_FAMILIES){
 const a=familyKey(korean),b=familyKey(english);
 bilingual.set(a,new Set([a,b]));bilingual.set(b,new Set([a,b]));
}
export function localFamilyKeys(name){
 const key=familyKey(name);
 return new Set(key?(bilingual.get(key)||[key]):[]);
}

// Capture permission during the actual button click; keep font bytes in memory only.
export function requestLocalFontAccess(host=globalThis){
 if(typeof host.queryLocalFonts!=='function')
  throw Error('이 브라우저는 PC 글꼴 접근을 지원하지 않습니다. Chrome 또는 Edge PC 버전을 사용하거나 TTF/OTF 원본 글꼴을 직접 추가하세요.');
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
 // querySelectorAll() excludes documentElement itself. HWP pages frequently
 // place the inherited font-family on <svg>; omitting it silently substitutes.
 const elements=[doc.documentElement,...doc.querySelectorAll('[font-family],[style]')];
 for(const el of elements){
  const style=el.getAttribute?.('style')||'';
  const match=/(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(style);
  for(const name of splitFontFamilies(match?.[1]||el.getAttribute?.('font-family')||'')){
   const clean=name.trim().replace(/^['"]|['"]$/g,'');
   const key=familyKey(clean);
   if(key&&!['serif','sans-serif','monospace','system-ui'].includes(key))names.set(key,clean);
  }
 }
 return names;
}

export async function loadDocumentLocalFonts(doc,count,available,parser,signal,onProgress=()=>{}){
 const needed=new Map(),neededPages=new Map();
 // Report before the expensive synchronous WASM/SVG scan.
 if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');
 onProgress({stage:'fonts',page:0,total:count,detail:'scan'});
 for(let i=0;i<count;i++){
  if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');
  const page=svgFontFamilies(doc.renderPageSvgWithProfile(i,'print'));
  for(const [key,name] of page){
   needed.set(key,name);
   neededPages.set(key,(neededPages.get(key)||0)+1);
  }
  onProgress({stage:'fonts',page:i+1,total:count,detail:'scan'});
  await cooperativeYield({signal});
 }
 // The OS normally enumerates its fonts in an arbitrary order. For a large
 // document, the previous 22-second budget could expire BEFORE the most-used
 // family was read. Rank only document-matching candidates by page frequency,
 // with exact names ahead of verified Korean/English aliases, then process.
 const candidates=[];
 for(let index=0;index<available.length;index++){
  const item=available[index];
  if(!item||typeof item.blob!=='function')continue;
  const observed=[item.family,item.fullName,item.postscriptName].filter(Boolean);
  const literalKeys=new Set(observed.map(familyKey).filter(Boolean));
  const expanded=new Set(observed.flatMap(name=>[...localFamilyKeys(name)]));
  const requested=[...expanded].filter(key=>needed.has(key));
  if(!requested.length)continue;
  const originalNames=[...new Set(requested.map(key=>needed.get(key)))];
  const exact=originalNames.some(name=>literalKeys.has(familyKey(name)));
  const frequency=requested.reduce((total,key)=>total+(neededPages.get(key)||0),0);
  candidates.push({item,index,expanded,originalNames,score:frequency*10+(exact?5:0)});
 }
 candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
 const faces=[],seen=new Set(),attempted=new Set(),loadedNames=new Set();
 const started=Date.now(),maxReadMs=22000;
 let unreadable=0,matched=0,timedOutFonts=0,skippedByBudget=0;
 for(const candidate of candidates){
  const {item,expanded,originalNames}=candidate;
  const sourceKey=familyKey(item.postscriptName||item.fullName||item.family)+'|'+
   familyKey(item.style||'');
  if(attempted.has(sourceKey))continue;
  attempted.add(sourceKey);matched++;
  if(signal?.aborted)throw new DOMException('변환이 취소되었습니다.','AbortError');
  const remaining=maxReadMs-(Date.now()-started);
  if(remaining<=0){skippedByBudget++;continue;}
  onProgress({stage:'fonts',page:count,total:count,detail:'read',processed:matched});
  let loaded;
  try{
   const blob=await boundedFontStep(()=>item.blob(),{signal,
    timeoutMs:Math.min(4000,remaining),code:'PC_FONT_BLOB_TIMEOUT'});
   // The blob is an SFNT container, not necessarily a .ttf outline. Fontkit
   // inspects the bytes, not the extension, and rejects unsupported formats.
   const file=new File([blob],'local-font.ttf',{type:'font/ttf'});
   loaded=await boundedFontStep(()=>loadPdfFonts([file],parser,signal,
    {postscriptName:item.postscriptName||null}),{signal,
    timeoutMs:Math.min(4000,Math.max(1,maxReadMs-(Date.now()-started))),
    code:'PC_FONT_PARSE_TIMEOUT'});
  }catch(error){
   if(error?.name==='AbortError'||signal?.aborted)throw error;
   if(error?.name==='TimeoutError')timedOutFonts++;
   unreadable++;continue;
  }
  const face=loaded?.faces?.[0];
  if(!face){unreadable++;continue;}
  const identity=familyKey(item.postscriptName||item.fullName||item.family)+'|'+face.bold+'|'+face.italic;
  if(seen.has(identity))continue;
  seen.add(identity);
  face.name='LocalFont'+(faces.length+1);
  face.isLocal=true;
  face.cssAliases=originalNames;
  face.aliases=[...new Set([...face.aliases,...expanded])];
  faces.push(face);
  for(const name of originalNames)loadedNames.add(familyKey(name));
 }

 onProgress({stage:'fonts',page:count,total:count,detail:'loaded'});
 return {faces,requestedFamilies:needed.size,requestedNames:[...needed.values()],
  matchedFontData:matched,unreadableFonts:unreadable,timedOutFonts,skippedByBudget,
  unmatchedNames:[...needed.values()].filter(name=>!loadedNames.has(familyKey(name)))
 }; // Names are displayed only in the current browser, never sent in telemetry.
}
