import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
test('no server API for document conversion',()=>{assert(!/fetch\s*\(/.test(code));assert(code.includes('new HwpDocument('));assert(code.includes('PDFDocument.create('));});
test('local browser files enforce limits',()=>{assert(!code.includes('MAX_FILE='));assert(code.includes('MAX_PAGES=120'));assert(code.includes('MAX_PIXELS=9_000_000'));});

test('drawing enhancement is bounded and does not claim vector PDF output',()=>{
 assert(code.includes('DETAIL_DPI=360'));
 assert(code.includes('DETAIL_MAX_PIXELS=12_000_000'));
 assert(code.includes("shapes>=180 && shapes>=text*2"));
 assert(code.includes('w*h>pixelLimit+10000'));
 assert(code.includes("renderMode:'raster'"));
 assert(!code.includes("renderMode:'vector'"));
});

test('HWP selection and conversion do not reject files over 20MiB',()=>{const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert(!ui.includes('file.size>20*1024*1024'));assert(!html.includes('20MiB'));assert(!code.includes('file.size>MAX_FILE'));});
