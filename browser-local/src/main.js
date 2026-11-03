import { prepareWasm, convertToPdf } from './converter.js';
const $=id=>document.getElementById(id);
let selected=null,pdfUrl=null,imgUrl=null,busy=false,ready=false,controller=null;
const status=(s)=>{$('status').textContent=s};
const sync=()=>{$('convert').disabled=!ready||!selected||busy;$('reset').disabled=!selected||busy;$('cancel').disabled=!busy;$('source').disabled=busy;$('quality').disabled=busy;$('searchable').disabled=busy;};
function clearOutput(){
 if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}
 if(imgUrl){URL.revokeObjectURL(imgUrl);imgUrl=null;}
 $('preview').replaceChildren(document.createTextNode('PDF 생성 후 첫 페이지를 표시합니다.'));
 $('download').hidden=true;$('progress').value=0;$('pages').textContent='';
}
$('source').addEventListener('change',async e=>{
 const file=e.target.files?.[0];selected=null;clearOutput();
 if(!file){$('filename').textContent='선택된 파일이 없습니다.';sync();return;}
 if(!/\.(hwp|hwpx)$/i.test(file.name)||file.size>20*1024*1024||file.size<8){
   $('filename').textContent='HWP/HWPX 20MiB 이하만 지원합니다.';sync();return;
 }
 selected=file;$('filename').textContent=file.name+' · '+(file.size/1048576).toFixed(2)+' MiB';
 status('파일을 선택했습니다. 서버로 전송하지 않습니다.');sync();
});
$('convert').addEventListener('click',async()=>{
 if(!selected||!ready||busy)return;
 const file=selected;
 controller=new AbortController();
 busy=true;clearOutput();sync();
 try{
  const result=await convertToPdf(file,info=>{
   $('progress').value=Math.min(99,Math.round(info.page/info.total*100));
   status('브라우저 내부 PDF 생성 중 · '+info.page+'/'+info.total+'쪽');
  },controller.signal,$('quality').value,$('searchable').checked?'searchable':'image');
  pdfUrl=URL.createObjectURL(result.pdf);imgUrl=URL.createObjectURL(result.preview);
  const img=new Image();img.src=imgUrl;img.alt='변환된 PDF 첫 페이지 렌더링';
  $('preview').replaceChildren(img);
  $('download').href=pdfUrl;
  $('download').download=file.name.replace(/\.hwpx?$/i,'')+'.pdf';
  $('download').hidden=false;$('progress').value=100;
  const coverage=result.textSummary;
  const coverageText=result.renderMode==='hybrid-searchable'?
   ' · 검색 계층 '+coverage.embedded+'개 (누락 '+coverage.skipped+'개)':
   ' · 이미지 PDF (검색 계층 없음)';
  $('pages').textContent=result.pages+'쪽 · '+(result.bytes/1024).toFixed(1)+' KiB'+coverageText;
  status(result.renderMode==='hybrid-searchable'?
   'PDF 생성 완료: 한글 검색·복사 계층이 포함됐습니다. 복잡한 글꼴·도면 조판은 원본과 비교하세요.':
   'PDF 생성 완료: 이미지 PDF입니다. 다운로드할 수 있습니다.');
 }catch(err){
  if(err?.name==='AbortError'){
   clearOutput();status('PDF 변환이 취소되었습니다. 파일을 다시 선택하거나 재시도할 수 있습니다.');
  }else{
   clearOutput();status('변환 실패: '+String(err?.message||err));
  }
 }
 finally{controller=null;busy=false;sync();}
});
$('cancel').addEventListener('click',()=>controller?.abort());
$('reset').addEventListener('click',()=>{selected=null;$('source').value='';clearOutput();$('filename').textContent='선택된 파일이 없습니다.';status('새 문서를 선택해 주세요.');sync();});
prepareWasm().then(()=>{ready=true;status('공식 rhwp WASM 초기화 완료. HWP/HWPX 문서를 선택하세요.');sync();})
 .catch(e=>{ready=false;status('rhwp WASM 초기화 실패: '+String(e?.message||e));sync();});
window.addEventListener('pagehide',()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);if(imgUrl)URL.revokeObjectURL(imgUrl);});
