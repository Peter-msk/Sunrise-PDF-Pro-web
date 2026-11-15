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

const TARGET='‧-｢｣․･⁀‿';
test('DEV38: real SVG->PDFKit retains all eight reported glyphs and embeds selected OFL faces',async()=>{
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
  const audit=await inspectPdfFontEmbedding(blob);
  assert.equal(audit.pageCount,1);
  assert.ok(audit.fonts.length>0);
  assert.ok(audit.fonts.every(f=>f.embedded),'every page font resource should have FontFile');
  const found=compareSelectedAndEmbedded(registry.faces.filter(f=>used.has(f.name)),audit);
  assert.ok(found.every(f=>f.embedded&&f.pdfResourcePresent),'all selected faces need embedded resources');
  assert.ok(used.size>=2,'at least two distinct faces must be selected for eight mixed glyphs');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsJob=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),
   useSystemFonts:false,disableFontFace:true});
  const document=await pdfjsJob.promise;
  try{
   const page=await document.getPage(1);
   const text=await page.getTextContent();
   const extracted=text.items.map(item=>String(item.str||'')).join('');
   for(const character of TARGET)
    assert.ok(extracted.includes(character),
      'PDF ToUnicode/search text must preserve U+'+character.codePointAt(0).toString(16));
  }finally{await document.destroy();}
 }finally{
  if(pdfjsJob)await pdfjsJob.destroy().catch(()=>{});
  globalThis.DOMParser=old.DOMParser;
  globalThis.XMLSerializer=old.XMLSerializer;
  window.close();
 }
});
