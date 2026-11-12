import {handleProAdmin} from './admin/handler.js';
import {sitePage,siteCSS} from './site-home.js';
import {traceDev4Route,TRACE_DEV4_RELEASE} from './trace-dev4-runtime.js';
import {OPERATIONS_R56_JS,OPERATIONS_R56_CSS} from './pro-operations-r56.js';
import {validSecrets,findSession,verifyCsrf,originMatches} from './admin/auth.js'; // TRACE_DEV4_SOURCE
// Sunrise PDF PRO Web | Cloudflare Workers edge gateway R28
// Independent of sunrise-pdf-editor; no conversion without verified origin.
const HTML = "<!doctype html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"description\" content=\"Sunrise PDF PRO Web — HWP/HWPX 웹 변환 서비스 스테이징\">\n<title>Sunrise PDF PRO | Web</title>\n<link rel=\"stylesheet\" href=\"/style.css\">\n<script src=\"/app.js\" defer></script>\n</head>\n<body>\n<div class=\"shell\">\n<aside class=\"sidebar\">\n<div class=\"brand\"><span class=\"logo\">S</span><span><strong>SUNRISE</strong><small>PDF PRO · WEB</small></span></div>\n<p class=\"navlabel\">WORKSPACE</p>\n<div class=\"navitem selected\">▣ &nbsp; HWP / HWPX → PDF</div>\n<div class=\"navitem\">◷ &nbsp; 변환 내역</div>\n<div class=\"sidefoot\"><b>사용자 설치 불필요</b><p>웹에서 문서를 선택하고 변환 상태를 확인합니다. 변환 엔진은 서버에서 구동됩니다.</p><small>WEB STAGING · R27 UI</small></div>\n</aside>\n<main class=\"main\">\n<header class=\"top\">\n<div><p class=\"eyebrow\">DOCUMENT CONVERSION</p><h1>HWP · HWPX <em>→ PDF</em></h1><p class=\"intro\">한컴 설치 없이 문서를 열람하고 PDF로 변환하는 웹서비스</p></div>\n<div class=\"account\"><span id=\"badge\" class=\"badge warn\">서버 연결 확인 중</span><span id=\"userLabel\">로그인 전</span><button id=\"logout\" class=\"textbutton\" hidden>로그아웃</button></div>\n</header>\n<div class=\"content\"><div class=\"notice\" role=\"status\"><span class=\"statusdot\"></span><div><strong>공식 rhwp 무료 브라우저 변환 사용 가능</strong><p><a href=\"/local/\">HWP/HWPX → PDF 로컬 변환기 열기</a> · 파일을 서버로 전송하지 않습니다.</p></div><span class=\"state\">API 불필요</span></div>\n<div class=\"notice\" role=\"status\"><span class=\"statusdot\"></span><div><strong id=\"serviceTitle\">웹 화면 준비</strong><p id=\"serviceDetail\">서버 엔진 연결을 확인 중입니다.</p></div><span id=\"serviceMode\" class=\"state\">확인 중</span></div>\n<div class=\"twocol\">\n<section class=\"panel\">\n<div class=\"panelhead\"><div><span class=\"step\">01 / FILE</span><h2>원본 문서 선택</h2></div><span class=\"chip\">.HWP · .HWPX</span></div>\n<label class=\"upload\" id=\"drop\"><input type=\"file\" id=\"file\" accept=\".hwp,.hwpx\"><span class=\"uploadico\">↑</span><strong>파일을 선택하거나 드래그하세요</strong><small>최대 20MiB · 브라우저에서 파일 형식 1차 검사</small></label>\n<p class=\"fileinfo\" id=\"fileInfo\">선택된 문서가 없습니다.</p>\n<div class=\"actions\"><button id=\"preview\" class=\"secondary\" disabled>원본 미리보기</button><button id=\"convert\" class=\"primary\" disabled>PDF로 변환</button></div>\n<p class=\"help\" id=\"fileHelp\">서버가 준비되지 않은 동안 문서는 업로드되지 않습니다.</p>\n</section>\n<section class=\"panel\">\n<div class=\"panelhead\"><div><span class=\"step\">02 / RESULT</span><h2>변환 결과</h2></div><span class=\"chip\" id=\"stage\">작업 대기</span></div>\n<div id=\"result\" class=\"result\"><div class=\"pdfico\">PDF</div><b>결과 미리보기 영역</b><small>실제 엔진이 생성한 PDF만 다운로드할 수 있습니다.</small></div>\n<div class=\"track\"><div id=\"fill\"></div></div>\n<p id=\"feedback\" class=\"feedback\" aria-live=\"polite\">서버 연결을 확인하고 있습니다.</p>\n<div class=\"actions\"><button id=\"cancel\" class=\"secondary\" disabled>작업 취소</button><a id=\"download\" class=\"primary download\" hidden>PDF 다운로드</a></div>\n</section>\n</div>\n<section class=\"panel history\"><div class=\"panelhead\"><div><span class=\"step\">03 / HISTORY</span><h2>내 변환 작업</h2></div><button id=\"refresh\" class=\"secondary compact\" disabled>새로고침</button></div><div id=\"jobs\" class=\"historylist\"><p class=\"muted\">변환 서버 로그인 후 작업이 표시됩니다.</p></div></section>\n<footer>Sunrise PDF PRO Web · GitHub → Cloudflare Pages 스테이징 · 서버 변환 연동 전</footer>\n</div>\n</main>\n</div>\n<div class=\"modal\" id=\"loginLayer\" hidden>\n<form class=\"loginbox\" id=\"loginForm\"><div class=\"logo loginlogo\">S</div><p class=\"eyebrow\">SECURE ACCESS</p><h2>웹서비스 로그인</h2><p>변환 서버에서 발급한 계정으로 로그인하세요.</p>\n<label>사용자 계정<input id=\"username\" autocomplete=\"username\" maxlength=\"48\" required></label>\n<label>비밀번호<input id=\"password\" type=\"password\" autocomplete=\"current-password\" maxlength=\"256\" required></label>\n<button id=\"loginButton\" class=\"primary\" type=\"submit\">로그인</button><p id=\"loginError\" class=\"error\" aria-live=\"polite\"></p></form>\n</div>\n</body></html>";
const CSS = ":root{color-scheme:light;font-family:Inter,Pretendard,\"Noto Sans KR\",-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:#17304e;background:#f4f7fb;font-size:14px}*{box-sizing:border-box}body{margin:0}button,input{font:inherit}[hidden]{display:none!important}.shell{display:grid;grid-template-columns:224px minmax(0,1fr);min-height:100vh}.sidebar{background:#102a4b;color:#d9e7f7;padding:27px 14px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:11px;margin:0 12px 35px}.brand strong,.brand small{display:block;letter-spacing:.1em}.brand strong{font-size:15px;color:white}.brand small{font-size:10px;color:#a5bedc;margin-top:4px}.logo{display:grid;place-items:center;background:#2781ef;color:white;font-size:21px;font-weight:800;border-radius:10px;width:41px;height:41px;flex-shrink:0}.navlabel,.step,.eyebrow{letter-spacing:.13em;font-weight:800;font-size:10px}.navlabel{color:#7c9fbe;padding:0 12px}.navitem{padding:13px 11px;border-radius:8px;margin-top:5px;color:#b4cbe5}.navitem.selected{color:white;background:#214c79;font-weight:700}.sidefoot{margin-top:auto;padding:16px 10px;font-size:12px;color:#b0c4df;line-height:1.65}.sidefoot small{color:#8fb7e4}.main{min-width:0}.top{background:white;border-bottom:1px solid #dfe7f0;padding:24px 31px;display:flex;justify-content:space-between;align-items:center;gap:15px}.eyebrow,.step{color:#387bd2}.top h1{font-size:26px;letter-spacing:-.05em;margin:6px 0}.top h1 em{font-style:normal;color:#2377e0}.intro{color:#71849b;margin:0;font-size:12px}.account{display:flex;gap:9px;align-items:center;color:#637c98;font-size:12px;flex-wrap:wrap}.badge{padding:6px 10px;border-radius:20px;background:#e7f5ed;color:#19764d;font-weight:700;font-size:11px;white-space:nowrap}.badge.warn{background:#fff1d6;color:#976614}.textbutton{border:none;background:transparent;color:#226dbb;cursor:pointer}.content{max-width:1440px;margin:auto;padding:24px 30px}.notice{display:flex;align-items:center;gap:12px;background:#e9f3fe;border:1px solid #cddff4;border-radius:10px;padding:13px 17px;margin-bottom:19px}.statusdot{height:9px;width:9px;border-radius:50%;background:#438cea;flex-shrink:0}.notice p{font-size:12px;color:#6483a5;margin:5px 0 0}.notice strong{font-size:13px}.state{font-size:11px;color:#4c719e;margin-left:auto;white-space:nowrap}.twocol{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{background:white;border-radius:12px;border:1px solid #e0e8f2;box-shadow:0 3px 12px #1a365309;padding:21px;min-width:0}.panelhead{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:20px}.panelhead h2{font-size:18px;letter-spacing:-.03em;margin:5px 0 0}.chip{font-size:11px;color:#6b8eae;border:1px solid #dfe7f0;background:#f7fafe;padding:7px 10px;border-radius:6px;white-space:nowrap}.upload{border:1.5px dashed #abc6e3;background:#f6faff;min-height:218px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:11px;text-align:center;cursor:pointer;padding:14px}.upload.drag{background:#e7f2ff;border-color:#2c77df}.upload input{position:absolute;width:1px;height:1px;opacity:0}.uploadico{display:grid;place-items:center;width:55px;height:55px;border-radius:11px;background:#e2eefa;color:#287ae5;font-size:31px}.upload strong{color:#315b87;font-size:14px}.upload small,.result small{color:#8ba0b9;font-size:11px}.fileinfo{min-height:36px;margin:0;color:#5c7590;font-size:12px;border-bottom:1px solid #edf1f6;padding:11px 0;overflow-wrap:anywhere}.actions{margin-top:15px;display:flex;gap:9px;flex-wrap:wrap}.actions button,.actions .download,.loginbox button{border-radius:7px;padding:10px 15px;font-weight:700;cursor:pointer;text-decoration:none}.primary{border:1px solid #2b78df;color:white;background:#2b78df}.primary:hover:not(:disabled){background:#1a65bf}.secondary{background:white;color:#356d9e;border:1px solid #cbd9e9}.secondary:hover:not(:disabled){background:#f1f6ff}button:disabled{opacity:.4;cursor:not-allowed}.help{font-size:11px;color:#8196ac;line-height:1.6}.result{min-height:266px;background:#f6f8fc;border:1px solid #e5edf5;border-radius:10px;display:flex;justify-content:center;align-items:center;flex-direction:column;gap:12px;padding:16px;text-align:center;overflow:hidden}.result b{font-size:12px;font-weight:500;color:#8296ac}.pdfico{display:grid;place-items:center;border-radius:9px;background:#fbe9ee;color:#dc5568;width:60px;height:67px;font-weight:800}.result iframe{border:0;width:100%;height:265px;background:white}.track{height:7px;border-radius:10px;background:#ecf1f7;overflow:hidden;margin-top:19px}.track div{height:100%;background:#2a7ce6;width:0;transition:width .25s}.feedback{font-size:12px;color:#65819d;min-height:20px}.history{margin-top:18px}.historylist{display:flex;flex-direction:column;gap:8px}.jobrow{border:1px solid #e8eef5;border-radius:7px;padding:12px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.jobrow strong{font-size:12px;overflow-wrap:anywhere}.jobrow span{font-size:12px;color:#7590a9}.jobrow a{font-size:12px;color:#2576d3}.muted{font-size:12px;color:#90a3b7}.compact{padding:8px 11px;border-radius:7px}.content footer{color:#91a6bb;font-size:11px;margin:22px 0}.modal{position:fixed;inset:0;display:grid;place-items:center;background:#122840d9;padding:20px}.loginbox{width:min(420px,100%);background:white;border-radius:15px;padding:30px;box-shadow:0 25px 80px #091a2d55}.loginbox h2{font-size:23px;margin:8px 0}.loginbox p{color:#71869b;font-size:12px;line-height:1.65}.loginlogo{margin-bottom:15px}.loginbox label{display:block;margin-top:12px;font-size:12px;color:#4d657e}.loginbox input{margin-top:6px;padding:11px;border:1px solid #cad8e7;border-radius:7px;width:100%}.loginbox button{margin-top:20px;width:100%}.error{color:#b74949!important}@media(max-width:1050px){.twocol{grid-template-columns:1fr}.top{align-items:flex-start}.content{padding:18px}.panel{padding:18px}}@media(max-width:720px){.shell{display:block}.sidebar{display:none}.top{flex-direction:column;padding:17px}.top h1{font-size:23px}.content{padding:11px}.panel{padding:15px}.upload{min-height:185px}.result{min-height:220px}.notice{align-items:flex-start}.state{max-width:100px;white-space:normal}}";
const APP = "'use strict';\n(()=> {\n  const $=id=>document.getElementById(id);\n  let selected=null,csrf='',job=null,interval=null,engine=false,wasm=false,username='';\n  const set=(id,v)=>{$(id).textContent=String(v);};\n  const reply=(msg)=>set('feedback',msg);\n  const sync=()=>{ $('convert').disabled=!selected||!engine||!csrf; $('preview').disabled=!selected||!wasm||!csrf; $('cancel').disabled=!job||!['queued','running'].includes(job.state); $('refresh').disabled=!csrf; };\n  async function api(path,options={}){\n    const method=options.method||'GET';\n    const headers={...(options.headers||{})};\n    if(method!=='GET'&&csrf)headers['X-Sunrise-CSRF']=csrf;\n    const response=await fetch(path,{...options,method,headers,credentials:'same-origin',cache:'no-store'});\n    if(!response.ok){let reason='HTTP '+response.status;try{const j=await response.json();reason=j.detail||j.error||reason;}catch{}throw Error(String(reason));}\n    return options.raw?response:response.json();\n  }\n  const fileSelected=async(file)=>{\n    selected=null;set('fileInfo','선택된 문서가 없습니다.');\n    if(!file){sync();return;}\n    if(!/\\.(hwp|hwpx)$/i.test(file.name)||file.size<8||file.size>20*1024*1024){reply('HWP/HWPX 문서 20MiB 이하만 선택할 수 있습니다.');sync();return;}\n    const head=new Uint8Array(await file.slice(0,8).arrayBuffer());\n    const isHwp=/\\.hwp$/i.test(file.name);\n    const valid=isHwp?[208,207,17,224,161,177,26,225].every((v,i)=>head[i]===v):head[0]===80&&head[1]===75&&head[2]===3&&head[3]===4;\n    if(!valid){reply('원본 파일의 기본 서명과 확장자가 다릅니다.');sync();return;}\n    selected=file;set('fileInfo',file.name+' · '+(file.size/1048576).toFixed(2)+' MiB · 기본 서명 확인');\n    reply(engine?'원본 선택 완료. 서버에 로그인되어 있으면 변환할 수 있습니다.':'원본 선택 완료. 백엔드가 미연결이므로 문서를 전송하지 않습니다.');\n    sync();\n  };\n  $('file').addEventListener('change',e=>fileSelected(e.target.files[0]));\n  const drop=$('drop');\n  ['dragover','dragleave','drop'].forEach(k=>drop.addEventListener(k,e=>{e.preventDefault();drop.classList.toggle('drag',k==='dragover');if(k==='drop')fileSelected(e.dataTransfer.files[0]);}));\n  function offline(){\n    engine=false;wasm=false;\n    set('badge','변환 서버 미연결');$('badge').classList.add('warn');\n    set('serviceTitle','웹 테스트 화면 배포 완료');\n    set('serviceDetail','Cloudflare Pages UI는 정상입니다. 실제 HWP/HWPX → PDF 서버는 아직 연결되지 않았습니다.');\n    set('serviceMode','API 미연결');set('userLabel','서버 연동 전');\n    set('fileHelp','현재 파일은 브라우저에서만 선택·검사합니다. 서버 업로드는 차단됩니다.');\n    reply('웹 UI를 확인할 수 있습니다. 변환 서버 연결 전까지 변환은 비활성화됩니다.');\n    $('loginLayer').hidden=true;sync();\n  }\n  async function checkServer(){\n    try{\n      const edge=await api('/api/edge-health');\n      if (!edge.backend_configured){offline();return;}\n      set('serviceTitle','변환 서버 연결 구성됨');\n      set('serviceDetail','서버 계정으로 로그인한 다음 엔진 준비상태를 확인합니다.');\n      set('serviceMode','백엔드 연결 구성');set('badge','로그인 필요');$('badge').classList.add('warn');\n      const session=await api('/api/session').catch(()=>null);\n      if(session&&session.csrf)await authenticated(session);\n      else {$('loginLayer').hidden=false;set('userLabel','로그인 필요');reply('서버 계정으로 로그인해 주세요.');}\n    }catch(e){offline();}\n  }\n  async function authenticated(s){\n    csrf=s.csrf;username=s.user||'';set('userLabel',username);\n    $('loginLayer').hidden=true;$('logout').hidden=false;\n    try{\n      const r=await api('/api/status');\n      engine=Boolean(r.rhwp_cli_available&&r.process_limits&&r.process_limits.ready);\n      wasm=Boolean(r.wasm_assets_verified);\n      const ready=engine?'rhwp 변환 엔진 준비됨':'변환 엔진 미준비';\n      const cause=r.rhwp_cli_contract_reason||r.process_limits?.reason||'RHWP_BACKEND_NOT_READY';\n      set('serviceTitle',ready);\n      set('serviceDetail',engine?'서버 변환 엔진을 확인했습니다. 실제 문서 변환을 시험할 수 있습니다.':'엔진 상태: '+cause);\n      set('serviceMode',engine?'실서비스 연결':'실서비스 점검');\n      set('badge',engine?'변환 가능':'서버 검증 대기');\n      $('badge').classList.toggle('warn',!engine);\n      reply(engine?'문서를 선택해 변환하세요.':'서버 로그인은 완료됐지만 실제 rhwp 변환은 준비되지 않았습니다.');\n    }catch(e){engine=false;wasm=false;set('badge','엔진 확인 실패');reply('엔진 상태 확인 실패: '+e.message);}\n    sync();await jobs();\n  }\n  async function jobs(){\n    if(!csrf)return;\n    try{const data=await api('/api/jobs');$('jobs').replaceChildren();\n      for(const j of (data.jobs||[])){const row=document.createElement('div');row.className='jobrow';\n        const name=document.createElement('strong');name.textContent=j.file||'문서';\n        const meta=document.createElement('span');meta.textContent=(j.state||'unknown')+' · '+(j.percent||0)+'%';\n        row.append(name,meta);\n        if(j.download&&j.state==='completed'){const a=document.createElement('a');a.href=j.download;a.textContent='PDF 다운로드';row.append(a);}\n        $('jobs').append(row);\n      }\n      if(!(data.jobs||[]).length)set('jobs','아직 작업이 없습니다.');\n    }catch(e){reply('작업 조회 오류: '+e.message);}\n  }\n  async function poll(){\n    if(!job)return;\n    try{job=await api('/api/jobs/'+encodeURIComponent(job.id));\n      set('stage',job.state);$('fill').style.width=Math.min(100,Math.max(0,Number(job.percent)||0))+'%';sync();\n      if(['completed','failed','cancelled','interrupted'].includes(job.state)){\n        clearInterval(interval);interval=null;\n        if(job.state==='completed'&&job.download){$('download').href=job.download;$('download').hidden=false;reply('실제 PDF 변환 완료 · '+(job.pages||'?')+'쪽');const f=document.createElement('iframe');f.src=job.download;f.title='PDF 결과 미리보기';$('result').replaceChildren(f);}\n        else reply('변환 종료: '+job.state+' · '+(job.error||''));\n        await jobs();\n      }else reply('서버에서 변환 중입니다: '+job.state);\n    }catch(e){clearInterval(interval);interval=null;reply('작업 확인 실패: '+e.message);}\n  }\n  $('convert').addEventListener('click',async()=>{if(!selected||!engine||!csrf)return;\n    $('download').hidden=true;const form=new FormData();form.append('file',selected);$('convert').disabled=true;reply('문서를 전송하는 중입니다.');\n    try{job=await api('/api/jobs',{method:'POST',body:form});await poll();if(job&&!['completed','failed','cancelled','interrupted'].includes(job.state))interval=setInterval(poll,1400);}\n    catch(e){reply('변환 요청 실패: '+e.message);}finally{sync();}\n  });\n  $('cancel').addEventListener('click',async()=>{if(job&&csrf){try{await api('/api/jobs/'+encodeURIComponent(job.id)+'/cancel',{method:'POST'});reply('작업 취소 요청 완료');}catch(e){reply(e.message);}}});\n  $('refresh').addEventListener('click',jobs);\n  $('preview').addEventListener('click',()=>reply('브라우저 rhwp WASM 자산 연결 후 원본 미리보기를 활성화합니다.'));\n  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const r=await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})});$('password').value='';await authenticated(r);}catch(err){set('loginError','로그인 실패: '+err.message);}});\n  $('logout').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST'});}catch{}window.location.reload();});\n  checkServer();\n})();";
const POLICY = Object.freeze({
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'"
});
const utf = new TextEncoder();
function originConfig(env) {
  if(typeof env?.SUNRISE_BACKEND_ORIGIN!=='string'||typeof env?.SUNRISE_EDGE_HMAC_SECRET!=='string'||env.SUNRISE_EDGE_HMAC_SECRET.length<32) return null;
  try {
    const u=new URL(env.SUNRISE_BACKEND_ORIGIN);
    if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(u.hostname))return null;
    return u.origin;
  } catch {return null;}
}
function safe(text,status,method,contentType='application/json; charset=utf-8'){
  return new Response(method==='HEAD'?null:text,{status,headers:{...POLICY,'Content-Type':contentType,'Cache-Control':'no-store'}});
}
const json=(o,status,method)=>safe(JSON.stringify(o),status,method);
const hex=(buff)=>Array.from(new Uint8Array(buff)).map(v=>v.toString(16).padStart(2,'0')).join('');
async function relay(request,env,target) {
  const incoming=new URL(request.url);
  const method=request.method.toUpperCase();
  if(!['GET','HEAD','POST','DELETE'].includes(method))return json({detail:'METHOD_DENIED'},405,method);
  if(method!=='GET'&&method!=='HEAD'&&request.headers.get('Origin')!==incoming.origin)return json({detail:'ORIGIN_DENIED'},403,method);
  const headers=new Headers(request.headers);
  for(const name of ['host','x-forwarded-host','x-forwarded-proto','x-sunrise-edge-time','x-sunrise-edge-nonce','x-sunrise-edge-signature']) headers.delete(name);
  const time=String(Math.floor(Date.now()/1000));
  const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
  const canonical=time+'\n'+nonce+'\n'+method+'\n'+incoming.pathname+incoming.search;
  const key=await crypto.subtle.importKey('raw',utf.encode(env.SUNRISE_EDGE_HMAC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=hex(await crypto.subtle.sign('HMAC',key,utf.encode(canonical)));
  headers.set('X-Sunrise-Edge-Time',time);
  headers.set('X-Sunrise-Edge-Nonce',nonce);
  headers.set('X-Sunrise-Edge-Signature',sig);
  headers.set('Cache-Control','no-store');
  const len=Number(request.headers.get('content-length')||0);
  if(!Number.isFinite(len)||len>22*1024*1024)return json({detail:'UPLOAD_SIZE_LIMIT'},413,method);
  const upstream=new Request(target+incoming.pathname+incoming.search,{
    method,headers,body:['GET','HEAD'].includes(method)?undefined:request.body,redirect:'manual'
  });
  let answer;
  try{answer=await fetch(upstream,{redirect:'manual'});}
  catch{return json({detail:'CONVERSION_BACKEND_UNREACHABLE'},503,method);}
  if(answer.status>=300&&answer.status<400)return json({detail:'BACKEND_REDIRECT_DENIED'},502,method);
  const responseHeaders=new Headers(answer.headers);
  responseHeaders.set('Cache-Control','no-store');
  responseHeaders.set('X-Content-Type-Options','nosniff');
  responseHeaders.set('Referrer-Policy','no-referrer');
  responseHeaders.delete('Access-Control-Allow-Origin');
  return new Response(method==='HEAD'?null:answer.body,{status:answer.status,headers:responseHeaders});
}

/* R29 browser-only PDF. No document leaves the browser. */
const LOCAL_RHWP_WASM_SHA256="54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989";
const LOCAL_RHWP_WASM_BYTES=11821756;
const LOCAL_POLICY={...POLICY,
 'Permissions-Policy':'camera=(), microphone=(), geolocation=(), local-fonts=(self)',
 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self' blob:; frame-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
};
async function localAsset(request, env, assetPath, method, contentType) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function')
    return new Response('LOCAL_STATIC_ASSETS_NOT_CONFIGURED', {status:503,headers:LOCAL_POLICY});
  try {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = assetPath;
    assetUrl.search = '';
    const assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), {method}));
    if (assetResponse.status !== 200)
      return new Response('LOCAL_STATIC_ASSET_UNAVAILABLE', {status:503,headers:LOCAL_POLICY});
    const headers = new Headers(assetResponse.headers);
    for(const [name,value] of Object.entries(LOCAL_POLICY)) headers.set(name,value);
    headers.set('Content-Type',contentType);
    headers.set('Cache-Control',contentType==='application/wasm'?'public,max-age=86400':'no-store');
    if(contentType==='application/wasm')headers.set('X-Rhwp-Version','0.8.7');
    return new Response(method==='HEAD'?null:assetResponse.body,{status:200,headers});
  } catch {
    return new Response('LOCAL_STATIC_ASSET_FETCH_FAILED',{status:503,headers:LOCAL_POLICY});
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
    // R56 UI adapter, preserving the existing converter assets.
    if(path==='/ops-r56.js'||path==='/ops-r56.css'){
      if(method!=='GET'&&method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:LOCAL_POLICY});
      return new Response(method==='HEAD'?null:path.endsWith('.js')?OPERATIONS_R56_JS:OPERATIONS_R56_CSS,{
        status:200,headers:{...LOCAL_POLICY,'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store'}
      });
    }
    // TRACE_DEV4_SOURCE: separate public collector and authenticated admin routes.
    if(path==='/trace-dev4-client.js'||path==='/trace-dev4-admin.js'||path==='/trace-dev4-admin.css')
      return traceDev4Route(request,env);
    if(path==='/api/public/trace-dev4')return traceDev4Route(request,env);
    if(path==='/admin/traces'||path==='/admin/traces/'||path.startsWith('/api/admin/trace-dev4/')){
      if(!env?.PRO_ADMIN_DB?.prepare||!validSecrets(env))return new Response('ADMIN_NOT_CONFIGURED',{status:503});
      let session;try{session=await findSession(request,env.PRO_ADMIN_DB);}catch{return new Response('ADMIN_SESSION_FAILED',{status:500});}
      if(!session)return path.startsWith('/admin/traces')?Response.redirect(new URL('/admin/login/',request.url),302):new Response('ADMIN_LOGIN_REQUIRED',{status:401});
      if(!['GET','HEAD'].includes(method)&&(!originMatches(request)||!await verifyCsrf(request,session)))
        return new Response('CSRF_DENIED',{status:403});
      return traceDev4Route(request,env);
    }
    const adminResponse=await handleProAdmin(request,env);
    if(adminResponse){
      if(method==='GET'&&path.startsWith('/admin/')&&adminResponse.headers.get('content-type')?.includes('text/html'))return new HTMLRewriter().on('#side',{element(e){e.append('<a href="/admin/traces/">◈ <span>Trace v2 DEV4</span></a>',{html:true});}}).transform(adminResponse);
      return adminResponse;
    }
    const target=originConfig(env);
    if(path==='/local')return Response.redirect(new URL('/local/',request.url),302);
    if(path==='/local/'||path==='/local/index.html'){
      if(method!=='GET'&&method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:LOCAL_POLICY});
      const original=await localAsset(request,env,'/app.html',method,'text/html; charset=utf-8');
      if(method==='HEAD'||original.status!==200)return original;
      return new HTMLRewriter().on('head',{element(e){e.append('<link rel="stylesheet" href="/site-nav.css"><link rel="stylesheet" href="/ops-r56.css"><script src="/trace-dev4-client.js"></script><script src="/ops-r56.js"></script>',{html:true});}}).on('.top-inner',{element(e){e.append('<nav id="pro-site-navigation" aria-label="주요 메뉴"><a href="/">메인</a><a href="/features/">기능</a><a href="/contact/">문의</a><a href="/admin/">관리자</a></nav>',{html:true});}}).transform(original);
    }
    if(/^\/local\/assets\/(?:local-bundle\.js|local-chunk-[A-Za-z0-9_-]+\.js)$/.test(path)){
      if(method!=='GET'&&method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:LOCAL_POLICY});
      return localAsset(request,env,path.slice('/local'.length),method,'application/javascript; charset=utf-8');
    }
    if(path==='/local/pdf-worker.mjs'||path==='/local/pdf-worker-legacy.mjs'){
      if(!['GET','HEAD'].includes(method))return new Response('Method Not Allowed',{status:405,headers:LOCAL_POLICY});
      // Exact allowlist of the two self-hosted PDF.js workers. No wildcard
      // for arbitrary .mjs, source maps or client-controlled file paths.
      const name=path.slice('/local/'.length);
      return localAsset(request,env,'/'+name,method,'application/javascript; charset=utf-8');
    }
    const fontPath=/^\/local\/fonts\/(Nanum(?:Gothic|Myeongjo)-(?:Regular|Bold)\.ttf|SunriseSymbols\.otf|SunriseMarks\.ttf)$/.exec(path);
    if(fontPath){
      if(method!=='GET'&&method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:LOCAL_POLICY});
      return localAsset(request,env,'/fonts/'+fontPath[1],method,fontPath[1].endsWith('.otf')?'font/otf':'font/ttf');
    }
    if(path==='/local/rhwp_bg.wasm'){
      if(method!=='GET'&&method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:LOCAL_POLICY});
      return localAsset(request,env,'/rhwp_bg.wasm',method,'application/wasm');
    }
    if(path==='/local/health'&&['GET','HEAD'].includes(method))return new Response(method==='HEAD'?null:JSON.stringify({rhwp_version:'0.8.7',wasm_sha256:LOCAL_RHWP_WASM_SHA256,wasm_bytes:LOCAL_RHWP_WASM_BYTES,converter:'browser-local-pdf',default_output:'professional',optional_outputs:['native-print'],quality_target_dpi:300,wasm_delivery:'cloudflare-static-assets',external_conversion_api:false,document_upload:false}),{headers:{...LOCAL_POLICY,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    if(path==='/api/edge-health'&&['GET','HEAD'].includes(method))
      return json({service:'sunrise-pdf-pro-web',edge:'cloudflare-worker',backend_configured:Boolean(target),real_conversion_verified:false},200,method);
    if(path.startsWith('/api/')){
      if(!target){
        if(path==='/api/status'&&['GET','HEAD'].includes(method))
          return json({rhwp_cli_available:false,wasm_assets_verified:false,process_limits:{ready:false},rhwp_cli_contract_reason:'BACKEND_NOT_CONNECTED',actual_conversion_verified:false},200,method);
        return json({detail:'BACKEND_NOT_CONNECTED'},503,method);
      }
      return relay(request,env,target);
    }
    if(method!=='GET'&&method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:POLICY});
    if(path==='/'||path==='/index.html')return safe(sitePage('home'),200,method,'text/html; charset=utf-8');
    if(path==='/features')return Response.redirect(new URL('/features/',request.url),302);
    if(path==='/features/'||path==='/features/index.html')return safe(sitePage('features'),200,method,'text/html; charset=utf-8');
    if(path==='/site-home.css')return safe(siteCSS,200,method,'text/css; charset=utf-8');
    if(path==='/site-nav.css')return safe('#pro-site-navigation{display:flex;align-items:center;gap:16px;margin-left:auto;margin-right:24px}#pro-site-navigation a{font-size:13px;color:#c7e5ff;text-decoration:none}@media(max-width:820px){#pro-site-navigation{flex-wrap:wrap;gap:12px;margin:0}}',200,method,'text/css; charset=utf-8');
    if(path==='/style.css')return safe(CSS,200,method,'text/css; charset=utf-8');
    if(path==='/app.js')return safe(APP,200,method,'application/javascript; charset=utf-8');
    return new Response('Not Found',{status:404,headers:POLICY});
  },
  // 04:00 KST daily (19:00 UTC) - fixed retention, no documents or raw error text.
  async scheduled(_event,env,ctx){
    if(!env?.PRO_ADMIN_DB?.prepare||!env?.PRO_ADMIN_DB?.batch)return;
    ctx.waitUntil((async()=>{
      const now=Math.floor(Date.now()/1000);
      try{
        await env.PRO_ADMIN_DB.batch([
          env.PRO_ADMIN_DB.prepare('DELETE FROM pro_trace_dev4 WHERE happened_at<?').bind(now-14*86400),
          env.PRO_ADMIN_DB.prepare('DELETE FROM pro_trace_dev4_audit WHERE happened_at<?').bind(now-90*86400),
          env.PRO_ADMIN_DB.prepare('DELETE FROM pro_telemetry WHERE happened_at<?').bind(now-30*86400),
          env.PRO_ADMIN_DB.prepare('DELETE FROM pro_admin_sessions WHERE expires_at<?').bind(now)
        ]);
      }catch{console.warn('R56_RETENTION_FAILED');}
    })());
  }
};
