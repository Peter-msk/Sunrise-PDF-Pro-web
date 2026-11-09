import assert from 'node:assert/strict';
import worker from '../src/worker.js';

/**
 * Cloudflare Workers provides HTMLRewriter as a runtime global; Node.js does
 * not. This test-only contract fixture records selector/markup registration.
 * It deliberately preserves Response bytes: HTML transformation itself is a
 * workerd/browser integration concern, not a Node.js DOM emulation.
 */
const rewriteHooks=[];
if(typeof globalThis.HTMLRewriter!=='function'){
 globalThis.HTMLRewriter=class HTMLRewriterContractFixture {
  on(selector,handlers){
   const fragments=[];
   handlers?.element?.({append:(content,options={})=>fragments.push({content:String(content),html:options.html===true})});
   rewriteHooks.push({selector,fragments});
   return this;
  }
  transform(response){return response;}
 };
}

const requested=[];
const assets={fetch:async request=>{
 const path=new URL(request.url).pathname;
 requested.push(path);
 const types={'/app.html':'text/html','/pdf-worker.mjs':'application/javascript','/assets/local-bundle.js':'application/javascript','/assets/local-chunk-Engine_01.js':'application/javascript','/rhwp_bg.wasm':'application/wasm','/fonts/NanumGothic-Regular.ttf':'font/ttf','/fonts/SunriseSymbols.otf':'font/otf','/fonts/SunriseMarks.ttf':'font/ttf'};
 if(!(path in types))return new Response('Not Found',{status:404});
 return new Response(request.method==='HEAD'?null:'test-asset',{status:200,headers:{'Content-Type':types[path]}});
}};
const env={ASSETS:assets};
for(const [route,assetPath,contentType] of [
 ['/local/','/app.html','text/html'],
 ['/local/pdf-worker.mjs','/pdf-worker.mjs','application/javascript'],
 ['/local/assets/local-bundle.js','/assets/local-bundle.js','application/javascript'],
 ['/local/assets/local-chunk-Engine_01.js','/assets/local-chunk-Engine_01.js','application/javascript'],
 ['/local/rhwp_bg.wasm','/rhwp_bg.wasm','application/wasm'],
 ['/local/fonts/NanumGothic-Regular.ttf','/fonts/NanumGothic-Regular.ttf','font/ttf'],
 ['/local/fonts/SunriseSymbols.otf','/fonts/SunriseSymbols.otf','font/otf'],
 ['/local/fonts/SunriseMarks.ttf','/fonts/SunriseMarks.ttf','font/ttf']
]){
 for(const method of ['GET','HEAD']){
  const response=await worker.fetch(new Request('https://sunrise.example'+route,{method}),env);
  assert.equal(response.status,200,method+' '+route);
  assert.match(response.headers.get('Content-Type')||'',new RegExp(contentType));
  assert.equal(await response.text(),method==='HEAD'?'':'test-asset');
  assert.equal(requested.at(-1),assetPath);
 }
}
// R50+ public landing page is no longer a 302 to /local/.
for(const route of ['/','/index.html']){
 const resp=await worker.fetch(new Request('https://sunrise.example'+route),env);
 assert.equal(resp.status,200,'R50 public landing must remain available');
 assert.match(resp.headers.get('Content-Type')||'',/text\/html/);
 assert.match(await resp.text(),/Sunrise|SUNRISE|PDF PRO/i);
}
assert.equal((await worker.fetch(new Request('https://sunrise.example/features/'),env)).status,200);
const legacyRedirect=await worker.fetch(new Request('https://sunrise.example/local'),env);
assert.equal(legacyRedirect.status,302);
assert.equal(legacyRedirect.headers.get('Location'),'https://sunrise.example/local/');
const health=await (await worker.fetch(new Request('https://sunrise.example/local/health'),env)).json();
assert.equal(health.document_upload,false);
assert.equal(health.external_conversion_api,false);
assert.equal(health.quality_target_dpi,300);
assert.equal(health.wasm_delivery,'cloudflare-static-assets');
const missing=await worker.fetch(new Request('https://sunrise.example/local/rhwp_bg.wasm'),{});
assert.equal(missing.status,503,'Missing static asset binding must fail closed');
const disallowed=await worker.fetch(new Request('https://sunrise.example/local/rhwp_bg.wasm',{method:'POST'}),env);
assert.equal(disallowed.status,405);
console.log('Worker static-assets routing, fail-closed and health contract: PASS');

for(const route of ['/local/assets/private.json','/local/assets/nested/local-chunk-x.js','/local/assets/local-chunk-x.js.map']){
 const response=await worker.fetch(new Request('https://sunrise.example'+route),env);
 assert.equal(response.status,404,route+' must not expose arbitrary assets');
}
const chunkPost=await worker.fetch(new Request('https://sunrise.example/local/assets/local-chunk-Engine_01.js',{method:'POST'}),env);
assert.equal(chunkPost.status,405);
const htmlResponse=await worker.fetch(new Request('https://sunrise.example/local/'),env);
assert.match(htmlResponse.headers.get('content-security-policy'),/frame-src 'self'/);
assert.match(htmlResponse.headers.get('content-security-policy'),/font-src 'self' blob:/);
assert.equal(health.default_output,'professional');
assert.deepEqual(health.optional_outputs,['native-print']);
console.log('Professional engine chunk routing, asset boundaries and print CSP: PASS');

assert.equal((await worker.fetch(new Request('https://sunrise.example/local/fonts/NanumGothic-Regular.ttf',{method:'POST'}),env)).status,405);
assert.equal((await worker.fetch(new Request('https://sunrise.example/local/fonts/unknown.ttf'),env)).status,404);
console.log('Bundled font asset routing: PASS');

assert.match(htmlResponse.headers.get('content-security-policy'),/worker-src 'self'/);
assert.equal((await worker.fetch(new Request('https://sunrise.example/local/pdf-worker.mjs',{method:'POST'}),env)).status,405);

// R55 Trace v2 / R56 compact queue assets: safe methods, privacy and same-origin policy.
for(const [path,contentType] of [['/ops-r56.js','javascript'],['/ops-r56.css','text/css']]){
 const res=await worker.fetch(new Request('https://sunrise.example'+path),env);
 assert.equal(res.status,200,path);
 assert.match(res.headers.get('content-type')||'',new RegExp(contentType),path);
 assert.equal(res.headers.get('cache-control'),path==='/trace-dev4-client.js'?'public, max-age=300':'no-store');
 assert.ok((await res.text()).length>200,path+' body is nonempty');
 const head=await worker.fetch(new Request('https://sunrise.example'+path,{method:'HEAD'}),env);
 assert.equal(head.status,200,path+' HEAD');
 assert.equal(await head.text(),'');
 assert.equal((await worker.fetch(new Request('https://sunrise.example'+path,{method:'POST'}),env)).status,405,path+' method guard');
}
const traceClient=await worker.fetch(new Request('https://sunrise.example/trace-dev4-client.js'),env);
assert.equal(traceClient.status,200);
assert.match(traceClient.headers.get('content-type')||'',/javascript/);
assert.match(await traceClient.text(),/trace2-dev4-pro|trace-dev4/i);
assert.match(htmlResponse.headers.get('permissions-policy')||'',/local-fonts=\(self\)/);
assert.ok(rewriteHooks.some(x=>x.selector==='head'&&x.fragments.some(y=>y.content.includes('/ops-r56.css')&&y.content.includes('/ops-r56.js'))),'R56 UI must be injected in /local/');
assert.ok(rewriteHooks.some(x=>x.selector==='.top-inner'),'R50 navigation must be preserved');
assert.equal((await worker.fetch(new Request('https://sunrise.example/admin/traces/'),env)).status,503,'admin must remain unavailable without DB/secrets');
console.log('R55/R56 Cloudflare HTMLRewriter contract, private admin gate, UI routes and homepage: PASS');
