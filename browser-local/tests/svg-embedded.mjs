import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {JSDOM} from 'jsdom';
import PDFDocument from '../node_modules/pdfkit/js/pdfkit.standalone.js';
import SVGtoPDF from 'svg-to-pdfkit';
import {parseDocumentSvg} from '../src/svg-embedded.js';
import {preflightProfessionalSvg} from '../src/svg-professional.js';

const win=new JSDOM('').window;
globalThis.DOMParser=win.DOMParser;globalThis.XMLSerializer=win.XMLSerializer;
const wrap=body=>'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120">'+body+'</svg>';
const data=xml=>'data:image/svg+xml;base64,'+Buffer.from(xml).toString('base64');
const image=(xml,attrs='x="20" y="20" width="80" height="60"')=>'<image '+attrs+' href="'+data(xml)+'"/>';
const picture=color=>wrap('<defs><linearGradient id="paint"><stop offset="0" stop-color="'+color+'"/><stop offset="1" stop-color="'+color+'"/></linearGradient></defs><rect width="240" height="120" fill="url(#paint)"/>');
const xml=root=>new win.XMLSerializer().serializeToString(root);

test('embedded SVG expands to independently scoped vector viewports and keeps physical dimensions',()=>{
 const physical='<svg xmlns="http://www.w3.org/2000/svg" width="170mm" height="51mm" viewBox="0 0 1000 300"><rect width="1000" height="300"/></svg>';
 const root=parseDocumentSvg(wrap(image(physical)));
 assert.equal(root.querySelectorAll('image').length,0);
 const outer=root.querySelector('g>svg');assert.equal(outer.getAttribute('width'),'80');
 assert.equal(outer.getAttribute('preserveAspectRatio'),'xMidYMid meet');
 assert.ok(Math.abs(Number(outer.getAttribute('viewBox').split(' ')[2])-170*96/25.4)<1e-9);
 assert.equal(outer.firstElementChild.getAttribute('viewBox'),'0 0 1000 300');
 assert.equal(preflightProfessionalSvg({svg:xml(root),width:240,height:120}).ok,true);
});

test('separate pictures never share gradient IDs or inherit parent paint',()=>{
 const root=parseDocumentSvg(wrap('<g fill="green">'+image(picture('#ff0000'))+image(picture('#0000ff'),'x="130" y="20" width="80" height="60"')+'</g>'));
 const ids=[...root.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,2);
 for(const rect of root.querySelectorAll('rect'))assert.ok(ids.includes(rect.getAttribute('fill').slice(5,-1)));
 assert.equal(root.querySelector('g>g>svg').getAttribute('fill'),'#000');
});

test('decoded picture scripts, events, foreign content, external resources and malformed XML are rejected',()=>{
 for(const bad of ['<script/>','<g onload="alert(1)"/>','<foreignObject/>','<image href="https://external.example/x.png"/>','<rect fill="url(//external.example/x)"/>'])
  assert.throws(()=>parseDocumentSvg(wrap(image(wrap(bad)))));
 for(const bad of ['<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>','<?xml-stylesheet href="https://external.example/x"?><svg/>','<svg><rect></svg>'])
  assert.throws(()=>parseDocumentSvg(wrap(image(bad))));
});

test('nested picture limits, duplicate IDs, unresolved references and nonfinite geometry fail closed',()=>{
 let nested=picture('#ff0000');for(let i=0;i<5;i++)nested=wrap(image(nested));
 assert.throws(()=>parseDocumentSvg(nested),/중첩/);
 assert.throws(()=>parseDocumentSvg(wrap(image(wrap('<g id="x"/><g id="x"/>')))),/중복/);
 assert.throws(()=>parseDocumentSvg(wrap(image(wrap('<rect fill="url(#outside)"/>')))),/참조/);
 assert.throws(()=>parseDocumentSvg(wrap(image(picture('red'),'x="0" y="0" width="Infinity" height="60"'))),/배치/);
 assert.throws(()=>parseDocumentSvg(wrap(image('<svg xmlns="http://www.w3.org/2000/svg"/>'))),/원본 크기/);
});

test('local CSS is flattened before picture ID scoping, including marker references',()=>{
 const inner=wrap('<style>.shape{fill:url(#paint)}</style><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><rect class="shape" width="100" height="100"/>');
 const root=parseDocumentSvg(wrap(image(inner)));
 assert.equal(root.querySelectorAll('style,[class]').length,0);
 assert.match(root.querySelector('rect').getAttribute('fill'),/^url\(#sunrise-picture-\d+\)$/);
});

test('real PDF keeps two differently colored embedded SVG pictures as vectors with correct fit geometry',async t=>{
 if(spawnSync('pdftoppm',['-v']).error){t.skip('pdftoppm unavailable');return;}
 const root=parseDocumentSvg(wrap(image(picture('#ff0000'))+image(picture('#0000ff'),'x="130" y="20" width="80" height="60"')));
 const dir=await mkdtemp(join(tmpdir(),'sunrise-embedded-'));
 try{
  const path=join(dir,'out.pdf'),out=createWriteStream(path),pdf=new PDFDocument({size:[240,120],margin:0});pdf.pipe(out);
  const warnings=[];SVGtoPDF(pdf,xml(root),0,0,{assumePt:true,warningCallback:w=>warnings.push(w)});pdf.end();await finished(out);assert.deepEqual(warnings,[]);
  assert.doesNotMatch((await readFile(path)).toString('latin1'),/\/Subtype\s*\/Image\b/);
  const raster=spawnSync('pdftoppm',['-r','72','-singlefile',path],{maxBuffer:1024*1024});assert.equal(raster.status,0);
  const match=/^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(raster.stdout.toString('latin1'));assert.ok(match);
  const pixels=raster.stdout.subarray(match[0].length),width=Number(match[1]);
  const pixel=(x,y)=>Array.from(pixels.subarray((y*width+x)*3,(y*width+x)*3+3));
  assert.deepEqual(pixel(50,50),[255,0,0]);assert.deepEqual(pixel(160,50),[0,0,255]);
  // Intrinsic 2:1 picture meets an 80x60 viewport: 10pt white top/bottom.
  assert.deepEqual(pixel(50,23),[255,255,255]);assert.deepEqual(pixel(50,77),[255,255,255]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
