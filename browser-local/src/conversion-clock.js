/** R61: browser-local elapsed time & bounded heuristic ETA. No file names leave browser. */
export function formatDuration(ms){
 if(!Number.isFinite(ms)||ms<0)return '—';
 const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
 const z=n=>String(n).padStart(2,'0');
 return hours?hours+':'+z(minutes)+':'+z(seconds%60):z(minutes)+':'+z(seconds%60);
}
export function estimateRemaining(elapsedMs,progress,staleMs=0){
 if(!Number.isFinite(elapsedMs)||elapsedMs<10000||!Number.isFinite(progress)||progress<.06||progress>=1||staleMs>20000)return null;
 return Math.min(86400000,Math.max(1000,Math.round(elapsedMs*(1-progress)/progress)));
}
export function createConversionClock({doc=globalThis.document,now=()=>performance.now(),wallNow=()=>Date.now(),setIntervalFn=setInterval,clearIntervalFn=clearInterval}={}){
 const status=doc?.getElementById('status');
 if(!status)throw Error('R61_CLOCK_STATUS_MISSING');
 const widget=doc.createElement('div');widget.id='conversion-clock';widget.className='conversion-clock';widget.hidden=true;
 widget.setAttribute('role','group');widget.setAttribute('aria-label','PDF 변환 시간');
 const info=doc.createElement('div');info.className='conversion-clock-row';
 const values=new Map();
 for(const [key,label] of [['elapsed','실제 경과시간'],['current','현재 파일'],['remaining','예상 남은 시간'],['finish','예상 완료 시각']]){
  const cell=doc.createElement('div');cell.className='conversion-clock-cell';
  const title=doc.createElement('span');title.className='conversion-clock-label';title.textContent=label;
  const value=doc.createElement('strong');value.id='conversion-'+key;value.textContent='—';
  cell.append(title,value);info.append(cell);values.set(key,value);
 }
 const hint=doc.createElement('small');hint.className='conversion-clock-hint';
 widget.append(info,hint);status.before(widget);
 let startMs=null,fileStartMs=null,lastAdvanced=0,progress=0,total=1,stage='',timer=null,active=false;
 let hidden=doc?.hidden===true,frozen=false;
 const set=(key,value)=>{values.get(key).textContent=value;};
 const stop=()=>{if(timer!==null){clearIntervalFn(timer);timer=null;}};
 function render(){
  if(startMs===null)return;
  const moment=now(),elapsed=Math.max(0,moment-startMs);
  set('elapsed',formatDuration(elapsed));
  if(fileStartMs!==null)set('current',formatDuration(Math.max(0,moment-fileStartMs)));
  if(!active)return;
  const remaining=hidden||frozen?null:
   estimateRemaining(elapsed,progress,Math.max(0,moment-lastAdvanced));
  if(remaining===null){set('remaining','계산 중');set('finish','—');}
  else{
   set('remaining','약 '+formatDuration(remaining));
   set('finish',new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(wallNow()+remaining)));
  }
  const stale=moment-lastAdvanced>20000&&progress<1;
  hint.textContent=frozen?'브라우저가 이 탭을 동결했습니다. 다시 활성화하기 전에는 JavaScript 변환이 진행되지 않습니다.':
   hidden?'다른 탭 또는 최소화 상태입니다. 진행이 제한될 수 있어 완료 예상시간을 보류합니다.':
   stale?stage+' 처리 중 · 진행률 갱신이 지연되어 예상 완료시간을 보류합니다.':
   '예상 시간은 문서 용량·표·도형·글꼴에 따라 달라집니다.';
 }
 function start(count){
  stop();hidden=doc?.hidden===true;frozen=false;total=Math.max(1,Number(count)||1);
  startMs=now();fileStartMs=null;lastAdvanced=startMs;progress=0;stage='PC 글꼴 확인';active=true;
  widget.hidden=false;set('current','대기');hint.textContent='PC 글꼴 접근 및 분석 중';
  render();timer=setIntervalFn(render,1000);
 }
 function setLifecycle({isHidden=hidden,isFrozen=frozen}={}){
  hidden=!!isHidden;frozen=!!isFrozen;
  if(active)render();
 }
 function itemStart(){if(!active)return;fileStartMs=now();stage='문서 읽기';render();}
 function update(done,part,phase){
  if(!active)return;
  const next=Math.max(progress,Math.min(.999,(Math.max(0,Number(done)||0)+Math.max(0,Math.min(.99,Number(part)||0)))/total));
  if(next>progress+.0001){progress=next;lastAdvanced=now();}
  stage=String(phase||stage).slice(0,70);render();
 }
 function itemDone(completed){
  if(!active)return;
  progress=Math.max(progress,Math.max(0,Math.min(total,Number(completed)||0))/total);
  lastAdvanced=now();fileStartMs=null;set('current','완료');render();
 }
 function finish(result='done'){
  if(startMs===null)return;
  active=false;stop();set('elapsed',formatDuration(now()-startMs));set('current','—');
  set('remaining',result==='cancelled'?'취소됨':result==='failed'?'확인 필요':'00:00');
  set('finish',result==='done'?'완료':result==='partial'?'일부 실패':result==='cancelled'?'취소':'실패');
  hint.textContent='최종 소요시간입니다.';
 }
 function reset(){stop();active=false;startMs=null;fileStartMs=null;progress=0;widget.hidden=true;}
 return {start,itemStart,update,itemDone,finish,reset,render,setLifecycle,get active(){return active;}};
}
