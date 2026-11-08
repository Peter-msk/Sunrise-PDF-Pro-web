import test from 'node:test';
import assert from 'node:assert/strict';
import {convertRemote} from '../src/remote-office-prototype.mjs';

test('file-only request and valid PDF response', async () => {
 const file = new File(['content'], 'example.pptx');
 const output = await convertRemote(file, {request: async (url, options) => {
  assert.equal(url, '/api/v1/conversions');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.redirect, 'error');
  assert.deepEqual([...options.body.keys()], ['file']);
  return new Response('%PDF-1.7\n%%EOF', {headers:{'content-type':'application/pdf'}});
 }});
 assert.equal(output.pdf.type, 'application/pdf');
 assert.ok(output.bytes > 8);
});
test('rejects server errors and invalid PDFs', async () => {
 const file = new File(['content'], 'a.xlsx');
 await assert.rejects(convertRemote(file, {request: async () => new Response('oops',{status:500})}));
 await assert.rejects(convertRemote(file, {request: async () => new Response('not pdf', {headers:{'content-type':'application/pdf'}})}));
 await assert.rejects(convertRemote(file, {request: async () => new Response('html', {headers:{'content-type':'text/html'}})}));
});
test('rejects invalid input and pre-aborted requests before sending', async () => {
 let calls = 0; const request = async () => { calls++; };
 await assert.rejects(convertRemote(new File(['x'], 'x.png'), {request}));
 const controller = new AbortController(); controller.abort();
 await assert.rejects(convertRemote(new File(['x'], 'x.hwp'), {request, signal:controller.signal}), {name:'AbortError'});
 assert.equal(calls, 0);
});
