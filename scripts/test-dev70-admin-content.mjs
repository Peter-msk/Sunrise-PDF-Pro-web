import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleProAdmin} from '../src/admin/handler.js';
import {createSession,COOKIE_NAME,now} from '../src/admin/auth.js';
import {ADMIN_JS} from '../src/admin/generated-assets.js';
import vm from 'node:vm';
const origin='https://example.test';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE pro_inquiries(id TEXT PRIMARY KEY,created_at INTEGER,updated_at INTEGER,email TEXT,subject TEXT,message TEXT,status TEXT,admin_note TEXT);
 CREATE TABLE pro_publications(id TEXT PRIMARY KEY,kind TEXT,title TEXT,body TEXT,state TEXT,created_at INTEGER,updated_at INTEGER,first_published_at INTEGER,expire_at INTEGER);
 CREATE TABLE pro_admin_sessions(token_hash TEXT PRIMARY KEY,csrf_hash TEXT,created_at INTEGER,expires_at INTEGER);
 CREATE TABLE pro_admin_audit(id TEXT PRIMARY KEY,occurred_at INTEGER,action TEXT,subject_type TEXT,subject_id TEXT,outcome TEXT);`);
 const db={prepare:q=>({bind:(...a)=>({run:async()=>({meta:{changes:Number(sql.prepare(q).run(...a).changes)}}),all:async()=>({results:sql.prepare(q).all(...a)}),first:async()=>sql.prepare(q).get(...a)})}),batch:async()=>{throw Error('unexpected batch');}};
 const env={PRO_ADMIN_DB:db,ADMIN_USER:'test',ADMIN_SESSION_SECRET:'a'.repeat(64),ADMIN_PASSWORD_HASH:'pbkdf2-sha256$310000$'+'a'.repeat(32)+'$'+'b'.repeat(64)};
 const send=async(path,method='GET',body,session)=>handleProAdmin(new Request(origin+path,{method,headers:{Origin:origin,...(session?{Cookie:COOKIE_NAME+'='+session.raw,'X-Sunrise-CSRF':session.csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 return {db,env,sql,send,close:()=>sql.close()};
}
test('public inquiry limits are atomic and case-insensitive; Korean boundaries preserved',async()=>{
 const f=fixture();try{
 const body={email:'TEST@example.invalid',subject:'가'.repeat(120),message:'한'.repeat(3000)};
 assert.equal((await f.send('/api/public/inquiries','POST',body)).status,201);
 assert.equal((await f.send('/api/public/inquiries','POST',{...body,email:'test@example.invalid'})).status,201);
 assert.equal((await f.send('/api/public/inquiries','POST',body)).status,201);
 assert.equal((await f.send('/api/public/inquiries','POST',body)).status,429);
 assert.equal((await f.send('/api/public/inquiries','POST',{...body,message:'한'.repeat(3001)})).status,400);
 assert.equal((await f.send('/api/public/inquiries','POST',{...body,company_website:'bot'})).status,202);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM pro_inquiries').get().n,3);
 }finally{f.close();}
});
test('authenticated publication updates preserve expiry and first date; unauthenticated writes denied',async()=>{
 const f=fixture();try{
 const path='/api/admin/publications',t=now(),body={kind:'announcement',state:'published',title:'공지',body:'내용',expire_at:t+3600};
 assert.equal((await f.send(path,'POST',body)).status,401);
 const session=await createSession(f.db,f.env);
 for(const v of [true,'123',1.5,-1,0,t-1])assert.equal((await f.send(path,'POST',{...body,expire_at:v},session)).status,400);
 const res=await f.send(path,'POST',body,session);assert.equal(res.status,201);
 const item=await res.json(),url=path+'/'+item.id;
 const {expire_at,...rest}=body;
 const updated=await f.send(url,'PATCH',{...rest,title:'수정'},session);assert.equal(updated.status,200);
 const edit=await updated.json();assert.equal(edit.expire_at,expire_at);assert.equal(edit.first_published_at,item.first_published_at);
 assert.equal((await f.send(url,'PATCH',{...rest,expire_at:null},session)).status,200);
 assert.equal((await f.send('/api/public/updates')).status,200);
 assert.equal((await (await f.send('/api/public/updates')).json()).announcements.length,1);
 assert.equal((await f.send(url,'PATCH',{...rest,state:'archived'},session)).status,200);
 assert.equal((await (await f.send('/api/public/updates')).json()).announcements.length,0);
 }finally{f.close();}
});
test('administrator JS parses and exposes search and KST expiry input',()=>{
 assert.doesNotThrow(()=>new vm.Script(ADMIN_JS));
 assert.match(ADMIN_JS,/datetime-local/);assert.match(ADMIN_JS,/문의 검색/);assert.match(ADMIN_JS,/게시물 검색/);
});
