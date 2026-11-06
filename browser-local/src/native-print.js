/**
 * Native Chromium/Edge print bridge for SVG pages emitted by rhwp.
 * This preserves selectable text and vector graphics on safe same-size pages where the browser's
 * SVG renderer and installed/selected fonts support them. PDF saving is done
 * by the browser's "Save as PDF" dialog, never by a remote service.
 *
 * The print frame is isolated from the main UI so SVG <style> rules cannot
 * change the application's appearance. Pages are already checkedSvg() output;
 * a second security guard prevents executable/external content at this boundary.
 */
const PX_TO_PT=72/96;
const MAX_PRINT_PAGES=120;
import {parseSafeSvg} from './svg-security.js';
function requireSafeSvg(svg,doc){
  return parseSafeSvg(svg,new doc.defaultView.DOMParser());
}

/**
 * Chromium sometimes clips inline SVG after switching named paper sizes.
 * Render those pages as bounded, lossless PNG Blobs instead of encoding them
 * synchronously as Base64 JPEG data URLs. Blob URLs are owned by the print job.
 * This keeps thin Korean glyph strokes and engineering-drawing lines lossless
 * and avoids retaining ~33% Base64 overhead per large fallback page.
 */
async function svgToSafePrintImage(svg,sourceWidth,sourceHeight,windowRef,signal){
  const checkCancel=()=>{
    if(signal?.aborted)throw new DOMException('인쇄 준비가 취소되었습니다.','AbortError');
  };
  checkCancel();
  const maxPixels=9_000_000;
  const scale=Math.min(300/96,Math.sqrt(maxPixels/(sourceWidth*sourceHeight)));
  const width=Math.max(1,Math.round(sourceWidth*scale));
  const height=Math.max(1,Math.round(sourceHeight*scale));
  const source=windowRef.URL.createObjectURL(new windowRef.Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
  let canvas;
  try{
    const image=new windowRef.Image();
    await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=error=>{
        if(settled)return;
        settled=true;
        image.onload=null;
        image.onerror=null;
        signal?.removeEventListener('abort',onAbort);
        if(error)reject(error);else resolve();
      };
      const onAbort=()=>{
        image.removeAttribute('src');
        finish(new DOMException('인쇄 준비가 취소되었습니다.','AbortError'));
      };
      image.onload=()=>finish();
      image.onerror=()=>finish(Error('인쇄용 SVG 이미지 렌더링 실패'));
      signal?.addEventListener('abort',onAbort,{once:true});
      if(signal?.aborted){onAbort();return;}
      image.src=source;
    });
    checkCancel();
    canvas=windowRef.document.createElement('canvas');
    canvas.width=width;
    canvas.height=height;
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw Error('인쇄용 Canvas 2D를 사용할 수 없습니다.');
    context.fillStyle='#fff';
    context.fillRect(0,0,width,height);
    context.drawImage(image,0,0,width,height);
    const bitmap=await new Promise((resolve,reject)=>{
      canvas.toBlob(result=>result?resolve(result):reject(Error('인쇄용 PNG 생성 실패')),'image/png');
    });
    checkCancel();
    if(bitmap.type!=='image/png')throw Error('인쇄용 PNG 형식 오류');
    return bitmap;
  }finally{
    windowRef.URL.revokeObjectURL(source);
    if(canvas){canvas.width=1;canvas.height=1;}
  }
}

/**
 * @param {{svg:string,width:number,height:number}[]} pages checked SVG pages
 * @param {HTMLDocument} ownerDocument main application document
 * @param {{faces:Array<{family:string,bytes:Uint8Array,bold:boolean,italic:boolean}>}} fontRegistry
 * @param {AbortSignal} signal
 * @returns {Promise<{print:()=>void,dispose:()=>void,pages:number}>}
 * Chromium named @page rules preserve each page's portrait/landscape size.
 * Other browsers must support the CSS page property for mixed sizes.
 */
export async function prepareNativePrint(pages,ownerDocument=document,fontRegistry={faces:[]},signal,{allowRasterFallback=false}={}){
  const checkCancel=()=>{if(signal?.aborted)throw new DOMException('인쇄 준비가 취소되었습니다.','AbortError');};
  checkCancel();
  if(!Array.isArray(pages)||pages.length===0||pages.length>MAX_PRINT_PAGES)
    throw Error('인쇄 페이지 수는 1~120쪽이어야 합니다.');
  const paper=[];
  const pagePaper=[];
  for(const page of pages){
    if(!Number.isFinite(page.width)||!Number.isFinite(page.height)||
        page.width<1||page.height<1||page.width>20000||page.height>20000)
      throw Error('인쇄 페이지 크기가 잘못되었습니다.');
    let size=paper.find(item=>Math.abs(item.width-page.width)<.25&&Math.abs(item.height-page.height)<.25);
    if(!size){
      size={width:page.width,height:page.height,name:'sunrisePage'+(paper.length+1)};
      paper.push(size);
    }
    pagePaper.push(size);
  }
  if(paper.length>1&&!allowRasterFallback)
    throw Error('혼합 용지의 글자·도형 보존 인쇄는 아직 검증되지 않았습니다. 페이지를 이미지로 자동 대체하지 않았습니다.');
  const frame=ownerDocument.createElement('iframe');
  frame.title='Sunrise PDF PRO 벡터 PDF 인쇄용 문서';
  frame.setAttribute('sandbox','allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden','true');
  frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0;pointer-events:none;';
  ownerDocument.body.append(frame);
  let disposed=false;
  const bitmapUrls=[];
  const cleanup=()=>{
    for(const url of bitmapUrls)frame.contentWindow?.URL.revokeObjectURL(url);
    bitmapUrls.length=0;
    frame.remove();
  };
  try{
    const doc=frame.contentDocument;
    if(!doc?.body)throw Error('브라우저 인쇄용 프레임을 열 수 없습니다.');
    doc.documentElement.setAttribute('lang','ko');
    doc.title='Sunrise PDF PRO';
    const style=doc.createElement('style');
    if(paper.length>1 && !frame.contentWindow.CSS?.supports?.('page','sunrisePage1'))
      throw Error('이 브라우저는 세로·가로 혼합 용지의 PDF 인쇄를 지원하지 않습니다.');
    style.textContent=paper.map(size=>
      `@page ${size.name}{size:${(size.width*PX_TO_PT).toFixed(3)}pt `+
      `${(size.height*PX_TO_PT).toFixed(3)}pt;margin:0}`+
      `.sunrise-print-page.${size.name}{page:${size.name};width:${(size.width*PX_TO_PT).toFixed(3)}pt;height:${(size.height*PX_TO_PT).toFixed(3)}pt}`).join('\n')+
      `html,body{margin:0!important;padding:0!important;background:white!important}`+
      `.sunrise-print-page{box-sizing:border-box;page-break-after:always;break-after:page}`+
      `.sunrise-print-page:last-child{page-break-after:auto;break-after:auto}`+
      `.sunrise-print-page>svg{width:100%!important;height:100%!important;display:block!important}`;
    doc.head.append(style);
    const explicit=new Set((fontRegistry.faces||[]).filter(face=>!face.isFallback).map(face=>face.family.toLocaleLowerCase()+'|'+face.bold+'|'+face.italic));
    for(const face of fontRegistry.faces||[]){
      for(const family of new Set([face.family,...(face.cssAliases||[])])){
        if(face.isFallback&&explicit.has(family.toLocaleLowerCase()+'|'+face.bold+'|'+face.italic))continue;
        checkCancel();
        const font=new frame.contentWindow.FontFace(family,face.bytes,{
          weight:face.bold?'700':'400',style:face.italic?'italic':'normal'
        });
        const loaded=await font.load();
        checkCancel();
        doc.fonts.add(loaded);
      }
    }
    await doc.fonts?.ready;
    checkCancel();
    let rasterizedPages=0;
    const changedAt=pagePaper.findIndex(size=>size!==pagePaper[0]);
    for(let index=0;index<pages.length;index++){
      const page=pages[index],size=pagePaper[index];
      checkCancel();
      const svg=requireSafeSvg(page.svg,doc);
      const container=doc.createElement('section');
      container.className='sunrise-print-page '+size.name;
      container.style.page=size.name;
      container.style.width=(size.width*PX_TO_PT).toFixed(3)+'pt';
      container.style.height=(size.height*PX_TO_PT).toFixed(3)+'pt';
      if(changedAt>=0&&index>=changedAt){
        const bitmap=await svgToSafePrintImage(
          new frame.contentWindow.XMLSerializer().serializeToString(svg),
          page.width,page.height,frame.contentWindow,signal);
        checkCancel();
        const url=frame.contentWindow.URL.createObjectURL(bitmap);
        bitmapUrls.push(url);
        const image=doc.createElement('img');
        image.src=url;
        image.alt='고해상도 도면 페이지';
        image.style.cssText='display:block;width:100%;height:100%;';
        container.append(image);
        await image.decode();
        checkCancel();
        rasterizedPages++;
      }else{
        container.append(doc.importNode(svg,true));
      }
      doc.body.append(container);
    }
    return {
      pages:pages.length,rasterizedPages,vectorPages:pages.length-rasterizedPages,
      print(){if(disposed)throw Error('인쇄용 문서가 이미 해제되었습니다.');
        frame.contentWindow?.focus();frame.contentWindow?.print();},
      dispose(){if(!disposed){disposed=true;cleanup();}}
    };
  }catch(error){cleanup();throw error;}
}
