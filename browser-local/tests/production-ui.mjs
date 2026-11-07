import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
test('no server API for document conversion',()=>{assert(!/fetch\s*\(/.test(code));assert(code.includes('new HwpDocument('));assert(code.includes('tryProfessionalDocument(doc,count'));assert(!code.includes('pdf.embedPng'));assert(!code.includes("engine==='stable'"));});
test('local browser files enforce limits',()=>{assert(!code.includes('MAX_FILE='));assert(code.includes('MAX_PAGES=120'));assert(code.includes('MAX_PIXELS=9_000_000'));});

test('drawing enhancement is bounded and does not claim vector PDF output',()=>{
 assert(code.includes('DETAIL_DPI=360'));
 assert(code.includes('DETAIL_MAX_PIXELS=12_000_000'));
 assert(code.includes("shapes>=180 && shapes>=text*2"));
 assert(code.includes('w*h>pixelLimit+10000'));
 assert(!code.includes("renderMode:'raster'"));
 assert(!code.includes("renderMode:'vector'"));
});

test('HWP selection and conversion do not reject files over 20MiB',()=>{const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert(!ui.includes('file.size>20*1024*1024'));assert(!html.includes('20MiB'));assert(!code.includes('file.size>MAX_FILE'));});

test('homepage shows functional guide without legacy staging or API marketing copy',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const label of ['PDF 변환 사용 방법','문서 선택','PDF 변환','미리보기·다운로드','지원 기능','출력 안내'])assert(html.includes(label),label);
 for(const stale of ['무료 API 없는','WEBASSEMBLY','실험 버전','유료 변환 API'])assert(!html.includes(stale),stale);
 for(const id of ['source','convert','cancel','reset','download','preview','progress','status','pages'])assert(html.includes('id="'+id+'"'),id);
});
