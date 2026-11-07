// Render the saved PDF bytes, rather than the intermediate rhwp SVG preview.
// Canvas here is a screen preview only; it never changes the downloadable PDF.
export function createPdfViewer($){
 let revision=0,document=null,loading=null,rendering=null,page=1,total=0,zoom=1;
 const area=$('preview'),canvas=$('pdf-canvas');
 const message=documentElement('span');area.replaceChildren(canvas,message);
 function controls(){
  $('page-prev').disabled=!document||page<=1;
  $('page-next').disabled=!document||page>=total;
  $('page-position').textContent=total?page+' / '+total+'쪽':'0 / 0쪽';
 }
 function clear(){
  rendering?.cancel();rendering=null;
  const old=loading;loading=null;old?.destroy().catch(()=>{});
  document=null;page=1;total=0;canvas.hidden=true;canvas.width=canvas.height=1;
  area.removeAttribute('aria-busy');controls();
 }
 async function draw(token=revision){
  if(!document)return;
  rendering?.cancel();
  const target=document,current=page;
  try{
   const pdfPage=await target.getPage(current);
   if(token!==revision||current!==page)return;
   const base=pdfPage.getViewport({scale:1});
   const width=Math.max(180,area.clientWidth-38);
   const scale=width/base.width*zoom;
   const pixelScale=Math.min(window.devicePixelRatio||1,2);
   const viewport=pdfPage.getViewport({scale});
   const bounded=Math.min(pixelScale,Math.sqrt(9_000_000/(viewport.width*viewport.height)));
   canvas.width=Math.max(1,Math.floor(viewport.width*bounded));
   canvas.height=Math.max(1,Math.floor(viewport.height*bounded));
   canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
   canvas.hidden=false;message.hidden=true;area.setAttribute('aria-busy','true');
   const task=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport,transform:[bounded,0,0,bounded,0,0]});
   rendering=task;await task.promise;
   if(token!==revision||current!==page)return;
   canvas.setAttribute('aria-label','생성된 PDF '+current+' / '+total+'쪽');
   area.removeAttribute('aria-busy');controls();
  }catch(error){
   if(error?.name==='RenderingCancelledException'||token!==revision)return;
   area.removeAttribute('aria-busy');message.hidden=false;
   message.textContent='PDF 화면 표시 실패: '+String(error?.message||error)+'. PDF 저장 후 확인하세요.';
  }
 }
 async function open(blob){
  const token=++revision;clear();message.hidden=false;
  message.textContent=blob?'실제 PDF를 여는 중입니다.':'변환을 완료한 문서를 선택하면 실제 PDF의 모든 페이지를 검토할 수 있습니다.';
  if(!blob)return;
  try{
   const [pdfjs,data]=await Promise.all([import('pdfjs-dist/build/pdf.mjs'),blob.arrayBuffer()]);
   if(token!==revision)return;
   pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf-worker.mjs',globalThis.document.baseURI).href;
   const task=pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:false});
   loading=task;const pdf=await task.promise;
   if(token!==revision){await task.destroy();return;}
   document=pdf;total=pdf.numPages;controls();await draw(token);
  }catch(error){if(token===revision){message.hidden=false;message.textContent='PDF 화면 표시 실패: '+String(error?.message||error)+'. PDF 저장 후 확인하세요.';}}
 }
 function move(delta){if(!document)return;page=Math.min(total,Math.max(1,page+delta));controls();draw();}
 $('page-prev').addEventListener('click',()=>move(-1));
 $('page-next').addEventListener('click',()=>move(1));
 $('preview-zoom').addEventListener('change',()=>{zoom=Number($('preview-zoom').value)||1;draw();});
 let resizeTimer;const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>draw(),120);});observer.observe(area);
 return {open,dispose(){++revision;clear();clearTimeout(resizeTimer);observer.disconnect();}};
}
function documentElement(tag){return globalThis.document.createElement(tag);}
