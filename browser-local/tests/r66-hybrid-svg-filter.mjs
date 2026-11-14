import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSvgForPdf,UNSUPPORTED_FILTER} from '../src/svg-filter-hybrid.mjs';
const svg='<svg xmlns="http://www.w3.org/2000/svg"><g filter="url(#shadow)"><rect width="10" height="10"/></g></svg>';
const failed=async()=>{throw Error(UNSUPPORTED_FILTER)};
const checked=x=>({svg:x,width:96,height:96});
test('default professional rejects unsupported filter and never silently rasterizes',async()=>{
 await assert.rejects(normalizeSvgForPdf(svg,failed,checked),/SVG_FILTER_EFFECT_UNSUPPORTED/);
});
test('explicit hybrid retains sanitized source and marks only filter-unsupported page',async()=>{
 const x=await normalizeSvgForPdf(svg,failed,checked,{hybrid:true});
 assert.equal(x.checked.svg,svg);assert.equal(x.checked.forceRasterReason,UNSUPPORTED_FILTER);
 assert.equal(x.rasterizedByChoice,true);assert.equal(x.stats.filtersApplied,0);
});
test('normal SVG remains vector even with hybrid selected',async()=>{
 const x=await normalizeSvgForPdf('<svg/>',async s=>({svg:s,filtersApplied:0}),checked,{hybrid:true});
 assert.equal(x.checked.forceRasterReason,undefined);assert.equal(x.rasterizedByChoice,false);
});
test('hybrid fails closed on any other error including dangerous external resources',async()=>{
 await assert.rejects(normalizeSvgForPdf(svg,async()=>{throw Error('SVG_EXTERNAL_RESOURCE')},checked,{hybrid:true}),/SVG_EXTERNAL_RESOURCE/);
 await assert.rejects(normalizeSvgForPdf(svg,failed,()=>{throw Error('UNSAFE_SVG')},{hybrid:true}),/UNSAFE_SVG/);
 await assert.rejects(normalizeSvgForPdf(svg,async()=>{throw Error('SVG_FILTER_IMAGE_DECODE_TIMEOUT')},checked,{hybrid:true}),/SVG_FILTER_IMAGE_DECODE_TIMEOUT/);
});
test('only explicit hybrid uses per-page raster policy and keeps default vector fail-closed',()=>{
 const converter=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
 const engine=readFileSync(new URL('../src/svg-professional.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(converter,/allowRasterFallback:false/);
 assert.match(converter,/filterOnlyRasterFallback:true/);
 assert.match(engine,/filterOnlyRasterFallback&&!forceFilterRaster/);
 assert.match(converter,/SVG_FILTER_EFFECT_UNSUPPORTED/);
 assert.match(ui,/<option value="professional" selected>/);
 assert.match(ui,/<option value="hybrid-filter">/);
 assert.match(ui,/쪽만 이미지/);
});

test('DEV33 visible bulk hybrid is explicit and never changes professional default',()=>{
 const js=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<option value="professional" selected>/);
 assert.match(html,/id="convert-hybrid"[^>]*hidden disabled/);
 assert.match(html,/필터 혼합 PDF로 시작/);
 assert.match(js,/\$\('convert-hybrid'\)\.addEventListener\('click'/);
 assert.match(js,/const hybridPending=items\.some\(/);
 assert.match(js,/requestedFileRecovery=null;requestedFileRetry=null;requestedBulkRecovery=false;/);
 assert.match(js,/requestedBatchEngine='hybrid-filter';/);
 assert.match(js,/const selectedEngine=requestedBatchEngine\|\|\$\('pdf-engine'\)\.value;/);
 assert.match(js,/requestedBatchEngine=null;/);
 assert.doesNotMatch(js,/\$\('pdf-engine'\)\.value\s*=\s*'hybrid-filter'/);
 assert.match(js,/\$\('convert'\)\.click\(\);/);
 // Main default selected option remains professional, no automatic conversion
 // result may change the batch-wide engine or modify completed PDFs.
 assert.doesNotMatch(js,/pdf-engine'\)\.value='compat-raster';/);
});
