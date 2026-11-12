import {ADMIN_HTML,ADMIN_CSS,ADMIN_JS,CONTACT_HTML,NEWS_HTML,PUBLIC_JS} from './generated-assets.js';
import {validSecrets,verifyPassword,createSession,findSession,destroySession,cookieSet,cookieClear,verifyCsrf,originMatches,isLocked,recordLoginFailure,loginSubject,sessionCsrf,now} from './auth.js';

const SEC_HEADERS={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=(), local-fonts=()',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
 'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'
};
const j=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...SEC_HEADERS,'Content-Type':'application/json; charset=utf-8',...extra}});
const html=(data,status=200)=>new Response(data,{status,headers:{...SEC_HEADERS,'Content-Type':'text/html; charset=utf-8'}});
const file=(data,type)=>new Response(data,{headers:{...SEC_HEADERS,'Content-Type':type}});
const deny=(code,status=400)=>j({ok:false,error:code},status);
const id=()=>crypto.randomUUID();
const kstDay=t=>Math.floor((t+32400)/86400);
const cleanText=(value,limit)=>typeof value==='string'&&value.trim().length>0&&value.length<=limit?value.trim():null;
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const eventKinds=new Set(['visit','convert_start','convert_progress','convert_success','convert_failure','convert_cancel','render_error','active_30s']);
const allowedFeatures=new Set(['hwp','hwpx','xlsx','xls','png','jpg','batch','ui','other']);
const allowedStages=new Set(['none','load','fonts','font_scan','font_read','font_bundle','font_measure','parse','render','svg_build','svg_normalize','image_gif','image_png','image_filter','svg_sanitize','svg_preflight','svg_vector','svg_vector_done','pdf_finalize','pdf_stream','pdf_done','compat_raster','compat_page_done','compat_save','pdf','download','open','viewer','unknown']);
const allowedStatuses=new Set(['new','in_progress','resolved']);
const allowedPublicationStates=new Set(['draft','published','archived']);
const allowedKinds=new Set(['announcement','release']);
function clampedInt(value,min,max,fallback){const n=Number(value);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:fallback;}
async function readBody(request,limit=8192){
 if(!request.body)return {};
 const reader=request.body.getReader();const parts=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>limit)throw new Error('PAYLOAD_TOO_LARGE');parts.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(error){if(error?.message==='PAYLOAD_TOO_LARGE')throw error;throw new Error('INVALID_JSON');}
}
function dbReady(env){return Boolean(env?.PRO_ADMIN_DB?.prepare&&env?.PRO_ADMIN_DB?.batch);}
async function audit(db,action,subjectType='',subjectId='',outcome='success'){
 await db.prepare('INSERT INTO pro_admin_audit(id,occurred_at,action,subject_type,subject_id,outcome) VALUES(?,?,?,?,?,?)')
  .bind(id(),now(),action,subjectType,subjectId,outcome).run();
}
async function initialHash(env,db){
 const row=await db.prepare("SELECT value FROM pro_admin_settings WHERE key='password_hash'").first();
 return row?.value||env.ADMIN_PASSWORD_HASH;
}
async function login(req,env){
 if(!originMatches(req))return deny('ORIGIN_DENIED',403);
 let input;try{input=await readBody(req,4096);}catch(e){return deny(e.message==='PAYLOAD_TOO_LARGE'?'PAYLOAD_TOO_LARGE':'INVALID_JSON',400);}
 const db=env.PRO_ADMIN_DB,subject=await loginSubject(req,env);
 if(await isLocked(db,subject))return deny('LOGIN_TEMPORARILY_LOCKED',429);
 const username=typeof input.username==='string'?input.username:'';
 const password=typeof input.password==='string'?input.password:'';
 // A wrong username still runs expensive verification to reduce account enumeration.
 let valid=false;
 try{valid=await verifyPassword(password,await initialHash(env,db));}catch{valid=false;}
 if(!valid||username!==env.ADMIN_USER){
  await recordLoginFailure(db,subject);await audit(db,'login','','','denied');
  return deny('INVALID_CREDENTIALS',401);
 }
 await db.prepare('DELETE FROM pro_admin_login_limits WHERE subject_hash=?').bind(subject).run();
 const session=await createSession(db,env);await audit(db,'login');
 return j({ok:true,csrf:session.csrf,expires_at:session.expires_at},200,{'Set-Cookie':cookieSet(session.raw)});
}
async function publicationsFeed(db){
 const rows=await db.prepare(`SELECT id,kind,title,body,first_published_at FROM pro_publications
 WHERE state='published' AND first_published_at IS NOT NULL AND first_published_at<=?
 AND (expire_at IS NULL OR expire_at>?) AND CAST((?+32400)/86400 AS INTEGER)-CAST((first_published_at+32400)/86400 AS INTEGER) BETWEEN 0 AND 6
 ORDER BY first_published_at DESC LIMIT 30`).bind(now(),now(),now()).all();
 const arr=rows.results||[];
 return {announcements:arr.filter(x=>x.kind==='announcement'),releases:arr.filter(x=>x.kind==='release')};
}
async function submitTelemetry(req,db){
 if(!originMatches(req))return deny('ORIGIN_DENIED',403);
 let b;try{b=await readBody(req,2048);}catch(e){return deny(e.message,400);}
 if(!validId(b.event_id)||!validId(b.session_id)||!eventKinds.has(b.kind)||!allowedFeatures.has(b.feature)||!allowedStages.has(b.stage)||
  typeof b.error_code!=='string'||!/^(?:NONE|[A-Z][A-Z0-9_]{2,63})$/.test(b.error_code)||
  !Number.isSafeInteger(b.duration_ms)||b.duration_ms<0||b.duration_ms>3600000)
  return deny('INVALID_TELEMETRY_SCHEMA');
 // Rate guard is per ephemeral browser session, without IP or other device tracking.
 const count=await db.prepare('SELECT COUNT(*) AS n FROM pro_telemetry WHERE session_id=? AND happened_at>?')
  .bind(b.session_id,now()-3600).first();
 if((count?.n||0)>=300)return deny('EVENT_RATE_LIMIT',429);
 // R65: progress events need a separate table. The historical telemetry table
 // has a CHECK that intentionally excludes 'convert_progress'; never mutate
 // or rebuild it just to change the diagnostic event schema.
 if(b.kind==='convert_progress'){
  const recent=await db.prepare(
   'SELECT COUNT(*) AS n FROM pro_telemetry_progress WHERE session_id=? AND happened_at>?')
   .bind(b.session_id,now()-3600).first();
  if((recent?.n||0)>=240)return deny('EVENT_RATE_LIMIT',429);
  await db.prepare(`INSERT OR IGNORE INTO pro_telemetry_progress
   (event_id,session_id,happened_at,feature,stage,duration_ms) VALUES(?,?,?,?,?,?)`)
   .bind(b.event_id,b.session_id,now(),b.feature,b.stage,b.duration_ms).run();
  return j({ok:true},202);
 }
 await db.prepare(`INSERT OR IGNORE INTO pro_telemetry
 (event_id,session_id,happened_at,event_kind,feature,stage,error_code,duration_ms) VALUES(?,?,?,?,?,?,?,?)`)
 .bind(b.event_id,b.session_id,now(),b.kind,b.feature,b.stage,b.error_code,b.duration_ms).run();
 return j({ok:true},202);
}
// D1 uses positional placeholders; isolated, bounded personal data storage.
async function saveInquiry(req,db){
 if(!originMatches(req))return deny('ORIGIN_DENIED',403);
 let b;try{b=await readBody(req,8192);}catch(e){return deny(e.message,400);}
 if(b.company_website)return j({ok:true},202);
 const email=cleanText(b.email,160),subject=cleanText(b.subject,120),message=cleanText(b.message,3000);
 if(!email||!/^\S+@\S+\.\S+$/.test(email)||!subject||!message)return deny('INVALID_INQUIRY');
 const count=await db.prepare('SELECT COUNT(*) AS n FROM pro_inquiries WHERE email=? AND created_at>?').bind(email,now()-3600).first();
 if((count?.n||0)>=3)return deny('INQUIRY_RATE_LIMIT',429);
 const t=now(),rid=id();
 await db.prepare(`INSERT INTO pro_inquiries(id,created_at,updated_at,email,subject,message,status,admin_note)
 VALUES(?,?,?,?,?,?,'new','')`).bind(rid,t,t,email,subject,message).run();
 return j({ok:true,reference:rid},201);
}
async function dashboard(db){
 const t=now(),todayStart=kstDay(t)*86400-32400,weekStart=t-7*86400;
 const [stats,queries,topics,unresolved]=await Promise.all([
  db.prepare(`SELECT COUNT(DISTINCT CASE WHEN event_kind='visit' AND happened_at>=? THEN session_id END) AS visits_today,
  COUNT(DISTINCT CASE WHEN event_kind='visit' AND happened_at>=? THEN session_id END) AS visits_7d,
  SUM(CASE WHEN event_kind='convert_start' AND happened_at>=? THEN 1 ELSE 0 END) AS started_today,
  SUM(CASE WHEN event_kind='convert_success' AND happened_at>=? THEN 1 ELSE 0 END) AS successes_today,
  SUM(CASE WHEN event_kind='convert_failure' AND happened_at>=? THEN 1 ELSE 0 END) AS failures_today,
  SUM(CASE WHEN event_kind='active_30s' AND happened_at>=? THEN 30 ELSE 0 END) AS active_seconds_today FROM pro_telemetry`)
  .bind(todayStart,weekStart,todayStart,todayStart,todayStart,todayStart).first(),
  db.prepare("SELECT status,COUNT(*) AS n FROM pro_inquiries GROUP BY status").all(),
  db.prepare("SELECT COUNT(*) AS n FROM pro_publications WHERE state='published'").first(),
  db.prepare("SELECT error_code,stage,COUNT(*) AS n FROM pro_telemetry WHERE event_kind IN('convert_failure','render_error') AND happened_at>? GROUP BY error_code,stage ORDER BY n DESC LIMIT 8").bind(weekStart).all()
 ]);
 return {period:'KST',visits_today:stats?.visits_today||0,visits_7d:stats?.visits_7d||0,
  started_today:stats?.started_today||0,successes_today:stats?.successes_today||0,failures_today:stats?.failures_today||0,
  active_seconds_today:stats?.active_seconds_today||0,inquiries:Object.fromEntries((queries.results||[]).map(x=>[x.status,x.n])),
  published:topics?.n||0,top_errors:unresolved.results||[],telemetry_status:'counts_from_client_events_not_server_proof'};
}
async function visits(db,url){
 const days=clampedInt(url.searchParams.get('days'),1,30,14),t=now(),start=t-days*86400;
 const rows=await db.prepare(`SELECT CAST((happened_at+32400)/86400 AS INTEGER) AS kst_day,
 COUNT(DISTINCT CASE WHEN event_kind='visit' THEN session_id END) AS visit_sessions,
 SUM(CASE WHEN event_kind='active_30s' THEN 30 ELSE 0 END) AS active_seconds,
 SUM(CASE WHEN event_kind='convert_start' THEN 1 ELSE 0 END) AS starts,
 SUM(CASE WHEN event_kind='convert_success' THEN 1 ELSE 0 END) AS successes,
 SUM(CASE WHEN event_kind='convert_failure' THEN 1 ELSE 0 END) AS failures
 FROM pro_telemetry WHERE happened_at>=? GROUP BY kst_day ORDER BY kst_day DESC LIMIT 30`).bind(start).all();
 return {days,rows:rows.results||[],definitions:{visits:'고유 브라우저 세션 수(사람 수와 다름)',active_seconds:'활성 이벤트 × 30초 추정값'}};
}
async function diagnostics(db,url){
 const limit=clampedInt(url.searchParams.get('limit'),1,200,80),code=url.searchParams.get('code')||'';
 if(code&&!/^[A-Z0-9_]{3,64}$/.test(code))return null;
 const stmt=code?
  db.prepare("SELECT happened_at,event_kind,feature,stage,error_code,duration_ms,session_id FROM pro_telemetry WHERE event_kind IN('convert_failure','render_error') AND error_code=? ORDER BY happened_at DESC LIMIT ?").bind(code,limit):
  db.prepare("SELECT happened_at,event_kind,feature,stage,error_code,duration_ms,session_id FROM pro_telemetry WHERE event_kind IN('convert_failure','render_error') ORDER BY happened_at DESC LIMIT ?").bind(limit);
 const rows=await stmt.all();
 const totals=await db.prepare(`SELECT error_code,stage,feature,COUNT(*) AS n FROM pro_telemetry
 WHERE event_kind IN('convert_failure','render_error') AND happened_at>?
 GROUP BY error_code,stage,feature ORDER BY n DESC LIMIT 50`).bind(now()-30*86400).all();
 const [workflows,outcomes,activity]=await Promise.all([
  db.prepare(`SELECT happened_at,event_kind,feature,stage,error_code,duration_ms,session_id FROM pro_telemetry
   WHERE event_kind IN('convert_start','convert_success','convert_failure','convert_cancel') ORDER BY happened_at DESC LIMIT 80`).all(),
  db.prepare(`SELECT event_kind,COUNT(*) AS n FROM pro_telemetry WHERE event_kind IN('convert_start','convert_success','convert_failure','convert_cancel') AND happened_at>? GROUP BY event_kind`).bind(now()-7*86400).all(),
  db.prepare(`SELECT session_id,COUNT(*)*30 AS active_seconds FROM pro_telemetry WHERE event_kind='active_30s' AND happened_at>? GROUP BY session_id ORDER BY active_seconds DESC LIMIT 50`).bind(now()-7*86400).all()
 ]);
 return {records:rows.results||[],by_reason:totals.results||[],workflows:workflows.results||[],outcomes:outcomes.results||[],active_sessions:activity.results||[],privacy:'원문·파일명·PDF 내용·스택 미수집'};
}
async function adminListPublications(db){
 const r=await db.prepare('SELECT * FROM pro_publications ORDER BY created_at DESC LIMIT 150').all();return {items:r.results||[]};
}
async function savePublication(req,db,subjectId){
 let b;try{b=await readBody(req,12000);}catch(e){return deny(e.message,400);}
 const kind=b.kind,state=b.state,title=cleanText(b.title,140),body=cleanText(b.body,5000);
 if(!allowedKinds.has(kind)||!allowedPublicationStates.has(state)||!title||!body)return deny('INVALID_PUBLICATION');
 const expire=b.expire_at==null?null:clampedInt(b.expire_at,1,9999999999,null);
 if(b.expire_at!=null&&expire===null)return deny('INVALID_EXPIRY');
 const t=now(),rid=subjectId||id();
 if(subjectId){
  const existing=await db.prepare('SELECT id,first_published_at FROM pro_publications WHERE id=?').bind(subjectId).first();
  if(!existing)return deny('PUBLICATION_NOT_FOUND',404);
  const first=existing.first_published_at||(state==='published'?t:null);
  await db.prepare('UPDATE pro_publications SET kind=?,state=?,title=?,body=?,updated_at=?,first_published_at=?,expire_at=? WHERE id=?')
   .bind(kind,state,title,body,t,first,expire,rid).run();
 }else{
  await db.prepare('INSERT INTO pro_publications(id,kind,title,body,state,created_at,updated_at,first_published_at,expire_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .bind(rid,kind,title,body,state,t,t,state==='published'?t:null,expire).run();
 }
 await audit(db,subjectId?'publication_update':'publication_create','publication',rid);
 return j({ok:true,id:rid,first_published_at:subjectId?undefined:(state==='published'?t:null)},subjectId?200:201);
}
async function changeInquiry(req,db,subjectId){
 let b;try{b=await readBody(req,4096);}catch(e){return deny(e.message,400);}
 if(!allowedStatuses.has(b.status)||typeof b.admin_note!=='string'||b.admin_note.length>2000)return deny('INVALID_INQUIRY_UPDATE');
 const current=await db.prepare('SELECT id FROM pro_inquiries WHERE id=?').bind(subjectId).first();
 if(!current)return deny('INQUIRY_NOT_FOUND',404);
 await db.prepare('UPDATE pro_inquiries SET status=?,admin_note=?,updated_at=? WHERE id=?')
  .bind(b.status,b.admin_note,now(),subjectId).run();
 await audit(db,'inquiry_update','inquiry',subjectId);
 return j({ok:true});
}
async function security(db){
 const sessions=await db.prepare('SELECT COUNT(*) AS n FROM pro_admin_sessions WHERE expires_at>?').bind(now()).first();
 const attempts=await db.prepare('SELECT COUNT(*) AS n FROM pro_admin_login_limits WHERE locked_until>?').bind(now()).first();
 const logs=await db.prepare('SELECT occurred_at,action,subject_type,subject_id,outcome FROM pro_admin_audit ORDER BY occurred_at DESC LIMIT 50').all();
 return {active_sessions:sessions?.n||0,locked_subjects:attempts?.n||0,audit:logs.results||[]};
}
async function system(env,db){
 const health=await db.prepare('SELECT 1 AS ok').first();
 return {service:'Sunrise PDF PRO(web)',worker_status:'request_reached_worker',d1_status:health?.ok===1?'reachable':'unverified',
  git_sha:typeof env.DEPLOY_GIT_SHA==='string'?env.DEPLOY_GIT_SHA:null,
  worker_version:typeof env.DEPLOY_VERSION==='string'?env.DEPLOY_VERSION:null,
  last_deploy_at:typeof env.DEPLOYED_AT==='string'?env.DEPLOYED_AT:null,
  caveat:'배포 메타데이터는 배포 시 주입된 값이 있는 경우에만 표시; Cloudflare 원격 상태는 별도 검증 필요'};
}
async function changePassword(req,db,env){
 let b;try{b=await readBody(req,4096);}catch(e){return deny(e.message,400);}
 if(typeof b.current_password!=='string'||typeof b.new_password!=='string'||b.new_password.length<14||b.new_password.length>256)return deny('INVALID_PASSWORD_INPUT');
 if(!await verifyPassword(b.current_password,await initialHash(env,db)))return deny('INVALID_CREDENTIALS',401);
 const salt=crypto.getRandomValues(new Uint8Array(16));const bytes=new TextEncoder().encode(b.new_password);
 const key=await crypto.subtle.importKey('raw',bytes,{name:'PBKDF2'},false,['deriveBits']);
 const derived=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},key,256);
 const toHex=a=>[...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const hash=`pbkdf2-sha256$310000$${toHex(salt)}$${toHex(derived)}`;
 await db.prepare("INSERT INTO pro_admin_settings(key,value) VALUES('password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(hash).run();
 await db.prepare('DELETE FROM pro_admin_sessions').run();
 await audit(db,'password_changed');
 return j({ok:true,reauthentication_required:true},200,{'Set-Cookie':cookieClear()});
}
function methodOnly(req,allowed){return allowed.includes(req.method.toUpperCase());}
async function api(req,env,path,url){
 const db=env.PRO_ADMIN_DB,method=req.method.toUpperCase();
 if(!dbReady(env))return deny('ADMIN_DB_NOT_CONFIGURED',503);
 try{
  if(path==='/api/public/updates'&&methodOnly(req,['GET','HEAD']))return j(await publicationsFeed(db));
  if(path==='/api/public/telemetry'&&method==='POST')return submitTelemetry(req,db);
  if(path==='/api/public/inquiries'&&method==='POST')return saveInquiry(req,db);
  if(path==='/api/admin/login'&&method==='POST'){
   if(!validSecrets(env))return deny('ADMIN_AUTH_NOT_CONFIGURED',503);
   return login(req,env);
  }
  if(!path.startsWith('/api/admin/'))return deny('ROUTE_NOT_FOUND',404);
  if(!validSecrets(env))return deny('ADMIN_AUTH_NOT_CONFIGURED',503);
  const session=await findSession(req,db);
  if(!session)return deny('ADMIN_LOGIN_REQUIRED',401);
  if(method!=='GET'&&method!=='HEAD'&&(!originMatches(req)||!await verifyCsrf(req,session)))return deny('CSRF_DENIED',403);
  if(path==='/api/admin/session'&&method==='GET')return j({authenticated:true,csrf:await sessionCsrf(req,env),expires_at:session.expires_at});
  if(path==='/api/admin/logout'&&method==='POST'){
   await destroySession(req,db);await audit(db,'logout');return j({ok:true},200,{'Set-Cookie':cookieClear()});
  }
  if(path==='/api/admin/sessions/revoke-all'&&method==='POST'){
   await db.prepare('DELETE FROM pro_admin_sessions').run();
   await audit(db,'sessions_revoked');
   return j({ok:true,reauthentication_required:true},200,{'Set-Cookie':cookieClear()});
  }
  if(path==='/api/admin/dashboard'&&method==='GET')return j(await dashboard(db));
  if(path==='/api/admin/visits'&&method==='GET')return j(await visits(db,url));
  if(path==='/api/admin/diagnostics'&&method==='GET'){
   const data=await diagnostics(db,url);return data?j(data):deny('INVALID_ERROR_FILTER');
  }
  if(path==='/api/admin/inquiries'&&method==='GET'){
   const rows=await db.prepare('SELECT * FROM pro_inquiries ORDER BY created_at DESC LIMIT 150').all();return j({items:rows.results||[]});
  }
  const inquiry=/^\/api\/admin\/inquiries\/([a-f0-9-]{36})$/i.exec(path);
  if(inquiry&&method==='PATCH')return changeInquiry(req,db,inquiry[1]);
  if(path==='/api/admin/publications'&&method==='GET')return j(await adminListPublications(db));
  if(path==='/api/admin/publications'&&method==='POST')return savePublication(req,db,null);
  const publication=/^\/api\/admin\/publications\/([a-f0-9-]{36})$/i.exec(path);
  if(publication&&method==='PATCH')return savePublication(req,db,publication[1]);
  if(path==='/api/admin/system'&&method==='GET')return j(await system(env,db));
  if(path==='/api/admin/security'&&method==='GET')return j(await security(db));
  if(path==='/api/admin/password'&&method==='POST')return changePassword(req,db,env);
  if(path==='/api/admin/retention/purge'&&method==='POST'){
   const before=now()-30*86400;
   await db.prepare('DELETE FROM pro_telemetry WHERE happened_at<?').bind(before).run();
   await db.prepare('DELETE FROM pro_telemetry_progress WHERE happened_at<?').bind(before).run();
   await db.prepare('DELETE FROM pro_admin_sessions WHERE expires_at<?').bind(now()).run();
   await db.prepare('DELETE FROM pro_admin_login_limits WHERE window_start<?').bind(now()-86400).run();
   await db.prepare("DELETE FROM pro_inquiries WHERE status='resolved' AND updated_at<?").bind(now()-90*86400).run();
   await audit(db,'retention_purge');return j({ok:true,telemetry_retention_days:30,resolved_inquiry_retention_days:90});
  }
  return deny('ROUTE_NOT_FOUND',404);
 }catch(e){
  // Never expose D1 error details, SQL, stack traces, secrets or personal data.
  return deny('ADMIN_OPERATION_FAILED',500);
 }
}
export async function handleProAdmin(req,env){
 const url=new URL(req.url),p=url.pathname,method=req.method.toUpperCase();
 if(p.startsWith('/api/admin/')||p.startsWith('/api/public/'))return api(req,env,p,url);
 if(p==='/admin/static/admin.css')return methodOnly(req,['GET','HEAD'])?file(ADMIN_CSS,'text/css; charset=utf-8'):deny('METHOD_NOT_ALLOWED',405);
 if(p==='/admin/static/admin.js')return methodOnly(req,['GET','HEAD'])?file(ADMIN_JS,'text/javascript; charset=utf-8'):deny('METHOD_NOT_ALLOWED',405);
 if(p==='/admin/static/public.js')return methodOnly(req,['GET','HEAD'])?file(PUBLIC_JS,'text/javascript; charset=utf-8'):deny('METHOD_NOT_ALLOWED',405);
 if(p==='/contact/'||p==='/news/')return methodOnly(req,['GET','HEAD'])?html(p==='/contact/'?CONTACT_HTML:NEWS_HTML):deny('METHOD_NOT_ALLOWED',405);
 if(p==='/admin'||p==='/admin/')return Response.redirect(new URL('/admin/overview/',req.url),302);
 const isLogin=p==='/admin/login'||p==='/admin/login/';
 const page=/^\/admin\/(overview|visits|diagnostics|inquiries|publications|system|security)\/?$/.exec(p);
 if(isLogin||page){
  if(!methodOnly(req,['GET','HEAD']))return deny('METHOD_NOT_ALLOWED',405);
  if(!isLogin){if(!dbReady(env)||!validSecrets(env))return deny('ADMIN_NOT_CONFIGURED',503);
   try{if(!await findSession(req,env.PRO_ADMIN_DB))return Response.redirect(new URL('/admin/login/',req.url),302);}catch{return deny('ADMIN_OPERATION_FAILED',500);}
  }
  return html(ADMIN_HTML);
 }
 return null;
}
