import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {approvedFonts,approvedSource,verifyApprovedFont} from '../scripts/install-safe-fonts.mjs';
import {loadPdfFonts,resolveFont,familyKey} from '../src/pdf-fonts.js';

test('DEV36 default assets contain four KERIS fonts and one OFL symbol fallback',()=>{
 assert.deepEqual(approvedFonts.map(f=>f.name),[
  'HakgyoansimBareonbatangR.ttf','HakgyoansimBareonbatangB.ttf',
  'HakgyoansimBareondotumR.ttf','HakgyoansimBareondotumB.ttf',
  'NotoSansSymbols2-Regular.ttf'
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
  assert.ok(f.size>600000&&f.size<2100000);
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
 assert.doesNotMatch(worker,/Nanum\(\?:Gothic\|Myeongjo\)/);
});

test('DEV36 actual 5 font binaries are valid fontkit faces with correct B/R and common symbols',async()=>{
 const {default:fontkit}=await import('@pdf-lib/fontkit');
 const files=await Promise.all(approvedFonts.map(async font=>{
  const bytes=await readFile(new URL('../public/fonts/'+font.name,import.meta.url));
  assert.equal(verifyApprovedFont(font,bytes),true);
  return {name:font.name,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
 }));
 const registry=await loadPdfFonts(files,fontkit);
 assert.equal(registry.faces.length,5);
 assert.deepEqual(registry.faces.slice(0,4).map(f=>f.bold),[false,true,false,true]);
 const symbol=registry.faces.find(f=>/Noto Sans Symbols 2/i.test(f.family));
 assert.ok(symbol,'Noto symbol font face must be parsed successfully');
 for(const char of ['◦','•','▸','∘']){
  assert.ok(symbol.characterSet.has(char.codePointAt(0)),
   'required real-report symbol missing from fallback: '+char);
 }
 // The original reports contain further punctuation not in these five fonts.
 // Never claim perfect glyph fidelity based on font embedding alone.
 const unresolved=['‧','‑','｢','｣','․','･','⁀','‿'];
 const remaining=unresolved.filter(char=>!registry.faces.some(face=>face.characterSet.has(char.codePointAt(0))));
 assert.ok(remaining.length>0,'unverified punctuation must be represented as a real coverage gap');
});
