/** Local-only post-generation PDF font-resource audit.
 * This is an opt-in inspection of already-produced PDF bytes. It never sends
 * font names, source filenames, document text or bytes to a server.
 * A page's Font resource and embedded program are NOT, by themselves,
 * proof that every requested source glyph was painted with that face.
 */
export async function inspectPdfFontEmbedding(pdfBlob,{
 maxBytes=48*1024*1024,loadLibrary=()=>import('pdf-lib'),signal
}={}){
 if(signal?.aborted)throw new DOMException('글꼴 검사가 취소되었습니다.','AbortError');
 if(!(pdfBlob instanceof Blob)||pdfBlob.type!=='application/pdf')
  throw Error('PDF_FONT_AUDIT_INPUT_INVALID');
 if(pdfBlob.size>maxBytes)throw Error('PDF_FONT_AUDIT_TOO_LARGE');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>512*1024*1024)
  throw Error('PDF_FONT_AUDIT_LIMIT_INVALID');
 const {PDFDocument,PDFDict,PDFArray,PDFName}=await loadLibrary();
 const name=s=>PDFName.of(s);
 const bytes=new Uint8Array(await pdfBlob.arrayBuffer());
 if(signal?.aborted)throw new DOMException('글꼴 검사가 취소되었습니다.','AbortError');
 const doc=await PDFDocument.load(bytes,{updateMetadata:false});
 if(signal?.aborted)throw new DOMException('글꼴 검사가 취소되었습니다.','AbortError');
 const result=new Map(),pages=doc.getPages();
 const get=(dict,key)=>dict instanceof PDFDict?dict.get(name(key)):undefined;
 const lookupDict=value=>{
  if(!value)return null;
  try{return doc.context.lookup(value,PDFDict);}
  catch{return null;}
 };
 const lookupArray=value=>{
  if(!value)return null;
  try{return doc.context.lookup(value,PDFArray);}
  catch{return null;}
 };
 const pdfName=value=>{
  if(!value)return '';
  try{return typeof value.decodeText==='function'?value.decodeText():
   String(value).replace(/^\//,'');}
  catch{return '';}
 };
 for(let i=0;i<pages.length;i++){
  if(signal?.aborted)throw new DOMException('글꼴 검사가 취소되었습니다.','AbortError');
  const resources=pages[i].node.Resources();
  const entries=lookupDict(get(resources,'Font'));
  if(!entries)continue;
  const items=entries.entries();
  if(items.length>256)throw Error('PDF_FONT_AUDIT_RESOURCES_LIMIT');
  for(const [resourceKey,fontRef] of items){
   const font=lookupDict(fontRef);
   if(!font)continue;
   const baseName=pdfName(get(font,'BaseFont'));
   const subtype=pdfName(get(font,'Subtype'));
   let descriptor=lookupDict(get(font,'FontDescriptor'));
   if(subtype==='Type0'){
    const descendants=lookupArray(get(font,'DescendantFonts'));
    descriptor=lookupDict(get(lookupDict(descendants?.get(0)),'FontDescriptor'))||descriptor;
   }
   const embedded=!!descriptor&&['FontFile','FontFile2','FontFile3']
    .some(key=>!!get(descriptor,key));
   const key=baseName+'|'+subtype+'|'+(embedded?'embedded':'not-embedded');
   if(!result.has(key))result.set(key,{
    baseName,subtype,embedded,pages:[],resources:[]
   });
   const entry=result.get(key);
   if(!entry.pages.includes(i+1))entry.pages.push(i+1);
   const id=pdfName(resourceKey);
   if(entry.resources.length<12&&!entry.resources.includes(id))entry.resources.push(id);
  }
 }
 return {pageCount:pages.length,fonts:[...result.values()].slice(0,256),
  note:'페이지 Font 리소스와 FontDescriptor 포함 여부를 검증했습니다. 실제 모든 글자의 서체·줄바꿈 동일성을 증명하지는 않습니다.'};
}

export function compareSelectedAndEmbedded(selected=[],fontAudit){
 const normalize=x=>String(x||'').normalize('NFKC')
  .replace(/^[A-Z]{6}\+/,'').replace(/[^a-zA-Z0-9가-힣]/g,'').toLowerCase();
 return selected.map(face=>{
  const candidates=[face.postscriptName,face.family].filter(Boolean).map(normalize);
  const entries=(fontAudit?.fonts||[]).filter(f=>{
   const base=normalize(f.baseName);
   return !!base&&candidates.some(x=>x&&(x===base||base.endsWith(x)));
  });
  return {family:face.family||'',postscriptName:face.postscriptName||'',
   pdfResourcePresent:entries.length>0,
   embedded:entries.some(x=>x.embedded),
   pages:[...new Set(entries.flatMap(x=>x.pages))].sort((a,b)=>a-b)};
 });
}
