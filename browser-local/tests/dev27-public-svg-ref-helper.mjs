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
   // Decode only the two bounded public-fixture nested SVG images for
   // classification; do not export markup, text, URLs or binary.
   for(const image of parsed.querySelectorAll('image')){
    const href=image.getAttribute('href')||image.getAttribute('xlink:href')||'';
    const m=/^data:image\\/svg\\+xml;base64,([a-z0-9+/\\s]+={0,2})$/i.exec(href);
    if(!m||m[1].length>1_000_000)continue;
    try{
     const bytes=Uint8Array.from(atob(m[1].replace(/\\s+/g,'')),x=>x.charCodeAt(0));
     const inner=new DOMParser().parseFromString(new TextDecoder('utf-8',{fatal:true}).decode(bytes),'image/svg+xml');
     for(const element of inner.querySelectorAll('*')){
      for(const attr of element.attributes){
       const name=attr.localName||attr.name;
       if(name==='href'||name==='src'){
        const type='embedded:'+element.localName+'/'+name+'/'+kind(attr.value);
        kinds.set(type,(kinds.get(type)||0)+1);
       }
       for(const match of attr.value.matchAll(/url\\s*\\(\\s*['"]?([^'")]+)['"]?\\s*\\)/gi)){
        const type='embedded:'+element.localName+'/'+name+'/css-'+kind(match[1]);
        kinds.set(type,(kinds.get(type)||0)+1);
       }
      }
      if(element.localName==='style')for(const match of (element.textContent||'').matchAll(/url\\s*\\(\\s*['"]?([^'")]+)['"]?\\s*\\)/gi)){
       const type='embedded:style/css-'+kind(match[1]);
       kinds.set(type,(kinds.get(type)||0)+1);
      }
     }
    }catch{
     kinds.set('embedded:parse-failure',(kinds.get('embedded:parse-failure')||0)+1);
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
