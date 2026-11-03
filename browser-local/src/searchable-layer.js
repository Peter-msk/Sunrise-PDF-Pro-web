// R32: position-preserving searchable PDF text over the unchanged raster page.
// This is a hybrid PDF, NOT a native vector or layout-identical Hancom export.
// Only SVG text nodes with explicit, non-transformed coordinates are eligible.
const MAX_TEXT_NODES=25000;
const PT_PER_PX=72/96;
const svgNum=value=>{
 const num=Number.parseFloat(value??'');
 return Number.isFinite(num)?num:null;
};
export function extractSvgTextRuns(svg,width,height){
 const tree=new DOMParser().parseFromString(svg,'image/svg+xml');
 if(tree.querySelector('parsererror')||tree.documentElement?.localName!=='svg')
  throw Error('검색 계층용 SVG 형식 오류');
 const nodes=tree.querySelectorAll('text');
 if(nodes.length>MAX_TEXT_NODES)throw Error('한 페이지 검색용 글자 요소가 허용량을 초과했습니다.');
 const runs=[];let skipped=0;
 for(const node of nodes){
  let transform=false,el=node;
  while(el && el!==tree.documentElement){
   if(el.hasAttribute('transform')){transform=true;break;}
   el=el.parentElement;
  }
  if(transform||node.hasAttribute('display')&&node.getAttribute('display')==='none'){skipped++;continue;}
  const x=svgNum(node.getAttribute('x')),y=svgNum(node.getAttribute('y'));
  const size=svgNum(node.getAttribute('font-size'))??12;
  const txt=node.textContent??'';
  if(x===null||y===null||size<=0||size>200||!txt||txt.length>1000||x<0||x>width||y<0||y>height){
   skipped++;continue;
  }
  // Styled nested tspan / complex transforms need dedicated text metrics in a future gate.
  if(node.querySelector('tspan')){skipped++;continue;}
  runs.push({text:txt,x:x*PT_PER_PX,y:(height-y)*PT_PER_PX,size:size*PT_PER_PX});
 }
 return {runs,total:nodes.length,skipped};
}
export function writeSearchableText(pdfPage,pdfFont,textLayer){
 let embedded=0,unsupported=0;
 for(const run of textLayer.runs){
  try{
   pdfPage.drawText(run.text,{
    x:run.x,y:run.y,size:run.size,font:pdfFont,opacity:0
   });
   embedded++;
  }catch{
   // Never render replacement symbols or misrepresent coverage.
   unsupported++;
  }
 }
 return {total:textLayer.total,embedded,skipped:textLayer.skipped+unsupported};
}
