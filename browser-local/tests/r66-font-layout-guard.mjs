/** R66-DEV11: test the actual safety predicate from svg-professional.js. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/svg-professional.js',import.meta.url),'utf8');
const begin=source.indexOf('function safeTextRunSplit(');
const end=source.indexOf('function textDirectlyIn(el){',begin);
assert.ok(begin>=0&&end>begin,'DEV11_ACTUAL_SOURCE_HELPER_MISSING');
const safeTextRunSplit=Function(source.slice(begin,end)+'\nreturn safeTextRunSplit;')();
assert.match(source,/safeTextRunSplit\(el,value\) &&/);
const el=(attrs={},parentElement=null)=>({parentElement,
  getAttribute:name=>Object.hasOwn(attrs,name)?attrs[name]:null});

test('ordinary Hangul with an independent missing glyph may still be split',()=>{
  assert.equal(safeTextRunSplit(el(),'한글★가'),true);
});
test('decomposed Korean and combining mark stay together',()=>{
  assert.equal(safeTextRunSplit(el(),'한글★'),false);
  assert.equal(safeTextRunSplit(el(),'한\u0301글★'),false);
});
test('ZWJ emoji sequence cannot be split into separate font spans',()=>{
  assert.equal(safeTextRunSplit(el(),'한글👩‍💻★'),false);
});
test('regional-indicator flag cannot be split between fonts',()=>{
  assert.equal(safeTextRunSplit(el(),'한글🇰🇷★'),false);
});
test('emoji skin tone modifier cannot be detached',()=>{
  assert.equal(safeTextRunSplit(el(),'한👍🏽글'),false);
});
test('variant selector and emoji keycap cannot be separated',()=>{
  assert.equal(safeTextRunSplit(el(),'한1️⃣글'),false);
});
test('middle/right-aligned text does not get a new tspan layout',()=>{
  assert.equal(safeTextRunSplit(el({'text-anchor':'middle'}),'한★글'),false);
  assert.equal(safeTextRunSplit(el({'text-anchor':'end'}),'한★글'),false);
});
test('inherited anchor on parent SVG group prevents an unsafe split',()=>{
  const parent=el({'text-anchor':'middle'});
  assert.equal(safeTextRunSplit(el({},parent),'한★글'),false);
  assert.equal(safeTextRunSplit(el({'text-anchor':'start'},parent),'한★글'),false);
});
test('explicit start anchor remains allowed, even if an ancestor sets middle',()=>{
  // CSS text-anchor inherits: a child explicit start takes precedence.
  // The guard is intentionally stricter and rejects ancestor middle until
  // SVG-to-PDFKit's inherited-anchor override can be verified in real E2E.
  assert.equal(safeTextRunSplit(el({'text-anchor':'start'},el({'text-anchor':'middle'})),'한★글'),false);
  assert.equal(safeTextRunSplit(el({'text-anchor':'start'}),'한★글'),true);
});
test('without Intl.Segmenter or when it fails, keep the text unsplit',()=>{
  assert.equal(safeTextRunSplit(el(),'한★글',null),false);
  assert.equal(safeTextRunSplit(el(),'한★글',class{constructor(){throw Error('no segmenter')}}),false);
});
