import {createPdfViewer} from './pdf-viewer.js';
import {renderNativePrintPages} from './converter.js';
import {convertAnyToPdf as convertToPdf} from './convert-any.js';
import {inputKind,isHwp} from './input-types.js';
import {prepareNativePrint} from './native-print.js';
import {runBatch,makePdfArchive,uniquePdfNames} from './batch.js';
const $=id=>document.getElementById(id);
const viewer=createPdfViewer($);
let items=[],active=null,busy=false,ready=true,controller=null,printJob=null,archiveUrl=null,nextId=0;
const status=value=>{$('status').textContent=value;};
function clearPrint(){if(printJob){printJob.dispose();printJob=null;}}
function clearArchive(){if(archiveUrl)URL.revokeObjectURL(archiveUrl);archiveUrl=null;$('download-all').hidden=true;$('download-all').removeAttribute('href');}
function release(item){if(item.pdfUrl)URL.revokeObjectURL(item.pdfUrl);if(item.imgUrl)URL.revokeObjectURL(item.imgUrl);}
function show(item){
 active=item;clearPrint();
 for(const row of $('file-list').children)row.classList.toggle('is-active',row.dataset.id===String(item?.id));
 $('viewer-file').textContent=item?.file.name||'문서를 선택하세요';
 const link=$('active-download');link.hidden=!item?.result;
 if(!item?.result){link.removeAttribute('href');$('pages').textContent='';$('quality-detail').replaceChildren();viewer.open(null);sync();return;}
 link.href=item.pdfUrl;link.download=uniquePdfNames(items.map(i=>i.file))[items.indexOf(item)];
 const r=item.result;const mode=r.renderMode==='professional'?'글자·도형 보존':r.renderMode==='spreadsheet-text'?'셀·글자 보존 · 원본 서식 제한':r.renderMode==='source-image'?'원본 이미지':'PDF';
 $('pages').textContent=r.pages+'쪽 · '+mode;
 const title=document.createElement('strong');title.textContent='출력 확인 · '+mode;
 const detail=document.createElement('div');
 detail.textContent=[...(r.substituteFamilies?.length?['대체 글꼴: '+r.substituteFamilies.join(', ')]:[]),...(r.warnings||[]),r.renderMode==='professional'?'HWP/HWPX 전체 페이지를 이미지로 바꾸지 않았습니다. 표·글상자·머리말·꼬리말은 페이지를 넘기며 확인하세요.':''].filter(Boolean).join(' ');
 $('quality-detail').replaceChildren(title,detail);viewer.open(item.result.pdf);sync();
}
function sync(){
 const pending=items.some(i=>['ready','failed','cancelled'].includes(i.state));
 $('convert').disabled=!ready||busy||!pending;$('reset').disabled=busy||!items.length;$('cancel').disabled=!busy;
 for(const id of ['source','pdf-font','pdf-engine'])$(id).disabled=busy;
 $('print-prepare').disabled=!ready||busy||!active||!isHwp(active.file)||active.state==='invalid';$('print-save').disabled=busy||!printJob;
 $('total-count').textContent=items.length;$('done-count').textContent=items.filter(i=>i.state==='done').length;
 $('failed-count').textContent=items.filter(i=>['failed','invalid'].includes(i.state)).length;
 $('queue-count').textContent=items.length+'개 파일';$('summary-state').textContent=busy?'처리 중':items.some(i=>i.state==='failed'||i.state==='invalid')?'확인 필요':items.some(i=>i.state==='done')?'결과 준비':'대기 중';
}
function draw(){
 const list=$('file-list');list.replaceChildren();
 if(!items.length){const li=document.createElement('li');li.className='empty';li.textContent='선택한 문서가 여기에 표시됩니다.';list.append(li);}
 const names=uniquePdfNames(items.map(i=>i.file));
 items.forEach((item,index)=>{
  const li=document.createElement('li');li.className='file-row';li.dataset.id=String(item.id);li.dataset.state=item.state;li.classList.toggle('is-active',active===item);
  const icon=document.createElement('span');icon.className='file-icon';icon.textContent=(inputKind(item.file)||'FILE').toUpperCase();
  const body=document.createElement('div'),name=document.createElement('div'),meta=document.createElement('div');name.className='file-name';name.textContent=item.file.name;meta.className='file-meta';
  const labels={ready:'변환 대기',working:'변환 중',done:'변환 완료',failed:'변환 실패',invalid:'지원하지 않는 파일',cancelled:'취소됨 · 다시 변환 가능'};
  let message=labels[item.state]||'';
  if(item.error){message+=' · '+item.error;meta.classList.add('error');}
  if(item.result?.substituteFamilies?.length)message+=' · 대체 글꼴: '+item.result.substituteFamilies.join(', ');
  if(item.result?.warnings?.length)message+=' · '+item.result.warnings.join(' ');
  meta.textContent=message;body.append(name,meta);
  const actions=document.createElement('div');actions.className='file-actions';
  if(item.state==='done'){
   const preview=document.createElement('button');preview.className='secondary';preview.type='button';preview.textContent='PDF 검토';preview.disabled=busy;preview.addEventListener('click',()=>show(item));actions.append(preview);
   const link=document.createElement('a');link.className='download';link.href=item.pdfUrl;link.download=names[index];link.textContent='다운로드';actions.append(link);
  }else if(item.state!=='invalid'){
   const select=document.createElement('button');select.className='secondary';select.type='button';select.textContent='선택';select.disabled=busy;select.addEventListener('click',()=>{show(item);status(item.file.name+' 문서를 선택했습니다.');});actions.append(select);
  }
  const remove=document.createElement('button');remove.className='secondary';remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',item.file.name+' 목록에서 삭제');remove.disabled=busy;remove.addEventListener('click',()=>{release(item);items=items.filter(i=>i!==item);clearArchive();if(active===item)show(items.find(i=>i.state==='done')||items[0]||null);draw();status('목록을 변경했습니다.');});actions.append(remove);
  li.append(icon,body,actions);list.append(li);
 });sync();
}
function addFiles(files){
 if(busy||!files.length)return;clearArchive();
 for(const file of files){const valid=Boolean(inputKind(file))&&file.size>=8;items.push({id:++nextId,file,state:valid?'ready':'invalid',error:valid?'':'HWP·HWPX·XLS·XLSX·JPG·JPEG·PNG 파일을 선택하세요.',result:null});}
 if(!active)show(items.find(i=>i.state==='ready')||null);draw();status(files.length+'개 파일을 목록에 추가했습니다. 전체 PDF 변환을 눌러 주세요.');
}
$('source').addEventListener('change',e=>{addFiles(Array.from(e.target.files||[]));e.target.value='';});
for(const event of ['dragenter','dragover'])$('drop').addEventListener(event,e=>{e.preventDefault();if(!busy)$('drop').classList.add('drag');});
for(const event of ['dragleave','drop'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.remove('drag');});
$('drop').addEventListener('drop',e=>addFiles(Array.from(e.dataTransfer?.files||[])));
$('pdf-font').addEventListener('change',()=>{clearPrint();const files=Array.from($('pdf-font').files||[]);if(files.some(f=>!/\.(ttf|otf)$/i.test(f.name))){$('pdf-font').value='';$('font-info').textContent='TTF/OTF 글꼴만 선택할 수 있습니다.';}else $('font-info').textContent=files.length?'선택한 글꼴 '+files.length+'개를 기본 글꼴보다 우선합니다.':'원본과 같은 서체가 필요하면 TTF/OTF를 추가하세요. 없는 글꼴은 대체되며 결과에 표시됩니다.';sync();});
$('pdf-engine').addEventListener('change',()=>{clearPrint();status('변경한 출력 방식은 다음 변환부터 적용됩니다.');sync();});
$('convert').addEventListener('click',async()=>{
 if(busy||!ready)return;const pending=items.filter(i=>['ready','failed','cancelled'].includes(i.state));if(!pending.length)return;
 const fontFiles=Array.from($('pdf-font').files||[]),engine=$('pdf-engine').value;controller=new AbortController();const signal=controller.signal;busy=true;clearPrint();clearArchive();draw();let completed=0;
 try{
  await runBatch(pending,async(file,item)=>{
   const result=await convertToPdf(file,info=>{
    const part=info.stage==='load'?Math.min(.15,.15*info.loaded/Math.max(1,info.total)):.15+.84*info.page/Math.max(1,info.total);
    $('progress').value=Math.min(99,Math.round((completed+part)/pending.length*100));
    status(file.name+' · '+(info.stage==='load'?'문서 읽는 중':info.page+'/'+info.total+'쪽 변환 중')+' · '+(completed+1)+'/'+pending.length+'개');
   },signal,{fontFiles,engine});return result;
  },signal,item=>{
   if(item.state==='done'){item.pdfUrl=URL.createObjectURL(item.result.pdf);item.imgUrl=URL.createObjectURL(item.result.preview);completed++;show(item);}
   else if(item.state==='failed'||item.state==='cancelled')completed++;
   draw();
  });
  if(!signal.aborted){
   $('progress').value=100;
   const done=items.filter(i=>i.state==='done').length,failed=items.filter(i=>i.state==='failed'||i.state==='invalid').length;
   status('변환 완료 '+done+'개'+(failed?' · 확인 필요 '+failed+'개':'')+'. 각 파일을 다운로드할 수 있습니다.');
   if(done>1){try{status('완료 파일 ZIP을 준비하는 중입니다.');const blob=await makePdfArchive(items,signal,(i,n)=>status('ZIP 준비 중 · '+i+'/'+n+'개'));archiveUrl=URL.createObjectURL(blob);$('download-all').href=archiveUrl;$('download-all').hidden=false;status('완료 '+done+'개'+(failed?' · 확인 필요 '+failed+'개':'')+'. ZIP 또는 개별 PDF를 다운로드하세요.');}catch(error){if(error?.name!=='AbortError')status('개별 PDF 다운로드 가능 · ZIP 생성 실패: '+String(error.message||error));else status('ZIP 생성이 취소되었습니다. 완료한 PDF는 개별 다운로드할 수 있습니다.');}}
  }else status('작업이 취소되었습니다. 완료된 PDF는 개별 다운로드할 수 있습니다.');
 }catch(error){status('작업 실패: '+String(error?.message||error));}
 finally{busy=false;controller=null;draw();}
});
$('print-prepare').addEventListener('click',async()=>{
 if(!active||!isHwp(active.file)||!ready||busy)return;const file=active.file;controller=new AbortController();const signal=controller.signal;busy=true;clearPrint();draw();
 try{const {pages,fontRegistry}=await renderNativePrintPages(file,info=>{status(file.name+' · 인쇄 준비 중'+(info.page?' '+info.page+'/'+info.total+'쪽':''));},signal,Array.from($('pdf-font').files||[]));if(signal.aborted)throw new DOMException('취소됨','AbortError');printJob=await prepareNativePrint(pages,document,fontRegistry,signal);status('인쇄 준비 완료. PDF로 인쇄/저장을 누른 뒤 PDF 저장 대상을 선택하세요.');}
 catch(error){clearPrint();status(error?.name==='AbortError'?'인쇄 준비가 취소되었습니다.':'인쇄 준비 실패: '+String(error?.message||error));}
 finally{busy=false;controller=null;draw();}
});
$('print-save').addEventListener('click',()=>{if(printJob&&!busy){try{printJob.print();status('인쇄 창에서 PDF로 저장을 선택하세요.');}catch(error){status('인쇄 실패: '+String(error?.message||error));}}});
$('cancel').addEventListener('click',()=>controller?.abort());
$('reset').addEventListener('click',()=>{for(const item of items)release(item);items=[];clearPrint();clearArchive();$('progress').value=0;show(null);draw();status('새 문서를 선택해 주세요.');});
viewer.open(null);status('변환 준비 완료. 한글·엑셀·이미지를 여러 개 선택할 수 있습니다.');sync();
window.addEventListener('pagehide',()=>{controller?.abort();viewer.dispose();clearPrint();clearArchive();for(const item of items)release(item);});
