/**
 * DEV38 release gate: real browser-pipeline components (SVG preflight, PDFKit,
 * svg-to-pdfkit, pinned OFL font binaries, and local FontDescriptor audit).
 * Does not replace the 25-document HWP/HWPX / 124-page visual acceptance test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import PDFKit from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import {JSDOM} from 'jsdom';
import {approvedFonts,verifyApprovedFont} from '../scripts/install-safe-fonts.mjs';
import {loadPdfFonts,resolveFont} from '../src/pdf-fonts.js';
import {preflightProfessionalSvg} from '../src/svg-professional.js';
import {inspectPdfFontEmbedding,compareSelectedAndEmbedded} from '../src/pdf-font-audit.mjs';

const TARGET='한글◦•▸∘‧-｢문서｣․･⁀‿';
const REQUIRED_SYMBOLS='◦•▸∘‧-｢｣․･⁀‿';
test('DEV38: real SVG->PDFKit embeds Hangul and all 12 punctuation glyphs in vector PDF',{timeout:45000},async()=>{
 const old={DOMParser:globalThis.DOMParser,XMLSerializer:globalThis.XMLSerializer};
 const window=new JSDOM('').window;
 globalThis.DOMParser=window.DOMParser;
 globalThis.XMLSerializer=window.XMLSerializer;
 let pdfjsJob;
 try{
  const files=await Promise.all(approvedFonts.map(async f=>{
   const bytes=await readFile(new URL('../public/fonts/'+f.name,import.meta.url));
   assert.equal(verifyApprovedFont(f,bytes),true,'approved bytes: '+f.name);
   return {name:f.name,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  }));
  const registry=await loadPdfFonts(files,fontkit);
  assert.equal(registry.faces.length,7);
  registry.faces.forEach((face,i)=>{
   face.isFallback=true;
   face.name='DEV38BundledFont'+(i+1);
   face.genericFamily=i<2?'serif':i<4?'sans':'symbol';
  });
  const checked={width:400,height:90,
   svg:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="90"><text x="12" y="50" font-size="21" font-family="OriginalNotInstalled">'+TARGET+'</text></svg>'};
  const normalized=preflightProfessionalSvg(checked,{fontRegistry:registry});
  assert.equal(normalized.ok,true,'SVG vector preflight: '+normalized.reason);
  assert.ok(normalized.svg.includes('<tspan'),'mixed glyph fallback should split safe text runs');
  const pdf=new PDFKit({autoFirstPage:false,margin:0,compress:false});
  const chunks=[];
  const completed=new Promise((resolve,reject)=>{
   pdf.on('data',value=>chunks.push(value));
   pdf.on('end',resolve);
   pdf.on('error',reject);
  });
  for(const face of registry.faces)pdf.registerFont(face.name,Buffer.from(face.bytes));
  pdf.addPage({size:[400,90],margins:{top:0,bottom:0,left:0,right:0}});
  const used=new Set(),warnings=[];
  SVGtoPDF(pdf,normalized.svg,0,0,{
   width:400,height:90,assumePt:false,
   fontCallback:(family,bold,italic)=>{
    const face=resolveFont(registry,family,bold?'bold':'normal',italic?'italic':'normal');
    assert.ok(face,'font callback must resolve '+family);
    used.add(face.name);
    return face.name;
   },
   warningCallback:message=>warnings.push(String(message))
  });
  assert.deepEqual(warnings,[],'unexpected SVG-to-PDFKit glyph rendering warning');
  pdf.end();await completed;
  const blob=new Blob(chunks,{type:'application/pdf'});
  // Default professional conversion may not silently replace vector text with a raster.
  const rawPdf=Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.doesNotMatch(rawPdf,/\/Subtype\s*\/Image\b/,
   'professional output unexpectedly contains an image XObject');
  const audit=await inspectPdfFontEmbedding(blob);
  assert.equal(audit.pageCount,1);
  assert.ok(audit.fonts.length>0);
  // PDFKit may expose an unused standard Helvetica resource; only faces
  // actually selected through fontCallback must be embedded.
  assert.ok(audit.fonts.some(f=>f.embedded),'selected custom font resource missing');
  assert.ok(used.size>=4,'Hangul plus all 12 punctuation glyphs must exercise body and three symbol faces');
  const expectedFaces=registry.faces.filter(f=>used.has(f.name));
  const found=compareSelectedAndEmbedded(expectedFaces,audit);
  assert.equal(found.length,expectedFaces.length,'no selected face may disappear from the PDF audit');
  for(const face of found){
   assert.equal(face.pdfResourcePresent,true,'selected font resource missing: '+face.family);
   assert.equal(face.embedded,true,'selected font has no FontFile: '+face.family);
   assert.deepEqual(face.pages,[1],'selected font must be referenced by the output page: '+face.family);
  }
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsJob=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),
   useSystemFonts:false,disableFontFace:true});
  const document=await pdfjsJob.promise;
  try{
   const page=await document.getPage(1);
   const text=await page.getTextContent();
   const extracted=text.items.map(item=>String(item.str||'')).join('');
   assert.ok(extracted.includes('한글')&&extracted.includes('문서'),
    'embedded Korean body text must remain searchable');
   for(const character of REQUIRED_SYMBOLS)
    assert.ok(extracted.includes(character),
      'PDF ToUnicode/search text must preserve U+'+character.codePointAt(0).toString(16));
  }finally{await document.cleanup();}
 }finally{
  if(pdfjsJob)await pdfjsJob.destroy().catch(()=>{});
  globalThis.DOMParser=old.DOMParser;
  globalThis.XMLSerializer=old.XMLSerializer;
  window.close();
 }
});


test('DEV38: unsupported glyph fails SVG preflight without silent substitution',()=>{
 const old={DOMParser:globalThis.DOMParser,XMLSerializer:globalThis.XMLSerializer};
 const window=new JSDOM('').window;
 globalThis.DOMParser=window.DOMParser;
 globalThis.XMLSerializer=window.XMLSerializer;
 try{
  const original='A🪼B';
  const checked={width:300,height:90,
   svg:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90"><text x="12" y="40" font-family="Uninstalled">'+original+'</text></svg>'};
  const registry={faces:[{name:'AsciiFace',family:'AsciiFace',aliases:['asciiface'],
   characterSet:new Set([65,66]),bold:false,italic:false,
   isFallback:true,genericFamily:'sans'}]};
  const output=preflightProfessionalSvg(checked,{fontRegistry:registry});
  assert.equal(output.ok,false);
  assert.match(output.reason,/FONT_(GLYPH|FAMILY|RUN_SPLIT)/);
  assert.ok(checked.svg.includes(original),'rejected SVG input must remain unchanged');
 }finally{
  globalThis.DOMParser=old.DOMParser;
  globalThis.XMLSerializer=old.XMLSerializer;
  window.close();
 }
});

test('DEV39 preflight preserves named bundled Hangul text with missing punctuation',()=>{
 const old={DOMParser:globalThis.DOMParser,XMLSerializer:globalThis.XMLSerializer};
 const window=new JSDOM('').window;
 globalThis.DOMParser=window.DOMParser;globalThis.XMLSerializer=window.XMLSerializer;
 try{
  const body={name:'Body',family:'학교안심 바른돋움',aliases:['학교안심바른돋움'],
   isFallback:true,bold:false,italic:false,genericFamily:'sans',
   characterSet:new Set([...('한글')].map(c=>c.codePointAt(0)))};
  const wide={name:'Wide',family:'WideFace',aliases:['wideface'],
   isFallback:true,bold:false,italic:false,genericFamily:'symbol',
   characterSet:new Set([...('한글‧')].map(c=>c.codePointAt(0)))};
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="260" height="80"><text x="12" y="38" font-family="학교안심 바른돋움">한글‧</text></svg>';
  const result=preflightProfessionalSvg({svg,width:260,height:80},
   {fontRegistry:{faces:[body,wide]}});
  assert.equal(result.ok,true,result.reason);
  const doc=new DOMParser().parseFromString(result.svg,'image/svg+xml');
  assert.deepEqual([...doc.querySelectorAll('text > tspan')].map(n=>
   [n.textContent,n.getAttribute('font-family')]),[
   ['한글','학교안심 바른돋움'],['‧','WideFace']]);
 }finally{
  globalThis.DOMParser=old.DOMParser;globalThis.XMLSerializer=old.XMLSerializer;
  window.close();
 }
});
