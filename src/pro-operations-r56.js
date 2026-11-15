/** R56 browser-local compatibility layer served by Cloudflare Worker; no document data sent. */
export const OPERATIONS_R56_JS=String.raw`/* Sunrise PDF PRO R56: non-invasive operations UI, including deployed R55 asset compatibility. */
(()=>{'use strict';
 if(window.__sunriseOperationsR56)return;window.__sunriseOperationsR56=true;
 // Queue metadata is bound to the row itself, not a separate FIFO.
 const byId=id=>document.getElementById(id);
 const sizeLabel=size=>{
  if(!Number.isFinite(size)||size<0)return '—';
  return size>=1048576?(size/1048576).toFixed(2)+' MB':size>=1024?(size/1024).toFixed(1)+' KB':Math.round(size)+' B';
 };
 // The legacy compiled bundle reads this checkbox, so enforce the new invariant before each click.
 document.addEventListener('click',event=>{
  if(!event.target?.closest?.('#convert, #print-prepare'))return;
  const control=byId('use-local-fonts');if(control)control.checked=true;
 },true);
 function rowCell(cls,text){
  const el=document.createElement('span');el.className=cls;el.textContent=text;return el;
 }
 function transform(){
  const list=byId('file-list');if(!list)return;
  const rows=Array.from(list.children).filter(row=>row.classList.contains('file-row'));
  rows.forEach((row,index)=>{
   const bytes=Number(row.dataset.bytes);
   const rowSize=Number.isSafeInteger(bytes)&&bytes>=0?bytes:null;
   if(row.dataset.r56!=='2'){
    const name=row.querySelector('.file-name');
    const body=name?.parentElement;
    const icon=row.querySelector('.file-icon');
    const actions=row.querySelector('.file-actions');
    if(!body||!actions)return;
    // Never move action buttons into the filename cell. The old inline tools
    // consumed the full width and made original filenames unreadable.
    body.className='file-body';
    if(name){name.title=name.textContent;name.setAttribute('aria-label',name.textContent);}
    const panel=document.createElement('div');
    panel.className='file-action-panel';
    panel.id='file-action-panel-'+String(row.dataset.id||index+1);
    panel.hidden=true;
    panel.setAttribute('role','group');
    panel.setAttribute('aria-label',(name?.textContent||'문서')+' 작업');
    panel.append(...Array.from(actions.children));
    const remark=document.createElement('span');
    remark.className='file-remark';
    const toggle=document.createElement('button');
    toggle.type='button';toggle.className='secondary file-action-toggle';
    toggle.textContent='작업';
    toggle.setAttribute('aria-controls',panel.id);
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label',(name?.textContent||'문서')+' 파일 작업 펼치기');
    toggle.addEventListener('click',()=>{
     const next=panel.hidden;
     // Keep one file's controls visible at a time. This preserves a compact
     // queue while allowing all review/download buttons to wrap below it.
     for(const other of list.querySelectorAll('.file-action-panel')){
      if(other===panel)continue;
      other.hidden=true;
      const otherToggle=other.parentElement?.querySelector('.file-action-toggle');
      if(otherToggle)otherToggle.setAttribute('aria-expanded','false');
     }
     panel.hidden=!next;
     toggle.setAttribute('aria-expanded',String(next));
    });
    remark.append(toggle);
    row.replaceChildren(
     rowCell('file-number',String(index+1)),body,
     rowCell('file-size',rowSize===null?'—':sizeLabel(rowSize)),
     rowCell('file-extension',String(icon?.textContent||'FILE').trim().toUpperCase()),
     remark,panel
    );
    row.dataset.r56='2';
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
   for(const label of ['구분','파일명','용량','파일속성','작업'])header.append(rowCell('file-list-heading',label));
   list.parentNode.insertBefore(wrap,list);wrap.append(header,list);
  }
  transform();
  new MutationObserver(transform).observe(list,{childList:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();`;
export const OPERATIONS_R56_CSS=String.raw`/* Sunrise PDF PRO DEV36: filename-first, accessible expandable action rows. */
.file-list-scroll{width:100%;max-height:440px;overflow-x:auto;overflow-y:auto;border:1px solid #dde7f1;border-radius:8px}
.file-list-header,.files .file-row{display:grid;grid-template-columns:38px minmax(0,1fr) 72px 64px 70px;gap:7px;align-items:center;min-width:0;box-sizing:border-box}
.file-list-header{position:sticky;top:0;z-index:2;background:#eaf1f8;border-bottom:1px solid #cfdeea;padding:8px 9px;color:#45637f;font-size:11px;font-weight:800}
.file-list-header span:nth-child(1),.file-list-header span:nth-child(3),.file-list-header span:nth-child(4),.file-list-header span:nth-child(5){text-align:center}
.files{display:block;min-width:0;max-height:none;overflow:visible;list-style:none;margin:0;padding:0}
.files .file-row{min-height:48px;padding:7px 9px;border-top:0;border-bottom:1px solid #edf2f7;line-height:1.4}
.files .file-row:nth-child(even){background:#fbfdff}
.files .file-row.is-active{background:#edf5ff}
.files .file-row:last-child{border-bottom:0}
.files .file-number,.files .file-size,.files .file-extension,.files .file-remark{font-size:11px;white-space:nowrap;text-align:center;color:#516d89}
.files .file-body{display:flex;flex-direction:column;align-items:stretch;gap:3px;min-width:0;overflow:visible}
.files .file-body .file-name{display:block;min-width:0;width:100%;max-width:100%;overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere;word-break:normal;font-size:12px;font-weight:700;line-height:1.45}
.files .file-body .file-meta{display:block;width:100%;max-width:100%;min-width:0;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px;color:#62798e}
.files .file-remark .file-action-toggle{font-size:11px;min-height:30px;padding:4px 9px;border-radius:6px;width:100%;white-space:nowrap}
.files .file-action-panel{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:3px;padding:10px;background:#f3f7fc;border:1px solid #dbe6f1;border-radius:7px;min-width:0}
.files .file-action-panel[hidden]{display:none!important}
.files .file-action-panel button,.files .file-action-panel a{font-size:11px;min-height:32px;padding:5px 9px;max-width:100%;white-space:normal;text-align:center}
.files .file-action-panel .file-delete{color:#9a3a3a;border-color:#ecd0d0;margin-left:auto}
.files .empty{min-width:0;text-align:center;padding:12px}
@media(max-width:620px){
 .file-list-scroll{max-height:410px}
 .file-list-header,.files .file-row{grid-template-columns:24px minmax(0,1fr) 52px 39px 46px;gap:3px}
 .file-list-header,.files .file-row{padding-left:5px;padding-right:5px}
 .files .file-body .file-name{font-size:11px}
 .files .file-size,.files .file-extension{font-size:10px}
 .files .file-remark .file-action-toggle{font-size:10px;padding:4px 3px}
}
`;
