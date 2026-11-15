/** DEV37: deterministic text-run regression; uses no network or font binaries.
 * Verifies font fallback selection rather than claiming glyph shape/layout parity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFont,resolveFontRuns,familyKey} from '../src/pdf-fonts.js';

function fakeFont(name,family,glyphs,genericFamily,{isFallback=true}={}){
 return {
  name,family,genericFamily,isFallback,aliases:[familyKey(family)],
  bold:false,italic:false,
  characterSet:new Set([...glyphs].map(ch=>ch.codePointAt(0)))
 };
}
function registry(){
 return {faces:[
  fakeFont('KERIS','학교안심 바른돋움','한글문서평가검증','sans'),
  fakeFont('SYMBOLS','Noto Sans Symbols 2','◦•▸∘','symbol'),
  fakeFont('NOTO','Noto Sans','‧-‑․⁀‿','symbol'),
  fakeFont('YI','Noto Sans Yi','｢｣･','symbol')
 ]};
}
test('DEV37: original 8 characters include ASCII U+002D, not U+2011 substitution',()=>{
 const expected=[0x2027,0x002D,0xff62,0xff63,0x2024,0xff65,0x2040,0x203f];
 const original='‧-｢｣․･⁀‿';
 assert.deepEqual([...original].map(c=>c.codePointAt(0)),expected);
 const fonts=registry();
 for(const ch of original){
  const face=resolveFont(fonts,'원본에 없는 서체','normal','normal',ch);
  assert.ok(face?.characterSet.has(ch.codePointAt(0)),ch+' needs an actual font face');
 }
 // U+2011 is also supported but not mislabeled as the original user's hyphen.
 assert.equal(resolveFont(fonts,'미설치 서체','normal','normal','‑')?.name,'NOTO');
});
test('DEV37: Hangul mixed with symbols splits only missing glyphs and preserves content',()=>{
 const text='한글‧｢문서｣․';
 const runs=resolveFontRuns(registry(),'원본에 없는 서체','normal','normal',text);
 assert.ok(runs?.length>1);
 assert.equal(runs.map(r=>r.text).join(''),text);
 assert.deepEqual(runs.map(r=>r.face.name),['KERIS','NOTO','YI','KERIS','YI','NOTO']);
 for(const run of runs)
  for(const c of run.text)assert.ok(run.face.characterSet.has(c.codePointAt(0)));
});
test('DEV37: explicitly installed matching font wins over generic bundled alternative',()=>{
 const f=registry();
 f.faces.push(fakeFont('LOCAL','학교안심 바른돋움','한글','sans',{isFallback:false}));
 const chosen=resolveFont(f,'학교안심 바른돋움','normal','normal','한글');
 assert.equal(chosen?.name,'LOCAL');
});
test('DEV37: a Unicode codepoint absent from all faces is never replaced silently',()=>{
 assert.equal(resolveFont(registry(),'미설치 서체','normal','normal','🪼'),null);
 assert.equal(resolveFontRuns(registry(),'미설치 서체','normal','normal','한글🪼'),null);
});
