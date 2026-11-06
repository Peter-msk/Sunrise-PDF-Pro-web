/**
 * On-device E2E only: real user-selected HWP/HWPX -> generated PDF.
 * No GitHub/Cloudflare, no upload, no CI. Requires installed local dependencies.
 * Usage: npm run test:hwp -- "C:\\path\\document.hwp" ["C:\\path\\pc-reference.pdf"]
 * For unusual environments set SUNRISE_TEST_BROWSER_CHANNEL=chromium|msedge.
 */
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,basename,extname,join} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';

const root=resolve(import.meta.dirname,'..');
const [documentArg,referenceArg]=process.argv.slice(2);
if(!documentArg||!/^\.hwp(x)?$/i.test(extname(documentArg))){
 console.error('사용법: npm run test:hwp -- "문서.hwp 또는 문서.hwpx" ["PC기준.pdf"]');
 process.exit(2);
}
const input=resolve(documentArg);
if(!existsSync(input)||!(!referenceArg||existsSync(resolve(referenceArg)))){
 console.error('입력 원본 또는 PC 기준 PDF를 찾을 수 없습니다.');
 process.exit(2);
}
const evidence=join(root,'local-evidence');
mkdirSync(evidence,{recursive:true});
const basenameSafe=basename(input).replace(/\.hwpx?$/i,'').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,60);
const output=join(evidence,basenameSafe+'-local-converted.pdf');
const reportPath=join(evidence,basenameSafe+'-local-e2e.json');
const base='http://127.0.0.1:4187/';
let server,browser,context;
const report={kind:'REAL_HWP_TO_PDF_LOCAL_E2E',sourceFile:basename(input),
   referenceFile:referenceArg?basename(referenceArg):null,
   status:'FAIL',networkPolicy:'localhost-only',producedPdf:null};
async function waitUntilReady(){
 for(let i=0;i<150;i++){
  if(server.exitCode!==null)throw Error('로컬 개발 서버가 시작 중 종료됐습니다.');
  try{const r=await fetch(base,{signal:AbortSignal.timeout(1000)});if(r.ok)return;}
  catch{/* retry only until timeout */}
  await sleep(200);
 }
 throw Error('로컬 개발 서버 시작 제한시간 초과');
}
function pageSummary(pdf){
 return pdf.getPages().map(page=>{
  const {width,height}=page.getSize();
  return {widthPt:Math.round(width*100)/100,heightPt:Math.round(height*100)/100};
 });
}
try{
 server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port','4187','--strictPort'],
  {cwd:root,stdio:['ignore','pipe','pipe']});
 let serverErrors='';
 server.stderr.on('data',chunk=>{serverErrors+=String(chunk).slice(0,1000);});
 await waitUntilReady();
 const preferred=process.env.SUNRISE_TEST_BROWSER_CHANNEL||
  (process.platform==='win32'?'msedge':undefined);
 try{browser=await chromium.launch({channel:preferred,headless:true});}
 catch(error){
  if(preferred==='msedge')browser=await chromium.launch({headless:true});
  else throw error;
 }
 context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const blocked=[];
 await page.route('**/*',route=>{
  const uri=route.request().url();
  const parsed=new URL(uri);
  if(parsed.hostname==='127.0.0.1'&&parsed.port==='4187')return route.continue();
  if(parsed.protocol==='blob:'||parsed.protocol==='data:')return route.continue();
  blocked.push(parsed.origin);
  return route.abort('blockedbyclient');
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>/변환 준비 완료|변환 기능 초기화 실패/.test(document.querySelector('#status')?.textContent||''),
   null,{timeout:120000});
 const initStatus=await page.locator('#status').innerText();
 if(!initStatus.includes('변환 준비 완료'))throw Error('rhwp WASM 부팅 실패: '+initStatus);
 await page.locator('#source').setInputFiles(input);
 if(await page.locator('#pdf-engine').inputValue()!=='professional')throw Error('기본 출력이 글자·도형 보존이 아닙니다.');
 await page.locator('#convert').click();
 await page.waitForFunction(()=>{
  const s=document.querySelector('#status')?.textContent||'';
  return document.querySelector('#done-count')?.textContent==='1' || document.querySelector('#failed-count')?.textContent==='1';
 },null,{timeout:300000});
 const status=await page.locator('#status').innerText();
 const link=page.locator('#file-list a.download');
 if(await link.count()!==1)throw Error('PDF 다운로드가 준비되지 않았습니다: '+status);
 const downloadPending=page.waitForEvent('download',{timeout:30000});
 await link.click();
 const download=await downloadPending;
 await download.saveAs(output);
 const data=readFileSync(output);
 if(data.subarray(0,5).toString()!=='%PDF-')throw Error('생성된 파일이 PDF가 아닙니다.');
 const pdf=await PDFDocument.load(data);
 const sizes=pageSummary(pdf);
 report.producedPdf=basename(output);
 report.pdfBytes=data.length;
 report.pages=sizes.length;
 report.pageSizesPt=sizes;
 report.actualConversionStatus=status;
 if(referenceArg){
  const reference=await PDFDocument.load(readFileSync(resolve(referenceArg)));
  const referencePages=pageSummary(reference);
  report.referencePages=referencePages.length;
  report.pageCountMatch=referencePages.length===sizes.length;
  report.paperSizeMatch=report.pageCountMatch&&referencePages.every((p,i)=>
   Math.abs(p.widthPt-sizes[i].widthPt)<1.0&&
   Math.abs(p.heightPt-sizes[i].heightPt)<1.0);
  if(!report.pageCountMatch||!report.paperSizeMatch)
    throw Error('PC 기준 PDF와 페이지 수 또는 용지 크기 불일치');
 }
 if(blocked.length)throw Error('외부 요청 발생(차단): '+[...new Set(blocked)].join(', '));
 report.status='PASS';
}catch(error){
 report.error=String(error?.message||error).slice(0,600);
}finally{
 try{await context?.close();}catch{}
 try{await browser?.close();}catch{}
 try{server?.kill();}catch{}
 writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(report.status!=='PASS')process.exitCode=1;
}
