/**
 * Stage-1 LOCAL E2E: start the freshly built Vite output, boot the actual
 * @rhwp/core WASM in a headless Chromium-compatible browser, verify that no
 * request leaves localhost using the public MIT HWPX fixture only.
 * Use after `npm run build`: `npm run test:wasm`.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {RHWP_PARTS} from '../src/rhwp-engine.mjs';

const root = resolve(import.meta.dirname, '..');
const evidence = join(root, 'local-evidence');
mkdirSync(evidence, { recursive: true });
const reportPath = join(evidence, 'stage1-browser-boot.json');
const port = 4189;
const origin = `http://127.0.0.1:${port}`;
const result = {
  kind: 'LOCAL_STAGE1_WASM_BOOT',
  status: 'FAIL',
  url: origin,
  remoteActions: 'none',
  documentUploads: 0,
  assertions: [],
};
let server = null;
let browser = null;
let context = null;
let stderr = '';
const blocked = [], pageErrors = [], wasmResponses = [];

async function waitForLocalServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error('Vite preview terminated before readiness');
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* bounded retry, localhost only */ }
    await sleep(100);
  }
  throw Error('Vite preview did not start within 10 seconds');
}

async function launchInstalledBrowser() {
  const requested = process.env.SUNRISE_TEST_BROWSER_CHANNEL;
  const choices = requested ? [requested] : (process.platform === 'win32'
    ? ['msedge', 'chrome', 'chromium'] : ['chromium']);
  const failures = [];
  for (const choice of choices) {
    try {
      const options = { headless: true };
      if (choice !== 'chromium') options.channel = choice;
      if (process.platform === 'linux') options.args = ['--no-sandbox'];
      const instance = await chromium.launch(options);
      return { instance, channel: choice };
    } catch (error) {
      failures.push(`${choice}: ${String(error?.message || error).split('\n')[0]}`);
    }
  }
  throw Error('Chromium/Edge browser unavailable: ' + failures.join(' | '));
}

try {
  if (!existsSync(join(root, 'dist/index.html')) ||
      !RHWP_PARTS.every(p=>existsSync(join(root,'dist',p.name)))) {
    throw Error('Vite dist assets are missing; run npm run build first');
  }
  server = spawn(process.execPath, [
    join(root, 'node_modules/vite/bin/vite.js'),
    'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-2000); });
  await waitForLocalServer();
  result.assertions.push('localhost Vite build served');

  const launched = await launchInstalledBrowser();
  browser = launched.instance;
  result.browser = launched.channel;
  context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads:true });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('response', response => {
    if (RHWP_PARTS.some(p=>new URL(response.url()).pathname.endsWith('/'+p.name)))
      wasmResponses.push({ status: response.status(), url: response.url() });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === 'blob:' || url.protocol === 'data:')
      return route.continue();
    blocked.push(url.origin);
    return route.abort('blockedbyclient');
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('변환 준비 완료'),null,{timeout:30000});
  if (!await page.locator('#convert').isDisabled())throw Error('Convert enabled without a selected input');
  result.assertions.push('UI booted with safe initial state');
  if(wasmResponses.length)throw Error('Unexpected eager WASM fetch before selection');
  // DEV36 intentionally lazy-initializes WASM on the first conversion.
  const fixture=Buffer.from(readFileSync(new URL('./fixtures/dev44-rhwp-test-image.hwpx.b64',import.meta.url),'utf8').trim(),'base64');
  await page.locator('#source').setInputFiles({name:'public-fixture.hwpx',mimeType:'application/zip',buffer:fixture});
  await page.locator('#convert').click();
  await page.waitForFunction(()=>Number(document.querySelector('#done-count')?.textContent||0)+Number(document.querySelector('#failed-count')?.textContent||0)===1,null,{timeout:90000});
  result.appStatus=await page.locator('#status').innerText();
  result.counts={done:Number(await page.locator('#done-count').innerText()),failed:Number(await page.locator('#failed-count').innerText())};
  const control=page.locator('#qa-export');
  // DEV63 deliberately hides the engineering-only QA control in production.
  if(!await control.isHidden())throw Error('Engineering QA control exposed in production');
  if(await control.isDisabled())throw Error('QA control disabled after conversion');
  await control.evaluate(node=>{node.hidden=false;});
  let exported;
  try{
    [exported]=await Promise.all([page.waitForEvent('download',{timeout:10000}),control.click({timeout:10000})]);
  }finally{await control.evaluate(node=>{node.hidden=true;});}
  const qa=JSON.parse(readFileSync(await exported.path(),'utf8'));
  result.assertions.push('engineering QA export works in isolated test without exposing the production control');
  result.qa={build_revision:qa.build_revision,rhwp_version:qa.rhwp_version,totals:qa.totals,files:qa.files};
  if(qa.rhwp_version!=='0.9.0')throw Error('Verified RHWP 0.9.0 failed to initialize');
  result.assertions.push('real RHWP 0.9.0 initialization succeeded');
  if(qa.totals.done!==1||qa.totals.failed!==0)throw Error('Built app public fixture conversion failed: '+JSON.stringify(result.qa));
  const download=page.locator('#file-list a.download');
  const [downloaded]=await Promise.all([page.waitForEvent('download',{timeout:15000}),download.click({timeout:15000})]);
  const pdf=await PDFDocument.load(readFileSync(await downloaded.path()));
  if(pdf.getPageCount()!==qa.files[0].pages||qa.files[0].raster_pages!==0)throw Error('Built app PDF page/engine mismatch');
  result.assertions.push('built app converted public HWPX and downloaded PDF with matching vector page count');
  result.wasmResponses = wasmResponses;
  if (!RHWP_PARTS.every(p=>wasmResponses.some(r=>r.status===200 && new URL(r.url).origin===origin && new URL(r.url).pathname.endsWith('/'+p.name))))
    throw Error('WASM was not fetched successfully from localhost');
  result.assertions.push('WASM asset fetched from localhost with HTTP 200');
  if (pageErrors.length) throw Error('Browser JS error: ' + pageErrors.join(' | '));
  if (blocked.length) throw Error('Unexpected external request: ' + [...new Set(blocked)].join(', '));
  result.assertions.push('no browser JavaScript exceptions or external network requests');
  result.status = 'PASS';
} catch (error) {
  result.error = String(error?.message || error).slice(0,1500);
  if (stderr) result.serverStderr = stderr;
  result.wasmResponses=wasmResponses;
  result.pageErrors=pageErrors.map(x=>x.slice(0,300));
  result.blockedOrigins=[...new Set(blocked.map(x=>{try{return new URL(x).origin;}catch{return 'invalid-url';}}))];
} finally {
  try { await context?.close(); } catch { /* cleanup best effort */ }
  try { await browser?.close(); } catch { /* cleanup best effort */ }
  try { server?.kill(); } catch { /* cleanup best effort */ }
  writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}
