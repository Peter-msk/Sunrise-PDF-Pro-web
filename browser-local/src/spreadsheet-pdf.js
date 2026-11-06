import {PDFDocument,rgb} from 'pdf-lib';
import {verifyOtherHeader,cancelled} from './input-types.js';
import {readDocumentBuffer} from './file-reader.js';
import {loadBundledFonts} from './bundled-fonts.js';
import {installMeasureFonts} from './pdf-fonts.js';
import {rasterPage} from './converter.js';
const FONT=9,LINE=12,PAD=4,MARGIN=32,MAX_CELLS=200000,MAX_PAGES=120;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function wrapCell(text,width,font,size=FONT){
 if(width<=0)throw Error('열 너비가 너무 좁습니다.');
 const out=[];for(const paragraph of String(text).split(/\r\n|\r|\n/)){
  let line='';for(const c of paragraph){if(font.widthOfTextAtSize(c,size)>width)throw Error('열 너비가 글자보다 좁습니다. 엑셀에서 열 수를 줄여 주세요.');
   if(line&&font.widthOfTextAtSize(line+c,size)>width){out.push(line);line='';}line+=c;
  }out.push(line);
 }return out;
}
export function planSheet(sheet,name,XLSX,font){
 if(!sheet['!ref'])return [];
 const range=XLSX.utils.decode_range(sheet['!ref']);const rowsN=range.e.r-range.s.r+1,colsN=range.e.c-range.s.c+1;
 if(rowsN<1||colsN<1||rowsN*colsN>MAX_CELLS)throw Error(name+': 사용 범위가 20만 셀을 초과합니다. 불필요한 빈 범위를 정리해 주세요.');
 const rows=[],cols=[];
 for(let r=range.s.r;r<=range.e.r;r++)if(!sheet['!rows']?.[r]?.hidden)rows.push(r);
 for(let c=range.s.c;c<=range.e.c;c++)if(!sheet['!cols']?.[c]?.hidden)cols.push(c);
 if(!rows.length||!cols.length)return [];
 const widths=cols.map(c=>Math.max(18,Math.min(360,(sheet['!cols']?.[c]?.wch??10)*5.5+8)));
 const total=widths.reduce((a,b)=>a+b,0);const paper=total>531?[841.89,595.28]:[595.28,841.89];
 const scale=Math.min(1,(paper[0]-MARGIN*2)/total);
 if(scale<.65)throw Error(name+': 열이 너무 많아 글자를 읽기 어렵습니다. 필요한 열을 별도 시트로 나누어 주세요.');
 for(let c=0;c<widths.length;c++)widths[c]*=scale;
 const size=FONT*scale,lineHeight=LINE*scale;
 const heights=rows.map(r=>Math.max(20*scale,(sheet['!rows']?.[r]?.hpt??20)*scale));
 const covered=new Set(),merges=new Map(),mergeEnds=new Map();
 for(const merge of sheet['!merges']||[]){
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
export async function drawSheetPages(pdf,plan,font,signal,onProgress=()=>{},family="NanumGothic"){
 let firstSvg;
  for(let i=0;i<plan.length;i++){
   cancelled(signal);const p=plan[i],page=pdf.addPage(p.paper),title=p.name+' · '+p.index;
   page.drawText(title,{x:MARGIN,y:p.paper[1]-MARGIN-12,size:11,font,color:rgb(.08,.2,.33)});
   const shapes=[];
   for(const cell of p.cells){const g=geometry(p,cell);page.drawRectangle({x:g.x,y:p.paper[1]-g.top-g.height,width:cell.width,height:g.height,borderColor:rgb(.72,.76,.8),borderWidth:.4});
    shapes.push(`<rect x="${g.x}" y="${g.top}" width="${cell.width}" height="${g.height}" fill="white" stroke="#b8c2cc" stroke-width=".4"/>`);
    for(let n=0;n<cell.lines.length;n++){
     const text=cell.lines[n],baseline=g.top+PAD*p.size/FONT+p.size+n*p.lineHeight;
     if(text)page.drawText(text,{x:g.x+PAD*p.size/FONT,y:p.paper[1]-baseline,size:p.size,font});
     shapes.push(`<text x="${g.x+PAD*p.size/FONT}" y="${baseline}" font-size="${p.size}">${escape(text)}</text>`);
    }
   }
   if(i===0){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${p.paper[0]}pt" height="${p.paper[1]}pt" viewBox="0 0 ${p.paper[0]} ${p.paper[1]}" font-family="${escape(family)}"><rect width="100%" height="100%" fill="white"/><text x="32" y="44" font-size="11">${escape(title)}</text>${shapes.join('')}</svg>`;firstSvg=svg;}
   onProgress({stage:'pdf',page:i+1,total:plan.length});await new Promise(resolve=>setTimeout(resolve,0));
  }
 return firstSvg;
}
export async function convertSpreadsheet(file,onProgress,signal,kind){
 cancelled(signal);verifyOtherHeader(kind,await file.slice(0,8).arrayBuffer());
 const data=await readDocumentBuffer(file,signal,p=>onProgress({stage:'load',...p}));cancelled(signal);
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
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!plan.length)throw Error('출력할 셀 내용이 없습니다. 숨김 시트와 빈 시트는 제외합니다.');
  const svg=await drawSheetPages(pdf,plan,font,signal,onProgress,face.family);
  const preview=(await rasterPage(svg,signal)).blob;
  const bytes=await pdf.save();cancelled(signal);
  return {pdf:new Blob([bytes],{type:'application/pdf'}),preview,pages:plan.length,bytes:bytes.length,renderMode:'spreadsheet-text',vectorPages:plan.length,rasterPages:0,substituteFamilies:[face.family],warnings:['셀 내용·표 중심 출력입니다. 원본 차트·그림·서식·인쇄 영역은 재현하지 않습니다. 수식은 저장된 계산값을 사용합니다.'+(hidden?' 숨김 시트 '+hidden+'개 제외.':'')]};
 }finally{release();}
}
