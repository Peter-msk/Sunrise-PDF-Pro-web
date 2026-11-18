import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {identifyRhwpImageEffect,applyRhwpImageEffectsRGBA,normalizeSvgGrayscale} from '../src/svg-safe-grayscale.mjs';
import {buildLocalBatchQaReport,qaDeploymentChannel,localQaFilterPrimitive,localQaWriterPendingRefs} from '../src/local-batch-qa.mjs';
const win=new JSDOM('').window;
const parse=xml=>new win.DOMParser().parseFromString(xml,'image/svg+xml');
const serialize=node=>new win.XMLSerializer().serializeToString(node);
const gray='<feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"/>';
const transfer=(slope,intercept)=>'<feComponentTransfer>'+['R','G','B'].map(c=>'<feFunc'+c+' type="linear" slope="'+slope+'" intercept="'+intercept+'"/>').join('')+'</feComponentTransfer>';
const threshold='<feComponentTransfer>'+['R','G','B'].map(c=>'<feFunc'+c+' type="discrete" tableValues="0 1"/>').join('')+'</feComponentTransfer>';
const filter=(id,body,extra='')=>'<filter id="'+id+'" '+extra+'>'+body+'</filter>';
const fx=filter('rhwp-img-grayscale',gray),bc=filter('rhwp-img-bc-b10c20',transfer(1.2,0)),bw=filter('rhwp-img-blackwhite',gray+threshold);
const svg=(defs,body)=>'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><defs>'+defs+'</defs>'+body+'</svg>';
const identify=xml=>identifyRhwpImageEffect(parse(svg(xml,'')).querySelector('filter'));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+Xj4UeQAAAABJRU5ErkJggg==';
const image='<image x="2" y="3" width="8" height="9" preserveAspectRatio="none" href="'+png+'"/>';
const wrap=(id,body)=>'<g filter="url(#'+id+')">'+body+'</g>';
function fakeImage(){
 const pixels=Uint8ClampedArray.of(255,0,0,137);
 let decoded=0,encoded=0,closed=0;
 const deps={parse,serialize,decode:async()=>{decoded++;return {width:1,height:1,close(){closed++}};},
  makeCanvas:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:pixels}),putImageData(){}}),toBlob:cb=>{encoded++;cb(new Blob([Uint8Array.of(1)],{type:'image/png'}));}}),
  imageToDataURL:async()=>png};
 return {pixels,deps,stats:()=>({decoded,encoded,closed})};
}
test('pinned RHWP exact 601 matrix / black-white chain / linear BC definitions recognized',()=>{
 assert.deepEqual(identify(fx),[{kind:'gray'}]);
 assert.deepEqual(identify(bw),[{kind:'gray'},{kind:'threshold'}]);
 assert.deepEqual(identify(bc),[{kind:'linear',slope:1.2,intercept:0}]);
 assert.equal(identify(filter('rhwp-img-bc-b10c20',transfer(1.2,.1))),null);
 assert.equal(identify(filter('rhwp-img-grayscale',gray,'width="50%"')),null);
 assert.equal(identify(filter('rhwp-img-grayscale',gray.replace('0.299','0.2126'))),null);
 assert.equal(identify(filter('other',gray)),null);
});
test('RGB color-space pipeline preserves alpha and applies actual inner-to-outer order',async()=>{
 const p=Uint8ClampedArray.of(255,0,0,137,0,255,0,255,0,0,255,0);
 await applyRhwpImageEffectsRGBA(p,3,1,[{kind:'gray'}]);
 assert.deepEqual([...p],[149,149,149,137,201,201,201,255,95,95,95,0]);
 const b=Uint8ClampedArray.of(255,0,0,255,0,255,0,100);
 await applyRhwpImageEffectsRGBA(b,2,1,[{kind:'gray'},{kind:'threshold'}]);
 assert.deepEqual([...b],[0,0,0,255,255,255,255,100]);
 const x=Uint8ClampedArray.of(255,0,0,255);
 await applyRhwpImageEffectsRGBA(x,1,1,[{kind:'linear',slope:1.2,intercept:0},{kind:'gray'}]);
 assert.deepEqual([...x],[149,149,149,255]);
});
test('nested RHWP wrappers modify only existing picture, keep adjacent vector geometry and text unchanged',async()=>{
 const f=fakeImage(),input=svg(fx+bc,'<rect x="8" y="1" width="4" height="5" fill="#ff0000"/><text x="1" y="10">한글</text>'+wrap('rhwp-img-grayscale','<g opacity="0.5">'+wrap('rhwp-img-bc-b10c20',image)+'</g>'));
 const r=await normalizeSvgGrayscale(input,undefined,f.deps);
 assert.equal(r.filtersApplied,2);assert.equal(r.imagesChanged,1);
 assert.deepEqual(f.stats(),{decoded:1,encoded:1,closed:1});
 assert.deepEqual([...f.pixels],[149,149,149,137]);
 const doc=parse(r.svg);assert.equal(doc.querySelectorAll('filter,[filter]').length,0);
 assert.equal(doc.querySelector('rect').getAttribute('fill'),'#ff0000');
 assert.equal(doc.querySelector('text').textContent,'한글');
 assert.equal(doc.querySelector('image').getAttribute('x'),'2');
 assert.equal(doc.querySelector('image').getAttribute('width'),'8');
 assert.equal(doc.querySelector('g[opacity]').getAttribute('opacity'),'0.5');
});
test('unsupported regions, multiple drawables, wrong definitions and external sources remain closed',async()=>{
 const f=fakeImage();
 for(const input of [
 svg(filter('rhwp-img-grayscale',gray,'width="50%"'),wrap('rhwp-img-grayscale',image)),
 svg(fx,wrap('rhwp-img-grayscale',image+'<rect width="3" height="3"/>')),
 svg(fx,wrap('rhwp-img-grayscale',image.replace(png,'https://example.invalid/x.png'))),
 svg(filter('rhwp-img-bc-b10c20',transfer(1.2,.1)),wrap('rhwp-img-bc-b10c20',image)),
 svg(fx,wrap('rhwp-img-grayscale',image.replace('<image ','<image class="unknown" ')))
 ])await assert.rejects(normalizeSvgGrayscale(input,undefined,f.deps),/SVG_FILTER_(EFFECT_UNSUPPORTED|IMAGE_EXTERNAL_RESOURCE)/);
 assert.equal(f.stats().decoded,0);
});
test('QA build provenance and numeric PDFKit references never export private details',()=>{
 const r=buildLocalBatchQaReport([{file:{name:'private.hwp'},state:'failed',error:'PDF_STREAM_TIMEOUT (FINAL_BYTES_NO_END, emitted=1B) [integrity=PDF_OUTPUT_TRAILER_INCOMPLETE] [ref_waiting=3]'}]);
 assert.equal(r.build_revision,'DEV46');
 assert.equal(r.rhwp_version,null);
 assert.equal(r.files[0].stream_pending_refs,3);
 assert.equal(localQaWriterPendingRefs('PDF_STREAM_TIMEOUT (NO_BYTES) [ref_waiting=999999]'),null);
 assert.equal(localQaFilterPrimitive('SVG_FILTER_EFFECT_UNSUPPORTED [primitive=component-transfer]'),'component-transfer');
 assert.equal(localQaFilterPrimitive('SVG_FILTER_EFFECT_UNSUPPORTED [primitive=private]'),null);
 assert.equal(qaDeploymentChannel('sunrise-pdf-pro-web-dev41-qa.ko-pg.workers.dev'),'qa');
 assert.equal(qaDeploymentChannel('sunrise-pdf-pro-web.ko-pg.workers.dev'),'production');
 assert.equal(qaDeploymentChannel('private.example'),'other');
 assert.doesNotMatch(JSON.stringify(r),/private/);
});
test('bounded image transformation cancels without publishing PNG',async()=>{
 const ctrl=new AbortController(),pixels=new Uint8ClampedArray(8);
 await assert.rejects(applyRhwpImageEffectsRGBA(pixels,2,1,[{kind:'gray'}],ctrl.signal,{chunkPixels:1,yieldControl:async()=>ctrl.abort()}),e=>e.name==='AbortError');
});

test('DEV44 RHWP exact crop viewport preserves coordinates and neighboring vectors',async()=>{
 const f=fakeImage();
 const crop='<svg x="11" y="12" width="14" height="15" viewBox="0.25 0 0.5 1" preserveAspectRatio="none" overflow="hidden">'+image+'</svg>';
 const result=await normalizeSvgGrayscale(svg(fx+bc,'<text>보존</text>'+wrap('rhwp-img-grayscale',wrap('rhwp-img-bc-b10c20',crop))),undefined,f.deps);
 assert.equal(result.filtersApplied,2);assert.equal(result.imagesChanged,1);
 const out=parse(result.svg),viewport=out.querySelector('svg svg');
 assert.ok(viewport);assert.equal(viewport.getAttribute('viewBox'),'0.25 0 0.5 1');
 assert.equal(viewport.getAttribute('overflow'),'hidden');
 assert.deepEqual(['x','y','width','height'].map(k=>viewport.getAttribute(k)),['11','12','14','15']);
 assert.equal(out.querySelector('text').textContent,'보존');
 assert.equal(out.querySelectorAll('[filter],filter').length,0);
 assert.deepEqual(f.stats(),{decoded:1,encoded:1,closed:1});
});
test('DEV44 non-RHWP viewports stay fail closed; no bitmap decode',async()=>{
 for(const bad of [
 '<svg x="0" y="0" width="10" height="10" viewBox="0 0 1 0" preserveAspectRatio="none">'+image+'</svg>',
 '<svg x="0" y="0" width="10" height="10" viewBox="0 0 1 1" preserveAspectRatio="none" overflow="visible">'+image+'</svg>',
 '<svg x="0" y="0" width="10" height="10" viewBox="0 0 1 1" preserveAspectRatio="none">'+image+'<rect width="1" height="1"/></svg>',
 '<svg x="0" y="0" width="10" height="10" viewBox="0 0 1 1" preserveAspectRatio="none" style="color:red">'+image+'</svg>'
 ]){
  const f=fakeImage();
  await assert.rejects(normalizeSvgGrayscale(svg(fx,wrap('rhwp-img-grayscale',bad)),undefined,f.deps),/SVG_FILTER_EFFECT_UNSUPPORTED/);
  assert.equal(f.stats().decoded,0);
 }
});
