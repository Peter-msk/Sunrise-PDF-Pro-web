import {cooperativeYield} from './cooperative-yield.mjs';
import {PDFDocument,rgb} from 'pdf-lib';
import {verifyOtherHeader,cancelled} from './input-types.js';
import {readDocumentBuffer} from './file-reader.js';
import {inspectXlsxPackage} from './xlsx-package-guard.mjs';
import {loadBundledFonts} from './bundled-fonts.js';
import {installMeasureFonts} from './pdf-fonts.js';
import {rasterPage} from './converter.js';
import {assertCompletePdfBytes} from './pdf-output-integrity.mjs';
import {wrapSpreadsheetCell} from './spreadsheet-wrap.mjs';
const FONT=9,LINE=12,PAD=4,MARGIN=32;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function wrapCell(text,width,font,size=FONT){
 return wrapSpreadsheetCell(text,width,font,size);
}
export function planSheet(sheet,name,XLSX,font){
 if(!sheet['!ref'])return [];
 const range=XLSX.utils.decode_range(sheet['!ref']);
 // A merge may legitimately extend past !ref when its extra cells are blank.
 // Expand the printable range instead of silently truncating its geometry.
 const bounds=[range?.s?.r,range?.s?.c,range?.e?.r,range?.e?.c];
 if(bounds.some(n=>!Number.isSafeInteger(n)||n<0)||
    range.s.r>range.e.r||range.s.c>range.e.c||
    range.e.r>1048575||range.e.c>16383)
  throw Error(name+': 시트 셀 범위가 유효하지 않습니다.');
 const allMerges=sheet['!merges']||[];
 if(!Array.isArray(allMerges))
  throw Error(name+': 병합 셀 범위가 유효하지 않습니다.');
 for(const merge of allMerges){
  const pos=[merge?.s?.r,merge?.s?.c,merge?.e?.r,merge?.e?.c];
  if(pos.some(n=>!Number.isSafeInteger(n)||n<0)||
     merge.s.r>merge.e.r||merge.s.c>merge.e.c||
     merge.e.r>1048575||merge.e.c>16383)
   throw Error(name+': 병합 셀 범위가 유효하지 않습니다.');
  range.s.r=Math.min(range.s.r,merge.s.r);range.s.c=Math.min(range.s.c,merge.s.c);
  range.e.r=Math.max(range.e.r,merge.e.r);range.e.c=Math.max(range.e.c,merge.e.c);
 }
 const rowsN=range.e.r-range.s.r+1,colsN=range.e.c-range.s.c+1;
 if(rowsN<1||colsN<1)throw Error(name+': 시트 사용 범위가 유효하지 않습니다.');
 const cols=[];
 for(let c=range.s.c;c<=range.e.c;c++)if(!sheet['!cols']?.[c]?.hidden)cols.push(c);
 if(!cols.length)return [];
 // Reject unprintable overly-wide sheets before enumerating millions of rows.
 const widths=cols.map(c=>{
  const value=sheet['!cols']?.[c]?.wch??10;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)
   throw Error(name+': 열 너비가 유효하지 않습니다.');
  return Math.max(18,value*5.5+8);
 });
 const total=widths.reduce((a,b)=>a+b,0);const paper=total>531?[Math.max(841.89,total+MARGIN*2),595.28]:[595.28,841.89];
 const scale=1;
 for(let c=0;c<widths.length;c++)widths[c]*=scale;
 const widthPrefix=[0];for(const w of widths)widthPrefix.push(widthPrefix.at(-1)+w);
 const rows=[];for(let r=range.s.r;r<=range.e.r;r++)if(!sheet['!rows']?.[r]?.hidden)rows.push(r);
 if(!rows.length)return [];
 const size=FONT*scale,lineHeight=LINE*scale;
 const heights=rows.map(r=>{
  const value=sheet['!rows']?.[r]?.hpt??20;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)
   throw Error(name+': 행 높이가 유효하지 않습니다.');
  return Math.max(20*scale,value*scale);
 });
 // A merge lookup must not scan every row and column for each merged cell.
 const lowerBound=(array,value)=>{let lo=0,hi=array.length;while(lo<hi){const mid=(lo+hi)>>>1;if(array[mid]<value)lo=mid+1;else hi=mid;}return lo;};
 const upperBound=(array,value)=>{let lo=0,hi=array.length;while(lo<hi){const mid=(lo+hi)>>>1;if(array[mid]<=value)lo=mid+1;else hi=mid;}return lo;};
 const covered=new Set(),merges=new Map(),mergeEnds=new Map();
 const printableBody=paper[1]-MARGIN*2-28;
 for(const merge of allMerges){
  const r0=lowerBound(rows,merge.s.r),r1=upperBound(rows,merge.e.r)-1;
  const c0=lowerBound(cols,merge.s.c),c1=upperBound(cols,merge.e.c)-1;
  if(r0>r1||c0>c1)continue;
  if(rows[r0]!==merge.s.r||cols[c0]!==merge.s.c)
   throw Error(name+': 병합 셀의 시작 위치가 숨겨져 있습니다. 숨김을 해제해 주세요.');
  // An indivisible merged region taller than one paper cannot be output.
  // Reject before allocating every covered-cell key for a pathological merge.
  const m={r:r0,c:c0,endR:r1,endC:c1};mergeEnds.set(m.r,Math.max(mergeEnds.get(m.r)??m.r,m.endR));
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const key=r+':'+c;if(covered.has(key)||merges.has(key))throw Error(name+': 병합 셀이 겹칩니다.');if(r===m.r&&c===m.c)merges.set(key,m);else covered.add(key);}
 }
 const allowed=font.getCharacterSet?new Set(font.getCharacterSet()):null;
 const cells=[];let any=false;
 for(let r=0;r<rows.length;r++)for(let c=0;c<cols.length;c++){
  if(covered.has(r+':'+c))continue;
  const cell=sheet[XLSX.utils.encode_cell({r:rows[r],c:cols[c]})];
  if(cell?.f&&(cell.v===undefined||cell.v===null))throw Error(name+': 저장된 계산값이 없는 수식이 있습니다. Excel에서 계산 후 저장해 주세요.');
  const text=(cell?XLSX.utils.format_cell(cell):'').replace(/\t/g,'    ');
  if(allowed&&Array.from(text).some(c=>!/[\r\n]/.test(c)&&!allowed.has(c.codePointAt(0))))throw Error(name+': 기본 글꼴로 표시할 수 없는 문자가 있습니다.');
  any ||= Boolean(text);
  const merge=merges.get(r+':'+c)||{r,c,endR:r,endC:c};
  const width=widthPrefix[merge.endC+1]-widthPrefix[c];
  const lines=wrapCell(text,width-PAD*2*scale,font,size);
  const required=lines.length*lineHeight+PAD*2*scale;
  let current=0;for(let i=r;i<=merge.endR;i++)current+=heights[i];
  if(required>current){const extra=(required-current)/(merge.endR-r+1);for(let i=r;i<=merge.endR;i++)heights[i]+=extra;}
  cells.push({...merge,lines,width});
 }
 if(!any)return [];
 const pages=[];const body=printableBody;let start=0,cursor=0,used=0;
 while(cursor<rows.length){
  let end=cursor;for(let i=cursor;i<=end;i++)end=Math.max(end,mergeEnds.get(i)??i);
  let groupHeight=0;for(let i=cursor;i<=end;i++)groupHeight+=heights[i];
  if(groupHeight>body){
   if(cursor>start)pages.push({start,end:cursor-1});
   pages.push({start:cursor,end});start=cursor=end+1;used=0;continue;
  }
  if(used+groupHeight>body){pages.push({start,end:cursor-1});start=cursor;used=0;}
  used+=groupHeight;cursor=end+1;
 }
 if(start<rows.length)pages.push({start,end:rows.length-1});
 const assigned=pages.map(()=>[]);
 // A cell belongs to exactly one page: distribute once instead of filtering
 // every cell for every page (quadratic for long worksheets).
 let pageIndex=0;
 for(const cell of cells){
  while(pageIndex<pages.length-1&&cell.r>pages[pageIndex].end)pageIndex++;
  const start=pages[pageIndex].start;
  if(cell.r<start||cell.endR>pages[pageIndex].end)throw Error(name+': 병합 셀이 페이지 경계를 넘었습니다.');
  // Transfer ownership, rather than allocating a duplicate object for every cell.
  cell.r-=start;cell.endR-=start;assigned[pageIndex].push(cell);
 }
 return pages.map((p,index)=>{const rowHeights=heights.slice(p.start,p.end+1);const logicalPaper=[paper[0],Math.max(paper[1],rowHeights.reduce((n,h)=>n+h,0)+MARGIN*2+28)];return {name,paper:logicalPaper,size,lineHeight,index:index+1,cols:widths,rows:rowHeights,cells:assigned[index]};});
}
function geometry(cell,columnPrefix,rowPrefix){
 const x=MARGIN+columnPrefix[cell.c],top=MARGIN+28+rowPrefix[cell.r];
 return {x,top,height:rowPrefix[cell.endR+1]-rowPrefix[cell.r]};
}
export async function drawSheetPages(pdf,plan,font,signal,onProgress=()=>{},family="NanumGothic",{makePreviewSvg=true}={}){
 let firstSvg,previousCols=null,columnPrefix=null;
  for(let i=0;i<plan.length;i++){
   cancelled(signal);const p=plan[i],factor=Math.min(1,14400/Math.max(...p.paper)),page=pdf.addPage(p.paper.map(n=>n*factor)),title=p.name+' · '+p.index;
   page.drawText(title,{x:MARGIN*factor,y:(p.paper[1]-MARGIN-12)*factor,size:11*factor,font,color:rgb(.08,.2,.33)});
   const shapes=makePreviewSvg&&i===0?[]:null;
   if(p.cols!==previousCols){columnPrefix=[0];for(const width of p.cols)columnPrefix.push(columnPrefix.at(-1)+width);previousCols=p.cols;}
   const rowPrefix=[0];for(const height of p.rows)rowPrefix.push(rowPrefix.at(-1)+height);
   for(const cell of p.cells){const g=geometry(cell,columnPrefix,rowPrefix);page.drawRectangle({x:g.x*factor,y:(p.paper[1]-g.top-g.height)*factor,width:cell.width*factor,height:g.height*factor,borderColor:rgb(.72,.76,.8),borderWidth:.4*factor});
    if(shapes)shapes.push(`<rect x="${g.x}" y="${g.top}" width="${cell.width}" height="${g.height}" fill="white" stroke="#b8c2cc" stroke-width=".4"/>`);
    for(let n=0;n<cell.lines.length;n++){
     const text=cell.lines[n],baseline=g.top+PAD*p.size/FONT+p.size+n*p.lineHeight;
     if(text)page.drawText(text,{x:(g.x+PAD*p.size/FONT)*factor,y:(p.paper[1]-baseline)*factor,size:p.size*factor,font});
     if(shapes)shapes.push(`<text x="${g.x+PAD*p.size/FONT}" y="${baseline}" font-size="${p.size}">${escape(text)}</text>`);
    }
   }
   if(shapes){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${p.paper[0]}pt" height="${p.paper[1]}pt" viewBox="0 0 ${p.paper[0]} ${p.paper[1]}" font-family="${escape(family)}"><rect width="100%" height="100%" fill="white"/><text x="32" y="44" font-size="11">${escape(title)}</text>${shapes.join('')}</svg>`;firstSvg=svg;}
   onProgress({stage:'pdf',page:i+1,total:plan.length});await cooperativeYield({signal});
  }
 return firstSvg;
}
export async function convertSpreadsheet(file,onProgress,signal,kind){
 cancelled(signal);verifyOtherHeader(kind,await file.slice(0,8).arrayBuffer());

 const data=await readDocumentBuffer(file,signal,p=>onProgress({stage:'load',...p}));cancelled(signal);

 if(kind==='xlsx'){
  onProgress({stage:'load',detail:'xlsx_package',loaded:data.byteLength,total:data.byteLength});
  inspectXlsxPackage(data);
 }
 cancelled(signal);
 let XLSX;
 try{XLSX=await import('xlsx');}
 catch(error){
  if(error?.name==='AbortError'||signal?.aborted)throw error;
  throw Error('XLSX_ENGINE_UNAVAILABLE: 브라우저의 스프레드시트 처리 모듈을 불러오지 못했습니다. 페이지를 새로고침하고 다시 시도하세요.');
 }
 cancelled(signal);
 if(kind==='xlsx')onProgress({stage:'load',detail:'xlsx_parse',loaded:data.byteLength,total:data.byteLength});
 let book;
 try{book=XLSX.read(data,{type:'array',cellStyles:true,cellNF:true,cellText:true,cellFormula:true});}
 catch(error){
  if(error?.name==='AbortError'||signal?.aborted)throw error;
  throw Error('XLSX_PARSE_FAILED: 통합문서 구조를 해석하지 못했습니다. 파일 암호화·손상 여부를 확인하고 Excel에서 일반 XLSX로 다시 저장한 후 재시도하세요.');
 }
 cancelled(signal);
 if(!book.SheetNames?.length)throw Error('통합문서에 시트가 없습니다.');
 const {default:fontkit}=await import('@pdf-lib/fontkit');
 const bundled=await loadBundledFonts(fontkit,signal),face=bundled.faces.find(f=>f.genericFamily==='sans'&&!f.bold&&!f.italic);
 if(!face)throw Error('엑셀 출력용 한글 글꼴을 불러올 수 없습니다.');
 // Full font embedding is intentional: subsetting this Nanum TTF can
 // extract correct Unicode while visibly dropping composite glyphs.
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(face.bytes,{subset:false});
 const release=await installMeasureFonts({faces:[{...face,cssAliases:[]}]},signal);
 try{
  if(kind==='xlsx')onProgress({stage:'load',detail:'xlsx_layout',loaded:data.byteLength,total:data.byteLength});
  const plan=[];let hidden=0;
  for(let index=0;index<book.SheetNames.length;index++){
   cancelled(signal);if(book.Workbook?.Sheets?.[index]?.Hidden){hidden++;continue;}
   const name=book.SheetNames[index];// Avoid the JS argument-count limit on very long workbooks.
   for(const page of planSheet(book.Sheets[name],name,XLSX,font))plan.push(page);
   delete book.Sheets[name];
   
   await cooperativeYield({signal});
  }
  if(!plan.length)throw Error('출력할 셀 내용이 없습니다. 숨김 시트와 빈 시트는 제외합니다.');
  await drawSheetPages(pdf,plan,font,signal,onProgress,face.family,{makePreviewSvg:false});
  // The viewer opens the completed PDF using PDF.js. Do not convert the
  // first sheet SVG to a redundant PNG; that extra async decode/encode could
  // stall the download even though a searchable vector PDF is already ready.
  const bytes=assertCompletePdfBytes(await pdf.save());cancelled(signal);
  return {pdf:new Blob([bytes],{type:'application/pdf'}),preview:null,pages:plan.length,bytes:bytes.length,renderMode:'spreadsheet-text',vectorPages:plan.length,rasterPages:0,substituteFamilies:[face.family],warnings:['셀 내용·표 중심 출력입니다. 원본 차트·그림·서식·인쇄 영역은 재현하지 않습니다. 수식은 저장된 계산값을 사용합니다.'+(hidden?' 숨김 시트 '+hidden+'개 제외.':'')]};
 }finally{release();}
}
