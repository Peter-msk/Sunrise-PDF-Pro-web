import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import * as kit from '../node_modules/pdfkit/js/pdfkit.browser.mjs';
import Helvetica from 'pdfkit/standard-fonts/Helvetica';
import SVGtoPDF from 'svg-to-pdfkit';
import {loadBrowserPdfBackend} from '../src/pdfkit-backend.js';

test('pinned PDFKit browser implementation emits a real vector/text PDF through the adapter',async()=>{
 const modules={pdfkit:kit,'svg-to-pdfkit':{default:SVGtoPDF},'pdfkit/standard-fonts/Helvetica':{default:Helvetica}};
 const backend=await loadBrowserPdfBackend(async name=>modules[name]);
 backend.registerStdFonts(backend.Helvetica);
 const pdf=new backend.PDFDocument({autoFirstPage:false,margin:0,font:null});
 const pending=backend.toBlob(pdf);
 pdf.addPage({size:[595.2756,841.8898],margin:0});
 const warnings=[];
 backend.SVGtoPDF(pdf,'<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 794 1123"><rect x="30" y="30" width="200" height="40" fill="#2277cc"/><text x="30" y="110" font-family="Helvetica" font-size="22">Sunrise PDF PRO R40 vector check</text></svg>',0,0,
  {width:595.2756,height:841.8898,assumePt:false,fontCallback:()=> 'Helvetica',warningCallback:x=>warnings.push(x)});
 pdf.end();const blob=await pending;
 assert.deepEqual(warnings,[]);assert.equal(blob.type,'application/pdf');
 assert.match(await blob.slice(0,8).text(),/^%PDF-/);
 await mkdir(new URL('../../artifacts/',import.meta.url),{recursive:true});
 await writeFile(new URL('../../artifacts/pdfkit-real-vector.pdf',import.meta.url),new Uint8Array(await blob.arrayBuffer()));
});
