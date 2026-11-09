const encoder=new TextEncoder();
export const COOKIE_NAME='__Host-sunrise-pro-admin';
export const TTL=8*3600;
const HEX=/^[0-9a-f]+$/i;
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=length=>crypto.getRandomValues(new Uint8Array(length));
const token=()=>[...bytes(32)].map(x=>x.toString(16).padStart(2,'0')).join('');
const safeEqual=(a,b)=>{
 const x=String(a),y=String(b);
 // Prevent early termination on mismatched or malformed lengths.
 let diff=x.length^y.length; for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x.charCodeAt(i)||0)^(y.charCodeAt(i)||0);
 return diff===0;
};
export const sha256=async str=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(str)));
export const now=()=>Math.floor(Date.now()/1000);
export const validSecrets=env=>typeof env.ADMIN_USER==='string'&&env.ADMIN_USER.length>0&&
 typeof env.ADMIN_SESSION_SECRET==='string'&&env.ADMIN_SESSION_SECRET.length>=64&&
 typeof env.ADMIN_PASSWORD_HASH==='string'&&/^pbkdf2-sha256\$\d+\$[0-9a-f]{32,}\$[0-9a-f]{64}$/i.test(env.ADMIN_PASSWORD_HASH);
export async function verifyPassword(input,stored){
 if(typeof input!=='string'||input.length>256)return false;
 const parts=String(stored||'').split('$');
 if(parts.length!==4||parts[0]!=='pbkdf2-sha256')return false;
 const rounds=Number(parts[1]);
 if(!Number.isSafeInteger(rounds)||rounds<210000||rounds>1000000||!HEX.test(parts[2])||parts[2].length<32||!HEX.test(parts[3])||parts[3].length!==64)return false;
 const salt=Uint8Array.from(parts[2].match(/.{2}/g),x=>parseInt(x,16));
 const key=await crypto.subtle.importKey('raw',encoder.encode(input),{name:'PBKDF2'},false,['deriveBits']);
 const value=hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:rounds,hash:'SHA-256'},key,256));
 return safeEqual(value,parts[3]);
}
export const cookieSet=t=>`${COOKIE_NAME}=${t}; Path=/; Max-Age=${TTL}; HttpOnly; Secure; SameSite=Strict`;
export const cookieClear=()=>`${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
export const cookieValue=req=>{
 const cookie=req.headers.get('Cookie')||'';
 const found=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE_NAME+'='));
 const value=found?.slice(COOKIE_NAME.length+1)||'';
 return /^[a-f0-9]{64}$/.test(value)?value:'';
};
export async function createSession(db,env){
 const raw=token(),csrf=await sha256(raw+env.ADMIN_SESSION_SECRET),issued=now();
 await db.prepare('INSERT INTO pro_admin_sessions(token_hash,csrf_hash,created_at,expires_at) VALUES(?,?,?,?)')
  .bind(await sha256(raw),await sha256(csrf),issued,issued+TTL).run();
 return {raw,csrf,expires_at:issued+TTL};
}
export async function findSession(req,db){
 const raw=cookieValue(req);if(!raw)return null;
 const stored=await db.prepare('SELECT token_hash,csrf_hash,expires_at FROM pro_admin_sessions WHERE token_hash=? AND expires_at>?').bind(await sha256(raw),now()).first();
 return stored||null;
}
export async function destroySession(req,db){
 const raw=cookieValue(req);if(raw)await db.prepare('DELETE FROM pro_admin_sessions WHERE token_hash=?').bind(await sha256(raw)).run();
}
export const sessionCsrf=(req,env)=>sha256(cookieValue(req)+env.ADMIN_SESSION_SECRET);
export async function verifyCsrf(req,session){
 const csrf=req.headers.get('X-Sunrise-CSRF')||'';
 if(!/^[a-f0-9]{64}$/.test(csrf))return false;
 return safeEqual(await sha256(csrf),session.csrf_hash);
}
export const originMatches=req=>{
 const requestUrl=new URL(req.url);const origin=req.headers.get('Origin');
 return origin===requestUrl.origin;
};
export const isLocked=async(db,subject)=>{
 const row=await db.prepare('SELECT locked_until FROM pro_admin_login_limits WHERE subject_hash=?').bind(subject).first();
 return row&&row.locked_until>now();
};
export async function recordLoginFailure(db,subject){
 const t=now();
 const row=await db.prepare('SELECT attempts,window_start FROM pro_admin_login_limits WHERE subject_hash=?').bind(subject).first();
 const attempts=row&&t-row.window_start<900?row.attempts+1:1;
 const start=row&&t-row.window_start<900?row.window_start:t;
 await db.prepare(`INSERT INTO pro_admin_login_limits(subject_hash,attempts,window_start,locked_until) VALUES(?,?,?,?)
 ON CONFLICT(subject_hash) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start,locked_until=excluded.locked_until`)
 .bind(subject,attempts,start,attempts>=6?t+900:0).run();
}
export async function loginSubject(req,env){
 const ip=req.headers.get('CF-Connecting-IP')||'local-unknown';
 // HMAC prevents retaining raw address. Cloudflare supplies the authoritative header in production.
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(ip)));
}
