import { prepareWasm, convertToPdf } from './converter.js';
const $=id=>document.getElementById(id);
let selected=null,pdfUrl=null,imgUrl=null,busy=false,ready=false,controller=null;
const status=(s)=>{$('status').textContent=s};
const sync=()=>{$('convert').disabled=!ready||!selected||busy;$('reset').disabled=!selected||busy;$('cancel').disabled=!busy;$('source').disabled=busy;};
function clearOutput(){
 if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}
 if(imgUrl){URL.revokeObjectURL(imgUrl);imgUrl=null;}
 $('preview').replaceChildren(document.createTextNode('PDF 생성 후 첫 페이지를 표시합니다.'));
 $('download').hidden=true;$('progress').value=0;$('pages').textContent='';
}
$('source').addEventListener('change',async e=>{
 const file=e.target.files?.[0];selected=null;clearOutput();
 if(!file){$('filename').textContent='선택된 파일이 없습니다.';sync();return;}
 if(!/\.(hwp|hwpx)$/i.test(file.name)||file.size<8){
   $('filename').textContent='HWP/HWPX 형식이며 최소 8바이트인 파일만 지원합니다.';sync();return;
 }
 selected=file;$('filename').textContent=file.name+' · '+(file.size/1048576).toFixed(2)+' MiB';
 status('문서를 선택했습니다. PDF 변환 시작 버튼을 눌러 주세요.');sync();
});
$('convert').addEventListener('click',async()=>{
 if(!selected||!ready||busy)return;
 const file=selected;
 controller=new AbortController();
 busy=true;clearOutput();sync();
 try{
  const result=await convertToPdf(file,info=>{
   $('progress').value=Math.min(99,Math.round(info.page/info.total*100));
   status('PDF 변환 중 · '+info.page+'/'+info.total+'쪽');
  },controller.signal);
  pdfUrl=URL.createObjectURL(result.pdf);imgUrl=URL.createObjectURL(result.preview);
  const img=new Image();img.src=imgUrl;img.alt='변환된 PDF 첫 페이지 렌더링';
  $('preview').replaceChildren(img);
  $('download').href=pdfUrl;
  $('download').download=file.name.replace(/\.hwpx?$/i,'')+'.pdf';
  $('download').hidden=false;$('progress').value=100;
  $('pages').textContent=result.pages+'쪽 · '+(result.bytes/1024).toFixed(1)+' KiB · 이미지 PDF';
  status('실제 PDF 생성 완료. PDF 다운로드 버튼을 눌러 저장하세요.');
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
prepareWasm().then(()=>{ready=true;status('변환 기능 초기화 완료. HWP/HWPX 문서를 선택하세요.');sync();})
 .catch(e=>{ready=false;status('변환 기능 초기화 실패: '+String(e?.message||e));sync();});
window.addEventListener('pagehide',()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);if(imgUrl)URL.revokeObjectURL(imgUrl);});
