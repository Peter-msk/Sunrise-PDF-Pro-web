import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {get} from 'node:http';
import {resolve} from 'node:path';
const base='http://127.0.0.1:4191';
const channel=process.env.SUNRISE_BROWSER_CHANNEL;
if(!['chrome','msedge'].includes(channel))throw Error('Set SUNRISE_BROWSER_CHANNEL to chrome or msedge');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4191','--strictPort'],{stdio:'inherit'});
let browser;
try{
 let ready=false;
 for(let i=0;i<150;i++){
  if(server.exitCode!==null)throw Error('Vite exited');
  try{const code=await new Promise((ok,bad)=>get(base+'/',r=>{r.resume();ok(r.statusCode);}).on('error',bad));if(code===200){ready=true;break;}}catch{}
  await sleep(200);
 }
 if(!ready)throw Error('Vite timeout');
 browser=await chromium.launch({channel,headless:true});
 const context=await browser.newContext();
 const page=await context.newPage();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Browser.grantPermissions',{permissions:['localFonts'],origin:base});
 await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('변환 준비 완료'),null,{timeout:120000});
 await page.evaluate(()=>{
  const btn=document.createElement('button');btn.id='font-test-trigger';btn.textContent='Test fonts';
  btn.onclick=()=>{window.nativeFonts=window.queryLocalFonts();};document.body.append(btn);
 });
 await page.locator('#font-test-trigger').click();
 const evidence=await page.evaluate(async()=>{
  const fonts=await window.nativeFonts;
  return (await import('/tests/native-font-entry.js')).verifyInstalledFont(fonts);
 });
 if(!evidence.faces||evidence.bytes<100)throw Error('Real OS font PDF was not produced');
 await page.locator('details.advanced summary').click();
 await page.locator('#use-local-fonts').check();
 await page.reload();
 if(!await page.locator('#use-local-fonts').isChecked())throw Error('Preference did not persist after reload');
 await page.locator('#source').setInputFiles(resolve('tests/fixtures/ci-sample.hwp'));
 await page.locator('#convert').click();
 await page.waitForFunction(()=>document.querySelector('#done-count')?.textContent==='1'||document.querySelector('#failed-count')?.textContent==='1',null,{timeout:180000});
 if(await page.locator('#done-count').innerText()!=='1')throw Error('HWP conversion failed: '+await page.locator('#file-list').innerText());
 if(await page.locator('#file-list a.download').count()!==1)throw Error('PDF download missing');
 await cdp.send('Browser.setPermission',{permission:{name:'local-fonts'},setting:'denied',origin:base});
 await page.evaluate(()=>{const btn=document.createElement('button');btn.id='font-denied-trigger';btn.textContent='Test denied';btn.onclick=()=>{window.deniedFonts=window.queryLocalFonts().then(()=>false,e=>e.name==='NotAllowedError');};document.body.append(btn);});
 await page.locator('#font-denied-trigger').click();
 if(!await page.evaluate(()=>window.deniedFonts))throw Error('Denied permission did not reject');
 console.log('PASS: '+channel+' Windows real OS font API, installed font PDF, preference, HWP, denial');
 await context.close();
}finally{await browser?.close();server.kill();}
