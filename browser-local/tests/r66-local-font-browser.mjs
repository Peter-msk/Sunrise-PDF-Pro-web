/**
 * Browser integration of the on-device PC font contract. A LOCAL test font
 * simulates FontData from a permitted OS: it is not a claim that the CI
 * runner has Korean Windows fonts installed. The bytes are real OFL SFNT.
 */
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {get} from 'node:http';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const base='http://127.0.0.1:4193/';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4193','--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 let ok=false;
 for(let n=0;n<80;n++){
  if(server.exitCode!==null)throw Error('Vite exited '+server.exitCode);
  try{
   const code=await new Promise((resolve,reject)=>get(base,r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
   if(code===200){ok=true;break;}
  }catch{}
  await sleep(250);
 }
 if(!ok)throw Error('Font test Vite startup timeout');
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 await page.goto(base,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('변환 준비 완료'),null,{timeout:90000});
 await page.locator('details.options.advanced summary').click();
 const available=await page.evaluate(async()=>{
  const font=await fetch('/fonts/NanumGothic-Regular.ttf');
  if(!font.ok)throw Error('test OFL font missing');
  const payload=await font.blob();
  window.queryLocalFonts=async()=>[{family:'Nanum Gothic',fullName:'Nanum Gothic',
   postscriptName:'NanumGothic',style:'Regular',blob:async()=>payload}];
  return payload.size;
 });
 if(available<1000)throw Error('test font bytes missing');
 await page.locator('#font-check').click();
 await page.waitForFunction(()=>document.querySelector('#pc-font-status')?.textContent.includes('1개에 접근 가능합니다'),null,{timeout:20000});
 const report=await page.evaluate(async()=>{
  const {verifyBilingualLocalFontPdf}=await import('/tests/r66-local-font-browser-entry.js');
  return verifyBilingualLocalFontPdf();
 });
 if(report.signature!=='%PDF-'||report.fontUsage.local!==1||report.missing.length||report.localFaces!==1)
  throw Error('Local PDF font browser integration failed: '+JSON.stringify(report));
 console.log('LOCAL_FONT_BILINGUAL_BROWSER_AND_EMBED_PASS '+JSON.stringify(report));
 await page.close();
}finally{await browser?.close();server.kill('SIGTERM');}
