// Served only by the Vite dev server during tests. Never imported by the app.
import {HwpDocument} from '@rhwp/core';
import {prepareWasm} from '../src/converter.js';
export async function inspectPublicFixture(bytes){
 await prepareWasm();
 const doc=new HwpDocument(new Uint8Array(bytes));
 try{
  const effects=new Set();let cropViewports=0;
  const pages=doc.pageCount();
  for(let i=0;i<pages;i++){
   const svg=doc.renderPageSvgWithProfile(i,'print');
   const xml=new DOMParser().parseFromString(svg,'image/svg+xml');
   if(xml.querySelector('parsererror'))throw Error('RHWP_SVG_PARSE');
   for(const el of xml.querySelectorAll('filter[id]'))effects.add(el.id);
   for(const el of xml.querySelectorAll('g[filter] svg[viewBox]')){
    if(el.children.length===1&&el.firstElementChild.localName==='image')cropViewports++;
   }
  }
  return {pages,effects:[...effects],cropViewports};
 }finally{doc.free?.();}
}
