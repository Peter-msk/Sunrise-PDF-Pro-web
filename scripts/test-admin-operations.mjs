import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {operationEventValid,operationStatement,operationSummary} from '../src/admin/operations.js';
const schema=readFileSync(new URL('../migrations/dev68-operation-telemetry.sql',import.meta.url),'utf8');
const t=2000000000,uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);sql.exec(schema);
 const db={prepare:q=>({bind:(...a)=>({run:()=>sql.prepare(q).run(...a),all:async()=>({results:sql.prepare(q).all(...a)}),first:async()=>sql.prepare(q).get(...a)})})};
 const send=(kind,n,opts={})=>operationStatement(db,{operation_id:uuid(n),session_id:uuid(999),feature:'hwp',kind,stage:'render',error_code:'NONE',duration_ms:0,...opts},opts.time??t,{allowNew:opts.allowNew!==false}).run();
 return {db,send,row:n=>sql.prepare('SELECT * FROM pro_conversion_operations WHERE operation_id=?').get(uuid(n)),close:()=>sql.close()};
}
test('valid operation ids only',()=>{
 assert.ok(operationEventValid({operation_id:uuid(1),kind:'convert_start'}));
 assert.ok(!operationEventValid({operation_id:'bad',kind:'convert_start'}));
 assert.ok(!operationEventValid({operation_id:uuid(1),kind:'visit'}));
});
test('duplicate start and terminal cannot inflate the operation count or change outcome',async()=>{
 const f=fixture();try{
 f.send('convert_start',1);f.send('convert_start',1,{time:t+1});
 f.send('convert_success',1,{duration_ms:300,time:t+2});f.send('convert_failure',1,{duration_ms:500,error_code:'CONVERSION_FAILED',time:t+3});
 const row=f.row(1);assert.equal(row.started_at,t);assert.equal(row.outcome,'success');assert.equal(row.duration_ms,300);
 const s=await operationSummary(f.db,t+4);assert.equal(s.rows[0].started,1);assert.equal(s.rows[0].successes,1);
 }finally{f.close();}
});
test('terminal arriving first is linked when start arrives late',async()=>{
 const f=fixture();try{
 f.send('convert_failure',1,{error_code:'PDF_STREAM_TIMEOUT',duration_ms:1000});
 assert.equal((await operationSummary(f.db,t)).terminal_without_start,1);
 f.send('convert_start',1,{time:t+2});
 const s=await operationSummary(f.db,t+2);assert.equal(s.terminal_without_start,0);assert.equal(s.rows[0].failures,1);assert.equal(f.row(1).error_code,'PDF_STREAM_TIMEOUT');
 }finally{f.close();}
});
test('progress monotonic and terminal state immutable',()=>{
 const f=fixture();try{
 f.send('convert_start',1);f.send('convert_progress',1,{duration_ms:500,stage:'pdf_stream'});f.send('convert_progress',1,{duration_ms:100,stage:'load'});
 assert.equal(f.row(1).stage,'pdf_stream');f.send('convert_cancel',1,{duration_ms:700,stage:'pdf_stream'});f.send('convert_progress',1,{duration_ms:900,stage:'pdf_done'});
 assert.equal(f.row(1).outcome,'cancel');assert.equal(f.row(1).duration_ms,700);assert.equal(f.row(1).stage,'pdf_stream');
 }finally{f.close();}
});
test('different session or feature cannot overwrite an operation',()=>{
 const f=fixture();try{
 f.send('convert_start',1);f.send('convert_failure',1,{session_id:uuid(998)});f.send('convert_success',1,{feature:'hwpx'});
 assert.equal(f.row(1).outcome,null);
 }finally{f.close();}
});
test('summary separates unfinished, cancelled, failed and successful attempts',async()=>{
 const f=fixture();try{
 for(let n=1;n<=4;n++)f.send('convert_start',n);
 f.send('convert_success',1,{duration_ms:1000});f.send('convert_failure',2,{duration_ms:2000});f.send('convert_cancel',3,{duration_ms:3000});
 const r=(await operationSummary(f.db,t)).rows[0];assert.deepEqual([r.started,r.successes,r.failures,r.cancels,r.unconfirmed,r.avg_terminal_ms],[4,1,1,1,1,2000]);
 f.send('convert_start',5,{time:t-8*86400});assert.equal((await operationSummary(f.db,t)).rows[0].started,4);
 }finally{f.close();}
});
test('new-operation hourly guard still permits existing attempt terminal',()=>{
 const f=fixture();try{
 for(let n=1;n<=301;n++)f.send('convert_start',n);
 assert.equal(f.row(301),undefined);f.send('convert_success',1,{duration_ms:1});assert.equal(f.row(1).outcome,'success');
 }finally{f.close();}
});

test('legacy rate cap fallback completes known attempts without inserting new ones',()=>{
 const f=fixture();try{
 f.send('convert_start',1);f.send('convert_success',1,{duration_ms:10,allowNew:false});
 f.send('convert_failure',2,{duration_ms:20,allowNew:false});
 assert.equal(f.row(1).outcome,'success');assert.equal(f.row(2),undefined);
 }finally{f.close();}
});
