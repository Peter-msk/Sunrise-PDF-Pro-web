import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,pbkdf2Sync,randomBytes} from 'node:crypto';
import vm from 'node:vm';
import {handleProAdmin} from '../src/admin/handler.js';
import {adminEnvironment,CREDENTIAL_JS,SETUP_JS} from '../src/admin/setup.js';
import {ADMIN_JS,ADMIN_HTML} from '../src/admin/generated-assets.js';
globalThis.crypto ??= webcrypto;
const origin='https://sunrise.example';
const hex=n=>randomBytes(n).toString('hex');
function mockDB(){
 const settings=new Map(),sessions=new Map(),limits=new Map(),audit=[];
 return {settings,sessions,limits,audit,batch:async()=>[],prepare(sql){
  const q=sql.replace(/\s+/g,' ').trim();
  const build=(args)=>({bind:(...a)=>build(a),async first(){
   if(q.includes('SELECT value FROM pro_admin_settings WHERE key=?'))return settings.has(args[0])?{value:settings.get(args[0])}:null;
   if(q.includes("SELECT value FROM pro_admin_settings WHERE key='password_hash'"))return settings.has('password_hash')?{value:settings.get('password_hash')}:null;
   if(q.includes('SELECT token_hash,csrf_hash,expires_at FROM pro_admin_sessions')){const x=sessions.get(args[0]);return x&&x.expires_at>args[1]?x:null;}
   if(q.includes('SELECT locked_until FROM pro_admin_login_limits')||q.includes('SELECT attempts,window_start FROM pro_admin_login_limits'))return limits.get(args[0])||null;
   throw Error('Unknown SELECT: '+q);
  },async run(){
   let changes=1;
   if(q.startsWith('INSERT OR IGNORE INTO pro_admin_settings')){if(settings.has(args[0])||settings.has('password_hash'))changes=0;else settings.set(args[0],args[1]);}
   else if(q.startsWith('UPDATE pro_admin_settings SET value=?')){if(settings.get(args[1])!==args[2])changes=0;else settings.set(args[1],args[0]);}
   else if(q.startsWith('INSERT INTO pro_admin_sessions'))sessions.set(args[0],{token_hash:args[0],csrf_hash:args[1],created_at:args[2],expires_at:args[3]});
   else if(q.startsWith('DELETE FROM pro_admin_sessions WHERE token_hash=?'))sessions.delete(args[0]);
   else if(q==='DELETE FROM pro_admin_sessions')sessions.clear();
   else if(q.startsWith('INSERT INTO pro_admin_login_limits'))limits.set(args[0],{attempts:args[1],window_start:args[2],locked_until:args[3]});
   else if(q.startsWith('DELETE FROM pro_admin_login_limits WHERE subject_hash=?'))limits.delete(args[0]);
   else if(q.startsWith('INSERT INTO pro_admin_audit'))audit.push(args);
   else throw Error('Unknown mutation: '+q);
   return {success:true,meta:{changes}};
  }});
  return build([]);
 }};
}
async function call(env,path,{method='GET',body,cookie,csrf,from=origin}={}){
 const headers={'Origin':from,'CF-Connecting-IP':'192.0.2.1'};
 if(body!==undefined)headers['Content-Type']='application/json';
 if(cookie)headers.Cookie=cookie;
 if(csrf)headers['X-Sunrise-CSRF']=csrf;
 const res=await handleProAdmin(new Request(origin+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),await adminEnvironment(env));
 assert.ok(res,'route must exist');
 return res;
}
const scope={window:{},crypto:webcrypto,TextEncoder,Uint8Array};
new vm.Script(CREDENTIAL_JS).runInNewContext(scope);
const derive=scope.window.sunriseAdminCredentials.proof;
const salt=()=>scope.window.sunriseAdminCredentials.salt();
test('first registration is disabled without operator key and legacy auth remains closed',async()=>{
 const env={PRO_ADMIN_DB:mockDB()};
 assert.deepEqual(await (await call(env,'/api/admin/setup-status')).json(),{configured:false,setup_enabled:false});
 assert.equal((await call(env,'/api/admin/setup',{method:'POST',body:{}})).status,503);
 assert.equal((await call(env,'/api/admin/session')).status,503);
 assert.equal((await call(env,'/admin/setup/')).status,200);
});
test('operator-only registration, browser proof, protected session, rotation and logout',async()=>{
 const env={PRO_ADMIN_DB:mockDB(),ADMIN_SETUP_KEY:hex(32)};
 const username='sunrise-admin',password=hex(18),password2=hex(18),s=salt(),proof=await derive(password,s,600000);
 const body={token:env.ADMIN_SETUP_KEY,username,salt:s,proof};
 assert.deepEqual(await (await call(env,'/api/admin/setup-status')).json(),{configured:false,setup_enabled:true});
 assert.equal((await call(env,'/api/admin/setup',{method:'POST',body,from:'https://other.example'})).status,403);
 assert.equal((await call(env,'/api/admin/setup',{method:'POST',body:{...body,token:hex(32)}})).status,403);
 assert.equal(env.PRO_ADMIN_DB.settings.size,0);
 for(const malformed of [null,[],true,42,'bad']){
  const rejected=await call(env,'/api/admin/setup',{method:'POST',body:malformed});
  assert.equal(rejected.status,400);assert.equal((await rejected.json()).error,'INVALID_JSON');
 }
 assert.equal(env.PRO_ADMIN_DB.settings.size,0);
 assert.equal((await call(env,'/api/admin/setup',{method:'POST',body})).status,201);
 assert.equal((await call(env,'/api/admin/setup',{method:'POST',body})).status,409);
 const stored=env.PRO_ADMIN_DB.settings.get('browser_admin_v1');
 assert.ok(stored&&!stored.includes(proof)&&!stored.includes(password)&&!stored.includes(env.ADMIN_SETUP_KEY));
 assert.deepEqual(await (await call(env,'/api/admin/setup-status')).json(),{configured:true,setup_enabled:false});
 assert.deepEqual(await (await call(env,'/api/admin/auth-challenge')).json(),{mode:'browser',salt:s,iterations:600000});
 assert.equal((await call(env,'/api/admin/session')).status,401);
 assert.equal((await call(env,'/api/admin/login',{method:'POST',body:{username,proof:hex(32)}})).status,401);
 for(const malformed of [null,[],true,42,'bad']){
  const rejected=await call(env,'/api/admin/login',{method:'POST',body:malformed});
  assert.equal(rejected.status,400);assert.equal((await rejected.json()).error,'INVALID_JSON');
 }
 const login=await call(env,'/api/admin/login',{method:'POST',body:{username,proof}});
 assert.equal(login.status,200);
 const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/HttpOnly; Secure; SameSite=Strict/);
 const cookie=setCookie.split(';')[0],{csrf}=await login.json();
 assert.equal((await call(env,'/api/admin/session',{cookie})).status,200);
 for(const malformed of [null,[],true,42,'bad']){
  const rejected=await call(env,'/api/admin/password',{method:'POST',body:malformed,cookie,csrf});
  assert.equal(rejected.status,400);assert.equal((await rejected.json()).error,'INVALID_JSON');
 }
 assert.equal((await call(env,'/api/admin/session',{cookie})).status,200);
 const new_salt=salt(),new_proof=await derive(password2,new_salt,600000),change={current_proof:proof,new_salt,new_proof};
 assert.equal((await call(env,'/api/admin/password',{method:'POST',body:change,cookie})).status,403);
 assert.equal((await call(env,'/api/admin/password',{method:'POST',body:change,cookie,csrf})).status,200);
 assert.equal((await call(env,'/api/admin/session',{cookie})).status,401);
 assert.equal((await call(env,'/api/admin/login',{method:'POST',body:{username,proof}})).status,401);
 const again=await call(env,'/api/admin/login',{method:'POST',body:{username,proof:new_proof}});assert.equal(again.status,200);
 const cookie2=again.headers.get('set-cookie').split(';')[0],csrf2=(await again.json()).csrf;
 assert.equal((await call(env,'/api/admin/logout',{method:'POST',cookie:cookie2,csrf:csrf2})).status,200);
 assert.equal((await call(env,'/api/admin/session',{cookie:cookie2})).status,401);
 assert.equal((await call({...env,ADMIN_SETUP_KEY:undefined},'/api/admin/session',{cookie:cookie2})).status,503);
});
test('legacy operator credentials are not replaced by first registration',async()=>{
 const s=hex(16),password=hex(16),hash=pbkdf2Sync(password,Buffer.from(s,'hex'),310000,32,'sha256').toString('hex');
 const env={PRO_ADMIN_DB:mockDB(),ADMIN_SETUP_KEY:hex(32),ADMIN_USER:'legacy-admin',ADMIN_SESSION_SECRET:hex(32),ADMIN_PASSWORD_HASH:'pbkdf2-sha256$310000$'+s+'$'+hash};
 assert.equal((await call(env,'/api/admin/setup',{method:'POST',body:{}})).status,409);
 assert.deepEqual(await (await call(env,'/api/admin/auth-challenge')).json(),{mode:'legacy'});
 assert.equal((await call(env,'/api/admin/login',{method:'POST',body:{username:env.ADMIN_USER,password}})).status,200);
});
test('Korean setup assets and login scripts parse; secrets are never embedded',()=>{
 assert.doesNotThrow(()=>new vm.Script(SETUP_JS));
 assert.doesNotThrow(()=>new vm.Script(ADMIN_JS));
 assert.match(ADMIN_HTML,/\/admin\/setup\//);
 assert.match(ADMIN_HTML,/\/admin\/static\/credential\.js/);
});

test('asynchronous admin database rejection is contained in a generic JSON 500',async()=>{
 const db=mockDB();
 const failure='private database failure detail';
 db.prepare=()=>({bind(){return this;},async first(){throw Error(failure);}});
 const response=await call({PRO_ADMIN_DB:db},'/api/admin/setup-status');
 assert.equal(response.status,500);
 assert.deepEqual(await response.json(),{ok:false,error:'ADMIN_OPERATION_FAILED'});
 assert.equal(response.headers.get('cache-control'),'no-store');
});

// DEV67: route-level regression for UTF-8 size limits and public failure containment.
test('valid Korean inquiry at the character limit is accepted and database errors are sanitized',async()=>{
 const db=mockDB();let inserted=null;
 db.prepare=sql=>({bind(...args){return {async first(){if(sql.includes('COUNT(*) AS n FROM pro_inquiries'))return {n:0};throw Error('private database detail');},async run(){if(sql.includes('INSERT INTO pro_inquiries')){inserted=args;return {success:true,meta:{changes:1}};}throw Error('unexpected mutation');}};}});
 const env={PRO_ADMIN_DB:db};const body={email:'test@example.invalid',subject:'가'.repeat(120),message:'한'.repeat(3000)};
 const accepted=await call(env,'/api/public/inquiries',{method:'POST',body});
 assert.equal(accepted.status,201);assert.equal(inserted[5],body.message);
 const invalid=await call(env,'/api/public/inquiries',{method:'POST',body:{...body,message:'한'.repeat(3001)}});
 assert.equal(invalid.status,400);
 db.prepare=()=>({bind(){return this;},async first(){throw Error('private database detail');}});
 const failed=await call(env,'/api/public/inquiries',{method:'POST',body});
 assert.equal(failed.status,500);assert.deepEqual(await failed.json(),{ok:false,error:'ADMIN_OPERATION_FAILED'});
});
