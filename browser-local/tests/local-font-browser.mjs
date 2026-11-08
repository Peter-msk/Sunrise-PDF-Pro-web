import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {writeFileSync} from 'node:fs';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4190','--strictPort'],{stdio:'inherit'});
let browser;
try{
 let ready=false;
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw Error('Vite exited');
  try{if((await fetch('http://127.0.0.1:4190/')).ok){ready=true;break;}}catch{}
  await sleep(200);
 }
 if(!ready)throw Error('Vite timeout');
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:4190/');
 await page.locator('#use-local-fonts').check();
 await page.reload();
 if(!await page.locator('#use-local-fonts').isChecked())throw Error('Font preference did not persist');
 const bytes=await page.evaluate(async()=>{
  const mod=await import('/tests/local-font-browser-entry.js');return mod.runBrowserFontTest();
 });
 if(bytes.length<100||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw Error('Invalid PDF');
 writeFileSync('/tmp/sunrise-local-font-test.pdf',Buffer.from(bytes));
 console.log('PASS: real browser local font bytes, stylesheet, PDF, and persisted preference');
 await context.close();
}finally{await browser?.close();server.kill();}
