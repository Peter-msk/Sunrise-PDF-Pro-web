import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFont,fontFamilyForPdfFace,pendingPdfFaceIndex} from '../src/pdf-fonts.js';
import {createLocalFontCache} from '../src/local-fonts.js';
import {localQaErrorCode,localQaFontReason,localQaWriterStep,buildLocalBatchQaReport,QA_BUILD_REVISION} from '../src/local-batch-qa.mjs';
const face=(name,family,chars,props={})=>({name,family,aliases:[family.toLowerCase()],bold:false,italic:false,characterSet:new Set([...chars].map(x=>x.codePointAt(0))),...props});
test('registered PC face only when exact/OFL glyph coverage is unavailable',()=>{
 const original=face('LocalFont1','Original','A'),symbol=face('LocalFont2','Symbol','★'),bundled=face('BundledFont1','Bundled','A',{isFallback:true});
 const registry={faces:[original,symbol,bundled],allowCoverageFallback:true};
 assert.equal(resolveFont(registry,'Original','normal','normal','A'),original);
 assert.equal(resolveFont(registry,'Unknown','normal','normal','A'),bundled);
 assert.equal(resolveFont(registry,'Original','normal','normal','★'),symbol);
 assert.equal(resolveFont(registry,'Original','normal','normal','🧬'),null);
 assert.equal(resolveFont({faces:registry.faces},'Original','normal','normal','★'),null);
});
test('covered same-family alternative style; unsupported relative style still rejected',()=>{
 const regular=face('LocalFont1','Original','★'),other=face('LocalFont2','Other','★',{bold:true});
 const registry={faces:[regular,other],allowCoverageFallback:true};
 assert.equal(resolveFont(registry,'Original','bold','normal','★'),regular);
 assert.equal(resolveFont(registry,'Original','bolder','normal','★'),null);
});
test('exact face pin links glyph-checked preflight to textless callback',()=>{
 const first=face('LocalFont1','Original','A'),second=face('LocalFont2','Original','★');
 const registry={faces:[first,second],allowCoverageFallback:true};
 assert.equal(resolveFont(registry,'Original','normal','normal','★'),second);
 const pin=fontFamilyForPdfFace(registry,second);
 assert.equal(pendingPdfFaceIndex(pin),1);
 assert.equal(resolveFont(registry,pin,'normal','normal'),second);
 assert.equal(resolveFont(registry,pin,'normal','normal','A'),null);
 assert.equal(resolveFont(registry,pin,'bold','normal','★'),null);
 assert.equal(resolveFont(registry,'__sunrise_pdf_face_99999__','normal','normal','★'),null);
});
test('batch cache is identity-keyed, bounded and cleared',()=>{
 const item={},other={};const data={bytes:new Uint8Array(5),characterSet:new Set([65])};
 const cache=createLocalFontCache({maxBytes:13,maxFaces:1});
 cache.put(item,data);cache.put(other,data);
 assert.equal(cache.get(item),data);assert.equal(cache.get(other),undefined);
 cache.clear();assert.equal(cache.get(item),undefined);
});
test('writer and font reason classification, fixed taxonomy and privacy',()=>{
 const raw='private.hwp arbitrary text [writer_step=svg-render]';
 const font='FONT_FAMILY_OR_VARIANT_UNAVAILABLE [font_reason=glyph-not-in-registry]';
 assert.equal(localQaErrorCode(raw),'PDF_WRITER_SVG_RENDER_FAILED');
 assert.equal(localQaWriterStep(raw),'svg-render');
 assert.equal(localQaErrorCode('PNG_PDF_IDAT_CHECKSUM [writer_step=svg-render]'),'PNG_PDF_IDAT_CHECKSUM');
 assert.equal(localQaErrorCode('PROFESSIONAL_SVG_WARNING_private text'),'PROFESSIONAL_SVG_WARNING');
 assert.equal(localQaFontReason(font),'glyph-not-in-registry');
 assert.equal(localQaFontReason('[font_reason=private-name]'),null);
 assert.equal(localQaWriterStep('[writer_step=private-name]'),null);
 assert.equal(localQaErrorCode('private text'),'OTHER_ERROR');
 const report=buildLocalBatchQaReport([{file:{name:'private.hwp'},state:'failed',error:raw},{file:{name:'private2.hwp'},state:'failed',error:font}]);
 assert.equal(report.build_revision,'DEV48');assert.equal(QA_BUILD_REVISION,'DEV48');
 assert.equal(report.files[0].writer_step,'svg-render');assert.equal(report.files[1].font_reason,'glyph-not-in-registry');
 assert.ok(!JSON.stringify(report).includes('private'));
});
