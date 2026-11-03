import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
test('no server API for document conversion',()=>{assert(!/fetch\s*\(/.test(code));assert(code.includes('new HwpDocument('));assert(code.includes('PDFDocument.create('));});
test('local browser files enforce limits',()=>{assert(code.includes('MAX_FILE=20*1024*1024'));assert(code.includes('MAX_PAGES=120'));assert(code.includes('MAX_PIXELS=9_000_000'));});
