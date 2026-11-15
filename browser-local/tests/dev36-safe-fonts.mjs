import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {approvedFonts,approvedSource,verifyApprovedFont} from '../scripts/install-safe-fonts.mjs';
import {loadPdfFonts,resolveFont,familyKey} from '../src/pdf-fonts.js';
import {localFamilyKeys} from '../src/local-fonts.js';

test('DEV37 defaults contain four KERIS body faces and three OFL symbol/Unicode fallbacks',()=>{
 assert.deepEqual(approvedFonts.map(f=>f.name),[
  'HakgyoansimBareonbatangR.ttf','HakgyoansimBareonbatangB.ttf',
  'HakgyoansimBareondotumR.ttf','HakgyoansimBareondotumB.ttf',
  'NotoSansSymbols2-Regular.ttf',
  'NotoSans-Regular.ttf','NotoSansYi-Regular.ttf'
 ]);
 const src=readFileSync(new URL('../src/bundled-fonts.js',import.meta.url),'utf8');
 for(const font of approvedFonts)assert.ok(src.includes(font.name),font.name);
 assert.doesNotMatch(src,/['"](?:NanumGothic-|NanumMyeongjo-|SunriseSymbols|SunriseMarks)/);
});

test('DEV36 all source URLs are pinned and each asset has a strict digest',()=>{
 for(const f of approvedFonts){
  assert.match(approvedSource(f),/^https:\/\/(?:media|raw)\.githubusercontent\.com\//);
  assert.match(approvedSource(f),/[0-9a-f]{40}/);
  assert.ok(/^[0-9a-f]{64}$/.test(f.sha256||'')||/^[0-9a-f]{40}$/.test(f.gitBlobSha||''));
  assert.ok(f.size>100000&&f.size<2100000);
 }
});

test('DEV36 rejects zero bytes, LFS pointer and mismatched font content',()=>{
 const selected=approvedFonts[0];
 assert.throws(()=>verifyApprovedFont(selected,new Uint8Array(0)),/SAFE_FONT_SIZE_MISMATCH/);
 assert.throws(()=>verifyApprovedFont(selected,new Uint8Array(selected.size)),/SAFE_FONT_SIGNATURE_INVALID/);
 const b=new Uint8Array(selected.size);b.set([0,1,0,0]);
 assert.throws(()=>verifyApprovedFont(selected,b),/SAFE_FONT_HASH_MISMATCH/);
});

test('DEV36 fontkit family style B/R are distinct, not duplicate regular faces',async()=>{
 const files=['R','B'].map(s=>({name:'HakgyoansimBareondotum'+s+'.ttf',
  arrayBuffer:async()=>new Uint8Array([s==='B'?2:1]).buffer}));
 const parsed={create:bytes=>({
  familyName:'Hakgyoansim Bareondotum',
  fullName:'Hakgyoansim Bareondotum '+(bytes[0]===2?'B':'R'),
  postscriptName:'HakgyoansimBareondotum'+(bytes[0]===2?'B':'R'),
  subfamilyName:bytes[0]===2?'B':'R',
  characterSet:[0xD55C,0xAE00,0x2022],
  italicAngle:0
 })};
 const reg=await loadPdfFonts(files,parsed);
 assert.deepEqual(reg.faces.map(f=>f.bold),[false,true]);
 assert.notEqual(reg.faces[0].name,reg.faces[1].name);
 const fallback={...reg.faces[1],isFallback:true,aliases:[familyKey('맑은 고딕')],genericFamily:'sans'};
 assert.equal(resolveFont({faces:[fallback]},'맑은 고딕','bold','normal','한글')?.name,fallback.name);
});

test('DEV36 Worker allowlist rejects retired font URL patterns',()=>{
 const worker=readFileSync(new URL('../../src/worker.js',import.meta.url),'utf8');
 assert.match(worker,/HakgyoansimBareon/);
 assert.match(worker,/NotoSansSymbols2-Regular/);
 assert.match(worker,/NotoSans-Regular/);
 assert.match(worker,/NotoSansYi-Regular/);
 assert.doesNotMatch(worker,/Nanum\(\?:Gothic\|Myeongjo\)/);
});

test('DEV37 all seven pinned font binaries parse and cover the eight reported missing punctuation glyphs',async()=>{
 const {default:fontkit}=await import('@pdf-lib/fontkit');
 const files=await Promise.all(approvedFonts.map(async font=>{
  const bytes=await readFile(new URL('../public/fonts/'+font.name,import.meta.url));
  assert.equal(verifyApprovedFont(font,bytes),true);
  return {name:font.name,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
 }));
 const registry=await loadPdfFonts(files,fontkit);
 assert.equal(registry.faces.length,7);
 assert.deepEqual(registry.faces.slice(0,4).map(f=>f.bold),[false,true,false,true]);
 const symbols=registry.faces[4];
 assert.match(symbols.family,/Noto Sans Symbols\\s*2/i);
 for(const c of ['◦','•','▸','∘'])
  assert.ok(symbols.characterSet.has(c.codePointAt(0)),'symbol fallback missing: '+c);
 // Restore the user's original U+002D hyphen, not U+2011.
 const originalEight=['‧','-','｢','｣','․','･','⁀','‿'];
 const optionalHyphen='‑';
 for(const c of [...originalEight,optionalHyphen]){
  const cp=c.codePointAt(0);
  // Do not assert that prior bundled fonts lacked a common ASCII hyphen.
  assert.ok(registry.faces.slice(5).some(f=>f.characterSet.has(cp)),
   'new fallback must cover U+'+cp.toString(16).toUpperCase());
  const options={faces:registry.faces.map((f,i)=>({...f,isFallback:true,
   genericFamily:i<2?'serif':i<4?'sans':'symbol'}))};
  const selected=resolveFont(options,'알 수 없는 원본 서체','normal','normal',c);
  assert.ok(selected?.characterSet?.has(cp),'PDF font selection must retain: '+c);
 }
});

test('DEV36 KERIS Korean/English names match for optional installed PC fonts',()=>{
 for(const [korean,english] of [
  ['학교안심 바른돋움','Hakgyoansim Bareondotum'],
  ['학교안심 바른바탕','Hakgyoansim Bareonbatang']
 ]){
  assert.ok(localFamilyKeys(korean).has(familyKey(english)));
  assert.ok(localFamilyKeys(english).has(familyKey(korean)));
 }
});
