/** Browser-only public-fixture diagnostic, never bundled into production.
 * Classifies SVG reference kinds, never outputs URL, IDs, image bytes or text.
 */
import {HwpDocument} from '@rhwp/core';
import {prepareWasm,checkedSvg} from '../src/converter.js';
import {normalizeGifSvg} from '../src/svg-gif.js';

const MAX_PAGES=40;
function kind(value){
 const v=String(value||'').trim();
 if(v.startsWith('#'))return 'local-ref';
 if(/^data:image\/svg\+xml[;,]/i.test(v)){
  const comma=v.indexOf(',');
  const head=comma>=0?v.slice(0,comma).toLowerCase():'missing-comma';
  if(head==='data:image/svg+xml;base64')return 'data-svg-base64-exact';
  if(head.includes(';base64'))return 'data-svg-base64-with-parameters';
  if(head.includes(';utf8')||head.includes('charset='))return 'data-svg-utf8-or-encoded';
  return 'data-svg-other-encoding';
 }
 if(/^data:image\/png[;,]/i.test(v))return 'data-png';
 if(/^data:image\/jpeg[;,]/i.test(v))return 'data-jpeg';
 if(/^data:image\/gif[;,]/i.test(v))return 'data-gif';
 if(/^data:image\/webp[;,]/i.test(v))return 'data-webp';
 if(/^data:/i.test(v))return 'data-other';
 if(/^blob:/i.test(v))return 'blob';
 if(/^https?:/i.test(v))return 'remote-http';
 if(/^file:/i.test(v))return 'file-url';
 if(!v)return 'empty';
 return 'other';
}
export async function classifyPublicSvgReferences(bytes){
 await prepareWasm();
 const doc=new HwpDocument(new Uint8Array(bytes));
 try{
  const count=doc.pageCount();
  const result={pageCount:count,scannedPages:0,failedPages:[],refKinds:{}};
  for(let i=0;i<Math.min(count,MAX_PAGES);i++){
   const page=i+1;
   const raw=doc.renderPageSvgWithProfile(i,'print');
   const parser=new DOMParser();
   const parsed=parser.parseFromString(raw,'image/svg+xml');
   const kinds=new Map();
   for(const el of parsed.querySelectorAll('*')){
    for(const attr of el.attributes){
     const name=attr.localName||attr.name;
     if(name==='href'||name==='src'){
      const key=el.localName+'/'+name+'/'+kind(attr.value);
      kinds.set(key,(kinds.get(key)||0)+1);
     }
     for(const m of attr.value.matchAll(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi)){
      const key=el.localName+'/'+name+'/css-'+kind(m[1]);
      kinds.set(key,(kinds.get(key)||0)+1);
     }
    }
   }
   for(const [key,value] of kinds)result.refKinds[key]=(result.refKinds[key]||0)+value;
   try{
    const clean=await normalizeGifSvg(raw);
    checkedSvg(clean);
   }catch(err){
    result.failedPages.push({page,code:String(err?.message||err).slice(0,140),
      refs:Array.from(kinds.entries()).map(([type,total])=>({type,total}))});
   }
   result.scannedPages++;
  }
  return result;
 }finally{doc.free();}
}
