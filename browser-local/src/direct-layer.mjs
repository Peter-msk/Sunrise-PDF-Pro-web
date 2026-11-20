/** DEV56 RHWP 0.9.0 replay_order.rs and model/text_clip.rs contract.
 * Layer metadata overrides image wrap; masterPage caps non-background paint.
 * Preserve source tree order within planes, never sort by raw zOrder.
 */
const fail=c=>{throw Error('DIRECT_PDF_LAYER_'+c);};
import {isCoordinate as finite,PX_TO_PT} from './direct-contract.mjs';
const wraps=[null,'square','tight','through','topAndBottom','behindText','inFrontOfText'];
export function directLayer(layer){
 if(layer==null)return null;
 if(typeof layer!=='object'||Array.isArray(layer)||Object.keys(layer).some(k=>!['textWrap','zOrder','stableIndex','masterPage'].includes(k))||
  !wraps.includes(layer.textWrap??null)||!Number.isSafeInteger(layer.zOrder)||!Number.isSafeInteger(layer.stableIndex)||
  layer.stableIndex<0||(layer.masterPage!==undefined&&typeof layer.masterPage!=='boolean'))fail('METADATA');
 return layer;
}
export function directPlane(op,layer){
 if(op.type==='pageBackground')return 0;
 if(layer?.masterPage)return 1;
 const wrap=layer?.textWrap??(op.type==='image'?op.wrap:null)??null;
 if(!wraps.includes(wrap))fail('WRAP');
 return wrap==='behindText'?1:wrap==='inFrontOfText'?3:2;
}
export function directClip(node){
 if(node.kind==='clipRect'){
  const b=node.clip;
  if(!['body','tableCell','textBox','generic'].includes(node.clipKind)||
   !['x','y','width','height'].every(k=>finite(b?.[k]))||b.width<0||b.height<0)fail('CLIP_RECT');
  return {kind:'rect',x:b.x,y:b.y,width:b.width,height:b.height,cost:1};
 }
 // Multiple paths may have backend-specific combining semantics; block until
 // verified. One closed compound path can express either winding rule.
 if(!Array.isArray(node.paths)||node.paths.length!==1)fail('CLIP_PATH_COUNT');
 const p=node.paths[0];
 if(typeof p?.even_odd!=='boolean'||!Array.isArray(p.commands)||p.commands.length<3||p.commands.length>4096)fail('CLIP_PATH');
 let open=false,segments=0;const commands=[];
 for(const c of p.commands){
  if(c==='Close'){
   if(!open||segments<1)fail('CLIP_SEQUENCE');open=false;commands.push(['Close']);continue;
  }
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).length!==1)fail('CLIP_COMMAND');
  const [k]=Object.keys(c),v=c[k],len=k==='Cubic'?6:k==='Move'||k==='Line'?2:0;
  if(!len||!Array.isArray(v)||v.length!==len||!v.every(finite))fail('CLIP_COMMAND');
  if(k==='Move'){if(open)fail('CLIP_SEQUENCE');open=true;segments=0;}
  else{if(!open)fail('CLIP_SEQUENCE');segments++;}
  commands.push([k,...v]);
 }
 if(open)fail('CLIP_SEQUENCE');
 return {kind:'path',commands,evenOdd:p.even_odd,cost:commands.length};
}
export function openDirectClip(page,c,height,lib,pt=PX_TO_PT){
 const x=n=>n*pt,y=n=>(height-n)*pt,ops=[lib.pushGraphicsState()];
 if(c.kind==='rect')ops.push(lib.rectangle(x(c.x),y(c.y+c.height),x(c.width),x(c.height)));
 else for(const [k,...v] of c.commands){
  if(k==='Move')ops.push(lib.moveTo(x(v[0]),y(v[1])));
  else if(k==='Line')ops.push(lib.lineTo(x(v[0]),y(v[1])));
  else if(k==='Cubic')ops.push(lib.appendBezierCurve(x(v[0]),y(v[1]),x(v[2]),y(v[3]),x(v[4]),y(v[5])));
  else ops.push(lib.closePath());
 }
 ops.push(c.evenOdd?lib.clipEvenOdd():lib.clip(),lib.endPath());
 page.pushOperators(...ops);
}
export function directGroup(node){
 const g=node.groupKind;
 if(g==null)return null;
 if(!g||typeof g!=='object'||Array.isArray(g)||!['generic','masterPage','header','footer','body','column','footnoteArea','textLine','table','tableCell','textBox','group'].includes(g.kind))fail('GROUP');
 if(g.paintTransform!==undefined&&(!Array.isArray(g.paintTransform)||g.paintTransform.length!==6||!g.paintTransform.every((n,i)=>n===[1,0,0,1,0,0][i])))fail('GROUP_TRANSFORM');
 // Counts are diagnostics; table layout is already present in leaf ops.
 if(g.kind==='table'&&(!Number.isSafeInteger(g.rowCount)||!Number.isSafeInteger(g.colCount)||g.rowCount<1||g.colCount<1))fail('TABLE_METADATA');
 if(g.kind==='tableCell'&&(!['row','col','rowSpan','colSpan'].every(k=>Number.isSafeInteger(g[k])&&g[k]>=(k.endsWith('Span')?1:0))))fail('CELL_METADATA');
 return g.kind;
}
