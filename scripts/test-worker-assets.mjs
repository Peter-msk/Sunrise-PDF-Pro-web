import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const requested=[];
const assets={fetch:async request=>{
 const path=new URL(request.url).pathname;
 requested.push(path);
 const types={'/app.html':'text/html','/assets/local-bundle.js':'application/javascript','/rhwp_bg.wasm':'application/wasm'};
 if(!(path in types))return new Response('Not Found',{status:404});
 return new Response(request.method==='HEAD'?null:'test-asset',{status:200,headers:{'Content-Type':types[path]}});
}};
const env={ASSETS:assets};
for(const [route,assetPath,contentType] of [
 ['/local/','/app.html','text/html'],
 ['/local/assets/local-bundle.js','/assets/local-bundle.js','application/javascript'],
 ['/local/rhwp_bg.wasm','/rhwp_bg.wasm','application/wasm']
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
