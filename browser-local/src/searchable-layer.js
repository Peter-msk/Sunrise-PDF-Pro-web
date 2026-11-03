// R32: searchable Unicode text over an unchanged rasterized SVG page.
// This remains a hybrid PDF, not a vector/print-parity export.
const MAX_TEXT_NODES=25000;
const PT_PER_PX=72/96;
const svgNum=value=>{
 const num=Number.parseFloat(value??'');
 return Number.isFinite(num)?num:null;
};
function coalesceGlyphs(glyphs){
 const result=[];
 let row=null;
 const flush=()=>{
  if(row){result.push({text:row.text,x:row.x,y:row.y,size:row.size});row=null;}
 };
 for(const g of glyphs){
  if(!row){
   row={...g,lastX:g.x,lastSize:g.size,lastText:g.text};
   continue;
  }
  const dx=g.x-row.lastX;
  const sameRow=Math.abs(g.y-row.y)<=0.5 && Math.abs(g.size-row.size)<=0.75;
  const adjacent=dx>=-0.15 && dx<=Math.max(row.lastSize,g.size)*1.85;
  // Do not merge independent table columns or separate graphic labels.
  if(!sameRow||!adjacent||row.text.length>=240||row.lastText.length!==1||g.text.length!==1){
   flush();
   row={...g,lastX:g.x,lastSize:g.size,lastText:g.text};
   continue;
  }
  const addSpace=dx>Math.max(row.lastSize,g.size)*1.12 && !row.text.endsWith(' ') && !g.text.startsWith(' ');
  row.text+=(addSpace?' ':'')+g.text;
  row.lastX=g.x;
  row.lastSize=g.size;
  row.lastText=g.text;
 }
 flush();
 return result;
}
export function extractSvgTextRuns(svg,width,height){
 const tree=new DOMParser().parseFromString(svg,'image/svg+xml');
 if(tree.querySelector('parsererror')||tree.documentElement?.localName!=='svg')
  throw Error('검색 계층용 SVG 형식 오류');
 const nodes=tree.querySelectorAll('text');
 if(nodes.length>MAX_TEXT_NODES)throw Error('한 페이지 검색용 글자 요소가 허용량을 초과했습니다.');
 const glyphs=[];let skipped=0;
 for(const node of nodes){
  let transform=false,el=node;
  while(el&&el!==tree.documentElement){
   if(el.hasAttribute('transform')){transform=true;break;}
   el=el.parentElement;
  }
  if(transform||node.getAttribute('display')==='none'){skipped++;continue;}
  const x=svgNum(node.getAttribute('x')),y=svgNum(node.getAttribute('y'));
  const size=svgNum(node.getAttribute('font-size'))??12;
  const txt=node.textContent??'';
  if(x===null||y===null||size<=0||size>200||!txt||txt.length>1000||x<0||x>width||y<0||y>height){
   skipped++;continue;
  }
  // Explicitly reject text whose SVG positioning is not reducible to one horizontal baseline.
  if(node.querySelector('tspan')){skipped++;continue;}
  glyphs.push({text:txt,x,y,size});
 }
 const runs=coalesceGlyphs(glyphs).map(row=>({
  text:row.text,x:row.x*PT_PER_PX,
  y:(height-row.y)*PT_PER_PX,size:row.size*PT_PER_PX
 }));
 return {runs,total:nodes.length,skipped};
}
export function writeSearchableText(pdfPage,pdfFont,textLayer){
 let embedded=0,unsupported=0;
 for(const run of textLayer.runs){
  try{
   pdfPage.drawText(run.text,{
    x:run.x,y:run.y,size:run.size,font:pdfFont,opacity:0
   });
   embedded+=[...run.text].length;
  }catch{
   // No replacement symbols; one unsupported character must not corrupt visible PDF.
   unsupported+=[...run.text].length;
  }
 }
 return {total:textLayer.total,embedded,skipped:textLayer.skipped+unsupported};
}
