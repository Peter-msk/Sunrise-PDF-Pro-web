/**
 * R35 DEV3 - browser-local font selection for exact SVG family/style matching.
 * Font bytes come only from user-selected files; no system-font enumeration,
 * remote font URL, or CJK font redistribution is performed.
 */
const GLYPH_WHITESPACE=/\s/u;
const GENERIC_FAMILIES=new Set(['sans-serif','serif','monospace','system-ui']);

export function splitFontFamilies(value=''){
  const names=[];let current='',quote=null;
  for(const c of String(value)){
    if(c==='"'||c==="'"){
      if(!quote)quote=c;
      else if(quote===c)quote=null;
      current+=c;
    }else if(c===','&&!quote){
      if(current.trim())names.push(current.trim());
      current='';
    }else current+=c;
  }
  if(current.trim())names.push(current.trim());
  return names;
}

export function familyKey(value){
  return String(value||'').trim().replace(/^['"]|['"]$/g,'')
    .normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('en-US');
}

export function requestedStyle(weight='normal',style='normal'){
  const w=String(weight||'normal').trim().toLowerCase();
  const s=String(style||'normal').trim().toLowerCase();
  // Relative or variable weights cannot reliably match one static font face.
  if(w==='bolder'||w==='lighter')return null;
  const numeric=/^[1-9]00$/.test(w)?Number(w):null;
  if(w!=='normal'&&w!=='bold'&&numeric===null)return null;
  if(!['normal','italic','oblique'].includes(s))return null;
  return {bold:w==='bold'||(numeric!==null&&numeric>=600),italic:s!=='normal'};
}

/**
 * Resolve an embedded font. Exact user-provided family+style wins; an OFL
 * bundled face is a clearly reported substitute when the document names a
 * font not available in the browser. Never reach out to the OS or a CDN.
 * The optional text is supplied during preflight to verify glyph coverage.
 */
export function resolveFont(registry,family,weight='normal',style='normal',text=''){
  const variant=requestedStyle(weight,style);
  if(!variant)return null;
  const faces=registry?.faces||[];
  const declared=splitFontFamilies(family);
  const firstConcrete=declared.find(name=>!GENERIC_FAMILIES.has(familyKey(name)));
  const covers=face=>!text||missingCodepoint(face,text)===null;
  const exactStyle=face=>face.bold===variant.bold&&face.italic===variant.italic;
  // Keep the first concrete document family authoritative; later CSS
  // alternatives do not override a requested unavailable face silently.
  if(firstConcrete){
    const key=familyKey(firstConcrete);
    const match=faces.find(face=>face.aliases.includes(key)&&exactStyle(face)&&covers(face));
    if(match)return match;
    if(key==='helvetica'&&!variant.bold&&!variant.italic&&
      (!text||[...text].every(c=>c.codePointAt(0)<127)))
      return {name:'Helvetica',characterSet:null,standard:true};
  }
  const candidates=faces.filter(face=>face.isFallback&&covers(face));
  if(candidates.length){
    // A small number of bundled Hangul families supports many source font
    // names. Serif documents retain a serif face; the rest prefer sans.
    const hint=familyKey(firstConcrete||declared[0]||'');
    const serif=/(명조|바탕|batang|myeongjo|myungjo|serif|times|명조체)/i.test(hint);
    const desired=serif?'serif':'sans';
    const category=candidates.filter(face=>face.genericFamily===desired);
    const ranked=category.length?category:candidates;
    return ranked.find(exactStyle)||ranked.find(face=>face.bold===variant.bold&&!face.italic)
      ||ranked.find(face=>!face.bold&&!face.italic)||ranked[0];
  }
  // Without explicit bundled substitutes, preserve strict family matching.
  if(!firstConcrete){
    const generic=declared.map(familyKey).find(n=>n==='serif'||n==='sans-serif');
    const fallback=faces.find(face=>exactStyle(face)&&covers(face)&&
      (!generic||!face.genericFamily||face.genericFamily===(generic==='serif'?'serif':'sans')));
    if(fallback)return fallback;
    if(!variant.bold&&!variant.italic)return {name:'Helvetica',characterSet:null,standard:true};
  }
  return null;
}

/** Keep all original Unicode characters when one font cannot cover a full
 * run but the selected and bundled faces collectively can. A caller may turn
 * the result into adjacent SVG tspans; no replacement glyph is fabricated. */
export function resolveFontRuns(registry,family,weight,style,text){
 const chars=Array.from(String(text||''));
 if(!chars.length||chars.length>2048)return null;
 const runs=[];
 for(const char of chars){
  const face=resolveFont(registry,family,weight,style,char);
  if(!face)return null;
  if(runs.length&&runs.at(-1).face.name===face.name)runs.at(-1).text+=char;
  else runs.push({text:char,face});
  if(runs.length>256)return null;
 }
 return runs;
}

export function missingCodepoint(face,text){
  if(!face)return null;
  // Helvetica's standard encoding does not promise Korean Unicode coverage.
  for(const c of String(text)){
    if(GLYPH_WHITESPACE.test(c))continue;
    const point=c.codePointAt(0);
    if(face.standard){if(point>0x7e||point<0x20)return point;}
    else if(!face.characterSet?.has(point))return point;
  }
  return null;
}

/**
 * @param {File[]|FileList} fontFiles local TTF/OTF faces, potentially multiple weights
 * @param {{create(bytes:Uint8Array):object}} parser e.g. @pdf-lib/fontkit
 * @param {AbortSignal} [signal]
 * @returns {Promise<{faces:Array<object>}>} metadata and bytes for PDFKit
 */
export async function loadPdfFonts(fontFiles,parser,signal){
  const files=Array.from(fontFiles||[]);
  const faces=[];
  for(const file of files){
    if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
    if(!file || !/\.(ttf|otf)$/i.test(file.name))
      throw Error('글꼴 파일은 TTF/OTF만 지원합니다.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
    let parsed;
    try{parsed=parser.create(bytes);}
    catch(e){throw Error('글꼴 파일을 분석할 수 없습니다: '+file.name+' ('+String(e?.message||e)+')');}
    if(!Array.isArray(parsed?.characterSet) || !parsed.familyName)
      throw Error('글꼴의 유니코드 문자표 또는 패밀리 정보를 찾을 수 없습니다: '+file.name);
    const subfamily=String(parsed.subfamilyName||'');
    const bold=/(bold|semibold|demibold|heavy|black)/i.test(subfamily);
    const italic=/(italic|oblique)/i.test(subfamily)||Boolean(parsed.italicAngle);
    const aliases=[...new Set([parsed.familyName,parsed.fullName,parsed.postscriptName]
      .filter(Boolean).map(familyKey))];
    if(faces.some(f=>f.bold===bold&&f.italic===italic&&aliases.some(a=>f.aliases.includes(a))))
      throw Error('같은 글꼴 패밀리와 스타일을 중복 선택했습니다: '+file.name);
    faces.push({name:'SunriseFont'+(faces.length+1),family:parsed.familyName,
      aliases,bold,italic,characterSet:new Set(parsed.characterSet),bytes});
  }
  return {faces};
}

/**
 * Load the same user-provided faces into CSS font measurement while rhwp
 * performs line breaking. This reduces the risk of SVG being laid out with an
 * OS substitute while PDFKit embeds a different font file.
 * The returned cleanup function MUST be called in the conversion finally.
 * No system or remote font is fetched.
 */
export async function installMeasureFonts(registry,signal,
  fontSet=globalThis.document?.fonts,FontFaceImpl=globalThis.FontFace){
  const faces=registry?.faces||[];
  if(!faces.length)return ()=>{};
  if(!fontSet?.add||!fontSet?.delete||typeof FontFaceImpl!=='function')
    throw Error('이 브라우저는 사용자 글꼴의 임시 로딩을 지원하지 않습니다.');
  const installed=[];
  const cleanup=()=>{for(const font of installed)fontSet.delete(font);};
  try{
    const explicitlyProvided=new Set(faces.filter(face=>!face.isFallback).flatMap(face=>
      [face.family,...(face.cssAliases||[])].map(name=>familyKey(name)+'|'+face.bold+'|'+face.italic)));
    for(const face of faces){
      const names=[...new Set([face.family,...(face.cssAliases||[])])];
      for(const family of names){
        const id=familyKey(family)+'|'+face.bold+'|'+face.italic;
        if(face.isFallback&&explicitlyProvided.has(id))continue;
        if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
        const cssFace=new FontFaceImpl(family,face.bytes,{
          style:face.italic?'italic':'normal',weight:face.bold?'700':'400'
        });
        const loaded=await cssFace.load();
        if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
        fontSet.add(loaded);installed.push(loaded);
      }
    }
    return cleanup;
  }catch(error){
    cleanup();
    throw error;
  }
}
