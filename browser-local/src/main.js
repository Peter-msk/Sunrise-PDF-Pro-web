import './r56-ui.js';
import {createPdfViewer} from './pdf-viewer.js';
import {createConversionClock,formatDuration} from './conversion-clock.js';
import {emitProEvent,startProTelemetry,classifyProError,proFeature} from './pro-telemetry.js';
import {renderNativePrintPages} from './converter.js';
import {convertAnyToPdf as convertToPdf} from './convert-any.js';
import {inputKind,isHwp} from './input-types.js';
import {prepareNativePrint} from './native-print.js';
import {runBatch,makePdfArchive,uniquePdfNames} from './batch.js';
import {canRecoverFile,planConversion,recoveryEngine} from './conversion-recovery.mjs';
import {requestLocalFontAccess} from './local-fonts.js';
import {settleInstalledFonts,localFontCapability} from './local-font-policy.mjs';
const USE_PC_FONTS_BY_DEFAULT=true;
// Permission-granted FontData stays in this tab's memory only. A 'font-check'
// success must not be thrown away and queried again after the tab is hidden.
let verifiedPcFontData=null;
const $=id=>document.getElementById(id);
const conversionClock=createConversionClock();
const viewer=createPdfViewer($);
let items=[],active=null,busy=false,ready=true,controller=null,printJob=null,archiveUrl=null,nextId=0;
let requestedFileRecovery=null;
const status=value=>{$('status').textContent=value;};
const fontStatus=value=>{const node=$('pc-font-status');if(node)node.textContent=value;};
// Permission is requested only in a real click. Enumeration is NOT proof a
// font can be embedded into PDF. A separate PDF usage count is shown after
// the document has been rendered.
const fontCapability=localFontCapability();
fontStatus(!fontCapability.secure?'PC 글꼴 접근은 HTTPS 연결에서만 지원됩니다.':
 !fontCapability.supported?'이 브라우저는 PC 글꼴 파일 접근을 지원하지 않습니다. Chrome/Edge 데스크톱에서 확인하거나 글꼴 파일을 직접 추가하세요.':
 'PC 글꼴 조회 가능 여부: 아직 확인하지 않음 · 글꼴 연결 확인을 누르면 사이트 권한을 요청할 수 있습니다.');
// Browser background timer policies can stall a conversion. Never claim that
// a frozen/discarded page is running; refresh the visible progress on return.
let backgroundSince=null;
document.addEventListener('visibilitychange',()=>{
 if(!busy)return;
 if(document.hidden){backgroundSince=performance.now();return;}
 if(backgroundSince!==null){
  conversionClock.render();
  status('변환 탭 복귀 · 실제 작업 상태를 확인 중입니다. 브라우저가 페이지를 정지했다면 진행이 지연될 수 있습니다.');
  backgroundSince=null;
 }
});
$('font-check')?.addEventListener('click',async()=>{
 if(busy)return;
 const button=$('font-check');button.disabled=true;
 let request=null;
 try{
  request=requestLocalFontAccess();
  fontStatus('PC 글꼴 권한을 확인하는 중입니다. 브라우저 요청이 나타나면 허용 여부를 선택하세요.');
  const result=await settleInstalledFonts(request,{timeoutMs:30000});
  if(result.status==='ready')verifiedPcFontData=result.fonts;
  fontStatus(result.status==='ready'
   ?'PC 설치 글꼴 '+result.fonts.length+'개에 접근 가능합니다. 문서 지정 서체와 일치·글꼴 파일 읽기·PDF 실제 임베딩은 변환 결과에서 별도로 확인하세요.'
   :result.notice||'PC 글꼴에 접근할 수 없습니다. TTF/OTF를 직접 추가할 수 있습니다.');
 }catch(error){
  fontStatus('PC 글꼴 조회를 시작하지 못했습니다: '+String(error?.message||error));
 }finally{button.disabled=false;}
});
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
 const r=item.result;const mode=r.renderMode==='professional'?'글자·도형 보존':r.renderMode==='mixed'?'혼합 PDF · 일부 쪽 이미지, 해당 쪽 검색 불가':r.renderMode==='raster-compat'?'호환 이미지 PDF · 글자 검색 불가':r.renderMode==='spreadsheet-text'?'셀·글자 보존 · 원본 서식 제한':r.renderMode==='source-image'?'원본 이미지':'PDF';
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
  const li=document.createElement('li');li.className='file-row';li.dataset.id=String(item.id);li.dataset.bytes=String(item.file.size);li.dataset.state=item.state;li.classList.toggle('is-active',active===item);
  const icon=document.createElement('span');icon.className='file-icon';icon.textContent=(inputKind(item.file)||'FILE').toUpperCase();
  const body=document.createElement('div'),name=document.createElement('div'),meta=document.createElement('div');name.className='file-name';name.textContent=item.file.name;meta.className='file-meta';
  const labels={ready:'변환 대기',working:'변환 중',done:'변환 완료',failed:'변환 실패',invalid:'지원하지 않는 파일',cancelled:'취소됨 · 다시 변환 가능'};
  let message=labels[item.state]||'';
  if(item.error){message+=' · '+item.error;meta.classList.add('error');if(isHwp(item.file)&&/SVG_FILTER_EFFECT_UNSUPPORTED|PDF_STREAM_TIMEOUT/.test(item.error))message+=' · 아래 출력 및 글꼴 옵션에서 호환 방식 선택 후 다시 변환할 수 있습니다(이미지 PDF, 글자 검색 불가).';}
  if(item.result?.substituteFamilies?.length)message+=' · 대체 글꼴: '+item.result.substituteFamilies.join(', ');
  if(item.result?.warnings?.length)message+=' · '+item.result.warnings.join(' ');
  if(['done','failed','cancelled'].includes(item.state)&&Number.isFinite(item._proDurationMs))message+=' · 처리시간 '+formatDuration(item._proDurationMs);
  meta.textContent=message;body.append(name,meta);
  const actions=document.createElement('div');actions.className='file-actions';
  if(item.state==='done'){
   const preview=document.createElement('button');preview.className='secondary';preview.type='button';preview.textContent='PDF 검토';preview.disabled=busy;preview.addEventListener('click',()=>show(item));actions.append(preview);
   const link=document.createElement('a');link.className='download';link.href=item.pdfUrl;link.download=names[index];link.textContent='다운로드';actions.append(link);
  }else if(item.state!=='invalid'){
   const select=document.createElement('button');select.className='secondary';select.type='button';select.textContent='선택';select.disabled=busy;select.addEventListener('click',()=>{show(item);status(item.file.name+' 문서를 선택했습니다.');});actions.append(select);
  }
  // The per-file click is explicit consent for the narrowest usable recovery.
  // Never reprocess other files, change the global default, or downgrade silently.
  if(canRecoverFile(item)){
   const recover=document.createElement('button');
   recover.className='secondary compat-retry';recover.type='button';
   const hybrid=recoveryEngine(item)==='hybrid-filter';
   recover.textContent=hybrid?'이 파일만 혼합 PDF로 복구':'이 파일만 이미지 PDF로 복구';
   recover.title=hybrid
    ?'미지원 SVG 필터가 있는 쪽만 이미지로 출력하고 다른 쪽은 벡터로 유지합니다. 이미지 쪽은 검색 불가.'
    :'전체 페이지가 이미지로 변환되어 글자 검색·선택과 벡터 편집이 불가능합니다.';
   recover.setAttribute('aria-label',item.file.name+(hybrid
    ?' 혼합 PDF로 이 파일만 다시 변환 (필터가 있는 쪽만 이미지)'
    :' 호환 이미지 PDF로 이 파일만 다시 변환 (글자 검색 불가)'));
   recover.disabled=busy;
   recover.addEventListener('click',()=>{
    if(busy||!ready||!canRecoverFile(item))return;
    requestedFileRecovery=item;
    $('convert').click();
   });
   actions.append(recover);
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
$('pdf-engine').addEventListener('change',()=>{clearPrint();status($('pdf-engine').value==='compat-raster'?'호환 이미지 PDF 방식이 선택됐습니다. 글자 검색·선택은 불가능하며 원본과 출력 결과를 비교하세요.':$('pdf-engine').value==='hybrid-filter'?'혼합 방식 선택: 미지원 필터가 있는 쪽만 이미지로 출력하고 나머지는 벡터로 보존합니다. 원본과 대조하세요.':'원본 글자·도형 보존 출력 방식을 선택했습니다.');sync();});
$('convert').addEventListener('click',async()=>{
 if(busy||!ready)return;
 const requested=requestedFileRecovery;requestedFileRecovery=null;
 const plan=planConversion(items,$('pdf-engine').value,requested);
 const {pending,engine}=plan;
 if(!pending.length)return;
 conversionClock.start(pending.length);
 const fontFiles=Array.from($('pdf-font').files||[]);
 if(plan.recovery)status(engine==='hybrid-filter'
  ?'선택한 문서 1개만 혼합 PDF로 다시 변환합니다. 미지원 필터 쪽만 이미지로 처리하며 나머지 쪽은 벡터로 유지합니다.'
  :'선택한 문서 1개만 호환 이미지 PDF로 다시 변환합니다. 모든 쪽의 글자 검색은 불가능합니다.');
 if(engine==='compat-raster')fontStatus('호환 이미지 PDF는 페이지를 그림으로 출력하므로 PC 글꼴의 PDF 임베딩 절차를 사용하지 않습니다.');
 let fontsRequest=null,fontAccessNotice='';try{if(USE_PC_FONTS_BY_DEFAULT&&engine!=='compat-raster'&&pending.some(i=>isHwp(i.file)))fontsRequest=verifiedPcFontData!==null?Promise.resolve(verifiedPcFontData):requestLocalFontAccess();}catch(error){fontAccessNotice='PC 설치 글꼴 API를 사용할 수 없어 내장 글꼴로 진행합니다. 원본 글꼴은 TTF/OTF로 직접 선택할 수 있습니다.';}
 controller=new AbortController();const signal=controller.signal;busy=true;clearPrint();clearArchive();draw();let completed=0;
 try{
  let localFonts=null;if(fontsRequest){status('PC 글꼴 접근 권한 확인 중입니다. 브라우저의 글꼴 허용 요청을 확인하세요. 응답이 없으면 30초 후 내장 글꼴로 진행합니다.');const access=await settleInstalledFonts(fontsRequest,{signal});localFonts=access.fonts;fontAccessNotice=access.notice||(localFonts?.length?'PC 설치 글꼴 '+localFonts.length+'개 접근 확인 · 문서에 일치하는 서체를 우선 사용합니다.':'');if(access.status==='ready')verifiedPcFontData=localFonts;
   fontStatus(access.status==='ready'?'PC 글꼴 '+localFonts.length+'개에 접근 확인 · 실제 PDF 사용 여부는 변환 결과를 확인하세요.':fontAccessNotice);}
  await runBatch(pending,async(file,item)=>{
   item._proDiagStage='load';
   item.lastEngine=engine;
   item._proStartedMs=performance.now();
   item._lastDiagPhase='parse';item._lastDiagSentMs=item._proStartedMs;
   emitProEvent('convert_start',{feature:proFeature(file),stage:engine==='compat-raster'?'compat_raster':engine==='hybrid-filter'?'svg_vector':'none'});
   emitProEvent('convert_progress',{feature:proFeature(file),stage:'parse',duration_ms:0});
   const result=await convertToPdf(file,info=>{
    const phases=new Set(['svg_build','svg_normalize','image_gif','image_png',
     'image_filter','svg_sanitize','svg_preflight','svg_vector','svg_vector_done',
     'pdf_finalize','pdf_write','pdf_stream','pdf_done','compat_raster','compat_page_done','compat_save']);
    item._proDiagStage=info.stage==='load'?'load':
     info.stage==='fonts'?(info.detail==='read'?'font_read':info.detail==='bundled'?'font_bundle':
      info.detail==='measure'?'font_measure':info.detail==='scan'?'font_scan':'fonts'):
     phases.has(info.detail)?info.detail:'render';
    // Keep diagnostics private and sampled. Always include last-page
    // phase transitions and PDF finalization, where the production stall occurs.
    const phaseNow=performance.now();
    const gap=phaseNow-(item._lastDiagSentMs||0);
    const changed=item._lastDiagPhase!==item._proDiagStage;
    const important=info.page===info.total&&
     ['svg_build','image_png','svg_vector','pdf_finalize','pdf_write','pdf_stream','pdf_done']
      .includes(item._proDiagStage);
    if((item._proProgressEvents||0)<100&&
      ((changed&&(gap>=750||important))||gap>=45000)){
      emitProEvent('convert_progress',{feature:proFeature(file),
       stage:item._proDiagStage,
       duration_ms:Math.max(0,Math.round(phaseNow-item._proStartedMs))});
      item._proProgressEvents=(item._proProgressEvents||0)+1;
      item._lastDiagPhase=item._proDiagStage;
      item._lastDiagSentMs=phaseNow;
    }
    const part=info.stage==='load'?Math.min(.15,.15*info.loaded/Math.max(1,info.total)):info.stage==='fonts'?.15+.15*info.page/Math.max(1,info.total):.30+.69*info.page/Math.max(1,info.total);
    $('progress').value=Math.min(99,Math.round((completed+part)/pending.length*100));
    conversionClock.update(completed,part,info.stage==='fonts'?'글꼴 검사':info.stage==='load'?'문서 읽기':'페이지 출력');
    const fontStatus=info.detail==='read'?'PC 글꼴 파일 읽는 중':
     info.detail==='bundled'?'기본 글꼴 준비 중':info.detail==='measure'?'PDF 측정용 글꼴 준비 중':
     info.detail==='complete'?'PDF 출력 시작 중':'문서에 필요한 글꼴 검색 중';
    const stepLabels={
     svg_build:'문서 SVG 생성',svg_normalize:'SVG 전처리',
     image_gif:'GIF 그림 확인',image_png:'PNG 그림 확인·조정',
     image_filter:'그림 효과 검사',svg_sanitize:'SVG 안전 검사',
     svg_preflight:'글꼴·벡터 사전 검사',svg_vector:'SVG 벡터 PDF 출력',
     svg_vector_done:'페이지 PDF 출력 완료',
     pdf_finalize:'PDF 최종 저장 준비',pdf_write:'페이지 PDF 작성 중',pdf_stream:'PDF 바이트 생성 중',
     pdf_done:'PDF 바이트 생성 완료',compat_raster:'호환 이미지 페이지 생성',compat_page_done:'호환 이미지 페이지 완료',compat_save:'호환 PDF 저장 중'
    };
    const message=info.stage==='load'?'문서 읽는 중':
     info.stage==='fonts'?fontStatus:
     stepLabels[info.detail]||'페이지 변환';
    const byteStatus=(info.detail==='pdf_stream'||info.detail==='pdf_write')&&Number.isSafeInteger(info.bytes)
     ?' · '+(info.bytes/(1024*1024)).toFixed(1)+' MB 생성':'';
    // Show completed synchronous stage duration without claiming it could be cancelled mid-call.
    const elapsedStatus=Number.isSafeInteger(info.elapsedMs)&&info.elapsedMs>=1000
     ?' · 단계 소요 '+(info.elapsedMs/1000).toFixed(1)+'초':'';
    status(file.name+' · '+message+byteStatus+elapsedStatus+' · '+info.page+'/'+info.total+'쪽 · '+(completed+1)+'/'+pending.length+'개');
   },signal,{fontFiles,engine,localFonts});
   if(fontAccessNotice&&isHwp(file))result.warnings=[...(result.warnings||[]),fontAccessNotice];
   if(plan.recovery&&item===requested)result.warnings=[...(result.warnings||[]),
    plan.engine==='hybrid-filter'
     ?'기본 벡터 변환 오류('+plan.cause+') 후 이 문서만 혼합 PDF로 복구했습니다. 이미지 출력 쪽을 원본과 비교하세요.'
     :'벡터·혼합 변환 오류('+plan.cause+') 후 이 문서만 전체 이미지 PDF로 복구했습니다. 모든 페이지를 원본과 비교하세요.'];
   return result;
  },signal,item=>{
   if(item.state==='working'){conversionClock.itemStart();draw();return;}
   const durationMs=Number.isFinite(item._proStartedMs)?Math.max(0,Math.round(performance.now()-item._proStartedMs)):0;
   item._proDurationMs=durationMs;
   if(item.state==='done')emitProEvent('convert_success',{feature:proFeature(item.file),stage:'pdf',duration_ms:durationMs});
   if(item.state==='done'){
    item.pdfUrl=URL.createObjectURL(item.result.pdf);completed++;
    // PDF.js preview must not run concurrently with the next HWP WASM render.
   }
   else if(item.state==='failed'){emitProEvent('convert_failure',{feature:proFeature(item.file),stage:item._proDiagStage||'unknown',error_code:classifyProError(item.error),duration_ms:durationMs});completed++;}
   else if(item.state==='cancelled'){
    emitProEvent('convert_cancel',{feature:proFeature(item.file),
     stage:item._proDiagStage||'unknown',duration_ms:durationMs});
    completed++;
   }
   if(['done','failed','cancelled'].includes(item.state))conversionClock.itemDone(completed);
   draw();
  });
  if(!signal.aborted){
   $('progress').value=100;
   const done=items.filter(i=>i.state==='done').length,failed=items.filter(i=>i.state==='failed'||i.state==='invalid').length;
   status('변환 완료 '+done+'개'+(failed?' · 확인 필요 '+failed+'개':'')+'. 각 파일을 다운로드할 수 있습니다.');
   if(done>1){try{status('완료 파일 ZIP을 준비하는 중입니다.');const blob=await makePdfArchive(items,signal,(i,n)=>status('ZIP 준비 중 · '+i+'/'+n+'개'));archiveUrl=URL.createObjectURL(blob);$('download-all').href=archiveUrl;$('download-all').hidden=false;status('완료 '+done+'개'+(failed?' · 확인 필요 '+failed+'개':'')+'. ZIP 또는 개별 PDF를 다운로드하세요.');}catch(error){if(error?.name!=='AbortError')status('개별 PDF 다운로드 가능 · ZIP 생성 실패: '+String(error.message||error));else status('ZIP 생성이 취소되었습니다. 완료한 PDF는 개별 다운로드할 수 있습니다.');}}
  }else status('작업이 취소되었습니다. 완료된 PDF는 개별 다운로드할 수 있습니다.');
 }catch(error){const cancelled=signal.aborted||error?.name==='AbortError';status(cancelled?'작업이 취소되었습니다. 완료 PDF는 개별 다운로드 가능합니다.':'작업 실패: '+String(error?.message||error));conversionClock.finish(cancelled?'cancelled':'failed');}
 finally{
  if(conversionClock.active)conversionClock.finish(signal.aborted?'cancelled':pending.some(i=>i.state==='failed')?'partial':'done');
  busy=false;controller=null;
  try{
   draw();
   const selected=plan.recovery&&requested?.state==='done'?requested:active?.state==='done'?active:items.find(i=>i.state==='done');
   if(selected)show(selected);
  }catch(error){console.warn('R63_FINAL_PREVIEW_FAILED',error?.name||'Error');}
 }
});
$('print-prepare').addEventListener('click',async()=>{
 if(!active||!isHwp(active.file)||!ready||busy)return;const file=active.file;
 let fontsRequest=null,printFontNotice='';try{if(USE_PC_FONTS_BY_DEFAULT)fontsRequest=verifiedPcFontData!==null?Promise.resolve(verifiedPcFontData):requestLocalFontAccess();}catch(error){printFontNotice='PC 글꼴 API를 사용할 수 없어 내장 글꼴로 인쇄합니다.';}
 controller=new AbortController();const signal=controller.signal;busy=true;clearPrint();draw();
 try{let localFonts=null;if(fontsRequest){const access=await settleInstalledFonts(fontsRequest,{signal});localFonts=access.fonts;if(access.status==='ready')verifiedPcFontData=localFonts;printFontNotice=access.notice||(localFonts?.length?'PC 설치 글꼴 '+localFonts.length+'개 접근 확인 · 일치하는 서체를 우선 사용합니다.':'');}const {pages,fontRegistry}=await renderNativePrintPages(file,info=>{status(file.name+' · 인쇄 준비 중'+(info.page?' '+info.page+'/'+info.total+'쪽':''));},signal,Array.from($('pdf-font').files||[]),localFonts);if(signal.aborted)throw new DOMException('취소됨','AbortError');printJob=await prepareNativePrint(pages,document,fontRegistry,signal);status('인쇄 준비 완료. PDF로 인쇄/저장을 누른 뒤 PDF 저장 대상을 선택하세요.'+(printFontNotice?' · '+printFontNotice:''));}
 catch(error){clearPrint();status(error?.name==='AbortError'?'인쇄 준비가 취소되었습니다.':'인쇄 준비 실패: '+String(error?.message||error));}
 finally{busy=false;controller=null;draw();}
});
$('print-save').addEventListener('click',()=>{if(printJob&&!busy){try{printJob.print();status('인쇄 창에서 PDF로 저장을 선택하세요.');}catch(error){status('인쇄 실패: '+String(error?.message||error));}}});
$('cancel').addEventListener('click',()=>controller?.abort());
$('reset').addEventListener('click',()=>{requestedFileRecovery=null;conversionClock.reset();for(const item of items)release(item);items=[];clearPrint();clearArchive();$('progress').value=0;show(null);draw();status('새 문서를 선택해 주세요.');});
viewer.open(null);status('변환 준비 완료. 한글·엑셀·이미지를 여러 개 선택할 수 있습니다.');sync();
window.addEventListener('pagehide',()=>{conversionClock.reset();controller?.abort();viewer.dispose();clearPrint();clearArchive();for(const item of items)release(item);});


startProTelemetry();
