import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const requested=[];
const assets={fetch:async request=>{
 const path=new URL(request.url).pathname;
 requested.push(path);
 const types={'/app.html':'text/html','/pdf-worker.mjs':'application/javascript','/assets/local-bundle.js':'application/javascript','/assets/local-chunk-Engine_01.js':'application/javascript','/rhwp_bg.wasm':'application/wasm','/fonts/NanumGothic-Regular.ttf':'font/ttf'};
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
 ['/local/fonts/NanumGothic-Regular.ttf','/fonts/NanumGothic-Regular.ttf','font/ttf']
]){
 for(const method of ['GET','HEAD']){
  const response=await worker.fetch(new Request('https://sunrise.example'+route,{method}),env);
  assert.equal(response.status,200,method+' '+route);
  assert.match(response.headers.get('Content-Type')||'',new RegExp(contentType));
  assert.equal(await response.text(),method==='HEAD'?'':'test-asset');
  assert.equal(requested.at(-1),assetPath);
 }
}
for(const route of ['/','/index.html']){
 const resp=await worker.fetch(new Request('https://sunrise.example'+route),env);
 assert.equal(resp.status,302,'Legacy home must redirect to converter');
 assert.equal(resp.headers.get('Location'),'https://sunrise.example/local/');
}
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
