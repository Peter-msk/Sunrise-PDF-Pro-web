/** DEV26 SVG filter semantics, static synthetics only, no user documents. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {normalizeSvgGrayscale,identifyIdentitySvgFilter} from '../src/svg-safe-grayscale.mjs';
import {preflightProfessionalSvg} from '../src/svg-professional.js';
import {parseSafeSvg} from '../src/svg-security.js';
import PDFKit from '../node_modules/pdfkit/js/pdfkit.standalone.js';
import SVGtoPDF from 'svg-to-pdfkit';
import {PDFDocument as PdfLibDocument} from 'pdf-lib';

const svg=body=>'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">'+body+'</svg>';
const rect=(extra='')=>'<rect x="10" y="10" width="80" height="50" fill="#ff0000" '+extra+'/>';
const def=(body,attrs='')=>'<defs><filter id="effect" '+attrs+'>'+body+'</filter></defs>';
const matrix='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0';
const color=(type,values='')=>'<feColorMatrix type="'+type+'" '+values+'/>';
async function dom(fn){
 const win=new JSDOM('').window,oldP=globalThis.DOMParser,oldS=globalThis.XMLSerializer;
 globalThis.DOMParser=win.DOMParser;globalThis.XMLSerializer=win.XMLSerializer;
 try{return await fn();}
 finally{globalThis.DOMParser=oldP;globalThis.XMLSerializer=oldS;win.close();}
}
const normalize=async input=>normalizeSvgGrayscale(input);
function vector(out){
 assert.doesNotMatch(out.svg,/<filter\b|filter\s*=/i);
 const pre=preflightProfessionalSvg({svg:out.svg,width:120,height:80});
 assert.equal(pre.ok,true,JSON.stringify(pre));
}
test('CSS saturate(0) is a grayscale sRGB vector-paint transformation',()=>dom(async()=>{
 const out=await normalize(svg(rect('filter="saturate(0)"')));
 vector(out);assert.match(out.svg,/fill="#363636"/);
 assert.equal(out.filtersApplied,1);assert.equal(out.imagesChanged,0);
}));
test('saturate(0%) in inline style maps through the existing grayscale vector engine',()=>dom(async()=>{
 const out=await normalize(svg(rect('style="filter:saturate(0%);fill:#ff0000"')));
 vector(out);assert.match(out.svg,/#363636/);
}));
test('grayscale() defaults to full grayscale but saturate() defaults to identity',()=>dom(async()=>{
 let out=await normalize(svg(rect('filter="grayscale()"')));
 vector(out);assert.match(out.svg,/#363636/);
 out=await normalize(svg(rect('filter="saturate()"')));
 vector(out);assert.match(out.svg,/#ff0000/);
}));
test('SVG feColorMatrix saturate zero still uses existing strict grayscale path',()=>dom(async()=>{
 const out=await normalize(svg(def(color('saturate','values="0"'))+rect('filter="url(#effect)"')));
 vector(out);assert.doesNotMatch(out.svg,/fill="#ff0000"/);
}));
test('CSS no-op functions preserve exact fill and vector output',()=>dom(async()=>{
 const names=['grayscale(0)','grayscale(0%)','saturate(1)','saturate(100%)','saturate()',
  'brightness(1)','contrast(1)','opacity(1)','invert(0)','sepia(0)','hue-rotate(0deg)'];
 for(const value of names){
  const out=await normalize(svg(rect('filter="'+value+'"')));
  vector(out);assert.match(out.svg,/fill="#ff0000"/,value);
 }
}));
test('limited CSS no-op chain is accepted without altering vector geometry',()=>dom(async()=>{
 const out=await normalize(svg(rect('filter="grayscale(0) brightness(1) saturate(100%) contrast(1) opacity(1) invert(0) sepia(0) hue-rotate(0deg)"')));
 vector(out);assert.equal(out.filtersApplied,1);
}));
test('identity matrix and default feColorMatrix remain vector',()=>dom(async()=>{
 for(const vals of ['values="'+matrix+'"','']){
  const out=await normalize(svg(def(color('matrix',vals))+rect('filter="url(#effect)"')));
  vector(out);assert.match(out.svg,/fill="#ff0000"/);
 }
}));
test('SVG feColorMatrix saturate 1 and hueRotate 0 are true no-ops',()=>dom(async()=>{
 for(const fx of [color('saturate','values="1"'),color('hueRotate','values="0"')]){
  const out=await normalize(svg(def(fx)+rect('filter="url(#effect)"')));
  vector(out);assert.match(out.svg,/fill="#ff0000"/);
 }
}));
test('four independent identity transfer channels remain vector',()=>dom(async()=>{
 const fx='<feComponentTransfer>'+['R','G','B','A'].map(c=>'<feFunc'+c+' type="identity"/>').join('')+'</feComponentTransfer>';
 const out=await normalize(svg(def(fx)+rect('filter="url(#effect)"')));
 vector(out);assert.match(out.svg,/fill="#ff0000"/);
}));
test('opaque gradient remains original gradient after identity filter removal',()=>dom(async()=>{
 const gradient='<defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>';
 const out=await normalize(svg(gradient+def(color('saturate','values="1"'))+
  '<rect x="10" y="10" width="80" height="50" fill="url(#g)" filter="url(#effect)"/>'));
 vector(out);assert.match(out.svg,/stop-color="#ff0000"/);assert.match(out.svg,/stop-color="#0000ff"/);
}));
test('classifier rejects nonidentity matrices, Gaussian blur and custom filter extents',()=>dom(async()=>{
 const cases=[
  [color('matrix','values="'+matrix+'"'),'',true],
  [color('saturate','values="1"'),'x="50%"',false],
  [color('saturate','values="1"'),'primitiveUnits="userSpaceOnUse"',false],
  [color('saturate','values="0.5"'),'',false],
  [color('hueRotate','values="90"'),'',false],
  [color('matrix','values="1 0 0 0 0"'),'',false],
  ['<feGaussianBlur stdDeviation="0"/>','',false],
  ['<feBlend in="SourceGraphic" in2="BackgroundImage"/>','',false],
  [color('saturate','values="1"'),'color-interpolation-filters="invalid"',false]
 ];
 for(const [fx,attrs,valid] of cases){
  const parsed=new DOMParser().parseFromString(svg(def(fx,attrs)),'image/svg+xml');
  assert.equal(identifyIdentitySvgFilter(parsed.querySelector('filter')),valid,fx);
 }
}));
test('group isolation, stroke, opacity, clip-path, class and blending remain fail-closed',()=>dom(async()=>{
 const fx=def(color('saturate','values="1"'));
 for(const shape of [
  '<g filter="url(#effect)">'+rect()+'</g>',
  rect('stroke="black" filter="url(#effect)"'),
  rect('opacity="0.3" filter="url(#effect)"'),
  rect('clip-path="url(#cut)" filter="url(#effect)"'),
  rect('class="special" filter="url(#effect)"'),
  rect('style="filter:url(#effect);mix-blend-mode:multiply"'),
  '<path d="M0 0h50" stroke="#000" filter="url(#effect)"/>'
 ]){
  await assert.rejects(normalize(svg(fx+shape)),/SVG_FILTER_EFFECT_UNSUPPORTED/,shape);
 }
}));
test('blur, drop shadows, opacity loss and partial transforms are never silently dropped',()=>dom(async()=>{
 for(const value of ['blur(3px)','drop-shadow(2px 3px 1px black)',
  'saturate(.4)','grayscale(50%)','brightness(1.1)','hue-rotate(30deg)',
  'invert(30%)','opacity(.5)','grayscale(0) blur(2px)','url(#effect) blur(2px)']){
  await assert.rejects(normalize(svg(rect('filter="'+value+'"'))),/SVG_FILTER_EFFECT_UNSUPPORTED/,value);
 }
 await assert.rejects(normalize(svg(def('<feGaussianBlur stdDeviation="3"/>')+rect('filter="url(#effect)"'))),/SVG_FILTER_EFFECT_UNSUPPORTED/);
}));
test('explicit clipped filter region and partial channel transfer are rejected',()=>dom(async()=>{
 const defs=[
  def(color('saturate','values="1"'),'width="40%"'),
  def('<feComponentTransfer><feFuncR type="identity"/></feComponentTransfer>'),
  def('<feComponentTransfer><feFuncR type="linear" slope="1"/><feFuncG type="identity"/><feFuncB type="identity"/><feFuncA type="identity"/></feComponentTransfer>')
 ];
 for(const d of defs)await assert.rejects(normalize(svg(d+rect('filter="url(#effect)"'))),/SVG_FILTER_EFFECT_UNSUPPORTED/);
}));
test('a stylesheet-only filter reference must not disappear',()=>dom(async()=>{
 const x=svg(def('<feGaussianBlur stdDeviation="2"/>')+'<style>rect { filter:url(#effect) }</style>'+rect());
 await assert.rejects(normalize(x),/SVG_FILTER_STYLESHEET_UNSUPPORTED/);
}));
test('an unused-looking filter referenced from a paint remains an error',()=>dom(async()=>{
 const x=svg(def('<feGaussianBlur stdDeviation="2"/>')+'<rect width="10" height="10" fill="url(#effect)"/>');
 await assert.rejects(normalize(x),/SVG_FILTER_UNRESOLVED_REFERENCE/);
}));
test('a genuinely unused filter can be removed while retaining the vector object',()=>dom(async()=>{
 const out=await normalize(svg(def('<feGaussianBlur stdDeviation="2"/>')+rect()));
 vector(out);assert.equal(out.filtersApplied,0);
}));
test('active event handlers remain rejected at the downstream SVG trust boundary',()=>dom(async()=>{
 const out=await normalize(svg(rect('filter="grayscale(0)" onload="alert(1)"')));
 assert.throws(()=>parseSafeSvg(out.svg),/이벤트 속성/);
}));
test('already aborted conversion never publishes a partial rewrite',()=>dom(async()=>{
 const signal=new AbortController();signal.abort();
 await assert.rejects(normalizeSvgGrayscale(svg(rect('filter="saturate(0)"')),signal.signal),e=>e.name==='AbortError');
}));

test('actual PDFKit output retains vector fill and valid page geometry after identity removal',()=>dom(async()=>{
 const input=svg(def(color('saturate','values="1"'))+rect('filter="url(#effect)"'));
 const out=await normalize(input);
 vector(out);
 const pdf=new PDFKit({autoFirstPage:false,margin:0,compress:false});
 const chunks=[],done=new Promise((resolve,reject)=>{
  pdf.on('data',data=>chunks.push(data));pdf.on('end',resolve);pdf.on('error',reject);
 });
 pdf.addPage({size:[90,60],margin:0});
 const warnings=[];
 SVGtoPDF(pdf,out.svg,0,0,{width:90,height:60,assumePt:false,
  warningCallback:message=>warnings.push(String(message))});
 pdf.end();
 await done;
 assert.deepEqual(warnings,[]);
 const bytes=Buffer.concat(chunks);
 const inspected=await PdfLibDocument.load(bytes);
 assert.equal(inspected.getPageCount(),1);
 assert.doesNotMatch(bytes.toString('latin1'),/\/Subtype\s*\/Image\b/);
 assert.match(bytes.toString('latin1'),/^%PDF-/);
}));
