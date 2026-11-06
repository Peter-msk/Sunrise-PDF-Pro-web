/**
 * R36 DEV4: fail-closed checks for SVG glyph positioning and transforms.
 * Layout remains the SVG-to-PDFKit renderer's responsibility: we NEVER rewrite
 * glyph x/y, reorder spans, approximate character advances, or silently drop
 * unsupported text positioning. Call before PDF drawing on a page.
 */
const NUMBER='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const LENGTH=new RegExp(`^(${NUMBER})(px)?$`);
const MAX_ABS=1_000_000;
const MAX_LIST=8192;

export function parseSvgNumberList(value,{allowPx=false}={}){
  const source=String(value ?? '').trim();
  if(!source || source.length>MAX_LIST)return null;
  const chunks=source.split(/[\s,]+/);
  if(chunks.some(x=>!x)||chunks.length>4096)return null;
  const numbers=[];
  for(const chunk of chunks){
    const match=LENGTH.exec(chunk);
    if(!match || (!allowPx&&match[2]))return null;
    const num=Number(match[1]);
    if(!Number.isFinite(num)||Math.abs(num)>MAX_ABS)return null;
    numbers.push(num);
  }
  return numbers;
}

// SVG transform grammar is checked, not interpreted: the original transform
// string is passed unchanged to SVG-to-PDFKit. A malformed/unsupported grammar
// is routed to the raster page fallback instead of being silently ignored.
export function validateSvgTransform(value){
  const input=String(value??'').trim();
  if(!input||input.length>1024)return false;
  const grammar=/\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*,?\s*/gy;
  const arity={matrix:[6],translate:[1,2],scale:[1,2],rotate:[1,3],skewX:[1],skewY:[1]};
  let end=0,found=0;
  while(end<input.length){
    grammar.lastIndex=end;
    const match=grammar.exec(input);
    if(!match || match.index!==end)return false;
    const values=parseSvgNumberList(match[2]);
    if(!values||!arity[match[1]].includes(values.length))return false;
    if(++found>32)return false;
    end=grammar.lastIndex;
  }
  return found>0;
}

function validateSvgLengthList(value){
  return parseSvgNumberList(value,{allowPx:true});
}

/**
 * Returns {ok,reason,positionedRuns}. Empty/missing geometry is valid.
 * Per-glyph rotation lists are conservatively NOT claimed as vector-capable:
 * SVG-to-PDFKit's char-level baseline rotation equivalence is unverified.
 */
export function validateTextGeometry(el){
  const tag=el.localName;
  let positionedRuns=0;
  const transform=el.getAttribute('transform');
  if(transform!==null && !validateSvgTransform(transform))
    return {ok:false,reason:'SVG_TRANSFORM_UNSUPPORTED',positionedRuns};
  if(tag!=='text' && tag!=='tspan' && tag!=='textPath')
    return {ok:true,positionedRuns};
  // The pinned renderer implements spacingAndGlyphs. Admit only one directly
  // positioned character here: multi-glyph shaping and nested text require a
  // separate fidelity proof and remain fail-closed.
  if(el.hasAttribute('textLength')||el.hasAttribute('lengthAdjust')||
     el.hasAttribute('textlength')||el.hasAttribute('lengthadjust')){
    const length=el.getAttribute('textLength');
    const values=length===null?null:validateSvgLengthList(length);
    const direct=Array.from(String(el.textContent||''));
    if(tag!=='text'||el.getAttribute('lengthAdjust')!=='spacingAndGlyphs'||
       !values||values.length!==1||values[0]<=0||values[0]>10000||
       direct.length!==1||!/[\x21-\x7e]/u.test(direct[0])||el.children?.length||
       el.hasAttribute('textlength')||el.hasAttribute('lengthadjust'))
      return {ok:false,reason:'TEXT_LENGTH_ADJUST_UNSUPPORTED',positionedRuns};
  }
  if(el.hasAttribute('rotate')){
    const angles=parseSvgNumberList(el.getAttribute('rotate'));
    if(!angles || angles.some(a=>a!==0))
      return {ok:false,reason:'GLYPH_ROTATION_UNSUPPORTED',positionedRuns};
  }
  const rawText=String(el.textContent||'');
  // SVG character positioning can interact with shaping and grapheme clusters.
  // Never claim exact per-glyph geometry for unverified multi-position lists.
  const glyphCount=Array.from(rawText).length;
  for(const name of ['x','y','dx','dy']){
    const value=el.getAttribute(name);
    if(value===null)continue;
    const values=validateSvgLengthList(value);
    if(!values || !glyphCount || values.length>glyphCount)
      return {ok:false,reason:'TEXT_POSITION_LIST_INVALID_'+name,positionedRuns};
    if(values.length>1)
      return {ok:false,reason:'TEXT_MULTI_GLYPH_POSITION_UNVERIFIED',positionedRuns};
    positionedRuns++;
  }
  const anchor=el.getAttribute('text-anchor');
  if(anchor!==null && !['start','middle','end'].includes(anchor.trim()))
    return {ok:false,reason:'TEXT_ANCHOR_UNSUPPORTED',positionedRuns};
  for(const name of ['letter-spacing','word-spacing']){
    const value=el.getAttribute(name);
    if(value!==null && value!=='normal' && !validateSvgLengthList(value)?.length)
      return {ok:false,reason:'TEXT_SPACING_UNSUPPORTED',positionedRuns};
    if(value!==null && value!=='normal' && validateSvgLengthList(value).length!==1)
      return {ok:false,reason:'TEXT_SPACING_UNSUPPORTED',positionedRuns};
    if(value!==null && value!=='normal' && validateSvgLengthList(value)[0]!==0)
      return {ok:false,reason:'TEXT_SPACING_FIDELITY_UNVERIFIED',positionedRuns};
  }
  return {ok:true,positionedRuns};
}
