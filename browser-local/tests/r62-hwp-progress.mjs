import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {settleInstalledFonts} from '../src/local-font-policy.mjs';

const source=(url)=>readFileSync(new URL(url,import.meta.url),'utf8');
test('R62 reuse a single HWP instance during font scan and PDF creation',()=>{
 const s=source('../src/converter.js');
 const convert=s.slice(s.indexOf('export async function convertToPdf'),s.indexOf('/** Prepare native browser-print'));
 assert.ok(convert.includes('doc=new HwpDocument(new Uint8Array(buf));'));
 assert.ok(convert.includes('if(!doc)doc=new HwpDocument(new Uint8Array(buf));'));
 assert.ok(!convert.includes('const probe=new HwpDocument'));
 assert.match(convert,/finally\{releaseMeasureFonts\(\);\}/);
});
test('R62 diagnostic progress only sends bounded phase and duration',()=>{
 const client=source('../src/main.js');
 const server=source('../../src/admin/handler.js');
 assert.match(server,/['"]convert_progress['"]/);
 assert.match(client,/['"]convert_progress['"]/);
 assert.match(client,/stage:item\._proDiagStage/);
 assert.match(client,/const gap=phaseNow-\(item\._lastDiagSentMs\|\|0\)/);
 assert.match(client,/gap>=45000/);
 assert.match(client,/\(item\._proProgressEvents\|\|0\)<100/);
 assert.match(client,/emitProEvent\(['"]convert_cancel['"]/);
 assert.ok(!client.includes('emitProEvent(\'convert_progress\',{fileName'));
});

test('R62 local font permission cannot block conversion indefinitely',async()=>{
 const pending=new Promise(()=>{});
 const result=await settleInstalledFonts(pending,{permissions:null,timeoutMs:10});
 assert.equal(result.status,'timeout');
 assert.equal(result.fonts,null);
 assert.match(result.notice,/PC 글꼴 접근/);
});
test('R62 cancelling a pending permission still rejects with AbortError',async()=>{
 const controller=new AbortController();
 const pending=new Promise(()=>{});
 const promise=settleInstalledFonts(pending,{signal:controller.signal,permissions:null,timeoutMs:5000});
 controller.abort();
 await assert.rejects(promise,{name:'AbortError'});
});
