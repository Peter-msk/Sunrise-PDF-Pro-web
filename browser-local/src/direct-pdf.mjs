/** DEV52 experimental direct PageLayerTree adapter. No SVG and no network.
 * Verified against rhwp v0.9.0 source c9095c5f67632e6721e800ccc7fb43ea49d26682.
 * DEV53 adds opt-in narrow text replay. NOT a production
 * renderer. Unknown operations never become blank or partial successful PDFs.
 */
import {MAX_CONVERSION_PAGES} from './page-limit.mjs';
import {planDirectText,prepareDirectText} from './direct-text.mjs';
import {createDirectFontResolver} from './direct-font.mjs';
import {planDirectImage,planDirectShape,verifyDirectPng} from './direct-media.mjs';
import {directLayer,directPlane,directClip,directGroup,openDirectClip} from './direct-layer.mjs';
import {planDirectSpecial} from './direct-special.mjs';
const SCHEMA_MINOR=35,RESOURCE_MINOR=6,PT=.75;
const DOCUMENT_OP_LIMIT=200000,DOCUMENT_WORK_LIMIT=1000000,YIELD_UNITS=256;
const MAX_JSON=32*1024*1024,MAX_NODES=60000,MAX_OPS=100000,MAX_DEPTH=128;
const error=code=>{throw Error('DIRECT_PDF_'+code);};
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7;
function bbox(b){
 if(!plain(b)||!['x','y','width','height'].every(k=>finite(b[k]))||b.width<0||b.height<0)error('BOUNDS');
 return b;
}
function cancel(signal){if(signal?.aborted)throw new DOMException('취소됨','AbortError');}
function yieldToHost(){return typeof setTimeout==='function'?new Promise(resolve=>setTimeout(resolve,0)):Promise.resolve();}
function pageCount(doc){const n=doc.pageCount();if(!Number.isSafeInteger(n)||n<1||n>MAX_CONVERSION_PAGES)error('PAGE_COUNT');return n;}
export function readDirectPage(doc,index){
 if(typeof doc?.getPageLayerTreeWithProfile!=='function')error('API_UNAVAILABLE');
 if(!Number.isSafeInteger(index)||index<0||index>=pageCount(doc))error('PAGE_INDEX');
 const raw=doc.getPageLayerTreeWithProfile(index,'print',false,false);
 if(typeof raw!=='string'||raw.length>MAX_JSON)error('TREE_BUDGET');
 let tree;try{tree=JSON.parse(raw);}catch{error('TREE_JSON');}
 if(!plain(tree)||tree.schemaVersion!==1||tree.schemaMinorVersion!==SCHEMA_MINOR||
  tree.resourceTableVersion!==1||tree.resourceTableMinorVersion!==RESOURCE_MINOR||
  tree.unit!=='px'||tree.coordinateSystem!=='page-top-left-y-down'||tree.profile!=='print')error('SCHEMA');
 if(!finite(tree.pageWidth)||!finite(tree.pageHeight)||tree.pageWidth<=0||tree.pageHeight<=0||
  tree.pageWidth>19200||tree.pageHeight>19200)error('PAGE_SIZE');
 if(!plain(tree.root)||!plain(tree.resources))error('TREE_ROOT');
 return tree;
}
// Streaming traversal: preserve upstream child/operation order. Collect
// paint planes separately; no arbitrary z-order interpretation. Clip geometry
// is opt-in, preserving the original geometry-only behavior.
export function inspectDirectPage(tree,{allowText=false,allowMedia=false,allowLayers=false,allowSpecial=false}={}){
 let nodes=0,operations=0,textRuns=0,clips=0,svgReferences=0;
 const types=new Map(), fonts=new Set(), blockers=new Set(),rectangles=[],paint=[];
 let specialCount=0,specialItems=0;
 let tableCount=0,cellCount=0,mergedCells=0,clipCost=0,clipReplayCost=0;
 let glyphCount=0,mediaCount=0,mediaBytes=0,mediaPixels=0,pathCommands=0;
 const stack=[{node:tree.root,depth:0,layer:null,chain:[]}];
 while(stack.length){
  const {node,depth,layer,chain}=stack.pop();
  if(++nodes>MAX_NODES||depth>MAX_DEPTH)error('NODE_BUDGET');
  if(!plain(node))error('NODE');bbox(node.bounds);
  const active=node.layer??layer;
  if(allowLayers)directLayer(active);
  if(!allowLayers&&active&&(!plain(active)||active.masterPage||active.textWrap==='behindText'||active.textWrap==='inFrontOfText'))blockers.add('paint-plane');
  switch(node.kind){
   case 'group':
    if(allowLayers){const g=directGroup(node);if(g==='table')tableCount++;if(g==='tableCell'){cellCount++;if(node.groupKind.rowSpan>1||node.groupKind.colSpan>1)mergedCells++;}}
    if(!Array.isArray(node.children)||node.children.length>MAX_NODES-nodes||stack.length+node.children.length>MAX_NODES)error('NODE_BUDGET');
    for(let i=node.children.length-1;i>=0;i--)stack.push({node:node.children[i],depth:depth+1,layer:active,chain});
    break;
   case 'clipRect':case 'clipPath':
    clips++;
    if(allowLayers){const clip=directClip(node);clipCost+=clip.cost;if(clipCost>20000||chain.length>=16)error('CLIP_BUDGET');stack.push({node:node.child,depth:depth+1,layer:active,chain:[...chain,clip]});}
    else{blockers.add('clip');stack.push({node:node.child,depth:depth+1,layer:active,chain});}break;
   case 'leaf':
    if(!Array.isArray(node.ops)||node.ops.length>MAX_OPS-operations)error('OP_BUDGET');
    for(const op of node.ops){
     if(!plain(op)||typeof op.type!=='string'||op.type.length>64)error('OP');
     operations++;bbox(op.bbox);
     const add=item=>{if(allowLayers){item.plane=directPlane(op,active);item.clips=chain;clipReplayCost+=chain.reduce((n,c)=>n+c.cost,0);if(clipReplayCost>100000)error('CLIP_REPLAY_BUDGET');}paint.push(item);};
     types.set(op.type,(types.get(op.type)||0)+1);
     if(op.type==='rawSvg')svgReferences++;
     if(allowSpecial&&['equation','placeholder','footnoteMarker','textControlMark','controlLabel','textDecoration','tabLeader','charOverlap','formObject'].includes(op.type)){
      try{const items=planDirectSpecial(op);
       if((specialItems+=items.length)>10000)error('SPECIAL_BUDGET');
       if(!allowText&&items.some(item=>item.kind==='text'))error('SPECIAL_TEXT_DISABLED');
       for(const item of items){if(item.kind==='text'){if(++glyphCount>50000)error('TEXT_BUDGET');}
        if(item.kind==='path'&&(pathCommands+=item.commands.length)>20000)error('PATH_PAGE_BUDGET');
        item.plane=1;add(item);}specialCount++;
      }catch(e){if(!String(e.message).startsWith('DIRECT_PDF_SPECIAL_'))throw e;blockers.add(e.message);}continue;
     }
     if(op.type==='textRun'){
      textRuns++;
      const family=op.style?.fontFamily;
      if(typeof family==='string'&&family.length<=256&&fonts.size<1024)fonts.add(family);
      if(allowText){
       try{const plan=planDirectText(op);glyphCount+=plan.glyphs.length;
        if(glyphCount>50000)error('TEXT_BUDGET');add(plan);
       }catch(e){if(!String(e.message).startsWith('DIRECT_PDF_TEXT_'))throw e;blockers.add(e.message);}
       continue;
      }
     }
     if(allowMedia&&['image','line','ellipse','path'].includes(op.type)){
      try{
       const item=op.type==='image'?planDirectImage(op,tree.resources,{allowLayers}):planDirectShape(op);
       if(++mediaCount>2048)error('MEDIA_COUNT');
       if(item.kind==='image'){
        mediaBytes+=item.bytes.length;mediaPixels+=item.info.width*item.info.height;
        if(mediaBytes>32*1024*1024||mediaPixels>48_000_000)error('MEDIA_PAGE_BUDGET');
       }
       if(item.kind==='path'&&(pathCommands+=item.commands.length)>20000)error('PATH_PAGE_BUDGET');
       add(item);
      }catch(e){if(!String(e.message).startsWith('DIRECT_PDF_MEDIA_'))throw e;blockers.add(e.message);}
      continue;
     }
     if(op.type!=='rectangle'&&op.type!=='pageBackground'){blockers.add('operation');continue;}
     const rectangle=rectanglePlan(op);
     if(!rectangle){blockers.add('rectangle-style');continue;}
     rectangles.push(rectangle);add({...rectangle,kind:'rectangle'});
    }
    break;
   default:error('NODE_KIND');
  }
 }
 return {width:tree.pageWidth,height:tree.pageHeight,nodes,operations,textRuns,clips,svgReferences,
  pathCommands,operationCounts:Object.fromEntries(types),fontFamilies:[...fonts],blockers:[...blockers],rectangles,paint,glyphCount,mediaCount,tableCount,cellCount,mergedCells,clipReplayCost,specialCount,specialItems};
}
const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
function rectanglePlan(op){
 const {x,y,width,height}=bbox(op.bbox);
 if(width===0||height===0)return null;
 if(op.type==='pageBackground'){
  if(op.gradient!=null||op.image!=null||op.borderColor!=null||op.borderWidth!==0||
    (op.backgroundColor!=null&&!color(op.backgroundColor)))return null;
  return {plane:0,x,y,width,height,fill:op.backgroundColor??null,stroke:null,strokeWidth:0};
 }
 const s=op.style,t=op.transform;
 if(!plain(s)||!plain(t)||t.rotation!==0||t.horzFlip!==false||t.vertFlip!==false||op.cornerRadius!==0||
  op.gradient!=null||op.printFillCoverage!=null||op.printPicturePen!=null||op.strokeJoin!=null||
  s.pattern!=null||s.shadow!=null||s.strokeDash!=='solid'||s.opacity!==1||
  (s.fillColor!==null&&!color(s.fillColor))||(s.strokeColor!==null&&!color(s.strokeColor))||
  !finite(s.strokeWidth)||s.strokeWidth<0||(s.strokeColor!==null&&s.strokeWidth===0))return null;
 return {plane:1,x,y,width,height,fill:s.fillColor,stroke:s.strokeColor,strokeWidth:s.strokeWidth};
}
// DEV52: caller-owned RHWP document; do not free or mutate it. Reject ALL
// unsupported pages before returning bytes. PDF-lib is already a dependency.
export async function buildDirectGeometryPdf(doc,options={}){
 return buildDirectPdf(doc,{...options,resolveFont:undefined,approvedFaces:undefined,allowMedia:false,allowLayers:false,allowSpecial:false});
}
// DEV53 remains opt-in. The production converter is not connected.
export async function buildDirectPdf(doc,{signal,onProgress=()=>{},loadPdf=()=>import('pdf-lib'),resolveFont,approvedFaces,fontSelections,allowMedia=false,allowLayers=false,allowSpecial=false,yieldControl=yieldToHost,validateJpeg=verifyJpegDecode,loadFontkit=async()=>(await import('@pdf-lib/fontkit')).default}={}){
 const count=pageCount(doc);cancel(signal);
 if(typeof yieldControl!=='function')error('YIELD_CONTROL');
 let pendingUnits=0,cooperativeYields=0,totalOperations=0,totalWork=0,clipTransitions=0;
 const due=units=>{pendingUnits+=units;if(pendingUnits<YIELD_UNITS)return false;pendingUnits=0;return true;};
 const pause=async()=>{cancel(signal);await yieldControl();cancel(signal);cooperativeYields++;};
 const lib=await loadPdf();
 const {PDFDocument,rgb}=lib;
 const pdf=await PDFDocument.create();
 const toColor=hex=>rgb(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
 if(approvedFaces!==undefined){
  if(resolveFont!==undefined)error('FONT_RESOLVER_CONFLICT');
  resolveFont=createDirectFontResolver(approvedFaces,{selections:fontSelections});
 }
 const allowText=typeof resolveFont==='function',cache=new Map();
 let fontkit,rendered=0,textRuns=0,glyphCount=0,images=0,shapes=0,embeddedBytes=0,embeddedPixels=0,mediaTotal=0,specialTotal=0;
 const imageCache=new Map();
 for(let i=0;i<count;i++){
  cancel(signal);
  const plan=inspectDirectPage(readDirectPage(doc,i),{allowText,allowMedia,allowLayers,allowSpecial});
  totalOperations+=plan.operations;
  // Conservative preflight estimates; do not allocate PDF objects for a page
  // that would exceed the cumulative document work budget.
  totalWork+=plan.paint.length+plan.glyphCount*8+plan.pathCommands+plan.specialItems*4+plan.clipReplayCost*4;
  if(totalOperations>DOCUMENT_OP_LIMIT||totalWork>DOCUMENT_WORK_LIMIT)error('DOCUMENT_WORK_BUDGET');
  if((specialTotal+=plan.specialItems)>30000)error('SPECIAL_DOCUMENT_BUDGET');
  if((mediaTotal+=plan.mediaCount)>10000)error('MEDIA_DOCUMENT_BUDGET');
  if(glyphCount+plan.glyphCount>200000)error('DOCUMENT_TEXT_BUDGET');
  if(plan.blockers.length)error('UNSUPPORTED_PAGE_'+(i+1)+':'+plan.blockers.join(','));
  const page=pdf.addPage([plan.width*PT,plan.height*PT]);
  // Stable order inside each plane. Coordinate conversion once, at PDF boundary.
  const planes=Array.from({length:allowLayers?4:2},()=>[]);
  for(const r of plan.paint){if(!planes[r.plane])error('PAINT_PLANE');planes[r.plane].push(r);}
  for(const items of planes){
   const activeClips=[];
   try{for(const r of items){
    if(due(1))await pause();
    const wanted=r.clips??[];let shared=0;
    while(shared<activeClips.length&&shared<wanted.length&&activeClips[shared]===wanted[shared])shared++;
    while(activeClips.length>shared){page.pushOperators(lib.popGraphicsState());activeClips.pop();clipTransitions++;}
    for(let j=shared;j<wanted.length;j++){openDirectClip(page,wanted[j],plan.height,lib);activeClips.push(wanted[j]);clipTransitions++;}
   if(r.kind==='text'){
    cancel(signal);
    if(!fontkit){fontkit=await loadFontkit();pdf.registerFontkit(fontkit);}
    const font=await prepareDirectText(pdf,r,resolveFont,fontkit,cache);
    cancel(signal);
    for(const g of r.glyphs){if(due(1))await pause();page.drawText(g.ch,{font,size:r.size*PT,x:g.x*PT,y:(plan.height-g.y)*PT,color:toColor(r.color)});}
    textRuns++;glyphCount+=r.glyphs.length;continue;
   }
   if(r.kind==='image'){
    cancel(signal);const key=r.mime+'|'+r.encoded;let image=imageCache.get(key);
    if(!image){
     if(imageCache.size>=128||embeddedBytes+r.bytes.length>64*1024*1024||embeddedPixels+r.info.width*r.info.height>96_000_000)error('IMAGE_DOCUMENT_BUDGET');
     if(r.mime==='image/png')await verifyDirectPng(r.info,signal);else await validateJpeg(r.bytes,r.info,signal);
     cancel(signal);
     image=await (r.mime==='image/png'?pdf.embedPng(r.bytes):pdf.embedJpg(r.bytes));
     if(image.width!==r.info.width||image.height!==r.info.height)error('IMAGE_EMBED_DIMENSIONS');
     imageCache.set(key,image);embeddedBytes+=r.bytes.length;embeddedPixels+=r.info.width*r.info.height;
    }
    cancel(signal);page.drawImage(image,{x:r.x*PT,y:(plan.height-r.y-r.height)*PT,width:r.width*PT,height:r.height*PT,opacity:r.opacity});images++;continue;
   }
   if(['line','ellipse','path'].includes(r.kind)){
    drawDirectShape(page,r,plan.height,lib,toColor);shapes++;continue;
   }
   if(!r.fill&&!r.stroke)continue;
   const options={x:r.x*PT,y:(plan.height-r.y-r.height)*PT,width:r.width*PT,height:r.height*PT,
    borderWidth:r.stroke?r.strokeWidth*PT:0,color:r.fill?toColor(r.fill):undefined,
    ...(r.stroke?{borderColor:toColor(r.stroke)}:{})};
   page.drawRectangle(options);rendered++;
   }}finally{while(activeClips.length){page.pushOperators(lib.popGraphicsState());activeClips.pop();clipTransitions++;}}
  }
  onProgress({page:i+1,total:count,operations:plan.operations});
  if(i+1<count)await pause();
 }
 cancel(signal);
 const bytes=await pdf.save();cancel(signal);
 if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>512*1024*1024)error('OUTPUT_BYTES');
 return {bytes,pages:count,rectangles:rendered,textRuns,glyphCount,images,shapes,uniqueImages:imageCache.size,specialItems:specialTotal,metrics:{operations:totalOperations,estimatedWork:totalWork,cooperativeYields,clipTransitions},experimental:true};
}

async function verifyJpegDecode(bytes,info,signal){
 if(typeof createImageBitmap!=='function')error('MEDIA_JPEG_DECODER_UNAVAILABLE');
 const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}),{imageOrientation:'none',colorSpaceConversion:'none'});
 try{cancel(signal);if(bitmap.width!==info.width||bitmap.height!==info.height)error('MEDIA_JPEG_DECODE_DIMENSIONS');}
 finally{bitmap.close();}
}
function drawDirectShape(page,r,height,lib,toColor){
 const x=v=>v*PT,y=v=>(height-v)*PT;
 if(r.kind==='line'){
  page.drawLine({start:{x:x(r.x1),y:y(r.y1)},end:{x:x(r.x2),y:y(r.y2)},thickness:r.strokeWidth*PT,color:toColor(r.stroke)});return;
 }
 const style={borderWidth:r.stroke?r.strokeWidth*PT:0,...(r.fill?{color:toColor(r.fill)}:{}),...(r.stroke?{borderColor:toColor(r.stroke)}:{})};
 if(r.kind==='ellipse'){
  page.drawEllipse({x:x(r.x+r.width/2),y:y(r.y+r.height/2),xScale:r.width*PT/2,yScale:r.height*PT/2,...style});return;
 }
 const ops=[lib.pushGraphicsState()];
 if(r.fill)ops.push(lib.setFillingColor(toColor(r.fill)));
 if(r.stroke)ops.push(lib.setStrokingColor(toColor(r.stroke)),lib.setLineWidth(r.strokeWidth*PT));
 for(const c of r.commands){
  if(c.type==='moveTo')ops.push(lib.moveTo(x(c.x),y(c.y)));
  else if(c.type==='lineTo')ops.push(lib.lineTo(x(c.x),y(c.y)));
  else if(c.type==='curveTo')ops.push(lib.appendBezierCurve(x(c.x1),y(c.y1),x(c.x2),y(c.y2),x(c.x3),y(c.y3)));
  else ops.push(lib.closePath());
 }
 ops.push(r.fill&&r.stroke?lib.fillAndStroke():r.fill?lib.fill():lib.stroke(),lib.popGraphicsState());
 page.pushOperators(...ops);
}
