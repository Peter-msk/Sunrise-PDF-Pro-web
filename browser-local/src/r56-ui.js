/* Sunrise PDF PRO R56: non-invasive operations UI, including deployed R55 asset compatibility. */
(()=>{'use strict';
 if(window.__sunriseOperationsR56)return;window.__sunriseOperationsR56=true;
 // Queue metadata is bound to the row itself, not a separate FIFO.
 const byId=id=>document.getElementById(id);
 const sizeLabel=size=>{
  if(!Number.isFinite(size)||size<0)return '—';
  return size>=1048576?(size/1048576).toFixed(2)+' MB':size>=1024?(size/1024).toFixed(1)+' KB':Math.round(size)+' B';
 };
 // Font access is managed by the explicit, user-activated request in main.js.
 function rowCell(cls,text){
  const el=document.createElement('span');el.className=cls;el.textContent=text;return el;
 }
 function transform(){
  const list=byId('file-list');if(!list)return;
  const rows=Array.from(list.children).filter(row=>row.classList.contains('file-row'));
  rows.forEach((row,index)=>{
   const bytes=Number(row.dataset.bytes);
   const rowSize=Number.isSafeInteger(bytes)&&bytes>=0?bytes:null;
   if(row.dataset.r56!=='1'){
    const name=row.querySelector('.file-name');
    const body=name?.parentElement;
    const icon=row.querySelector('.file-icon');
    const actions=row.querySelector('.file-actions');
    if(!body||!actions)return;
    const remove=Array.from(actions.children).find(node=>node.tagName==='BUTTON'&&node.textContent.trim()==='삭제');
    const tools=document.createElement('span');tools.className='file-inline-tools';
    for(const action of Array.from(actions.children)){if(action!==remove)tools.append(action);}
    body.className='file-body';body.append(tools);
    if(name){name.title=name.textContent;name.setAttribute('aria-label',name.textContent);}
    const fmt=rowCell('file-size',rowSize===null?'—':sizeLabel(rowSize));
    const ext=rowCell('file-extension',String(icon?.textContent||'FILE').trim().toUpperCase());
    const remark=document.createElement('span');remark.className='file-remark';
    if(remove){remove.classList.add('file-delete');remove.setAttribute('aria-label',(name?.textContent||'문서')+' 파일 목록에서 삭제');remark.append(remove);}
    row.replaceChildren(rowCell('file-number',String(index+1)),body,fmt,ext,remark);
    row.dataset.r56='1';
   }
   const number=row.querySelector('.file-number');if(number)number.textContent=String(index+1);
   const size=row.querySelector('.file-size');if(size)size.textContent=rowSize===null?'—':sizeLabel(rowSize);
   const meta=row.querySelector('.file-meta');if(meta)meta.title=meta.textContent;
  });
 }
 function init(){
  const checkbox=byId('use-local-fonts');
  if(checkbox){
   checkbox.checked=true;
   checkbox.setAttribute('aria-hidden','true');
   const label=checkbox.closest('label');if(label)label.hidden=true;
   const detail=label?.nextElementSibling;
   if(detail?.tagName==='P'){
    detail.textContent=typeof window.queryLocalFonts==='function'
      ?'PC 설치 글꼴은 변환·인쇄 시 자동으로 확인합니다. 최초 사용 시 브라우저의 글꼴 접근 권한을 허용하세요. 지원하지 않는 글꼴은 내장 글꼴로 대체되며 원본과 다를 수 있습니다.'
      :'PC 글꼴 자동 사용은 Windows/Mac용 Chrome·Edge 지원 환경에서 동작합니다. 현재 브라우저에서는 내장 글꼴을 사용하며, 필요한 TTF/OTF를 직접 추가할 수 있습니다.';
   }
  }
  const list=byId('file-list');
  if(!list)return;
  if(!document.querySelector('.file-list-scroll')){
   const wrap=document.createElement('div');wrap.className='file-list-scroll';wrap.setAttribute('role','region');
   wrap.setAttribute('aria-label','변환 파일 목록, 좌우로 스크롤 가능');
   const header=document.createElement('div');header.className='file-list-header';header.setAttribute('aria-hidden','true');
   for(const label of ['구분','파일명','용량','파일속성','비고'])header.append(rowCell('file-list-heading',label));
   list.parentNode.insertBefore(wrap,list);wrap.append(header,list);
  }
  transform();
  new MutationObserver(transform).observe(list,{childList:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();