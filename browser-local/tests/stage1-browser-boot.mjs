/**
 * Stage-1 LOCAL E2E: start the freshly built Vite output, boot the actual
 * @rhwp/core WASM in a headless Chromium-compatible browser, verify that no
 * request leaves localhost. Does NOT load or transmit any user document.
 * Use after `npm run build`: `npm run test:wasm`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

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
      !existsSync(join(root, 'dist/rhwp_bg.wasm'))) {
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
  context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const blocked = [];
  const pageErrors = [];
  const wasmResponses = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/rhwp_bg.wasm'))
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
  await page.waitForFunction(() => {
    const status = document.getElementById('status')?.textContent || '';
    return /초기화 (완료|실패)/.test(status);
  }, null, { timeout: 90000 });
  result.appStatus = await page.locator('#status').innerText();
  if (!result.appStatus.includes('초기화 완료'))
    throw Error('Real rhwp WASM failed to initialize: ' + result.appStatus);
  result.assertions.push('real rhwp WASM initialization succeeded');
  result.wasmResponses = wasmResponses;
  if (!wasmResponses.some(r => r.status === 200 && new URL(r.url).origin === origin))
    throw Error('WASM was not fetched successfully from localhost');
  result.assertions.push('WASM asset fetched from localhost with HTTP 200');
  if (pageErrors.length) throw Error('Browser JS error: ' + pageErrors.join(' | '));
  if (blocked.length) throw Error('Unexpected external request: ' + [...new Set(blocked)].join(', '));
  result.assertions.push('no browser JavaScript exceptions or external network requests');
  if (!await page.locator('#convert').isDisabled())
    throw Error('Convert button is enabled without a selected input document');
  result.assertions.push('UI booted with safe initial state');
  result.status = 'PASS';
} catch (error) {
  result.error = String(error?.message || error).slice(0,1500);
  if (stderr) result.serverStderr = stderr;
} finally {
  try { await context?.close(); } catch { /* cleanup best effort */ }
  try { await browser?.close(); } catch { /* cleanup best effort */ }
  try { server?.kill(); } catch { /* cleanup best effort */ }
  writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}
