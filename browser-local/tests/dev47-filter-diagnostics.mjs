import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {normalizeSvgGrayscale} from '../src/svg-safe-grayscale.mjs';
import {buildLocalBatchQaReport} from '../src/local-batch-qa.mjs';
import {localQaFilterReason,safeFilterReason} from '../src/svg-filter-diagnostics.mjs';
const gray='<filter id="rhwp-img-grayscale"><feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"/></filter>';
const privateId='rhwp-img-private-document';
const png='<image width="10" height="10" href="data:image/png;base64,AAAA"/>';
const svg=(definition,body)=>'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs>'+definition+'</defs>'+body+'</svg>';
const wrap=body=>'<g filter="url(#rhwp-img-grayscale)">'+body+'</g>';
async function rejected(input,expected){
 const dom=new JSDOM('',{url:'https://example.invalid'});
 try{
  await assert.rejects(normalizeSvgGrayscale(input,undefined,{
   parse:s=>new dom.window.DOMParser().parseFromString(s,'image/svg+xml'),
   decode:()=>{throw Error('UNSAFE_DECODE');}
  }),e=>e.message==='SVG_FILTER_EFFECT_UNSUPPORTED'&&e.filterReason===expected);
 }finally{dom.window.close();}
}
test('recognized RHWP definition but multiple images are rejected, not silently flattened',async()=>rejected(svg(gray,wrap(png+png)),'wrapper-shape'));
test('recognized RHWP definition but unsafe image attributes are rejected',async()=>rejected(svg(gray,wrap(png.replace('<image','<image class="private-name"'))),'image-attributes'));
test('known RHWP definition inside styled ancestor stays fail-closed',async()=>rejected(svg(gray,'<g class="private-name">'+wrap(png)+'</g>'),'ancestor-style'));
test('modified RHWP filter definition is separately diagnosed without emitting its ID',async()=>rejected(svg(gray.replace('rhwp-img-grayscale',privateId),'<g filter="url(#'+privateId+')">'+png+'</g>'),'rhwp-definition-mismatch'));
test('unrecognized non-RHWP definition is classified independently',async()=>rejected(svg('<filter id="x"><feColorMatrix type="saturate" values="0.5"/></filter>','<g filter="url(#x)">'+png+'</g>'),'unsupported-definition'));
test('diagnostic export is allowlisted and retains no private data',()=>{
 const result=buildLocalBatchQaReport([{file:{name:'secret.hwpx'},state:'failed',error:'SVG_FILTER_EFFECT_UNSUPPORTED [filter_reason=wrapper-shape]'}]);
 assert.equal(result.files[0].filter_reason,'wrapper-shape');
 assert.equal(localQaFilterReason('SVG_FILTER_EFFECT_UNSUPPORTED [filter_reason=secret-name]'),null);
 assert.equal(localQaFilterReason('OTHER [filter_reason=wrapper-shape]'),null);
 assert.equal(safeFilterReason('__proto__'),null);
 assert.doesNotMatch(JSON.stringify(result),/secret/);
});
