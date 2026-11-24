// First administrator setup: one strong operator-provided Worker secret.
// Browser PBKDF2 avoids expensive password derivation on the Worker.
import {sha256, now} from './auth.js';
export const ITERATIONS=600000;
const KEY='browser_admin_v1';
const encoder=new TextEncoder();
const hex=a=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
const isHex=(s,n)=>typeof s==='string'&&s.length===n&&/^[a-f0-9]+$/.test(s);
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
export const rootConfigured=env=>typeof env.ADMIN_SETUP_KEY==='string'&&env.ADMIN_SETUP_KEY.length>=32&&env.ADMIN_SETUP_KEY.length<=256;
export const legacyConfigured=env=>Boolean(env.ADMIN_USER||env.ADMIN_PASSWORD_HASH||env.ADMIN_SESSION_SECRET);
export const validAccount=a=>!!a&&typeof a.username==='string'&&/^[a-z][a-z0-9._-]{3,31}$/.test(a.username)&&isHex(a.salt,32)&&isHex(a.verifier,64);
export async function getAccount(db){
 const row=await db.prepare("SELECT value FROM pro_admin_settings WHERE key=?").bind(KEY).first();
 if(!row)return null;
 const account=JSON.parse(row.value);
 if(!validAccount(account))throw new Error('Invalid administrator record');
 return account;
}
async function keyed(env,scope,value){
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_SETUP_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(scope+':'+value)));
}
export async function verifySetupToken(env,token){
 if(!rootConfigured(env)||typeof token!=='string'||token.length<32||token.length>256)return false;
 return equal(await sha256(token),await sha256(env.ADMIN_SETUP_KEY));
}
export async function sessionSecret(env){return keyed(env,'sunrise-pro-admin-session-v1','');}
export const validProof=(proof,salt)=>isHex(proof,64)&&isHex(salt,32);
export async function makeAccount(env,username,proof,salt){
 if(!rootConfigured(env)||typeof username!=='string'||!/^[a-z][a-z0-9._-]{3,31}$/.test(username)||!validProof(proof,salt))return null;
 return {username,salt,verifier:await keyed(env,'sunrise-pro-admin-verifier-v1',username+':'+salt+':'+proof),created_at:now()};
}
export async function verifyProof(env,account,proof){
 if(!rootConfigured(env)||!validAccount(account)||!validProof(proof,account.salt))return false;
 return equal(account.verifier,await keyed(env,'sunrise-pro-admin-verifier-v1',account.username+':'+account.salt+':'+proof));
}
export async function registerAccount(db,account){
 if(!validAccount(account))return false;
 // A single atomic insert prevents simultaneous setup requests from replacing the administrator.
 const r=await db.prepare("INSERT OR IGNORE INTO pro_admin_settings(key,value) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM pro_admin_settings WHERE key='password_hash')").bind(KEY,JSON.stringify(account)).run();
 return r.meta?.changes===1;
}
export async function replaceAccount(db,old,next){
 if(!validAccount(old)||!validAccount(next)||old.username!==next.username||old.salt===next.salt)return false;
 const r=await db.prepare("UPDATE pro_admin_settings SET value=? WHERE key=? AND value=?").bind(JSON.stringify(next),KEY,JSON.stringify(old)).run();
 return r.meta?.changes===1;
}
export async function adminEnvironment(env){
 // The root key is never exposed to the client; only a domain-separated
 // session key is used by the existing session/CSRF implementation.
 if(!rootConfigured(env)||!env.PRO_ADMIN_DB?.prepare)return env;
 const account=await getAccount(env.PRO_ADMIN_DB);
 if(!account)return env;
 return {...env,ADMIN_BROWSER_ACCOUNT:account,ADMIN_USER:account.username,ADMIN_SESSION_SECRET:await sessionSecret(env)};
}
export const SETUP_HTML='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sunrise PDF PRO · 최초 관리자 등록</title><link rel="stylesheet" href="/admin/static/admin.css"><script defer src="/admin/static/credential.js"></script><script defer src="/admin/static/setup.js"></script></head><body><main class="login-wrap"><form class="login-panel" id="setup-form" autocomplete="off"><h1>최초 관리자 계정 등록</h1><p>Sunrise PDF PRO 운영 계정을 한 번만 등록합니다.</p><label>초기 설정 토큰<input name="token" type="password" required minlength="32" maxlength="256" autocomplete="off"></label><label>관리자 아이디<input name="username" value="sunrise-admin" required minlength="4" maxlength="32" pattern="[a-z][a-z0-9._\\-]{3,31}" autocomplete="username"></label><label>비밀번호<input name="password" type="password" required minlength="16" maxlength="128" autocomplete="new-password"></label><label>비밀번호 확인<input name="confirm" type="password" required minlength="16" maxlength="128" autocomplete="new-password"></label><button class="primary" type="submit" disabled>계정 등록</button><p id="setup-status" role="status" aria-live="polite">등록 가능 여부 확인 중</p><p><a href="/admin/login/">관리자 로그인</a> · <a href="/local/">서비스 화면</a></p></form></main></body></html>';
export const CREDENTIAL_JS=String.raw`'use strict';
(()=>{
 const hex=a=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
 window.sunriseAdminCredentials={
  salt:()=>hex(crypto.getRandomValues(new Uint8Array(16))),
  proof:async(password,salt,iterations)=>{
   if(typeof password!=='string'||password.length>256||typeof salt!=='string'||!/^[a-f0-9]{32}$/.test(salt)||iterations!==600000)throw Error('인증 설정을 확인해 주세요.');
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
   return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g),x=>parseInt(x,16)),iterations,hash:'SHA-256'},key,256));
  }
 };
})();`;
export const SETUP_JS=String.raw`'use strict';
(()=>{
 const form=document.getElementById('setup-form'),status=document.getElementById('setup-status'),button=form.querySelector('button');
 const errors={ADMIN_SETUP_DISABLED:'초기 설정 토큰을 Cloudflare에 먼저 등록하세요.',ADMIN_ALREADY_CONFIGURED:'관리자 계정이 이미 설정되어 있습니다.',INVALID_SETUP_TOKEN:'초기 설정 토큰이 올바르지 않습니다.',LOGIN_TEMPORARILY_LOCKED:'시도 횟수를 초과했습니다. 15분 후 다시 시도하세요.',INVALID_SETUP_INPUT:'입력 정보를 확인해 주세요.'};
 async function request(path,body){
  const r=await fetch(path,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',headers:{'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(errors[data.error]||'등록 요청을 처리하지 못했습니다 ('+r.status+').');
  return data;
 }
 async function boot(){
  try{const x=await request('/api/admin/setup-status');if(x.configured){status.textContent=errors.ADMIN_ALREADY_CONFIGURED;return;}if(!x.setup_enabled){status.textContent=errors.ADMIN_SETUP_DISABLED;return;}button.disabled=false;status.textContent='초기 설정 토큰과 새 계정 정보를 입력하세요.';}catch(e){status.textContent=e.message;}
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(button.disabled)return;
  const f=new FormData(form),password=String(f.get('password'));
  if(password!==f.get('confirm')||password.length<16||password.length>128){status.textContent='비밀번호를 16자 이상으로 지정하고 확인란과 일치시켜 주세요.';return;}
  button.disabled=true;status.textContent='계정을 안전하게 등록하는 중입니다.';
  try{const salt=window.sunriseAdminCredentials.salt(),proof=await window.sunriseAdminCredentials.proof(password,salt,600000);
   await request('/api/admin/setup',{token:f.get('token'),username:f.get('username'),salt,proof});form.reset();status.textContent='계정 등록 완료. 로그인 화면으로 이동합니다.';location.replace('/admin/login/');
  }catch(e){status.textContent=e.message;button.disabled=false;}
 });
 boot();
})();`;
