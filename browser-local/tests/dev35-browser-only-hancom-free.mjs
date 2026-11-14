import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localFontCapability,settleInstalledFonts} from '../src/local-font-policy.mjs';
import {resolveFont,familyKey} from '../src/pdf-fonts.js';
import {inspectEngineContract} from '../scripts/verify-engine-contract.mjs';
import {resolve} from 'node:path';

test('mobile browser with no OS font API is still eligible for self-hosted WASM PDF conversion',async()=>{
 const capability=localFontCapability({isSecureContext:true});
 assert.deepEqual(capability,{supported:false,secure:true});
 const result=await settleInstalledFonts(null);
 assert.equal(result.status,'disabled');
 assert.equal(result.fonts,null);
 const converter=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
 assert.match(converter,/import init, \{ HwpDocument \} from '@rhwp\/core'/);
 assert.match(converter,/prepareWasm\(\)/);
 assert.match(converter,/new HwpDocument\(new Uint8Array\(buf\)\)/);
 assert.match(converter,/loadBundledFonts\(fontkit,signal\)/);
 assert.match(converter,/tryProfessionalDocument\(doc,count/);
});

test('OS font permission denied is a quality fallback, never an implicit conversion failure',async()=>{
 const error=Object.assign(Error('no permission'),{name:'NotAllowedError'});
 const result=await settleInstalledFonts(Promise.reject(error));
 assert.equal(result.status,'denied');
 assert.equal(result.fonts,null);
 assert.match(result.notice,/내장 글꼴로 변환/);
});

test('empty font query does not falsely mean no installed fonts',async()=>{
 const x=await settleInstalledFonts(Promise.resolve([]),{
  permissions:{query:async()=>({state:'granted'})},
  timeoutMs:100
 });
 assert.equal(x.status,'empty-granted');
 assert.equal(x.fonts,null);
 assert.match(x.notice,/0개/);
});

test('enumeration reads only font metadata until an actual document needs a face',async()=>{
 let blobCalls=0;
 const face={family:'맑은 고딕',style:'Regular',blob:async()=>{blobCalls++;return new Blob([]);}};
 const result=await settleInstalledFonts(Promise.resolve([face]),{timeoutMs:100});
 assert.equal(result.status,'ready');assert.equal(result.fonts.length,1);
 assert.equal(blobCalls,0);
});

test('selected original font outranks substitute while missing font has explicit fallback',()=>{
 const chars=new Set(['한','글'].map(c=>c.codePointAt(0)));
 const bundled={name:'BundledFont',aliases:[familyKey('맑은 고딕')],
  family:'Nanum Gothic',bold:false,italic:false,isFallback:true,
  genericFamily:'sans',characterSet:chars};
 const exact={...bundled,name:'UserSelectedOriginalFont',family:'맑은 고딕',isFallback:false};
 assert.equal(resolveFont({faces:[bundled,exact]},'맑은 고딕','normal','normal','한글').name,
  'UserSelectedOriginalFont');
 assert.equal(resolveFont({faces:[bundled]},'맑은 고딕','normal','normal','한글').name,
  'BundledFont');
});

test('web UI does not gate conversion on Hancom installation or local font access',()=>{
 const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(ui,/const deviceFontsAvailable=fontCapability\.secure&&fontCapability\.supported/);
 assert.match(ui,/if\(USE_PC_FONTS_BY_DEFAULT&&needsFonts\)/);
 assert.match(ui,/if\(deviceFontsAvailable\)/);
 assert.match(ui,/else fontAccessNotice=/);
 assert.match(ui,/localFonts\}/);
 assert.match(html,/한컴오피스가 설치되지 않은 PC·모바일에서도/);
 assert.match(html,/원본 TTF\/OTF 글꼴 추가 \(PC·모바일 선택\)/);
 assert.match(html,/<option value="professional" selected>/);
 assert.doesNotMatch(ui,/\b(?:ActiveXObject|win32com|HWPFrame\.HwpObject)\b/);
});

test('all active browser modules forbid Hancom COM/subprocess runtime imports',()=>{
 const root=resolve(new URL('../..',import.meta.url).pathname);
 const result=inspectEngineContract(root);
 assert.equal(result.ok,true,result.issues.join(','));
});
