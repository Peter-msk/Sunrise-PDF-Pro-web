import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {recordLoginFailure} from '../src/admin/auth.js';
import {handleProAdmin} from '../src/admin/handler.js';
import {traceDev4Route} from '../src/trace-dev4-runtime.js';
test('failed-login counters retain concurrent increments and fixed lock expiration',async()=>{
 const sql=new DatabaseSync(':memory:');try{
 sql.exec('CREATE TABLE pro_admin_login_limits(subject_hash TEXT PRIMARY KEY,attempts INTEGER,window_start INTEGER,locked_until INTEGER)');
 const db={prepare:q=>({bind:(...a)=>({run:async()=>sql.prepare(q).run(...a)})})};
 const t=1800000000;
 const row=s=>sql.prepare('SELECT attempts,window_start,locked_until FROM pro_admin_login_limits WHERE subject_hash=?').get(s);
 for(let i=0;i<5;i++)await recordLoginFailure(db,'a',t+i);
 assert.equal(row('a').attempts,5);assert.equal(row('a').locked_until,0);
 await recordLoginFailure(db,'a',t+5);assert.equal(row('a').locked_until,t+905);
 await recordLoginFailure(db,'a',t+20);assert.equal(row('a').locked_until,t+905);
 await recordLoginFailure(db,'a',t+905);assert.equal(row('a').attempts,1);
 await recordLoginFailure(db,'b',t);await recordLoginFailure(db,'b',t+900);assert.equal(row('b').attempts,1);
 await Promise.all(Array.from({length:24},()=>recordLoginFailure(db,'parallel',t)));
 assert.equal(row('parallel').attempts,6);assert.equal(row('parallel').locked_until,t+900);
 }finally{sql.close();}
});
test('public JSON request boundary and content-type are enforced before storage',async()=>{
 let writes=0;
 const db={prepare:()=>({bind:()=>({run:async()=>{writes++;return {meta:{changes:1}}}})}),batch:async()=>[]};
 const origin='https://example.test';
 const req=async(body,headers={})=>handleProAdmin(new Request(origin+'/api/public/inquiries',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body})}),{PRO_ADMIN_DB:db});
 const valid=JSON.stringify({email:'test@example.invalid',subject:'한글',message:'가'.repeat(3000)});
 assert.equal((await req(valid,{'Content-Type':'application/json; charset=utf-8'})).status,201);
 assert.equal((await req(valid,{'Content-Type':'text/plain'})).status,400);
 assert.equal((await req(undefined)).status,400);
 assert.equal((await req(valid,{'Content-Length':'25000'})).status,400);
 assert.equal((await req(JSON.stringify({body:'한'.repeat(9000)}))).status,400);
 for(const x of ['null','[]','true','1','"str"','{'])assert.equal((await req(x)).status,400);
 assert.equal((await req(new Uint8Array([123,34,255,34,58,49,125]))).status,400);
 assert.equal(writes,1);
});
test('trace admin HTML and JSON return no-store security headers',async()=>{
 for(const [path,method] of [['/admin/traces/','GET'],['/api/public/trace-dev4','GET']]){
 const res=await traceDev4Route(new Request('https://example.test'+path,{method}),{});
 assert.equal(res.headers.get('cache-control'),'no-store');
 assert.equal(res.headers.get('x-frame-options'),'DENY');
 assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 }
});
test('inquiry rate lookup uses additive expression index',()=>{
 const sql=new DatabaseSync(':memory:');try{
 sql.exec('CREATE TABLE pro_inquiries(email TEXT,created_at INTEGER); CREATE INDEX idx_pro_inquiries_date ON pro_inquiries(created_at DESC);');
 const migration=readFileSync(new URL('../migrations/dev72-inquiry-index.sql',import.meta.url),'utf8');
 sql.exec(migration);sql.exec(migration);
 const p=sql.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM pro_inquiries WHERE lower(email)=lower(?) AND created_at>?').all('test@example.invalid',1);
 assert.ok(p.some(x=>x.detail.includes('idx_pro_inquiries_email_time')&&x.detail.includes('<expr>=?')));
 }finally{sql.close();}
});
