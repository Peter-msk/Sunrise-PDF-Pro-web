import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
 assert.match(client,/phaseNow-\(item\._lastDiagSentMs\|\|0\)>=45000/);
 assert.match(client,/emitProEvent\(['"]convert_cancel['"]/);
 assert.ok(!client.includes('emitProEvent(\'convert_progress\',{fileName'));
});
