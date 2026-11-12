import {cooperativeYield} from './cooperative-yield.mjs';
import {PDFDocument,rgb} from 'pdf-lib';
import {verifyOtherHeader,cancelled} from './input-types.js';
import {readDocumentBuffer} from './file-reader.js';
import {inspectXlsxPackage,XLSX_LIMITS} from './xlsx-package-guard.mjs';
import {loadBundledFonts} from './bundled-fonts.js';
import {installMeasureFonts} from './pdf-fonts.js';
import {rasterPage} from './converter.js';
import {assertCompletePdfBytes} from './pdf-output-integrity.mjs';
import {wrapSpreadsheetCell} from './spreadsheet-wrap.mjs';
const FONT=9,LINE=12,PAD=4,MARGIN=32,MAX_CELLS=200000,MAX_PAGES=120;
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
 if(!Array.isArray(allMerges)||allMerges.length>MAX_CELLS)
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
 if(rowsN<1||colsN<1||rowsN*colsN>MAX_CELLS)throw Error(name+': 사용 범위가 20만 셀을 초과합니다. 불필요한 빈 범위를 정리해 주세요.');
 const rows=[],cols=[];
 for(let r=range.s.r;r<=range.e.r;r++)if(!sheet['!rows']?.[r]?.hidden)rows.push(r);
 for(let c=range.s.c;c<=range.e.c;c++)if(!sheet['!cols']?.[c]?.hidden)cols.push(c);
 if(!rows.length||!cols.length)return [];
 const widths=cols.map(c=>{
  const value=sheet['!cols']?.[c]?.wch??10;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)
   throw Error(name+': 열 너비가 유효하지 않습니다.');
  return Math.max(18,Math.min(360,value*5.5+8));
 });
 const total=widths.reduce((a,b)=>a+b,0);const paper=total>531?[841.89,595.28]:[595.28,841.89];
 const scale=Math.min(1,(paper[0]-MARGIN*2)/total);
 if(scale<.65)throw Error(name+': 열이 너무 많아 글자를 읽기 어렵습니다. 필요한 열을 별도 시트로 나누어 주세요.');
 for(let c=0;c<widths.length;c++)widths[c]*=scale;
 const size=FONT*scale,lineHeight=LINE*scale;
 const heights=rows.map(r=>{
  const value=sheet['!rows']?.[r]?.hpt??20;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)
   throw Error(name+': 행 높이가 유효하지 않습니다.');
  return Math.max(20*scale,value*scale);
 });
 const covered=new Set(),merges=new Map(),mergeEnds=new Map();
 for(const merge of allMerges){
  const rr=rows.map((r,i)=>r>=merge.s.r&&r<=merge.e.r?i:-1).filter(i=>i>=0),cc=cols.map((c,i)=>c>=merge.s.c&&c<=merge.e.c?i:-1).filter(i=>i>=0);
  if(!rr.length||!cc.length)continue;
  if(rr[0]!==rows.indexOf(merge.s.r)||cc[0]!==cols.indexOf(merge.s.c))throw Error(name+': 병합 셀의 시작 위치가 숨겨져 있습니다. 숨김을 해제해 주세요.');
  const m={r:rr[0],c:cc[0],endR:rr.at(-1),endC:cc.at(-1)};mergeEnds.set(m.r,Math.max(mergeEnds.get(m.r)??m.r,m.endR));
  for(const r of rr)for(const c of cc){const key=r+':'+c;if(covered.has(key)||merges.has(key))throw Error(name+': 병합 셀이 겹칩니다.');if(r===m.r&&c===m.c)merges.set(key,m);else covered.add(key);}
 }
 const allowed=font.getCharacterSet?new Set(font.getCharacterSet()):null;
 const cells=[];let any=false;
 for(let r=0;r<rows.length;r++)for(let c=0;c<cols.length;c++){
  if(covered.has(r+':'+c))continue;
  const cell=sheet[XLSX.utils.encode_cell({r:rows[r],c:cols[c]})];
  if(cell?.f&&(cell.v===undefined||cell.v===null))throw Error(name+': 저장된 계산값이 없는 수식이 있습니다. Excel에서 계산 후 저장해 주세요.');
  const text=(cell?XLSX.utils.format_cell(cell):'').replace(/\t/g,'    ');
  if(allowed&&Array.from(text).some(c=>!/[\r\n]/.test(c)&&!allowed.has(c.codePointAt(0))))throw Error(name+': 기본 글꼴로 표시할 수 없는 문자가 있습니다.');
  if(text.length>20000)throw Error(name+': 한 셀의 내용이 너무 깁니다.');any ||= Boolean(text);
  const merge=merges.get(r+':'+c)||{r,c,endR:r,endC:c};
  const width=widths.slice(c,merge.endC+1).reduce((a,b)=>a+b,0);
  const lines=wrapCell(text,width-PAD*2*scale,font,size);
  const required=lines.length*lineHeight+PAD*2*scale;
  const current=heights.slice(r,merge.endR+1).reduce((a,b)=>a+b,0);
  if(required>current){const extra=(required-current)/(merge.endR-r+1);for(let i=r;i<=merge.endR;i++)heights[i]+=extra;}
  cells.push({...merge,lines,width});
 }
 if(!any)return [];
 const pages=[];const body=paper[1]-MARGIN*2-28;let start=0,cursor=0;
 while(cursor<rows.length){
  let end=cursor;for(let i=cursor;i<=end;i++)end=Math.max(end,mergeEnds.get(i)??i);
  const groupHeight=heights.slice(cursor,end+1).reduce((a,b)=>a+b,0);
  if(groupHeight>body)throw Error(name+': 한 행 또는 병합 영역이 한 쪽보다 큽니다. 행 내용을 나누어 주세요.');
  const used=heights.slice(start,cursor).reduce((a,b)=>a+b,0);
  if(used+groupHeight>body){pages.push({start,end:cursor-1});if(pages.length>=MAX_PAGES)throw Error(name+': 출력이 120쪽을 초과합니다.');start=cursor;}
  cursor=end+1;
 }
 pages.push({start,end:rows.length-1});
 return pages.map((p,index)=>({name,paper,size,lineHeight,index:index+1,cols:widths,rows:heights.slice(p.start,p.end+1),cells:cells.filter(c=>c.r>=p.start&&c.r<=p.end).map(c=>({...c,r:c.r-p.start,endR:c.endR-p.start}))}));
}
function geometry(page,cell){const x=MARGIN+page.cols.slice(0,cell.c).reduce((a,b)=>a+b,0),top=MARGIN+28+page.rows.slice(0,cell.r).reduce((a,b)=>a+b,0),height=page.rows.slice(cell.r,cell.endR+1).reduce((a,b)=>a+b,0);return {x,top,height};}
export async function drawSheetPages(pdf,plan,font,signal,onProgress=()=>{},family="NanumGothic",{makePreviewSvg=true}={}){
 let firstSvg;
  for(let i=0;i<plan.length;i++){
   cancelled(signal);const p=plan[i],page=pdf.addPage(p.paper),title=p.name+' · '+p.index;
   page.drawText(title,{x:MARGIN,y:p.paper[1]-MARGIN-12,size:11,font,color:rgb(.08,.2,.33)});
   const shapes=[];
   for(const cell of p.cells){const g=geometry(p,cell);page.drawRectangle({x:g.x,y:p.paper[1]-g.top-g.height,width:cell.width,height:g.height,borderColor:rgb(.72,.76,.8),borderWidth:.4});
    if(makePreviewSvg)shapes.push(`<rect x="${g.x}" y="${g.top}" width="${cell.width}" height="${g.height}" fill="white" stroke="#b8c2cc" stroke-width=".4"/>`);
    for(let n=0;n<cell.lines.length;n++){
     const text=cell.lines[n],baseline=g.top+PAD*p.size/FONT+p.size+n*p.lineHeight;
     if(text)page.drawText(text,{x:g.x+PAD*p.size/FONT,y:p.paper[1]-baseline,size:p.size,font});
     if(makePreviewSvg)shapes.push(`<text x="${g.x+PAD*p.size/FONT}" y="${baseline}" font-size="${p.size}">${escape(text)}</text>`);
    }
   }
   if(i===0&&makePreviewSvg){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${p.paper[0]}pt" height="${p.paper[1]}pt" viewBox="0 0 ${p.paper[0]} ${p.paper[1]}" font-family="${escape(family)}"><rect width="100%" height="100%" fill="white"/><text x="32" y="44" font-size="11">${escape(title)}</text>${shapes.join('')}</svg>`;firstSvg=svg;}
   onProgress({stage:'pdf',page:i+1,total:plan.length});await cooperativeYield({signal});
  }
 return firstSvg;
}
export async function convertSpreadsheet(file,onProgress,signal,kind){
 cancelled(signal);verifyOtherHeader(kind,await file.slice(0,8).arrayBuffer());
 if(kind==='xlsx'&&typeof file?.size==='number'&&file.size>XLSX_LIMITS.inputBytes)
  throw Error('XLSX_INPUT_BYTES_LIMIT');
 if(kind==='xls'&&typeof file?.size==='number'&&file.size>48*1024*1024)
  throw Error('XLS_INPUT_BYTES_LIMIT');
 const data=await readDocumentBuffer(file,signal,p=>onProgress({stage:'load',...p}));cancelled(signal);
 if(kind==='xls'&&data.byteLength>48*1024*1024)throw Error('XLS_INPUT_BYTES_LIMIT');
 if(kind==='xlsx')inspectXlsxPackage(data);cancelled(signal);
 const XLSX=await import('xlsx');const book=XLSX.read(data,{type:'array',cellStyles:true,cellNF:true,cellText:true,cellFormula:true});cancelled(signal);
 if(!book.SheetNames?.length)throw Error('통합문서에 시트가 없습니다.');
 const {default:fontkit}=await import('@pdf-lib/fontkit');
 const bundled=await loadBundledFonts(fontkit,signal),face=bundled.faces.find(f=>f.genericFamily==='sans'&&!f.bold&&!f.italic);
 if(!face)throw Error('엑셀 출력용 한글 글꼴을 불러올 수 없습니다.');
 // Full font embedding is intentional: subsetting this Nanum TTF can
 // extract correct Unicode while visibly dropping composite glyphs.
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(face.bytes,{subset:false});
 const release=await installMeasureFonts({faces:[{...face,cssAliases:[]}]},signal);
 try{
  const plan=[];let hidden=0;
  for(let index=0;index<book.SheetNames.length;index++){
   cancelled(signal);if(book.Workbook?.Sheets?.[index]?.Hidden){hidden++;continue;}
   const name=book.SheetNames[index];plan.push(...planSheet(book.Sheets[name],name,XLSX,font));
   if(plan.length>MAX_PAGES)throw Error('엑셀 출력이 120쪽을 초과합니다. 시트를 나누어 변환해 주세요.');
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
