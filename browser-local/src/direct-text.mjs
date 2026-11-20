/** DEV53: experimental, narrow legacy-position text replay.
 * RHWP v0.9.0 json.rs: textRun placement, scalar positions and clusters.
 * No claim of general shaping, fallback or production readiness.
 */
import {directFamilyKey as key,validateDirectFace} from './direct-font.mjs';
const fail=code=>{throw Error('DIRECT_PDF_TEXT_'+code);};
import {isCoordinate as finite,isRecord as plain,isRgbHex} from './direct-contract.mjs';
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=.002;
const range=(r,start,end)=>r?.start===start&&r?.end===end;
const unsafe=/[^\uAC00-\uD7A3A-Za-z0-9 .,!?():;+\-\/]/u;
const MAX_RUN=4096;
export function planDirectText(op){
 const t=op.text,s=op.style,p=op.placement,m=p?.runToPage;
 if(typeof t!=='string'||!t.length||t.length>MAX_RUN||unsafe.test(t))fail('UNICODE_SCOPE');
 if(op.rotation!==0||op.isVertical!==false||op.orientation!=='horizontal'||
   op.projectionKind!=='verbatim'||op.clusterBasis!=='legacyPosition'||
   op.displayText!=null||op.displayPositions!=null||op.paintTransform!=null||
   op.variant!=null||op.legacyVisuals!=null||op.controlMarks!=null||
   op.puaGlyphCandidates!=null||op.puaGlyphCandidatesComplete===false||
   op.tabLeaders!=null||op.charOverlap!==null||op.fieldMarker?.kind!=='none')fail('PROJECTION');
 if(!plain(s)||!plain(op.paintStyle)||Object.keys(s).length!==Object.keys(op.paintStyle).length||
   Object.keys(s).some(k=>!Object.hasOwn(op.paintStyle,k)||JSON.stringify(s[k])!==JSON.stringify(op.paintStyle[k])))fail('STYLE_MISMATCH');
 const styleKeys=new Set(['fontFamily','fontSize','color','bold','italic','ratio','underline','underlineShape',
   'strikethrough','strikeShape','outlineType','shadowType','shadowColor','shadowOffsetX','shadowOffsetY',
   'emboss','engrave','superscript','subscript','underlineColor','strikeColor','shadeColor','emphasisDot','kerning']);
 if(Object.keys(s).some(k=>!styleKeys.has(k)))fail('STYLE_EXTENSION');
 if(typeof s.fontFamily!=='string'||!key(s.fontFamily)||s.fontFamily.length>256||
   !finite(s.fontSize)||s.fontSize<=0||s.fontSize>1024||!isRgbHex(s.color)||
   typeof s.bold!=='boolean'||s.italic!==false||s.ratio!==1||s.underline!=='none'||
   s.strikethrough!==false||s.outlineType!==0||s.shadowType!==0||s.emboss!==false||
   s.engrave!==false||s.superscript!==false||s.subscript!==false||
   s.emphasisDot!==0||typeof s.shadeColor!=='string'||s.shadeColor.toLowerCase()!=='#ffffff'||
   (s.kerning!==undefined&&s.kerning!==false))fail('STYLE');
 if(!m||m.a!==1||m.b!==0||m.c!==0||m.d!==1||
   !finite(op.baseline)||!near(p.baselineY,0)||!near(m.e,op.bbox?.x)||
   !near(m.f,op.bbox?.y+op.baseline))fail('PLACEMENT');
 if(!Array.isArray(op.positions)||![t.length,t.length+1].includes(op.positions.length)||
   !op.positions.every(finite)||!Array.isArray(op.clusters)||op.clusters.length!==t.length)fail('POSITIONS');
 if(!Number.isSafeInteger(op.source?.id)||op.source.id<0)fail('SOURCE');
 const validSpan=(r,length)=>Number.isSafeInteger(r?.start)&&r.start>=0&&Number.isSafeInteger(r?.end)&&r.end-r.start===length;
 const encoder=new TextEncoder();
 if(!validSpan(op.source.utf16Range,t.length)||!validSpan(op.source.utf8Range,encoder.encode(t).length))fail('SOURCE');
 let utf8=0;
 const glyphs=[];
 for(let i=0;i<t.length;i++){
   const ch=t[i],end=utf8+encoder.encode(ch).length,c=op.clusters[i],x=op.positions[i];
   if(!range(c?.textRangeUtf16,i,i+1)||!range(c?.textRangeUtf8,utf8,end)||
     !range(c?.sourceRangeUtf8,utf8,end)||c.projection!=='verbatim'||c.flags!=null||
     !near(c.origin?.x,x)||!near(c.origin?.y,0)||x<0||
     (i>0&&x<=op.positions[i-1]))fail('CLUSTER');
   if(c.advance!=null&&(!near(c.advance.dy,0)||!near(c.advance.dx,op.positions[i+1]-x)))fail('ADVANCE');
   if(i<t.length-1&&c.advance==null)fail('ADVANCE');
   glyphs.push({ch,x:m.e+c.origin.x,y:m.f});utf8=end;
 }
 if(op.positions.length>t.length&&op.positions[t.length]<=op.positions[t.length-1])fail('ADVANCE');
 return {plane:1,kind:'text',text:t,family:s.fontFamily,size:s.fontSize,color:s.color,bold:s.bold,glyphs};
}
// Legacy scalar replay is only valid where the font's actual whole-run
// layout equals isolated glyph layout, including positioning.
export function validateIndependentGlyphs(font,plan){
 const run=font.layout(plan.text);
 if(run.glyphs.length!==plan.glyphs.length||run.positions.length!==plan.glyphs.length)fail('SHAPING');
 for(let i=0;i<plan.glyphs.length;i++){
   const ch=plan.glyphs[i].ch,cp=ch.codePointAt(0),one=font.layout(ch);
   if(!font.hasGlyphForCodePoint(cp)||one.glyphs.length!==1||one.positions.length!==1)fail('GLYPH');
   const a=run.glyphs[i],b=one.glyphs[0],p=run.positions[i],q=one.positions[0];
   if(!a.id||a.id!==b.id||a.codePoints?.length!==1||a.codePoints[0]!==cp||
     b.codePoints?.length!==1||b.codePoints[0]!==cp||
     !['xAdvance','yAdvance','xOffset','yOffset'].every(k=>near(p[k],q[k]))||
     !near(p.xOffset,0)||!near(p.yOffset,0)||!near(p.yAdvance,0))fail('SHAPING');
 }
}
export async function prepareDirectText(pdf,plan,resolveFont,fontkit,cache){
 const name=key(plan.family)+'|'+(plan.bold?'bold':'regular');let entry=cache.get(name);
 if(!entry){
   if(cache.size>=16)fail('FONT_BUDGET');
   const face=await resolveFont({family:plan.family,bold:plan.bold===true,italic:false});
   if(!(face?.bytes instanceof Uint8Array)||face.bytes.length>32*1024*1024)fail('FONT_INPUT');
   const {font,bytes}=validateDirectFace(fontkit,{...face,bytes:face.bytes.slice()},plan.family,plan.bold===true);
   const total=[...cache.values()].reduce((n,x)=>n+x.bytes,0)+bytes.length;
   if(total>64*1024*1024)fail('FONT_BUDGET');
   validateIndependentGlyphs(font,plan);
   const embedded=await pdf.embedFont(bytes,{subset:false});
   entry={font,embedded,bytes:bytes.length};cache.set(name,entry);
 }else validateIndependentGlyphs(entry.font,plan);
 return entry.embedded;
}
