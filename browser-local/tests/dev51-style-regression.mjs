/** DEV51: actual SVG DOM + production preflight + real vector PDF output.
 * Synthetic snippets reproduce invalid CSS font-style handling; this does
 * not assert that the anonymized 23 failures had the exact same raw values.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import PDFKit from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import {resolveFont,loadPdfFonts,resolveSvgFontStyleForRendering} from '../src/pdf-fonts.js';
import {preflightProfessionalSvg} from '../src/svg-professional.js';
import {inspectPdfFontEmbedding} from '../src/pdf-font-audit.mjs';
import {buildLocalBatchQaReport} from '../src/local-batch-qa.mjs';
const family='Original';
const regular={name:'OriginalRegular',family,aliases:['original'],bold:false,italic:false,characterSet:new Set([65,66,0xd55c,0xae00])};
const italic={...regular,name:'OriginalItalic',italic:true};
const registry={faces:[regular,italic],allowCoverageFallback:true};
const svg=content=>'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" font-family="Original">'+content+'</svg>';
async function withDom(fn){
 const w=new JSDOM('').window,old=[globalThis.DOMParser,globalThis.XMLSerializer];
 globalThis.DOMParser=w.DOMParser;globalThis.XMLSerializer=w.XMLSerializer;
 try{return await fn();}finally{[globalThis.DOMParser,globalThis.XMLSerializer]=old;w.close();}
}
const pre=(content,fontRegistry=registry)=>preflightProfessionalSvg({svg:svg(content),width:300,height:100},{fontRegistry});
test('DEV51 invalid style declarations do not poison inherited SVG text',async()=>withDom(()=>{
 const cases=[
 ['<text font-style="">한글</text>','normal',1],
 ['<g font-style="italic"><text font-style="">한글</text></g>','italic',1],
 ['<g font-style="none"><text>한글</text></g>','normal',1],
 ['<g font-style="italic"><g font-style="nonsense"><text>한글</text></g></g>','italic',1],
 ['<text font-style="oblique 15deg">한글</text>','italic',1],
 ['<g font-style="italic"><text font-style="normal">한글</text></g>','normal',0],
 ['<text font-style="inherit">한글</text>','normal',0]
 ];
 for(const [xml,expected,recoveries] of cases){
  const result=pre(xml);assert.equal(result.ok,true,result.reason+' '+xml);
  assert.equal(result.fontStyleRecoveries,recoveries);
  const d=new DOMParser().parseFromString(result.svg,'image/svg+xml');
  const t=d.querySelector('text');let effective='normal';
  for(let n=t;n;n=n.parentElement){const attr=n.getAttribute('font-style');if(attr!==null){effective=attr;break;}}
  assert.equal(effective,expected,xml);
  assert.equal(t.textContent,'한글');
 }
}));
test('DEV51 valid oblique angle and invalid style resolve independently from weight',()=>{
 assert.equal(resolveSvgFontStyleForRendering('normal','oblique -10deg').style,'italic');
 assert.equal(resolveSvgFontStyleForRendering('normal','oblique 0.25turn').styleRecovery,'oblique-angle-approximated');
 assert.equal(resolveSvgFontStyleForRendering('normal','oblique 91deg',400,'italic').styleRecovery,'invalid-style-inherited');
 assert.equal(resolveSvgFontStyleForRendering('invalid','none').reason,'weight-unsupported');
});
test('DEV51 no relaxation of malicious resource, unknown element or missing glyph checks',async()=>withDom(()=>{
 for(const xml of ['<text font-style="url(https://example.com/x)">한글</text>','<script>bad</script>','<text font-style="">🪼</text>','<text font-weight="invalid">한글</text>'])
  assert.equal(pre(xml).ok,false,xml);
}));
test('DEV51 real PDF writer keeps all source text vector and embeds selected PC-equivalent face',{timeout:45000},async()=>withDom(async()=>{
 const bytes=await readFile(new URL('../public/fonts/HakgyoansimBareondotumR.ttf',import.meta.url));
 const r=await loadPdfFonts([{name:'HakgyoansimBareondotumR.ttf',arrayBuffer:async()=>Uint8Array.from(bytes).buffer}],fontkit);
 const face=r.faces[0];face.aliases.push('original');face.isLocal=true;
 const reg={faces:r.faces,allowCoverageFallback:true};
 const output=pre('<g font-style="none"><text x="12" y="35" font-size="18">한글</text><text x="12" y="65" font-size="18" font-style="">한글</text></g>',reg);
 assert.equal(output.ok,true,output.reason);assert.equal(output.fontStyleRecoveries,2);
 const pdf=new PDFKit({autoFirstPage:false,margin:0,compress:false});const chunks=[],used=new Set(),warnings=[];
 const completed=new Promise((res,rej)=>{pdf.on('data',x=>chunks.push(x));pdf.on('end',res);pdf.on('error',rej);});
 pdf.registerFont(face.name,Buffer.from(face.bytes));pdf.addPage({size:[300,100],margins:{top:0,bottom:0,left:0,right:0}});
 SVGtoPDF(pdf,output.svg,0,0,{width:300,height:100,assumePt:false,
  fontCallback:(family,bold,italic)=>{const f=resolveFont(reg,family,bold?'bold':'normal',italic?'italic':'normal');assert.ok(f);used.add(f.name);return f.name;},
  warningCallback:m=>warnings.push(m)});
 pdf.end();await completed;
 assert.deepEqual(warnings,[]);assert.ok(used.has(face.name));
 const data=Buffer.concat(chunks);assert.doesNotMatch(data.toString('latin1'),/\/Subtype\s*\/Image\b/);
 const audit=await inspectPdfFontEmbedding(new Blob([data],{type:'application/pdf'}));assert.ok(audit.fonts.some(f=>f.embedded));
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const job=pdfjs.getDocument({data:Uint8Array.from(data),useSystemFonts:false,disableFontFace:true});
 try{const d=await job.promise;assert.equal(d.numPages,1);const text=await (await d.getPage(1)).getTextContent();assert.equal(text.items.map(x=>x.str||'').join('').replace(/\s/g,''),'한글한글');await d.cleanup();}finally{await job.destroy();}
}));
test('DEV51 records numeric style recovery counts only',()=>{
 const qa=buildLocalBatchQaReport([{file:{name:'private.hwp'},state:'done',result:{fontStyleRecoveries:3}}]);
 assert.equal(qa.build_revision,'DEV61');assert.equal(qa.files[0].font_style_recoveries,3);
 assert.ok(!JSON.stringify(qa).includes('private'));
});
