/** DEV27 native Chromium print as explicit alternative for SVG filter failures.
 * Synthetic graphics only. Does not assert parity with user Hancom documents.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {JSDOM} from 'jsdom';
import {parseSafeSvg} from '../src/svg-security.js';

test('SVG filters remain intact at the safe native-print trust boundary',()=>{
 const win=new JSDOM('').window;
 try{
  const raw='<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="f">'+
   '<feGaussianBlur stdDeviation="2"/></filter></defs><rect width="12" height="12" filter="url(#f)"/></svg>';
  const node=parseSafeSvg(raw,new win.DOMParser());
  assert.equal(node.querySelector('feGaussianBlur')?.getAttribute('stdDeviation'),'2');
  assert.equal(node.querySelector('rect')?.getAttribute('filter'),'url(#f)');
  assert.throws(()=>parseSafeSvg(raw.replace('<rect width','<script>alert(1)</script><rect width'),
   new win.DOMParser()),/허용되지 않는 요소/);
 }finally{win.close();}
});

test('SVG failure exposes opt-in browser print prepare then separate print/save action',()=>{
 const src=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const print=readFileSync(new URL('../src/native-print.js',import.meta.url),'utf8');
 assert.match(src,/recoveryCode\(item\.error\)==='SVG_FILTER_EFFECT_UNSUPPORTED'/);
 assert.match(src,/\\bFONT_GLYPH_MISSING\\b/);
 assert.match(src,/item\.state==='failed'&&isHwp\(item\.file\)/);
 assert.match(src,/native\.className='secondary native-print-recovery'/);
 assert.match(src,/show\(item\);\s*\$\('print-prepare'\)\.click\(\)/);
 assert.match(src,/if\(printJob&&active===item&&!busy\)/);
 assert.match(src,/\$\('print-save'\)\.click\(\)/);
 assert.match(src,/앱의 실패 상태는 자동으로 성공 처리되지 않습니다/);
 assert.match(print,/parseSafeSvg\(svg,new doc\.defaultView\.DOMParser\(\)\)/);
 assert.doesNotMatch(src,/item\.state='done';\s*\$\('print-save'\)/);
});

test('Chromium print handles complex SVG blur and retains unrelated searchable text',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setContent('<!doctype html><html><head><meta charset="utf-8">'+
   '<style>@page{size:600px 420px;margin:0}html,body{margin:0;padding:0}svg{display:block}</style></head><body>'+
   '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420">'+
   '<defs><filter id="blur"><feGaussianBlur stdDeviation="4"/></filter></defs>'+
   '<rect x="100" y="90" width="220" height="100" fill="#f00" filter="url(#blur)"/>'+
   '<text x="80" y="280" font-family="Arial" font-size="30">VECTOR TEXT SAMPLE</text>'+
   '</svg></body></html>');
  const bytes=await page.pdf({printBackground:true,preferCSSPageSize:true});
  assert.equal(Buffer.from(bytes).subarray(0,5).toString('ascii'),'%PDF-');
  assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
  const loading=getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:true});
  try{
   const doc=await loading.promise;
   const text=await(await doc.getPage(1)).getTextContent();
   const words=text.items.map(x=>x.str||'').join(' ');
   assert.match(words,/VECTOR TEXT SAMPLE/,
    'Unfiltered SVG text should remain extractable in browser printed PDF');
  }finally{await loading.destroy();}
 }finally{await browser.close();}
});
