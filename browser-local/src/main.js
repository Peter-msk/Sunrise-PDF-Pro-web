import './r56-ui.js';
import {createPdfViewer} from './pdf-viewer.js';
import {describeConversionError,outputModeText} from './user-output-copy.mjs';
import {createConversionClock,formatDuration} from './conversion-clock.js';
import {emitProEvent,startProTelemetry,classifyProError,proFeature,newProOperationId} from './pro-telemetry.js';
import {renderNativePrintPages} from './converter.js';
import {convertAnyToPdf as convertToPdf} from './convert-any.js';
import {inputKind,isHwp} from './input-types.js';
import {prepareNativePrint} from './native-print.js';
import {runBatch,makePdfArchive,uniquePdfNames,shouldAutoArchive} from './batch.js';
import {buildLocalBatchQaReport,QA_BUILD_REVISION,qaDeploymentChannel} from './local-batch-qa.mjs';
import {canRecoverFile,planConversion,planBulkRecovery,planSingleRetry,localFailureAdvice,recoveryEngine,recoveryCode} from './conversion-recovery.mjs';
import {createLocalFontCache,requestLocalFontAccess} from './local-fonts.js';
import {settleInstalledFonts,localFontCapability,createVerifiedFontSnapshot} from './local-font-policy.mjs';
const USE_PC_FONTS_BY_DEFAULT=true;
// Only an explicit recent check is reusable once; each later conversion queries current fonts.
const verifiedPcFontData=createVerifiedFontSnapshot();let fontCheckPending=false;
function beginPcFontRequest(){
 const verified=verifiedPcFontData.take();
 return verified!==null?Promise.resolve(verified):requestLocalFontAccess();
}
try{globalThis.navigator?.permissions?.query?.({name:'local-fonts'}).then(p=>{
 p.addEventListener?.('change',()=>verifiedPcFontData.clear());
}).catch(()=>{});}catch{/* optional permission API */}
const $=id=>document.getElementById(id);
// Technical revision is recorded in optional local QA output only.
// Browser page title and user controls must not expose internal build IDs.
const conversionClock=createConversionClock();
const viewer=createPdfViewer($);
let items=[],active=null,busy=false,ready=true,controller=null,printJob=null,archiveUrl=null,nextId=0;
let requestedFileRecovery=null,requestedBulkRecovery=false,requestedFileRetry=null,requestedBatchEngine=null;
const status=value=>{$('status').textContent=value;};
const fontStatus=value=>{const node=$('pc-font-status');if(node)node.textContent=value;};
// Permission is requested only in a real click. Enumeration is NOT proof a
// font can be embedded into PDF. A separate PDF usage count is shown after
// the document has been rendered.
const fontCapability=localFontCapability();
// The web's bundled RHWP WASM/PDF engine works without Hancom Office on
// Windows, macOS or mobile. OS font enumeration is an optional quality aid.
const deviceFontsAvailable=fontCapability.secure&&fontCapability.supported;
if(!deviceFontsAvailable){
 const check=$('font-check');
 if(check){check.disabled=true;check.title='이 기기에서는 설치 글꼴 조회를 지원하지 않습니다. 한컴오피스 설치는 필요 없으며 TTF/OTF를 직접 추가할 수 있습니다.';}
}
fontStatus(!fontCapability.secure?'이 페이지에서는 설치 글꼴 접근 권한을 사용할 수 없습니다. 웹 PDF 변환은 계속 가능하며 내장 글꼴 또는 직접 선택한 TTF/OTF로 진행합니다.':
 !fontCapability.supported?'모바일·이 브라우저에서는 설치 글꼴 자동 조회를 지원하지 않습니다. 한컴오피스 없이 웹에서 PDF로 변환하며, 내장 글꼴을 쓰거나 원본 TTF/OTF를 추가할 수 있습니다.':
 'PC 설치 글꼴을 선택적으로 사용할 수 있습니다. 원본 서체와 일치하는지 확인하려면 글꼴 연결 확인을 누르세요. 한컴오피스 설치는 필요 없습니다.');
// Browser background timer policies can stall a conversion. Never claim that
// a frozen/discarded page is running; refresh the visible progress on return.
let backgroundSince=null,browserFrozen=false;
function refreshBrowserLifecycle(returned=false){
 conversionClock.setLifecycle({isHidden:document.hidden,isFrozen:browserFrozen});
 if(!busy||controller?.signal.aborted)return;
 if(document.hidden||browserFrozen){
  backgroundSince??=performance.now();
  return;
 }
 if(returned&&backgroundSince!==null){
  // Never auto-restart a previously active converter. A thawed Promise
  // continues itself; a discarded tab has no in-memory work to restore.
  backgroundSince=null;
  status('변환 탭 복귀 · 실제 진행 상태를 다시 확인 중입니다. 중단된 작업을 중복 실행하지 않습니다.');
 }
}
document.addEventListener('visibilitychange',()=>{
 refreshBrowserLifecycle(!document.hidden);
});
document.addEventListener('freeze',()=>{
 browserFrozen=true;refreshBrowserLifecycle();
});
document.addEventListener('resume',()=>{
 browserFrozen=false;refreshBrowserLifecycle(true);
});
window.addEventListener('pageshow',event=>{
 if(event.persisted){browserFrozen=false;refreshBrowserLifecycle(true);}
});
$('font-check')?.addEventListener('click',async()=>{
 if(busy||fontCheckPending)return;
 fontCheckPending=true;verifiedPcFontData.clear();sync();
 let request=null;
 try{
  request=requestLocalFontAccess();
  fontStatus('PC 글꼴 권한을 확인하는 중입니다. 브라우저 요청이 나타나면 허용 여부를 선택하세요.');
  const result=await settleInstalledFonts(request,{timeoutMs:30000});
  if(result.status==='ready')verifiedPcFontData.set(result.fonts);
  fontStatus(result.status==='ready'
   ?'PC 설치 글꼴 '+result.fonts.length+'개에 접근 가능합니다. 문서 지정 서체와 일치·글꼴 파일 읽기·PDF 실제 임베딩은 변환 결과에서 별도로 확인하세요.'
   :result.notice||'PC 글꼴에 접근할 수 없습니다. TTF/OTF를 직접 추가할 수 있습니다.');
 }catch(error){
  fontStatus('PC 글꼴 조회를 시작하지 못했습니다: '+String(error?.message||error));
 }finally{fontCheckPending=false;sync();}
});
function clearPrint(){
 if(printJob){printJob.dispose();printJob=null;}
 // A file switch can happen without draw(): remove any stale row-level save
 // action before it could misleadingly invoke a disposed print job.
 for(const button of $('file-list').querySelectorAll('.native-print-save'))button.remove();
}
function clearArchive(){if(archiveUrl)URL.revokeObjectURL(archiveUrl);archiveUrl=null;$('download-all').hidden=true;$('download-all').removeAttribute('href');}
function release(item){if(item.pdfUrl)URL.revokeObjectURL(item.pdfUrl);if(item.imgUrl)URL.revokeObjectURL(item.imgUrl);}
function show(item){
 // A reselect of the same document must not discard its already prepared
 // browser-print frame; switching documents must always dispose that frame.
 if(active!==item)clearPrint();
 active=item;
 for(const row of $('file-list').children)row.classList.toggle('is-active',row.dataset.id===String(item?.id));
 $('viewer-file').textContent=item?.file.name||'문서를 선택하세요';
 const link=$('active-download');link.hidden=!item?.result;
 if(!item?.result){link.removeAttribute('href');$('pages').textContent='';viewer.open(null);sync();return;}
 link.href=item.pdfUrl;link.download=getPdfNames()[items.indexOf(item)];
 const r=item.result;const mode=outputModeText[r.renderMode]||'PDF';
 $('pages').textContent=r.pages+'쪽 · '+mode;
viewer.open(item.result.pdf);sync();
}
function sync(){
 if($('font-check'))$('font-check').disabled=!deviceFontsAvailable||busy||fontCheckPending;
 $('qa-export').disabled=!items.length;
 const pending=items.some(i=>['ready','failed','cancelled'].includes(i.state));
 $('convert').disabled=!ready||busy||fontCheckPending||!pending;$('reset').disabled=busy||!items.length;$('cancel').disabled=!busy;
 const hybridPending=items.some(i=>isHwp(i.file)&&['ready','failed','cancelled'].includes(i.state));
 $('convert-hybrid').hidden=!hybridPending;
 $('convert-hybrid').disabled=!ready||busy||fontCheckPending||!hybridPending;
 const bulk=$('recover-failed'),recoverable=items.filter(canRecoverFile).length;
 if(bulk){bulk.hidden=recoverable===0;bulk.disabled=!ready||busy||fontCheckPending||recoverable===0;
  bulk.textContent='실패 파일 '+recoverable+'개만 복구';
  bulk.title='사용자가 직접 누를 때만 실패 파일을 다시 변환합니다. 글꼴 누락·PDF 저장 오류는 문서 전체가 이미지 PDF로 저장되어 글자 검색이 불가능합니다. 지원되지 않는 그림 효과가 있으면 해당 쪽만 이미지로 복구할 수 있습니다.';}
 for(const id of ['source','pdf-font','pdf-engine'])$(id).disabled=busy;
 $('print-prepare').disabled=!ready||busy||fontCheckPending||!active||!isHwp(active.file)||active.state==='invalid';$('print-save').disabled=busy||!printJob;
 $('total-count').textContent=items.length;$('done-count').textContent=items.filter(i=>i.state==='done').length;
 $('failed-count').textContent=items.filter(i=>['failed','invalid'].includes(i.state)).length;
 const zipPrepare=$('prepare-archive');if(zipPrepare){zipPrepare.hidden=busy||!!archiveUrl||items.filter(i=>i.state==='done').length<2;zipPrepare.disabled=busy;}
 $('queue-count').textContent=items.length+'개 파일';$('summary-state').textContent=busy?'처리 중':items.some(i=>i.state==='failed'||i.state==='invalid')?'확인 필요':items.some(i=>i.state==='done')?'결과 준비':'대기 중';
}
let pdfNameCache=null,pdfNameList=null,pdfNameCount=-1;
function getPdfNames(){
 if(pdfNameList!==items||pdfNameCount!==items.length){
  pdfNameCache=uniquePdfNames(items.map(i=>i.file));
  pdfNameList=items;pdfNameCount=items.length;
 }
 return pdfNameCache;
}
function createFileRow(item,index,names){
  const li=document.createElement('li');li.className='file-row';li.dataset.id=String(item.id);li.dataset.bytes=String(item.file.size);li.dataset.state=item.state;li.classList.toggle('is-active',active===item);
  const icon=document.createElement('span');icon.className='file-icon';icon.textContent=(inputKind(item.file)||'FILE').toUpperCase();
  const body=document.createElement('div'),name=document.createElement('div'),meta=document.createElement('div');name.className='file-name';name.textContent=item.file.name;meta.className='file-meta';
  const labels={ready:'변환 대기',working:'변환 중',done:'변환 완료',failed:'변환 실패',invalid:'지원하지 않는 파일',cancelled:'취소됨 · 다시 변환 가능'};
  let message=labels[item.state]||'';
  if(item.error){meta.classList.add('error');const guidance=localFailureAdvice(item.error);message+=' · '+(guidance||describeConversionError(item.error));if(isHwp(item.file)&&/SVG_FILTER_EFFECT_UNSUPPORTED|SVG_FILTER_PIPELINE_FAILED|SVG_VECTOR_RENDER_FAILED|PDF_STREAM_TIMEOUT|FONT_GLYPH_MISSING|SVG_RENDER_SOURCE_CHARS_LIMIT/.test(item.error))message+=' · 아래 출력 및 글꼴 옵션에서 호환 방식 선택 후 다시 변환할 수 있습니다(이미지 PDF, 글자 검색 불가).';}
  // The output list is for users. Technical font/vector metrics and verbose
  // diagnostics remain available in the local QA report and engine logs.
  if(item.state==='done'&&isHwp(item.file)&&item.result?.rasterPages>0)
   message+=' · 이미지 PDF: 해당 페이지는 글자 선택이 제한됩니다.';
  if(item.state==='failed'&&Number.isSafeInteger(item._proLastPage)&&item._proLastPage>0)message+=' · 마지막 처리 '+item._proLastPage+'쪽';
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
    ?'지원되지 않는 그림 효과가 있는 쪽만 이미지로 출력하고 다른 쪽은 글자·도형을 보존합니다. 이미지 쪽은 검색할 수 없습니다.'
    :'전체 페이지가 이미지로 변환되어 글자 검색·선택과 벡터 편집이 불가능합니다.';
   recover.setAttribute('aria-label',item.file.name+(hybrid
    ?' 혼합 PDF로 이 파일만 다시 변환 (필터가 있는 쪽만 이미지)'
    :' 호환 이미지 PDF로 이 파일만 다시 변환 (글자 검색 불가)'));
   recover.disabled=busy;
   recover.addEventListener('click',()=>{
    if(busy||!ready||fontCheckPending||!canRecoverFile(item))return;
    requestedFileRetry=null;requestedFileRecovery=item;
    $('convert').click();
   });
   actions.append(recover);
  }
   // Generic one-file retry preserves the user's output choice. Specialized
   // HWP recovery remains the only action that changes output quality.
   if(['failed','cancelled'].includes(item.state)&&inputKind(item.file)&&!canRecoverFile(item)){
    const retry=document.createElement('button');
    retry.type='button';retry.className='secondary file-retry';
    retry.textContent='이 파일만 다시 시도';
    retry.title='현재 출력 설정으로 이 파일만 다시 변환합니다. 이미 완료된 PDF와 다른 실패·대기 파일은 유지합니다.';
    retry.setAttribute('aria-label',item.file.name+' 파일만 다시 변환');
    retry.disabled=busy||!ready;
    retry.addEventListener('click',()=>{
     if(busy||!ready||fontCheckPending||!items.includes(item)||!['failed','cancelled'].includes(item.state)||!inputKind(item.file))return;
     requestedFileRecovery=null;requestedBulkRecovery=false;requestedFileRetry=item;
     $('convert').click();
    });
    actions.append(retry);
   }
   // Chrome/Edge printing can recover a failed vector PDF caused by a
   // missing glyph or unsupported SVG effect. This is always user-triggered;
   // no inferred font replacement, raster downgrade, or success status.
   const nativePrintableError=item.state==='failed'&&isHwp(item.file)&&
    (recoveryCode(item.error)==='SVG_FILTER_EFFECT_UNSUPPORTED'||
     /\bFONT_GLYPH_MISSING\b/.test(item.error||''));
   if(nativePrintableError){
    const native=document.createElement('button');
    native.type='button';native.className='secondary native-print-recovery';
    native.textContent='브라우저 PDF 인쇄 준비';
    native.title='Chrome/Edge 인쇄 방식으로 준비합니다. 글꼴이 부족하면 다른 서체로 보일 수 있고 일부 그림 효과는 이미지로 출력될 수 있습니다. PDF 저장 후 모든 페이지의 글꼴·표·그림을 원본과 반드시 대조하세요.';
    native.disabled=busy||!ready;
    native.addEventListener('click',()=>{
     if(busy||!ready||fontCheckPending||!items.includes(item)||item.state!=='failed'||!isHwp(item.file)||
      !(recoveryCode(item.error)==='SVG_FILTER_EFFECT_UNSUPPORTED'||
        /\bFONT_GLYPH_MISSING\b/.test(item.error||'')))return;
     show(item);
     $('print-prepare').click();
    });
    actions.append(native);
   }
  if(printJob&&active===item&&!busy){
   const print=document.createElement('button');
   print.type='button';print.className='secondary native-print-save';
   print.textContent='브라우저 PDF로 저장';
   print.title='브라우저 인쇄창에서 PDF 저장 대상을 직접 선택하세요. 저장 성공 여부를 앱이 자동으로 판단하지 않습니다.';
   print.addEventListener('click',()=>{$('print-save').click();});
   actions.append(print);
  }
  const remove=document.createElement('button');remove.className='secondary';remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',item.file.name+' 목록에서 삭제');remove.disabled=busy;remove.addEventListener('click',()=>{release(item);items=items.filter(i=>i!==item);clearArchive();if(active===item)show(items.find(i=>i.state==='done')||items[0]||null);draw();status('목록을 변경했습니다.');});actions.append(remove);
  li.append(icon,body,actions);
  return li;
}
function draw(changed=null){
 const list=$('file-list'),names=getPdfNames();
 if(changed){
  const index=items.indexOf(changed);
  if(index>=0&&list.children.length===items.length){
   const old=list.querySelector('.file-row[data-id="'+changed.id+'"]');
   if(old){old.replaceWith(createFileRow(changed,index,names));sync();return;}
  }
 }
 const fragment=document.createDocumentFragment();
 if(!items.length){const li=document.createElement('li');li.className='empty';li.textContent='선택한 문서가 여기에 표시됩니다.';fragment.append(li);}
 items.forEach((item,index)=>fragment.append(createFileRow(item,index,names)));
 list.replaceChildren(fragment);
 sync();
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
$('pdf-font').addEventListener('change',()=>{clearPrint();const files=Array.from($('pdf-font').files||[]);if(files.some(f=>!/\.(ttf|otf)$/i.test(f.name))){$('pdf-font').value='';$('font-info').textContent='TTF/OTF 글꼴만 선택할 수 있습니다.';}else $('font-info').textContent=files.length?'선택한 글꼴 '+files.length+'개를 기본 글꼴보다 우선합니다.':'원본과 같은 서체가 필요하면 TTF/OTF를 추가하세요. 없는 글꼴은 대체되며 결과에 표시됩니다.';draw();});
$('pdf-engine').addEventListener('change',()=>{clearPrint();status($('pdf-engine').value==='direct-trial'?'정밀 변환은 원본과 일치하는 글꼴이 필요하며 일부 문서의 특수 서식을 지원하지 않을 수 있습니다.':$('pdf-engine').value==='compat-raster'?'호환 이미지 PDF 방식이 선택됐습니다. 글자 검색·선택은 불가능하며 원본과 출력 결과를 비교하세요.':$('pdf-engine').value==='hybrid-filter'?'혼합 방식 선택: 미지원 필터가 있는 쪽만 이미지로 출력하고 나머지는 벡터로 보존합니다. 원본과 대조하세요.':'원본 글자·도형 보존 출력 방식을 선택했습니다.');draw();});
// Export is an explicit, local user action. It works during a long-running
// batch so the last recorded stage is not lost; it never sends source data.
$('qa-export').addEventListener('click',()=>{
 if(!items.length)return;
 try{
  const report=buildLocalBatchQaReport(items);
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],
   {type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='Sunrise_PDF_PRO_Web_QA_'+QA_BUILD_REVISION+'_'+qaDeploymentChannel()+'_' +
   report.generated_at.replace(/[-:T]/g,'').slice(0,14)+'.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  status('실기 검증 보고서 다운로드를 요청했습니다. 파일명·본문·경로는 보고서에 포함하지 않습니다.');
 }catch(error){
  status('실기 검증 보고서 생성 실패: '+String(error?.message||error));
 }
});
// A visible one-click opt-in avoids forcing users to run every incompatible
// HWP once in professional mode and only then discover the hidden setting.
// No default or background downgrade: the explicit button selection is the
// sole authority to choose hybrid-filter for a whole pending batch.
$('convert-hybrid').addEventListener('click',()=>{
 if(busy||!ready||!items.some(i=>isHwp(i.file)&&
  ['ready','failed','cancelled'].includes(i.state)))return;
 requestedFileRecovery=null;requestedFileRetry=null;requestedBulkRecovery=false;
 requestedBatchEngine='hybrid-filter';
 status('사용자가 혼합 출력을 선택했습니다. 미지원 필터가 있는 페이지만 이미지로 출력합니다. 해당 쪽의 텍스트 검색은 불가능합니다.');
 $('convert').click();
});
$('recover-failed').addEventListener('click',()=>{
 if(busy||!ready||!items.some(canRecoverFile))return;
 requestedFileRetry=null;requestedFileRecovery=null;requestedBulkRecovery=true;
 $('convert').click();
});
$('convert').addEventListener('click',async()=>{
 if(busy||!ready||fontCheckPending)return;
 const requested=requestedFileRecovery;requestedFileRecovery=null;
 const oneFileRetry=requestedFileRetry;requestedFileRetry=null;
 const bulkRequested=requestedBulkRecovery;requestedBulkRecovery=false;
 // A one-click hybrid choice is consumed by this one operation only. Keep
 // the visible professional default and subsequent conversions unchanged.
 const selectedEngine=requestedBatchEngine||$('pdf-engine').value;
 requestedBatchEngine=null;
 let plan=bulkRequested?planBulkRecovery(items):planConversion(items,selectedEngine,requested);
 if(oneFileRetry&&!bulkRequested&&!requested)plan=planSingleRetry(items,selectedEngine,oneFileRetry);
 const {pending,engine}=plan;
 const recoverySpecs=new Map((plan.targets||[]).map(spec=>[spec.item,spec]));
 if(!pending.length)return;
 conversionClock.start(pending.length);
 const fontFiles=Array.from($('pdf-font').files||[]);
 if(plan.bulk)status('실패한 문서 '+pending.length+'개만 선택적으로 복구합니다. 지원되지 않는 그림 효과가 있는 쪽은 이미지로 출력하며, 글꼴 누락·저장 오류 또는 혼합 변환 재실패 시 문서 전체가 이미지 PDF로 출력되어 글자 검색이 불가능합니다. 성공 파일과 대기 파일은 제외됩니다.');
 else if(plan.singleRetry)status('선택한 문서 1개만 동일한 출력 설정으로 다시 변환합니다. 완료 파일과 다른 실패·대기 파일은 유지합니다.');
 else if(plan.recovery)status(engine==='hybrid-filter'
  ?'선택한 문서 1개만 혼합 PDF로 다시 변환합니다. 미지원 필터 쪽만 이미지로 처리하며 나머지 쪽은 벡터로 유지합니다.'
  :'선택한 문서 1개만 호환 이미지 PDF로 다시 변환합니다. 모든 쪽의 글자 검색은 불가능합니다.');
 if(!plan.bulk&&engine==='compat-raster')fontStatus('호환 이미지 PDF는 페이지를 그림으로 출력하므로 PC 글꼴의 PDF 임베딩 절차를 사용하지 않습니다.');
 const needsFonts=pending.some(item=>isHwp(item.file)&&
  (recoverySpecs.get(item)?.engine||engine)!=='compat-raster');
 let fontsRequest=null,fontAccessNotice='';
 try{
  if(USE_PC_FONTS_BY_DEFAULT&&needsFonts){
   if(deviceFontsAvailable)
    fontsRequest=beginPcFontRequest();
   else fontAccessNotice='이 기기는 설치 글꼴 자동 조회를 지원하지 않습니다. 한컴오피스 설치 없이 웹 엔진과 내장 글꼴로 변환합니다. 원본 TTF/OTF가 있으면 직접 추가할 수 있습니다. 대체 서체로 줄바꿈이나 배치가 달라질 수 있습니다.';
  }
 }catch(error){fontAccessNotice='설치 글꼴 접근을 시작하지 못해 내장 글꼴로 계속합니다. 원본 TTF/OTF는 직접 추가할 수 있습니다.';}
 const localFontCache=createLocalFontCache();
 controller=new AbortController();const signal=controller.signal;busy=true;clearPrint();clearArchive();draw();refreshBrowserLifecycle();let completed=0;
 try{
  let localFonts=null;if(fontsRequest){status('PC 글꼴 접근 권한 확인 중입니다. 브라우저의 글꼴 허용 요청을 확인하세요. 응답이 없으면 30초 후 내장 글꼴로 진행합니다.');const access=await settleInstalledFonts(fontsRequest,{signal});localFonts=access.fonts;fontAccessNotice=access.notice||(localFonts?.length?'PC 설치 글꼴 '+localFonts.length+'개 접근 확인 · 문서에 일치하는 서체를 우선 사용합니다.':'');
   fontStatus(access.status==='ready'?'PC 글꼴 '+localFonts.length+'개에 접근 확인 · 실제 PDF 사용 여부는 변환 결과를 확인하세요.':fontAccessNotice);}
  await runBatch(pending,async(file,item)=>{
   item._proDiagStage='load';
   item._proSourcePages=null;item._proLastPage=null;
   const spec=recoverySpecs.get(item),itemEngine=spec?.engine||engine;
   item.lastEngine=itemEngine;
   item._proOperationId=newProOperationId();
    item._proStartedMs=performance.now();
   item._lastDiagPhase='parse';item._lastDiagSentMs=item._proStartedMs;item._proProgressEvents=0;
   emitProEvent('convert_start',{feature:proFeature(file),stage:itemEngine==='compat-raster'?'compat_raster':itemEngine==='hybrid-filter'?'svg_vector':'none',operation_id:item._proOperationId});
   emitProEvent('convert_progress',{feature:proFeature(file),stage:'parse',duration_ms:0,operation_id:item._proOperationId});
   const result=await convertToPdf(file,info=>{
    const phases=new Set(['svg_build','svg_normalize','image_gif','image_png',
     'image_filter','svg_sanitize','svg_preflight','svg_vector','svg_vector_done',
     'pdf_finalize','pdf_write','pdf_stream','pdf_done','compat_raster','compat_page_done','compat_save']);
    if(info.detail==='hwp_page_count'&&Number.isSafeInteger(info.pages)&&info.pages>=1)
     item._proSourcePages=info.pages;
    if(['professional','professional-raster'].includes(info.stage)&&
       Number.isSafeInteger(info.page)&&info.page>0)
     item._proLastPage=info.page;
    item._proDiagStage=info.stage==='document'&&info.detail==='hwp_page_count'?'hwp_page_count':
     info.stage==='load'?(['wasm_init','wasm_ready','file_read','hwp_open','xlsx_package','xlsx_parse','xlsx_layout'].includes(info.detail)?info.detail:'load'):
     info.stage==='fonts'?(info.detail==='read'?'font_read':info.detail==='bundled'?'font_bundle':
      info.detail==='measure'?'font_measure':info.detail==='scan'?'font_scan':'fonts'):
     phases.has(info.detail)?info.detail:'render';
    // Keep diagnostics private and sampled. Always include last-page
    // phase transitions and PDF finalization, where the production stall occurs.
    const phaseNow=performance.now();
    const gap=phaseNow-(item._lastDiagSentMs||0);
    const changed=item._lastDiagPhase!==item._proDiagStage;
    // First-use WASM compilation must report start/ready even before
    // the normal progress sampling interval has elapsed.
    const important=(info.stage==='load'&&
      ['wasm_init','wasm_ready'].includes(item._proDiagStage))||
      (info.page===info.total&&
       ['svg_build','image_png','svg_vector','pdf_finalize','pdf_write','pdf_stream','pdf_done']
        .includes(item._proDiagStage));
    if((item._proProgressEvents||0)<100&&
      ((changed&&(gap>=750||important))||gap>=45000)){
      emitProEvent('convert_progress',{feature:proFeature(file),
       stage:item._proDiagStage,
       duration_ms:Math.max(0,Math.round(phaseNow-item._proStartedMs)),operation_id:item._proOperationId});
      item._proProgressEvents=(item._proProgressEvents||0)+1;
      item._lastDiagPhase=item._proDiagStage;
      item._lastDiagSentMs=phaseNow;
    }
    const part=info.stage==='load'?Math.min(.15,.15*info.loaded/Math.max(1,info.total)):info.stage==='fonts'?.15+.15*info.page/Math.max(1,info.total):.30+.69*info.page/Math.max(1,info.total);
    $('progress').value=Math.min(99,Math.round((completed+part)/pending.length*100));
    conversionClock.update(completed,part,info.stage==='fonts'?'글꼴 검사':info.stage==='load'?(info.detail==='wasm_init'?'웹 엔진 초기화':'문서 읽기'):'페이지 출력');
    const fontStatus=info.detail==='read'?'PC 글꼴 파일 읽는 중':
     info.detail==='bundled'?'기본 글꼴 준비 중':info.detail==='measure'?'PDF 측정용 글꼴 준비 중':
     info.detail==='complete'?'PDF 출력 시작 중':'문서에 필요한 글꼴 검색 중';
    const stepLabels={
     svg_build:'문서 페이지 생성',svg_normalize:'페이지 내용 준비',
     image_gif:'GIF 그림 확인',image_png:'PNG 그림 확인·조정',
     image_filter:'그림 효과 검사',svg_sanitize:'문서 내용 검사',
     svg_preflight:'글꼴·도형 검사',svg_vector:'PDF 페이지 출력',
     svg_vector_done:'페이지 출력 완료',direct_page_done:'정밀 PDF 페이지 출력 완료',
     pdf_finalize:'PDF 최종 저장 준비',pdf_write:'페이지 PDF 작성 중',pdf_stream:'PDF 바이트 생성 중',
     pdf_done:'PDF 바이트 생성 완료',compat_raster:'호환 이미지 페이지 생성',compat_page_done:'호환 이미지 페이지 완료',compat_save:'호환 PDF 저장 중'
    };
    const message=info.stage==='load'?(info.detail==='wasm_init'?'문서 변환 기능 준비 중 · 처음 이용할 때는 시간이 걸릴 수 있습니다':info.detail==='wasm_ready'?'문서 변환 기능 준비 완료':'xlsx_package'===info.detail?'엑셀 파일 검사':'xlsx_parse'===info.detail?'엑셀 시트 읽기':'xlsx_layout'===info.detail?'엑셀 페이지 구성 확인':'문서 읽는 중'):
     info.stage==='fonts'?fontStatus:
     stepLabels[info.detail]||'페이지 변환';
    const byteStatus=(info.detail==='pdf_stream'||info.detail==='pdf_write')&&Number.isSafeInteger(info.bytes)
     ?' · '+(info.bytes/(1024*1024)).toFixed(1)+' MB 생성':'';
    // Show completed synchronous stage duration without claiming it could be cancelled mid-call.
    const elapsedStatus=Number.isSafeInteger(info.elapsedMs)&&info.elapsedMs>=1000
     ?' · 단계 소요 '+(info.elapsedMs/1000).toFixed(1)+'초':'';
    // File reading reports bytes, not PDF pages. WASM has no page count.
    const pageStatus=info.stage!=='load'&&info.stage!=='fonts'&&
     Number.isSafeInteger(info.page)&&info.page>=1&&
     Number.isSafeInteger(info.total)&&info.total>=info.page
      ?' · '+info.page+'/'+info.total+'쪽':'';
    const loadStatus=info.stage==='load'&&
     !['wasm_init','wasm_ready'].includes(info.detail)&&
     Number.isSafeInteger(info.loaded)&&info.loaded>=0&&
     Number.isSafeInteger(info.total)&&info.total>0
      ?' · '+Math.min(100,Math.floor(info.loaded/info.total*100))+'% 읽음':'';
    status(file.name+' · '+message+byteStatus+elapsedStatus+pageStatus+loadStatus+
     ' · '+(completed+1)+'/'+pending.length+'개');
   },signal,{fontFiles,engine:itemEngine,localFontCache,localFonts});
   if(fontAccessNotice&&isHwp(file)&&itemEngine!=='direct-trial')result.warnings=[...(result.warnings||[]),fontAccessNotice];
   if((plan.recovery&&item===requested)||spec){
    const cause=spec?.cause||plan.cause;
    result.warnings=[...(result.warnings||[]),(spec?itemEngine==='hybrid-filter':plan.engine==='hybrid-filter')
     ?'기본 벡터 변환 오류('+cause+') 후 이 문서만 혼합 PDF로 복구했습니다. 이미지 출력 쪽을 원본과 비교하세요.'
     :'벡터·혼합 변환 오류('+cause+') 후 이 문서만 전체 이미지 PDF로 복구했습니다. 모든 페이지를 원본과 비교하세요.'];
   }
   return result;
  },signal,item=>{
   if(item.state==='working'){
    conversionClock.itemStart();draw(item);return;
   }
   const durationMs=Number.isFinite(item._proStartedMs)?Math.max(0,Math.round(performance.now()-item._proStartedMs)):0;
   item._proDurationMs=durationMs;
   if(item.state==='done')emitProEvent('convert_success',{feature:proFeature(item.file),stage:'pdf',duration_ms:durationMs,operation_id:item._proOperationId});
   if(item.state==='done'){
    item.pdfUrl=URL.createObjectURL(item.result.pdf);completed++;
    // PDF.js preview must not run concurrently with the next HWP WASM render.
   }
   else if(item.state==='failed'){emitProEvent('convert_failure',{feature:proFeature(item.file),stage:item._proDiagStage||'unknown',error_code:classifyProError(item.error),duration_ms:durationMs,operation_id:item._proOperationId});completed++;}
   else if(item.state==='cancelled'){
    emitProEvent('convert_cancel',{feature:proFeature(item.file),
     stage:item._proDiagStage||'unknown',duration_ms:durationMs,operation_id:item._proOperationId});
    completed++;
   }
   if(['done','failed','cancelled'].includes(item.state)){item._proOperationId=null;conversionClock.itemDone(completed);}
   draw(item);
  });
  if(!signal.aborted){
   $('progress').value=100;
   const done=items.filter(i=>i.state==='done').length,failed=items.filter(i=>i.state==='failed'||i.state==='invalid').length;
   status('변환 완료 '+done+'개'+(failed?' · 확인 필요 '+failed+'개':'')+'. 각 파일을 다운로드할 수 있습니다.');
   if(done>1&&shouldAutoArchive(items)){try{status('완료 파일 ZIP을 준비하는 중입니다.');const blob=await makePdfArchive(items,signal,(i,n)=>status('ZIP 준비 중 · '+i+'/'+n+'개'));archiveUrl=URL.createObjectURL(blob);$('download-all').href=archiveUrl;$('download-all').hidden=false;status('완료 '+done+'개'+(failed?' · 확인 필요 '+failed+'개':'')+'. ZIP 또는 개별 PDF를 다운로드하세요.');}catch(error){if(error?.name!=='AbortError')status('개별 PDF 다운로드 가능 · ZIP 생성 실패: '+String(error.message||error));else status('ZIP 생성이 취소되었습니다. 완료한 PDF는 개별 다운로드할 수 있습니다.');}}
   else if(done>1)status('완료 '+done+'개 · 개별 PDF를 즉시 다운로드하거나 ZIP 준비 버튼을 누르세요. 대용량 ZIP은 필요한 경우에만 생성합니다.');
  }else status('작업이 취소되었습니다. 완료된 PDF는 개별 다운로드할 수 있습니다.');
 }catch(error){const cancelled=signal.aborted||error?.name==='AbortError';status(cancelled?'작업이 취소되었습니다. 완료 PDF는 개별 다운로드 가능합니다.':'작업 실패: '+describeConversionError(error?.message||error));conversionClock.finish(cancelled?'cancelled':'failed');}
 finally{
  if(conversionClock.active)conversionClock.finish(signal.aborted?'cancelled':pending.some(i=>i.state==='failed')?'partial':'done');
  localFontCache.clear();
  busy=false;controller=null;
  try{
   draw();
   const selected=plan.recovery&&requested?.state==='done'?requested:active?.state==='done'?active:items.find(i=>i.state==='done');
   if(selected)show(selected);
  }catch(error){console.warn('R63_FINAL_PREVIEW_FAILED',error?.name||'Error');}
 }
});
$('prepare-archive')?.addEventListener('click',async()=>{
 if(busy||archiveUrl||items.filter(i=>i.state==='done').length<2)return;
 controller=new AbortController();const signal=controller.signal;busy=true;draw();
 try{status('ZIP 준비 중 · 완료 PDF는 유지됩니다.');
  const blob=await makePdfArchive(items,signal,(i,n)=>status('ZIP 준비 중 · '+i+'/'+n+'개'));
  if(signal.aborted)throw new DOMException('취소됨','AbortError');
  archiveUrl=URL.createObjectURL(blob);$('download-all').href=archiveUrl;$('download-all').hidden=false;status('ZIP 준비 완료 · ZIP 또는 개별 PDF를 다운로드하세요.');
 }catch(error){status(signal.aborted?'ZIP 생성 취소 · 개별 PDF 유지':'개별 PDF 다운로드 가능 · ZIP 생성 실패: '+String(error?.message||error));}
 finally{busy=false;controller=null;draw();}
});
$('print-prepare').addEventListener('click',async()=>{
 if(!active||!isHwp(active.file)||!ready||busy||fontCheckPending)return;const file=active.file;
 let fontsRequest=null,printFontNotice='';
 try{
  if(USE_PC_FONTS_BY_DEFAULT&&deviceFontsAvailable)
   fontsRequest=beginPcFontRequest();
  else printFontNotice='설치 글꼴 자동 조회가 없어 내장 글꼴과 사용자가 선택한 글꼴로 인쇄합니다. 한컴오피스 설치는 필요하지 않습니다.';
 }catch(error){printFontNotice='설치 글꼴 접근 실패: 내장 글꼴로 인쇄합니다.';}
 controller=new AbortController();const signal=controller.signal;busy=true;clearPrint();draw();refreshBrowserLifecycle();
 try{let localFonts=null;if(fontsRequest){const access=await settleInstalledFonts(fontsRequest,{signal});localFonts=access.fonts;printFontNotice=access.notice||(localFonts?.length?'PC 설치 글꼴 '+localFonts.length+'개 접근 확인 · 일치하는 서체를 우선 사용합니다.':'');}const {pages,fontRegistry}=await renderNativePrintPages(file,info=>{status(file.name+' · 인쇄 준비 중'+(info.page?' '+info.page+'/'+info.total+'쪽':''));},signal,Array.from($('pdf-font').files||[]),localFonts);if(signal.aborted)throw new DOMException('취소됨','AbortError');printJob=await prepareNativePrint(pages,document,fontRegistry,signal);status('브라우저 인쇄 준비 완료. 해당 문서의 브라우저 PDF로 저장 버튼을 눌러 PDF 저장 대상을 직접 선택하세요. 필터·글꼴·배치를 원본과 대조해야 하며 앱의 실패 상태는 자동으로 성공 처리되지 않습니다.'+(printFontNotice?' · '+printFontNotice:''));}
 catch(error){clearPrint();status(error?.name==='AbortError'?'인쇄 준비가 취소되었습니다.':'인쇄 준비 실패: '+describeConversionError(error?.message||error));}
 finally{busy=false;controller=null;draw();}
});
$('print-save').addEventListener('click',()=>{if(printJob&&!busy){try{printJob.print();status('인쇄 창에서 PDF로 저장을 선택하세요.');}catch(error){status('인쇄 실패: '+describeConversionError(error?.message||error));}}});
$('cancel').addEventListener('click',()=>{
 if(!controller||controller.signal.aborted)return;
 controller.abort();
 // Immediate user feedback does not claim synchronous WASM work is stopped.
 status('취소 요청됨 · 현재 작업이 제어를 반환하면 중단합니다. 이미 완료된 PDF는 유지됩니다.');
 $('cancel').disabled=true;
});
$('reset').addEventListener('click',()=>{requestedFileRecovery=null;requestedFileRetry=null;requestedBulkRecovery=false;requestedBatchEngine=null;conversionClock.reset();for(const item of items)release(item);items=[];clearPrint();clearArchive();$('progress').value=0;show(null);draw();status('새 문서를 선택해 주세요.');});
viewer.open(null);
status(document.wasDiscarded
 ?'브라우저가 이전 탭을 메모리에서 폐기했습니다. 미완료 변환은 복원할 수 없습니다. 원본 파일을 다시 선택해 변환하세요.'
 :'변환 준비 완료. 한글·엑셀·이미지를 여러 개 선택할 수 있습니다.');
sync();
window.addEventListener('pagehide',event=>{
 if(event.persisted){
  // BFCache is a frozen in-memory page, not a terminated document. Cleaning
  // object URLs here destroys finished downloads when the user returns.
  browserFrozen=true;refreshBrowserLifecycle();return;
 }
 conversionClock.reset();controller?.abort();viewer.dispose();
 clearPrint();clearArchive();for(const item of items)release(item);
});


startProTelemetry();
