import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localFailureAdvice} from '../src/conversion-recovery.mjs';

const source=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('DEV36 WASM first use is classified separately from file reading',()=>{
 const converter=source('../src/converter.js'),main=source('../src/main.js');
 assert.match(converter,/detail:'wasm_init'/);
 assert.match(converter,/detail:'wasm_ready'/);
 assert.match(converter,/WASM_INIT_FAILED/);
 assert.match(main,/RHWP 웹 엔진 초기화 중/);
 assert.match(main,/info\.detail==='wasm_init'/);
 assert.match(main,/info\.detail==='wasm_ready'/);
});
test('DEV36 anonymous progress collector accepts bounded boot stages',()=>{
 const front=source('../src/pro-telemetry.js');
 const back=source('../../src/admin/handler.js');
 for(const stage of ['wasm_init','wasm_ready']){
  assert.ok(front.includes("'"+stage+"'"));
  assert.ok(back.includes("'"+stage+"'"));
 }
});
test('DEV36 oversized SVG explanation does not claim unsafe auto-recovery',()=>{
 const message=localFailureAdvice('SVG_RENDER_SOURCE_CHARS_LIMIT');
 assert.match(message,/페이지가 너무 복잡/);
 assert.match(message,/다른 문서를 먼저 완료/);
 assert.ok(!message.includes('자동'));
 assert.match(localFailureAdvice('WASM_INIT_FAILED'),/변환 기능을 시작하지 못/);
});

test('DEV36 loading status is never an undefined page and always reports WASM boot',()=>{
 const client=source('../src/main.js');
 assert.ok(client.includes("['wasm_init','wasm_ready'].includes(item._proDiagStage)"));
 assert.ok(client.includes("const pageStatus=info.stage!=='load'&&info.stage!=='fonts'"));
 assert.ok(client.includes("const loadStatus=info.stage==='load'"));
 assert.ok(client.includes("pageStatus+loadStatus"));
 assert.ok(!client.includes("+' · '+info.page+'/'+info.total+'쪽"));
});
