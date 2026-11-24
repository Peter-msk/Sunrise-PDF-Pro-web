import test from 'node:test';
import assert from 'node:assert/strict';
import {retentionStatements,purgeRetention} from '../src/admin/retention.js';
const t=2000000000,day=86400;
const db={prepare:sql=>({bind:(...args)=>({sql,args})})};
test('scheduled rules cover progress, expired sessions, trace and trace audit without inquiries',()=>{
 const rows=retentionStatements(db,t,'scheduled');
 assert.equal(rows.length,6);
 assert.deepEqual(rows.map(x=>x.args),[[t-30*day],[t-30*day],[t],[t-day,t],[t-14*day],[t-90*day]]);
 assert.ok(rows[1].sql.includes('pro_telemetry_progress'));
 assert.ok(rows[2].sql.includes('expires_at<=?'));
 assert.ok(rows[3].sql.includes('locked_until<=?'));
 assert.ok(!rows.some(x=>x.sql.includes('pro_inquiries')));
});
test('manual policy preserves unresolved inquiries and trace data',()=>{
 const rows=retentionStatements(db,t,'manual');
 assert.equal(rows.length,5);
 assert.match(rows[4].sql,/status='resolved'/);
 assert.deepEqual(rows[4].args,[t-90*day]);
 assert.ok(!rows.some(x=>x.sql.includes('pro_trace')));
});
test('rejects invalid cutoff and unknown mode',()=>{
 for(const value of [0,-1,NaN,1.5])assert.throws(()=>retentionStatements(db,value,'manual'));
 assert.throws(()=>retentionStatements(db,t,'unknown'));
});
test('one atomic batch, failure propagates',async()=>{
 let count=0;
 const wrapped={...db,batch:async rows=>{count++;return rows;}};
 assert.equal((await purgeRetention(wrapped,t,'scheduled')).length,6);
 assert.equal(count,1);
 await assert.rejects(purgeRetention({...db,batch:async()=>{throw Error('failed');}},t,'manual'),/failed/);
});
