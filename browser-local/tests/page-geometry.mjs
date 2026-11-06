import test from 'node:test';
import assert from 'node:assert/strict';
import {svgLengthToPixels,svgViewBox,svgPageSize} from '../src/page-geometry.js';

function near(actual,expected,tol=0.01){assert.ok(Math.abs(actual-expected)<tol,`${actual} != ${expected}`);}

test('A4 210 x 297 mm becomes A4 points regardless of internal SVG viewBox',()=>{
 const page=svgPageSize({width:'210mm',height:'297mm',viewBox:'0 0 100 100'});
 near(page.width*72/96,595.2756);
 near(page.height*72/96,841.8898);
 assert.notEqual(page.width,100);
});
test('SVG physical lengths in points, inches, picas, cm and quarter-millimetres',()=>{
 near(svgLengthToPixels('595.2756pt')*72/96,595.2756);
 near(svgLengthToPixels('8.5in'),816);
 near(svgLengthToPixels('2pc'),32);
 near(svgLengthToPixels('2.54cm'),96);
 near(svgLengthToPixels('101.6q'),96);
});
test('viewport dimensions override viewBox coordinate width even with another aspect ratio',()=>{
 const page=svgPageSize({width:'210mm',height:'297mm',viewBox:'-30 -10 120 50'});
 near(page.width,210*96/25.4);
 near(page.height,297*96/25.4);
 assert.equal(svgViewBox('-30 -10 120 50').minX,-30);
});
test('implicit height derives from viewBox aspect ratio',()=>{
 const page=svgPageSize({width:'200mm',viewBox:'0 0 200 100'});
 near(page.height,100*96/25.4);
});
test('legacy unitless documents preserve 794x1123 and viewBox fallback',()=>{
 assert.deepEqual(svgPageSize(),{width:794,height:1123});
 assert.deepEqual(svgPageSize({viewBox:'0 0 794 1123'}),{width:794,height:1123});
 assert.deepEqual(svgPageSize({width:'794',height:'1123',viewBox:'0 0 794 1123'}),{width:794,height:1123});
});
test('unsupported and unsafe units are never silently misread',()=>{
 for(const invalid of ['210%', 'auto', '-1mm', 'NaN', '1e999mm', 'calc(10px)', 'javascript:0']){
  assert.equal(svgLengthToPixels(invalid),null,invalid);
  assert.throws(()=>svgPageSize({width:invalid,height:'297mm'}));
 }
 assert.throws(()=>svgPageSize({viewBox:'0 0 0 842'}));
 assert.throws(()=>svgPageSize({width:'5000cm',height:'10mm'}));
});

test('large engineering drawing coordinates do not become huge PDF paper',()=>{
 const page=svgPageSize({width:'297mm',height:'210mm',
   viewBox:'-200000 -300000 800000 600000'});
 near(page.width*72/96,841.8898);
 near(page.height*72/96,595.2756);
 assert.throws(()=>svgPageSize({viewBox:'0 0 800000 600000'}));
});
