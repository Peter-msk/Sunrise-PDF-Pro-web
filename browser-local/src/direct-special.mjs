/** DEV57: static form appearances from RHWP's authoritative drawing only.
 * Never synthesize equation glyphs or silently discard labels.
 */
const fail=c=>{throw Error('DIRECT_PDF_SPECIAL_'+c);};
import {isCoordinate as finite,isRgbHex as color,hasOnlyKeys as only} from './direct-contract.mjs';
const box=b=>['x','y','width','height'].every(k=>finite(b?.[k]))&&b.width>0&&b.height>0;
export function planDirectSpecial(op){
 if(op.type==='equation')fail('EQUATION_LAYOUT_UNSUPPORTED');
 if(op.type==='placeholder')fail('MISSING_OR_OLE_OBJECT');
 if(op.type==='footnoteMarker')fail('FOOTNOTE_FONT_LAYOUT');
 if(op.type==='textControlMark'||op.type==='controlLabel')fail('CONTROL_MARK');
 if(op.type==='textDecoration'||op.type==='tabLeader'||op.type==='charOverlap')fail('TEXT_EFFECT');
 if(op.type!=='formObject')fail('OPERATION');
 const d=op.drawing;
 if(!only(op,['type','bbox','formType','caption','text','foreColor','backColor','value','enabled','drawing'])||
  !['pushButton','checkBox','radioButton','comboBox','edit'].includes(op.formType)||
  !box(op.bbox)||!only(d,['primitives','label'])||!Array.isArray(d.primitives)||
  !Object.hasOwn(d,'label'))fail('FORM_DRAWING');
 const items=[];
 for(const p of d.primitives){
  if(!color(p?.color))fail('FORM_COLOR');
  if(p.kind==='rect'){
   if(!only(p,['kind','bbox','color'])||!box(p.bbox))fail('FORM_RECT');
   const {x,y,width,height}=p.bbox;items.push({kind:'rectangle',x,y,width,height,fill:p.color,stroke:null,strokeWidth:0});
  }else if(p.kind==='circle'){
   if(!only(p,['kind','x','y','radius','color'])||![p.x,p.y,p.radius].every(finite)||p.radius<=0)fail('FORM_CIRCLE');
   items.push({kind:'ellipse',x:p.x-p.radius,y:p.y-p.radius,width:2*p.radius,height:2*p.radius,fill:p.color,stroke:null,strokeWidth:0});
  }else if(p.kind==='polyline'){
   if(!only(p,['kind','points','color','width','closed'])||!Array.isArray(p.points)||p.points.length<2||
    !p.points.every(a=>Array.isArray(a)&&a.length===2&&a.every(finite))||!finite(p.width)||p.width<0||
    typeof p.closed!=='boolean'||(p.width===0&&(!p.closed||p.points.length<3)))fail('FORM_POLYLINE');
   // RHWP uses width=0 closed polygon for filled dropdown arrow.
   const commands=p.points.map(([x,y],i)=>({type:i?'lineTo':'moveTo',x,y}));if(p.closed)commands.push({type:'closePath'});
   items.push({kind:'path',commands,fill:p.width===0?p.color:null,stroke:p.width>0?p.color:null,strokeWidth:p.width});
  }else fail('FORM_PRIMITIVE');
 }
 if(d.label!==null){
  const l=d.label;
  // Only a single unshaped ASCII/Hangul scalar with a supplied baseline is
  // supported; no invented multi-character advances or font fallback.
  if(!only(l,['text','x','baseline','fontFamily','fontSize','bold','italic','color'])||
   typeof l.text!=='string'||l.text.length!==1||!/^[\uAC00-\uD7A3A-Za-z0-9]$/u.test(l.text)||
   !finite(l.x)||!finite(l.baseline)||!finite(l.fontSize)||l.fontSize<=0||l.fontSize>1024||
   typeof l.fontFamily!=='string'||!l.fontFamily.trim()||l.fontFamily.length>256||
   typeof l.bold!=='boolean'||l.italic!==false||!color(l.color))fail('FORM_LABEL_LAYOUT');
  items.push({kind:'text',text:l.text,family:l.fontFamily,bold:l.bold,size:l.fontSize,color:l.color,glyphs:[{ch:l.text,x:l.x,y:l.baseline}]});
 }
 if(!items.length)fail('FORM_EMPTY');
 return items;
}
