import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSvgFontStyle,requestedStyle} from '../src/pdf-fonts.js';
import {classifySvgWriterReason} from '../src/svg-professional.js';
import {localQaFontStyleReason,localQaWriterReason,buildLocalBatchQaReport} from '../src/local-batch-qa.mjs';
test('valid inherited and relative CSS weights are computed before static font selection',()=>{
 for(const [w,parent,n,expected] of [['bolder',400,700,'bold'],['bolder',100,400,'normal'],['lighter',900,700,'bold'],['lighter',700,400,'normal'],['inherit',650,650,'bold'],['unset',300,300,'normal'],['initial',900,400,'normal'],['650',400,650,'bold'],['450.5',400,450.5,'normal']]){
 const r=normalizeSvgFontStyle(w,'inherit',parent,'italic');
 assert.equal(r.numeric,n);assert.equal(r.weight,expected);assert.equal(r.style,'italic');assert.equal(r.reason,null);
 }
 assert.equal(requestedStyle('bolder','normal'),null);
});
test('bounded CSS values, inherited style and invalid declarations',()=>{
 for(const w of ['0','1001','calc(500)','private','-1'])assert.equal(normalizeSvgFontStyle(w,'normal').reason,'weight-unsupported');
 assert.equal(normalizeSvgFontStyle(null,'inherit',null,'normal').reason,'weight-unsupported');
 assert.equal(normalizeSvgFontStyle('700','initial',null,null).style,'normal');
 assert.equal(normalizeSvgFontStyle('normal','oblique').style,'italic');
 assert.equal(normalizeSvgFontStyle('normal','oblique 0deg').style,'normal');
 assert.equal(normalizeSvgFontStyle('normal','oblique 20deg').reason,'style-unsupported');
});
test('writer errors stay bounded and the QA report never exports raw messages',()=>{
 assert.equal(classifySvgWriterReason(new TypeError('private.hwp')),'type-error');
 assert.equal(classifySvgWriterReason(new Error('Unknown image format')),'image-decode');
 assert.equal(classifySvgWriterReason(new Error('unsupported number: abc')),'numeric-geometry');
 assert.equal(classifySvgWriterReason(new Error('private unknown')),'unclassified');
 assert.equal(classifySvgWriterReason(new RangeError('Maximum call stack size exceeded')),'recursion-limit');
 const e='[writer_step=svg-render] [writer_reason=type-error] confidential.hwp';
 assert.equal(localQaWriterReason(e),'type-error');assert.equal(localQaWriterReason('[writer_reason=private-name]'),null);
 assert.equal(localQaFontStyleReason('[font_style_reason=weight-unsupported]'),'weight-unsupported');
 const report=buildLocalBatchQaReport([{file:{name:'confidential.hwp'},state:'failed',error:e}]);
 assert.equal(report.files[0].writer_reason,'type-error');
 assert.ok(!JSON.stringify(report).includes('confidential'));
});
