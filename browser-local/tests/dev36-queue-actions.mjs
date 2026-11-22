import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {OPERATIONS_R56_JS,OPERATIONS_R56_CSS} from '../../src/pro-operations-r56.js';

function fixture(){
 const filename='2026년 환경영향평가 보고서-표, 머리말, 그림, 본문 검증 원본.hwp';
 const row=(number)=>'<li class="file-row" data-id="'+number+'" data-bytes="30124567">'+
  '<span class="file-icon">HWP</span><div>'+
  '<div class="file-name">'+filename+'</div>'+
  '<div class="file-meta">변환 완료 · 글꼴 재검토</div></div>'+
  '<div class="file-actions"><button type="button">PDF 검토</button>'+
  '<button type="button">PDF 벡터 품질 확인</button>'+
  '<button type="button">PDF 글꼴 확인</button>'+
  '<a href="blob:test" download="report.pdf">다운로드</a>'+
  '<button type="button">삭제</button></div></li>';
 return {html:'<!doctype html><html lang="ko"><body><div class="queue">'+
  '<ul class="files" id="file-list">'+row(1)+row(2)+'</ul></div></body></html>',filename};
}
async function mount(){
 const {html,filename}=fixture();
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://sunrise.example/local/'});
 const firstAction=dom.window.document.querySelector('.file-actions button');
 let invoked=0;firstAction.addEventListener('click',()=>invoked++);
 dom.window.eval(OPERATIONS_R56_JS);
 await new Promise(resolve=>dom.window.setTimeout(resolve,0));
 return {dom,filename,invoked:()=>invoked};
}
test('DEV36: original filename stays outside the operation panel and is never shortened',async()=>{
 const {dom,filename}=await mount();
 try{
  const row=dom.window.document.querySelector('.file-row');
  const name=row.querySelector('.file-body .file-name');
  const actions=row.querySelector('.file-action-panel');
  assert.equal(name.textContent,filename);
  assert.equal(name.parentElement.contains(actions),false);
  assert.equal(row.children.length,6);
  assert.equal(row.dataset.r56,'2');
  assert.equal(actions.hidden,true);
  assert.equal(row.querySelector('.file-remark .file-action-toggle').textContent,'작업');
  assert.deepEqual(Array.from(actions.children).map(x=>x.textContent),
   ['PDF 검토','PDF 벡터 품질 확인','PDF 글꼴 확인','다운로드','삭제']);
 }finally{dom.window.close();}
});
test('DEV36: button toggles one file drawer and existing event listeners still work',async()=>{
 const {dom,invoked}=await mount();
 try{
  const rows=Array.from(dom.window.document.querySelectorAll('.file-row'));
  const first=rows[0].querySelector('.file-action-toggle');
  const second=rows[1].querySelector('.file-action-toggle');
  const p1=rows[0].querySelector('.file-action-panel'),p2=rows[1].querySelector('.file-action-panel');
  first.click();assert.equal(first.getAttribute('aria-expanded'),'true');
  assert.equal(p1.hidden,false);
  p1.querySelector('button').click();assert.equal(invoked(),1);
  second.click();assert.equal(p1.hidden,true);assert.equal(p2.hidden,false);
  assert.equal(first.getAttribute('aria-expanded'),'false');
  second.click();assert.equal(p2.hidden,true);
  assert.equal(second.getAttribute('aria-expanded'),'false');
 }finally{dom.window.close();}
});
test('DEV36: no old inline tools; both Worker and standalone CSS allow wrapped filenames',()=>{
 const standalone=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const externalCSS=readFileSync(new URL('../src/styles/file-queue.css',import.meta.url),'utf8');
 assert.doesNotMatch(OPERATIONS_R56_JS,/body\.append\(tools\)/);
 assert.match(OPERATIONS_R56_CSS,/file-action-panel/);
 assert.match(OPERATIONS_R56_CSS,/white-space:normal/);
 assert.match(OPERATIONS_R56_CSS,/overflow-wrap:anywhere/);
 assert.match(standalone,/href="\.\/src\/styles\/file-queue\.css"/);
 assert.doesNotMatch(standalone,/<style\b/);
 assert.equal(externalCSS.trim(),OPERATIONS_R56_CSS.trim());
});
