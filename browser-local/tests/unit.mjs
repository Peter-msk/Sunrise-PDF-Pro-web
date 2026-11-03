import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const converter=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
const textLayer=readFileSync(new URL('../src/searchable-layer.js',import.meta.url),'utf8');
test('client document parser and PDF renderer never send the HWP buffer to network',()=>{
 assert(converter.includes('new HwpDocument(new Uint8Array(buf))'));
 assert(converter.includes('PDFDocument.create()'));
 assert(converter.includes('fetch(searchableFontURL,{credentials:\'same-origin\'})'));
 assert(!converter.includes('fetch(file')&&!converter.includes('fetch(buf')&&!converter.includes('fetch(selected'));
 assert(!/FormData|XMLHttpRequest|navigator[.]sendBeacon/.test(converter));
});
test('bounded image and engineering drawing quality profiles',()=>{
 assert(converter.includes('MAX_FILE=20*1024*1024'));
 assert(converter.includes('MAX_PAGES=120'));
 assert(converter.includes('standard:{dpi:300,maxPixels:9_000_000,maxPages:120}'));
 assert(converter.includes('detail:{dpi:360,maxPixels:16_000_000,maxPages:30}'));
});
test('Korean text overlay has explicit positioning and transparency',()=>{
 assert(textLayer.includes('new DOMParser()'));
 assert(textLayer.includes('MAX_TEXT_NODES=25000'));
 assert(textLayer.includes('opacity:0'));
 assert(textLayer.includes('font:pdfFont'));
 assert(converter.includes("renderMode:needText&&textSummary.embedded>0?'hybrid-searchable':'raster'"));
});
