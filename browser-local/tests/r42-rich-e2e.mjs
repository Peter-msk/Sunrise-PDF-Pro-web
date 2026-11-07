// Run in GitHub Actions against the built Worker, not a separate converter.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fixtures} from './r42-fixtures.mjs';
const root=resolve(import.meta.dirname,'../..'),input=resolve(root,'artifacts/r42-fixtures'),output=resolve(root,'artifacts/r42-browser');
mkdirSync(input,{recursive:true});mkdirSync(output,{recursive:true});
for(const [name,corpus,sha] of fixtures){
 const url='https://raw.githubusercontent.com/edwardkim/rhwp/v0.8.7/fuzz/corpus/'+corpus+'/'+name;
 const response=await fetch(url);assert.ok(response.ok,url);
 const data=new Uint8Array(await response.arrayBuffer());assert.equal(createHash('sha256').update(data).digest('hex'),sha,name+' changed');
 writeFileSync(resolve(input,name),data);
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const site=process.env.SUNRISE_TEST_URL||'http://127.0.0.1:8787/local/';
try{
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1365,height:1000}}),errors=[],uploads=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))uploads.push(r.url());if(!r.url().startsWith(new URL(site).origin+'/')&&!/^(blob:|data:)/.test(r.url()))external.push(r.url());});
 await page.goto(site,{waitUntil:'networkidle',timeout:60000});
 await page.locator('#source').setInputFiles(fixtures.map(([name])=>resolve(input,name)));await page.locator('#convert').click();
 await page.waitForFunction(()=>!document.querySelector('#source').disabled,null,{timeout:180000});
 assert.equal(await page.locator('#done-count').textContent(),'6',await page.locator('#file-list').textContent());assert.equal(await page.locator('#failed-count').textContent(),'0');
 for(let i=0;i<fixtures.length;i++){
  const row=page.locator('#file-list .file-row').nth(i),pending=page.waitForEvent('download');
  await row.getByRole('link',{name:'다운로드',exact:true}).click();await(await pending).saveAs(resolve(output,fixtures[i][0]+'.pdf'));
 }
 // Open the actual generated multipage PDF, then rapidly navigate/zoom and
 // select another file while rendering. A stale paint must not win this race.
 await page.locator('#file-list .file-row').nth(4).getByRole('button',{name:'PDF 검토',exact:true}).click();
 await page.locator('#pdf-canvas[aria-label="생성된 PDF 1 / 5쪽"]').waitFor({state:'visible'});
 for(let i=0;i<4;i++)await page.locator('#page-next').click();
 await page.locator('#preview-zoom').selectOption('2');await page.locator('#preview-zoom').selectOption('1.5');await page.locator('#preview-zoom').selectOption('1');
 await page.locator('#pdf-canvas[aria-label="생성된 PDF 5 / 5쪽"]').waitFor({state:'visible'});
 assert.equal(await page.locator('#page-next').isEnabled(),false);
 await page.locator('#file-list .file-row').nth(5).getByRole('button',{name:'PDF 검토',exact:true}).click();
 await page.locator('#pdf-canvas[aria-label="생성된 PDF 1 / 3쪽"]').waitFor({state:'visible'});
 assert.equal(await page.locator('#preview').getAttribute('aria-busy'),null);
 assert.doesNotMatch(await page.locator('#preview').innerText(),/실패/);
 await page.screenshot({path:resolve(output,'desktop.png'),fullPage:true});
 // Resize the same working batch, preserving results and downloads.
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile page overflows horizontally');
 assert.equal(await page.locator('#done-count').textContent(),'6');
 await page.screenshot({path:resolve(output,'mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);assert.deepEqual(external,[]);
 writeFileSync(resolve(output,'BROWSER_RESULT.json'),JSON.stringify({status:'PASS',successfulExports:6,fixtures:fixtures.map(([name,,sha256])=>({name,sha256})),actualPdfNavigation:true,rapidPaintRace:true,mobileWidth:390,documentUpload:false,hancomReferenceEquivalence:'NOT_VERIFIED'},null,2));
}finally{await browser.close();}
