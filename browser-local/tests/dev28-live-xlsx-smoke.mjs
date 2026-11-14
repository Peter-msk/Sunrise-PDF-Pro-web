/** DEV28: synthetic XLSX only, no user documents uploaded or logged.
 * Run against production URL to verify dynamic XLSX chunk, ZIP preflight,
 * in-browser SheetJS parse, font embedding and PDF download.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import * as XLSX from 'xlsx';
import {PDFDocument} from 'pdf-lib';
const site=process.env.SUNRISE_XLSX_URL||'https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/';
const b=XLSX.utils.book_new();
const ws=XLSX.utils.aoa_to_sheet([
 ['구분','수량','설명'],
 ['검증 문서',12,'XLSX 생성 및 PDF 변환 시험'],
 ['한글과 영문',34,'ABC'],
 ['합계',46,'완료']
]);
ws['!cols']=[{wch:18},{wch:10},{wch:29}];
XLSX.utils.book_append_sheet(b,ws,'검증 시트');
const bytes=Buffer.from(XLSX.write(b,{type:'buffer',bookType:'xlsx',compression:true}));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message).slice(0,150)));
 await page.goto(site,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('변환 준비 완료'),null,{timeout:90000});
 await page.locator('#source').setInputFiles({name:'dev28-public-synthetic.xlsx',
   mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
 await page.locator('#convert').click();
 await page.waitForFunction(()=>document.querySelector('#cancel')?.disabled &&
  (document.querySelector('#done-count')?.textContent==='1'||document.querySelector('#failed-count')?.textContent==='1'),
  null,{timeout:120000});
 const done=(await page.locator('#done-count').innerText())==='1';
 const status=(await page.locator('#file-list').innerText()).slice(0,520);
 if(!done)throw Error('SYNTHETIC_XLSX_CONVERSION_FAILED: '+status);
 const dlNext=page.waitForEvent('download',{timeout:25000});
 await page.locator('#file-list a.download').click();
 const dl=await dlNext;
 const parts=[];for await(const p of await dl.createReadStream())parts.push(p);
 const pdfBytes=Buffer.concat(parts);
 assert.equal(pdfBytes.subarray(0,5).toString('ascii'),'%PDF-');
 const pdf=await PDFDocument.load(pdfBytes);
 assert.ok(pdf.getPageCount()>=1);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'PASS',format:'xlsx',inputBytes:bytes.length,outputBytes:pdfBytes.length,pages:pdf.getPageCount(),server:new URL(site).origin}));
}catch(e){console.error('DEV28_XLSX_SMOKE_FAILED',String(e).slice(0,900));process.exitCode=1;}
finally{await browser.close();}
