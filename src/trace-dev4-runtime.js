/** Sunrise PDF PRO Trace v2 DEV4 adaptation. No document data in telemetry. */
const RELEASE='trace2-dev4-pro-20261110';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FEATURES=new Set(['hwp','hwpx','xls','xlsx','jpg','png','batch','other']);
const PHASES=new Set(['load','fonts','parse','render','pdf','download','unknown']);
const MODULES=new Set(['converter','pdf_fonts','svg_professional','pdf_writer','spreadsheet','image_pdf','batch','viewer','unknown']);
const CALLS=new Set(['read_file','select_fonts','parse_document','render_svg','render_page','write_pdf','make_archive','open_preview','convert_one','unknown']);
const SIZES=new Set(['empty','lt1m','1to10m','10to50m','ge50m','unknown']);
const BROWSERS=new Set(['chrome','edge','firefox','safari','other']);
const DURATIONS=new Set(['0to99','100to499','500to1999','2000to9999','ge10000']);
const STEPS=new Set(['select','load_start','load_ok','fonts_start','fonts_ok','parse_start','parse_ok','render_start','render_ok','pdf_start','pdf_ok','download_start','download_ok','failed','cancelled']);
const STATES=new Set(['new','investigating','fix_candidate','verifying','resolved','reopened']);
const KEYS=['schema','trace_id','operation_id','session_id','feature','code','phase','module','callsite','size_bucket','browser','client_release','duration_bucket','steps'];
const output=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(code,status=400)=>output({error:code},status);
const safeBody=async(req,limit)=>{
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))throw Error('CONTENT_TYPE');
 const len=Number(req.headers.get('content-length')||0);if(len>limit)throw Error('SIZE');
 const reader=req.body?.getReader();if(!reader)throw Error('BODY');
 let n=0;const parts=[];while(true){const x=await reader.read();if(x.done)break;n+=x.value.byteLength;if(n>limit)throw Error('SIZE');parts.push(x.value);}
 const b=new Uint8Array(n);let at=0;for(const p of parts){b.set(p,at);at+=p.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
};
function validate(t){
 if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).length!==KEYS.length||Object.keys(t).some(k=>!KEYS.includes(k)))return false;
 if(t.schema!==2||![t.trace_id,t.operation_id,t.session_id].every(s=>typeof s==='string'&&UUID.test(s))||new Set([t.trace_id,t.operation_id,t.session_id]).size!==3)return false;
 if(!FEATURES.has(t.feature)||!PHASES.has(t.phase)||!MODULES.has(t.module)||!CALLS.has(t.callsite)||!SIZES.has(t.size_bucket)||!BROWSERS.has(t.browser)||!DURATIONS.has(t.duration_bucket)||t.client_release!==RELEASE)return false;
 if(typeof t.code!=='string'||!/^[A-Z][A-Z0-9_]{2,63}$/.test(t.code))return false;
 if(!Array.isArray(t.steps)||t.steps.length<1||t.steps.length>12)return false;
 for(const s of t.steps)if(!s||Array.isArray(s)||Object.keys(s).sort().join(',')!=='duration,step'||!STEPS.has(s.step)||!DURATIONS.has(s.duration))return false;
 return true;
}
async function fingerprint(t){
 const bytes=new TextEncoder().encode([t.feature,t.code,t.phase,t.module,t.callsite].join('|'));
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return Array.from(digest.slice(0,4),n=>n.toString(16).padStart(2,'0')).join('');
}
async function submit(req,env){
 if(req.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
 if(req.headers.get('origin')!==new URL(req.url).origin)return fail('ORIGIN_DENIED',403);
 let t;try{t=await safeBody(req,3000);}catch{return fail('INVALID_PAYLOAD',400);}
 if(!validate(t))return fail('TRACE_SCHEMA_REJECTED',400);
 const db=env?.PRO_ADMIN_DB;if(!db?.prepare)return fail('STORAGE_UNAVAILABLE',503);
 const when=Math.floor(Date.now()/1000),fp=await fingerprint(t);
 try{
  const prior=await db.prepare('SELECT trace_id FROM pro_trace_dev4 WHERE operation_id=?').bind(t.operation_id).first();
  if(prior)return output({ok:true,trace_id:prior.trace_id,duplicate:true},202);
  const x=await db.prepare('INSERT OR IGNORE INTO pro_trace_dev4(trace_id,operation_id,session_scope,happened_at,feature,code,phase,module_id,callsite_id,size_bucket,browser,client_release,worker_version,duration_bucket,steps_json,fingerprint) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM pro_trace_dev4 WHERE session_scope=? AND happened_at>?)<40 AND (SELECT COUNT(*) FROM pro_trace_dev4 WHERE session_scope=? AND happened_at>?)<80')
   .bind(t.trace_id,t.operation_id,t.session_id,when,t.feature,t.code,t.phase,t.module,t.callsite,t.size_bucket,t.browser,t.client_release,env?.CF_VERSION_METADATA?.id||RELEASE,t.duration_bucket,JSON.stringify(t.steps),fp,t.session_id,when-3600,t.session_id,when-86400).run();
  if((x.meta?.changes||0)!==1)return fail('TRACE_RATE_OR_DUPLICATE',429);
  return output({ok:true,trace_id:t.trace_id},202);
 }catch{return fail('STORAGE_UNAVAILABLE',503);}
}
const hex8=/^[0-9a-f]{8}$/;
const commit=/^[0-9a-f]{40}$/;
async function list(db){
 const rs=await db.prepare("SELECT t.fingerprint,t.feature,t.code,t.phase,t.module_id,t.callsite_id,t.n,t.first_seen,t.last_seen,COALESCE(i.status,'new') status,COALESCE(i.revision,0) revision,CASE WHEN i.status='resolved' AND t.last_seen>i.resolved_at THEN 1 ELSE 0 END recurred FROM (SELECT fingerprint,feature,code,phase,module_id,callsite_id,COUNT(*) n,MIN(happened_at) first_seen,MAX(happened_at) last_seen FROM pro_trace_dev4 WHERE happened_at>=? GROUP BY fingerprint ORDER BY last_seen DESC LIMIT 100)t LEFT JOIN pro_trace_dev4_incidents i ON i.fingerprint=t.fingerprint ORDER BY t.last_seen DESC")
  .bind(Math.floor(Date.now()/1000)-14*86400).all();
 return output({schema:2,release:RELEASE,items:rs.results||[],retention_days:14});
}
async function detail(db,id){
 if(!UUID.test(id))return fail('INVALID_TRACE_ID');
 const row=await db.prepare('SELECT trace_id,happened_at,feature,code,phase,module_id,callsite_id,size_bucket,browser,client_release,worker_version,duration_bucket,steps_json,fingerprint FROM pro_trace_dev4 WHERE trace_id=?').bind(id).first();
 if(!row)return fail('NOT_FOUND',404);
 const {steps_json,...safe}=row;return output({trace:{...safe,steps:JSON.parse(steps_json)}});
}
async function update(req,db,fp){
 if(!hex8.test(fp))return fail('INVALID_FINGERPRINT');
 let b;try{b=await safeBody(req,1600);}catch{return fail('INVALID_PAYLOAD');}
 if(!b||Array.isArray(b)||Object.keys(b).sort().join(',')!=='fix_commit,note,revision,status'||!STATES.has(b.status)||typeof b.note!=='string'||b.note.length>400||/[@\x00-\x1f\x7f]|https?:\/\/|[a-z]:[\\/]|\.pdf\b/i.test(b.note)||!(b.fix_commit===null||(typeof b.fix_commit==='string'&&commit.test(b.fix_commit)))||!Number.isSafeInteger(b.revision)||b.revision<0||b.revision>1000000)return fail('INVALID_INCIDENT');
 const now=Math.floor(Date.now()/1000);
 try{
  const exists=await db.prepare('SELECT 1 yes FROM pro_trace_dev4 WHERE fingerprint=? LIMIT 1').bind(fp).first();if(!exists)return fail('NOT_FOUND',404);
  const rows=await db.batch([
   db.prepare("INSERT OR IGNORE INTO pro_trace_dev4_incidents(fingerprint,status,note,revision,created_at,updated_at) VALUES(?,'new','',0,?,?)").bind(fp,now,now),
   db.prepare("UPDATE pro_trace_dev4_incidents SET status=?,note=?,fix_commit=?,revision=revision+1,updated_at=?,resolved_at=CASE WHEN ?='resolved' THEN ? WHEN ?='reopened' THEN NULL ELSE resolved_at END WHERE fingerprint=? AND revision=?").bind(b.status,b.note.trim(),b.fix_commit,now,b.status,now,b.status,fp,b.revision),
   db.prepare('INSERT INTO pro_trace_dev4_audit(fingerprint,status,note,fix_commit,revision,happened_at) SELECT fingerprint,status,note,fix_commit,revision,? FROM pro_trace_dev4_incidents WHERE fingerprint=? AND changes()>0').bind(now,fp)
  ]);
  if(rows[1]?.meta?.changes!==1)return fail('REVISION_CONFLICT',409);
  return output({ok:true,revision:b.revision+1});
 }catch{return fail('INCIDENT_UPDATE_FAILED',503);}
}
async function history(db,fp){
 if(!hex8.test(fp))return fail('INVALID_FINGERPRINT');
 const rows=await db.prepare('SELECT status,note,fix_commit,revision,happened_at FROM pro_trace_dev4_audit WHERE fingerprint=? ORDER BY id DESC LIMIT 30').bind(fp).all();return output({items:rows.results||[]});
}
export async function traceDev4Route(req,env){
 const p=new URL(req.url).pathname,db=env?.PRO_ADMIN_DB;
 if(p==='/trace-dev4-client.js')return new Response(TRACE_CLIENT,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
 if(p==='/trace-dev4-admin.js')return new Response(TRACE_ADMIN_JS,{headers:{'content-type':'text/javascript; charset=utf-8','x-content-type-options':'nosniff'}});
 if(p==='/trace-dev4-admin.css')return new Response(TRACE_ADMIN_CSS,{headers:{'content-type':'text/css; charset=utf-8','x-content-type-options':'nosniff'}});
 if(p==='/admin/traces/'||p==='/admin/traces')return new Response(TRACE_ADMIN_HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY'}});
 if(p==='/api/public/trace-dev4')return submit(req,env);
 if(!db?.prepare)return fail('STORAGE_UNAVAILABLE',503);
 if(p==='/api/admin/trace-dev4/incidents'&&req.method==='GET')return list(db);
 const latest=/^\/api\/admin\/trace-dev4\/latest\/([0-9a-f]{8})$/.exec(p);
 if(latest&&req.method==='GET'){const x=await db.prepare('SELECT trace_id FROM pro_trace_dev4 WHERE fingerprint=? ORDER BY happened_at DESC LIMIT 1').bind(latest[1]).first();return output({trace_id:x?.trace_id||null});}
 const m=/^\/api\/admin\/trace-dev4\/traces\/([0-9a-f-]{36})$/.exec(p);
 if(m&&req.method==='GET')return detail(db,m[1]);
 const n=/^\/api\/admin\/trace-dev4\/incidents\/([0-9a-f]{8})(\/history)?$/.exec(p);
 if(n&&req.method==='PATCH'&&!n[2])return update(req,db,n[1]);
 if(n&&req.method==='GET'&&n[2])return history(db,n[1]);
 return fail('ROUTE_NOT_FOUND',404);
}
export const TRACE_DEV4_RELEASE=RELEASE;

const TRACE_CLIENT="/* PRO Trace v2 DEV4 observer: records only fixed event vocabulary, never file data. */\n(()=>{\n 'use strict';\n if(window.__proTraceDev4)return;\n window.__proTraceDev4=true;\n const original=window.fetch;\n if(typeof original!=='function'||!crypto?.randomUUID)return;\n const FEATURE=new Set(['hwp','hwpx','xls','xlsx','jpg','png','batch','other']);\n const PHASE=new Set(['load','fonts','parse','render','pdf','download']);\n const session_id=crypto.randomUUID();\n let active=null,seen=0;\n const bucket=ms=>ms<100?'0to99':ms<500?'100to499':ms<2000?'500to1999':ms<10000?'2000to9999':'ge10000';\n const browser=()=>/Edg\\//.test(navigator.userAgent)?'edge':/Firefox\\//.test(navigator.userAgent)?'firefox':/Chrome\\//.test(navigator.userAgent)?'chrome':/Safari\\//.test(navigator.userAgent)?'safari':'other';\n function mark(step){if(!active||active.steps.at(-1)?.step===step)return;active.steps.push({step,duration:bucket(performance.now()-active.started)});if(active.steps.length>12)active.steps.shift();}\n function showId(id){try{const area=document.querySelector('.queue')||document.getElementById('status');if(!area)return;const p=document.createElement('p');p.className='trace-dev4-id';p.textContent='변환 오류 진단번호: '+id;p.style.cssText='font-size:12px;overflow-wrap:anywhere';area.append(p);}catch{}}\n function onStatus(){if(!active)return;const s=document.getElementById('status')?.textContent||'';\n  if(/읽는 중/.test(s))mark('load_start');\n  else if(/글꼴|서체/.test(s))mark('fonts_start');\n  else if(/변환 중/.test(s))mark('render_start');\n  else if(/ZIP 준비/.test(s))mark('pdf_start');\n }\n const registerObserver=()=>{const el=document.getElementById('status');if(el)new MutationObserver(onStatus).observe(el,{childList:true,characterData:true,subtree:true});};\n if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',registerObserver,{once:true});else registerObserver();\n function onEvent(x){if(!x||typeof x!=='object')return;\n  if(x.kind==='convert_start'){\n   active={trace_id:crypto.randomUUID(),operation_id:crypto.randomUUID(),started:performance.now(),feature:FEATURE.has(x.feature)?x.feature:'other',steps:[]};mark('select');mark('load_start');return;\n  }\n  if(!active)return;\n  if(x.kind==='convert_success'){mark('pdf_ok');active=null;return;}\n  if(x.kind==='convert_cancel'){mark('cancelled');active=null;return;}\n  if(x.kind!=='convert_failure')return;\n  const phase=PHASE.has(x.stage)?x.stage:'unknown';\n  const code=typeof x.error_code==='string'&&/^[A-Z][A-Z0-9_]{2,63}$/.test(x.error_code)?x.error_code:'CONVERSION_FAILED';\n  const module=phase==='fonts'?'pdf_fonts':phase==='render'?(active.feature==='hwp'||active.feature==='hwpx'?'svg_professional':'converter'):phase==='pdf'?'pdf_writer':phase==='download'?'batch':active.feature==='xls'||active.feature==='xlsx'?'spreadsheet':active.feature==='jpg'||active.feature==='png'?'image_pdf':'converter';\n  const callsite=phase==='fonts'?'select_fonts':phase==='render'?(module==='svg_professional'?'render_svg':'render_page'):phase==='pdf'?'write_pdf':phase==='download'?'make_archive':phase==='load'?'read_file':'convert_one';\n  mark('failed');const t=active;active=null;\n  const payload={schema:2,trace_id:t.trace_id,operation_id:t.operation_id,session_id,feature:t.feature,code,phase,module,callsite,size_bucket:'unknown',browser:browser(),client_release:'trace2-dev4-pro-20261110',duration_bucket:bucket(performance.now()-t.started),steps:t.steps};\n  if(++seen>40)return;\n  try{const body=JSON.stringify(payload);if(body.length>2900)return;original.call(window,'/api/public/trace-dev4',{method:'POST',headers:{'content-type':'application/json'},body,credentials:'same-origin',keepalive:true}).catch(()=>{});showId(t.trace_id);}catch{}\n }\n window.fetch=function(input,init){\n  try{const url=typeof input==='string'?input:input?.url;const path=new URL(url,location.href);\n   if(path.origin===location.origin&&path.pathname==='/api/public/telemetry'&&(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string')onEvent(JSON.parse(init.body));\n  }catch{}\n  return Reflect.apply(original,this,arguments);\n };\n})();\n";

const TRACE_ADMIN_JS="(()=>{'use strict';\nconst $=id=>document.getElementById(id);\nlet current=null,csrf='';\nconst request=async(path,options={})=>{const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const b=await r.json();if(!r.ok)throw Error(b.error||'HTTP '+r.status);return b;};\nconst line=(parent,text)=>{const p=document.createElement('p');p.textContent=text;parent.append(p);};\nasync function load(){\n $('notice').textContent='오류 사건을 조회하는 중';$('groups').replaceChildren();\n try{const session=await request('/api/admin/session');csrf=session.csrf;\n  const j=await request('/api/admin/trace-dev4/incidents');$('notice').textContent='최근 14일 · '+j.items.length+'개 오류 유형';\n  for(const x of j.items){const b=document.createElement('button');b.type='button';b.textContent=x.feature+' · '+x.code+' · '+x.n+'건 · '+x.status+(x.recurred?' · 재발':'');b.onclick=()=>inspect(x);$('groups').append(b);}\n  if(!j.items.length)line($('groups'),'수집된 Trace DEV4 오류가 없습니다.');\n }catch(e){$('notice').textContent='조회 실패: '+e.message;}\n}\nasync function inspect(x){current=x;$('selected').textContent=x.fingerprint+' · '+x.feature+' · '+x.code+' · '+x.phase+' · '+x.module_id+'.'+x.callsite_id;\n $('status').value=x.status;$('revision').textContent='수정 버전 '+x.revision;\n $('steps').replaceChildren();$('history').replaceChildren();\n try{const hs=await request('/api/admin/trace-dev4/incidents/'+x.fingerprint+'/history');for(const h of hs.items)line($('history'),new Date(h.happened_at*1000).toLocaleString('ko-KR')+' · '+h.status+' · '+h.note);\n const latest=await request('/api/admin/trace-dev4/latest/'+x.fingerprint);if(latest.trace_id){const tr=await request('/api/admin/trace-dev4/traces/'+latest.trace_id);for(const s of tr.trace.steps)line($('steps'),s.step+' · '+s.duration);line($('steps'),'진단번호: '+tr.trace.trace_id);}\n }catch(e){line($('steps'),'상세 오류: '+e.message);}\n}\n$('save').onclick=async()=>{if(!current)return;try{const b=await request('/api/admin/trace-dev4/incidents/'+current.fingerprint,{method:'PATCH',headers:{'content-type':'application/json','X-Sunrise-CSRF':csrf},body:JSON.stringify({status:$('status').value,note:$('note').value,revision:current.revision,fix_commit:null})});$('notice').textContent='조사 상태 저장 완료 · '+b.revision;await load();}catch(e){$('notice').textContent='저장 실패: '+e.message;}};\n$('refresh').onclick=load;load();\n})();\n";

const TRACE_ADMIN_CSS=":root{font-family:system-ui,'Malgun Gothic',sans-serif;background:#f4f8fb;color:#163448;font-size:13px}body{margin:0}header{background:#123048;color:#fff;padding:16px 24px;display:flex;justify-content:space-between;gap:15px;align-items:center}header a{color:#cce7fc}main{max-width:1180px;margin:20px auto;padding:0 15px}h1{font-size:22px}h2{font-size:16px}section{padding:16px;background:#fff;border:1px solid #d4e2eb;border-radius:8px;margin-bottom:14px}button,select,textarea{font:inherit;border:1px solid #aac0cf;border-radius:6px;background:#fff;padding:9px}button{cursor:pointer}button:focus-visible,a:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #8dc4ed;outline-offset:2px}#groups{display:flex;flex-wrap:wrap;gap:8px}#groups button{max-width:100%;text-align:left}#steps p,#history p{padding:4px 0;border-bottom:1px solid #e2edf3;overflow-wrap:anywhere}textarea{display:block;width:100%;max-width:640px;height:80px;box-sizing:border-box}#notice{color:#386b89}@media(min-width:750px){.columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}}\n";

const TRACE_ADMIN_HTML="<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>Sunrise PDF PRO · Trace v2 DEV4</title><link rel=\"stylesheet\" href=\"/trace-dev4-admin.css\"><script src=\"/trace-dev4-admin.js\" defer></script></head><body><header><b>SUNRISE PDF PRO · Trace v2 DEV4</b><a href=\"/admin/diagnostics/\">관리자 대시보드로</a></header><main><h1>실행 추적 및 오류 사건 관리</h1><p id=\"notice\" role=\"status\" aria-live=\"polite\">관리자 세션 확인 중</p><section><h2>최근 오류 유형</h2><button id=\"refresh\" type=\"button\">새로고침</button><div id=\"groups\"></div></section><section><h2>선택된 오류 사건</h2><p id=\"selected\">오류를 선택하세요.</p><div class=\"columns\"><div><h2>단계별 실행 이력</h2><div id=\"steps\"></div></div><div><h2>조사 이력</h2><div id=\"history\"></div></div></div><label for=\"status\">조사 상태</label><select id=\"status\"><option value=\"new\">미확인</option><option value=\"investigating\">조사 중</option><option value=\"fix_candidate\">수정 후보</option><option value=\"verifying\">검증 중</option><option value=\"resolved\">해결</option><option value=\"reopened\">재발</option></select><p id=\"revision\"></p><label for=\"note\">관리자 비공개 메모(400자)</label><textarea id=\"note\" maxlength=\"400\" placeholder=\"문서명·메일·개인정보·URL은 입력하지 마세요\"></textarea><button id=\"save\" type=\"button\">조사 상태 저장</button></section></main></body></html>\n";