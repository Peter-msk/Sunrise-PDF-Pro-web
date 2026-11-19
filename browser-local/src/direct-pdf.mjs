/** DEV52 experimental direct PageLayerTree adapter. No SVG and no network.
 * Verified against rhwp v0.9.0 source c9095c5f67632e6721e800ccc7fb43ea49d26682.
 * This is an intentionally narrow geometry-only prototype, NOT a production
 * renderer. Unknown operations never become blank or partial successful PDFs.
 */
import {MAX_CONVERSION_PAGES} from './page-limit.mjs';
const SCHEMA_MINOR=35,RESOURCE_MINOR=6,PT=.75;
const MAX_JSON=32*1024*1024,MAX_NODES=60000,MAX_OPS=100000,MAX_DEPTH=128;
const error=code=>{throw Error('DIRECT_PDF_'+code);};
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7;
function bbox(b){
 if(!plain(b)||!['x','y','width','height'].every(k=>finite(b[k]))||b.width<0||b.height<0)error('BOUNDS');
 return b;
}
function cancel(signal){if(signal?.aborted)throw new DOMException('취소됨','AbortError');}
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
// deliberately blocks the prototype until clipping replay is implemented.
export function inspectDirectPage(tree){
 let nodes=0,operations=0,textRuns=0,clips=0,svgReferences=0;
 const types=new Map(), fonts=new Set(), blockers=new Set(),rectangles=[];
 const stack=[{node:tree.root,depth:0,layer:null}];
 while(stack.length){
  const {node,depth,layer}=stack.pop();
  if(++nodes>MAX_NODES||depth>MAX_DEPTH)error('NODE_BUDGET');
  if(!plain(node))error('NODE');bbox(node.bounds);
  const active=node.layer??layer;
  if(active&&(!plain(active)||active.masterPage||active.textWrap==='behindText'||active.textWrap==='inFrontOfText'))blockers.add('paint-plane');
  switch(node.kind){
   case 'group':
    if(!Array.isArray(node.children)||node.children.length>MAX_NODES-nodes||stack.length+node.children.length>MAX_NODES)error('NODE_BUDGET');
    for(let i=node.children.length-1;i>=0;i--)stack.push({node:node.children[i],depth:depth+1,layer:active});
    break;
   case 'clipRect':case 'clipPath':
    clips++;blockers.add('clip');stack.push({node:node.child,depth:depth+1,layer:active});break;
   case 'leaf':
    if(!Array.isArray(node.ops)||node.ops.length>MAX_OPS-operations)error('OP_BUDGET');
    for(const op of node.ops){
     if(!plain(op)||typeof op.type!=='string'||op.type.length>64)error('OP');
     operations++;bbox(op.bbox);
     types.set(op.type,(types.get(op.type)||0)+1);
     if(op.type==='rawSvg')svgReferences++;
     if(op.type==='textRun'){
      textRuns++;
      const family=op.style?.fontFamily;
      if(typeof family==='string'&&family.length<=256&&fonts.size<1024)fonts.add(family);
     }
     if(op.type!=='rectangle'&&op.type!=='pageBackground'){blockers.add('operation');continue;}
     const rectangle=rectanglePlan(op);
     if(!rectangle){blockers.add('rectangle-style');continue;}
     rectangles.push(rectangle);
    }
    break;
   default:error('NODE_KIND');
  }
 }
 return {width:tree.pageWidth,height:tree.pageHeight,nodes,operations,textRuns,clips,svgReferences,
  operationCounts:Object.fromEntries(types),fontFamilies:[...fonts],blockers:[...blockers],rectangles};
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
export async function buildDirectGeometryPdf(doc,{signal,onProgress=()=>{},loadPdf=()=>import('pdf-lib')}={}){
 const count=pageCount(doc);cancel(signal);
 const {PDFDocument,rgb}=await loadPdf();
 const pdf=await PDFDocument.create();
 const toColor=hex=>rgb(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
 let rendered=0;
 for(let i=0;i<count;i++){
  cancel(signal);
  const plan=inspectDirectPage(readDirectPage(doc,i));
  if(plan.blockers.length)error('UNSUPPORTED_PAGE_'+(i+1)+':'+plan.blockers.join(','));
  const page=pdf.addPage([plan.width*PT,plan.height*PT]);
  // Stable order inside each plane. Coordinate conversion once, at PDF boundary.
  for(const plane of [0,1])for(const r of plan.rectangles){
   if(r.plane!==plane||(!r.fill&&!r.stroke))continue;
   const options={x:r.x*PT,y:(plan.height-r.y-r.height)*PT,width:r.width*PT,height:r.height*PT,
    borderWidth:r.stroke?r.strokeWidth*PT:0,color:r.fill?toColor(r.fill):undefined,
    ...(r.stroke?{borderColor:toColor(r.stroke)}:{})};
   page.drawRectangle(options);rendered++;
  }
  onProgress({page:i+1,total:count,operations:plan.operations});
 }
 cancel(signal);
 const bytes=await pdf.save();cancel(signal);
 if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>512*1024*1024)error('OUTPUT_BYTES');
 return {bytes,pages:count,rectangles:rendered,experimental:true};
}
