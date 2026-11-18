// Served only by the Vite dev server during tests. Never imported by the app.
import {HwpDocument} from '@rhwp/core';
import {unzipSync} from 'fflate';
import {prepareWasm} from '../src/converter.js';
import {verifyBakedBlackwhite} from './dev45-blackwhite-pixels.mjs';

async function decodePixels(blob){
 const bitmap=await createImageBitmap(blob,{colorSpaceConversion:'none'});
 const canvas=document.createElement('canvas');
 try{
  const {width,height}=bitmap;
  if(width*height>9000000)throw Error('BLACKWHITE_FIXTURE_PIXEL_LIMIT');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0);
  return ctx.getImageData(0,0,width,height);
 }finally{bitmap.close();canvas.width=canvas.height=0;}
}

export async function inspectPublicFixture(bytes,verifyBlackwhite=false){
 await prepareWasm();
 const input=new Uint8Array(bytes);
 // The MIT fixture contains one BMP used by every picture. RHWP v0.8.7
 // bakes zero-adjustment BlackWhite into PNG and suppresses the SVG filter.
 // Compare every emitted picture to the independent original BMP pixels.
 let source=null;
 if(verifyBlackwhite){
  const bmp=unzipSync(input)['BinData/image1.bmp'];
  if(!bmp)throw Error('BLACKWHITE_FIXTURE_BMP_MISSING');
  source=await decodePixels(new Blob([bmp],{type:'image/bmp'}));
 }
 const doc=new HwpDocument(input);
 try{
  const effects=new Set();let cropViewports=0;
  const baked={images:0,pngImages:0,pixels:0,black:0,white:0,changed:0,mismatched:0,alphaMismatch:0};
  const cache=new Map();
  const pages=doc.pageCount();
  for(let i=0;i<pages;i++){
   const svg=doc.renderPageSvgWithProfile(i,'print');
   const xml=new DOMParser().parseFromString(svg,'image/svg+xml');
   if(xml.querySelector('parsererror'))throw Error('RHWP_SVG_PARSE');
   for(const el of xml.querySelectorAll('filter[id]'))effects.add(el.id);
   for(const el of xml.querySelectorAll('g[filter] svg[viewBox]')){
    if(el.children.length===1&&el.firstElementChild.localName==='image')cropViewports++;
   }
   if(source)for(const el of xml.querySelectorAll('image')){
    baked.images++;
    const href=el.getAttribute('href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href')||'';
    const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(href);
    if(!match)continue;
    baked.pngImages++;
    let stats=cache.get(href);
    if(!stats){
     const png=Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0));
     const actual=await decodePixels(new Blob([png],{type:'image/png'}));
     stats=verifyBakedBlackwhite(source,actual);
     cache.set(href,stats);
    }
    for(const key of ['pixels','black','white','changed','mismatched','alphaMismatch'])baked[key]+=stats[key];
   }
  }
  return {pages,effects:[...effects],cropViewports,...(source?{baked}:{})};
 }finally{doc.free?.();}
}
