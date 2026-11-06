import {chromium} from 'playwright';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';import assert from 'node:assert/strict';import {unzipSync} from 'fflate';import {createHash} from 'node:crypto';
import '../scripts/create-format-fixtures.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/r41-browser');mkdirSync(out,{recursive:true});
const site=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:8787/local/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});const errors=[],uploads=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))uploads.push(r.url());if(!r.url().startsWith(new URL(site).origin+'/')&&!/^(blob:|data:)/.test(r.url()))external.push(r.url());});
 await page.goto(site,{waitUntil:'networkidle',timeout:60000});
 const files=['table.xls','table.xlsx','orientation.jpg','alpha-test.png'];
 await page.locator('#source').setInputFiles(files.map(f=>resolve(root,'artifacts/multi-format',f)));
 await page.locator('#convert').click();
 await page.waitForFunction(()=>document.querySelector('#done-count')?.textContent==='4'||(!document.querySelector('#source').disabled&&document.querySelector('#failed-count').textContent!=='0'),null,{timeout:180000});
 assert.equal(await page.locator('#done-count').textContent(),'4',await page.locator('#status').innerText());assert.equal(await page.locator('#failed-count').textContent(),'0');
 const results=[];
 for(let i=0;i<files.length;i++){
  const pending=page.waitForEvent('download',{timeout:30000});await page.locator('#file-list .file-row').nth(i).getByRole('link',{name:'다운로드',exact:true}).click();const dl=await pending;
  const name=['xls.pdf','xlsx.pdf','jpg.pdf','png.pdf'][i];await dl.saveAs(resolve(out,name));results.push({source:files[i],output:name,hash:createHash('sha256').update(readFileSync(resolve(out,name))).digest('hex')});
 }
 await page.locator('#download-all').waitFor({state:'visible',timeout:30000});const pending=page.waitForEvent('download',{timeout:30000});await page.locator('#download-all').click();await(await pending).saveAs(resolve(out,'batch.zip'));
 const archive=unzipSync(new Uint8Array(readFileSync(resolve(out,'batch.zip'))));assert.equal(Object.keys(archive).length,4);
 const hashes=Object.values(archive).map(bytes=>createHash('sha256').update(bytes).digest('hex')).sort();assert.deepEqual(hashes,results.map(r=>r.hash).sort());
 assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);assert.deepEqual(external,[]);
 await page.locator('#file-list .file-row').nth(0).getByRole('button',{name:'미리보기',exact:true}).click();assert.match(await page.locator('#pages').textContent(),/3쪽/);
 await page.screenshot({path:resolve(out,'result.png'),fullPage:true});writeFileSync(resolve(out,'BROWSER_RESULT.json'),JSON.stringify({status:'PASS',results,zipMatches:true,documentUpload:false},null,2));
}finally{await browser.close();}
