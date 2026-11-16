/**
 * R66-DEV10 targeted contract for the real preflight source branch.
 * Extracts and executes that branch with minimal DOM/font test doubles.
 * Does not claim SVG-to-PDFKit browser pixel equivalence; that is a real E2E gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/svg-professional.js',import.meta.url),'utf8');
const begin=source.indexOf('        const face=resolveFont(fontRegistry,currentFamily,currentWeight,currentStyle,value);');
const end=source.indexOf('        // A PC font selected from a later declared family',begin);
assert.ok(begin>=0 && end>begin,'R66_FONT_BRANCH_CONTEXT_MISSING');
const core=source.slice(begin,end);
assert.match(core,/const mixedOriginal=!!namedOriginal/);
assert.match(core,/!\/\\p\{Mark\}\/u\.test\(value\)/);

const key=s=>String(s||'').trim().replace(/^["']|["']$/g,'').replace(/\s+/g,'').toLocaleLowerCase('en-US');
const families=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
const contains=(face,value)=>[...value].every(c=>/\s/u.test(c)||face.characterSet?.has(c.codePointAt(0)));
function resolveFont(registry,family,weight,style,value){
  const id=key(family), bold=weight==='bold',italic=style==='italic';
  const candidates=registry.faces.filter(f=>f.bold===bold&&f.italic===italic&&contains(f,value));
  return candidates.find(f=>!f.isFallback&&f.aliases.includes(id))||candidates.find(f=>f.isFallback)||null;
}
function resolveFontRuns(registry,family,weight,style,value){
  const chars=[...value];if(chars.length>2048)return null;
  const runs=[];
  for(const char of chars){
    const face=resolveFont(registry,family,weight,style,char);
    if(!face)return null;
    if(runs.length&&runs.at(-1).face.name===face.name)runs.at(-1).text+=char;
    else runs.push({text:char,face});
    if(runs.length>256)return null;
  }
  return runs;
}

function element(tag,text,attrs={}){
  const attributes={...attrs};
  let content=String(text);
  const node={localName:tag,children:[],
    getAttribute:name=>Object.hasOwn(attributes,name)?String(attributes[name]):null,
    hasAttribute:name=>Object.hasOwn(attributes,name),
    setAttribute(name,value){attributes[name]=String(value);},
    appendChild(child){this.children.push(child);},
    get textContent(){return content||this.children.map(x=>x.textContent).join('');},
    set textContent(value){content=String(value);this.children=[];}
  };
  node.ownerDocument={createElementNS:(_ns,name)=>element(name,'')};
  return node;
}
const testSafeTextRunSplit=Function(source.slice(source.indexOf('function safeTextRunSplit('),source.indexOf('function textDirectlyIn(el){'))+'\nreturn safeTextRunSplit;')();
const runner=Function('resolveFont','resolveFontRuns','splitFontFamilies','familyKey','missingCodepoint','safeTextRunSplit',
  `return function execute(el,fontRegistry){
    let changed=false;const substituteFamilies=new Set();const stack=[];
    const currentFamily=el.getAttribute('font-family')||'원본고딕';
    const currentWeight=el.getAttribute('font-weight')||'normal';
    const currentStyle=el.getAttribute('font-style')||'normal';
    const value=el.textContent;
    for(let once=0;once<1;once++){
    ${core}
    }
    return {ok:true,changed,substitutes:[...substituteFamilies],children:el.children};
  };`)(resolveFont,resolveFontRuns,families,key,(face,value)=>contains(face,value)?null:0x2605,testSafeTextRunSplit);

const alphabet='한글가나다라마바사ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
const local={name:'LocalA',family:'원본고딕',aliases:['원본고딕'],bold:false,italic:false,
  characterSet:new Set([...alphabet].map(x=>x.codePointAt(0)))};
const bundled={name:'BundledB',family:'나눔고딕',aliases:['나눔고딕'],isFallback:true,bold:false,italic:false,
  characterSet:new Set([...alphabet+'★◼\u0301'].map(x=>x.codePointAt(0)))};
const registry={faces:[local,bundled]};
const check=(text,attrs={},fontRegistry=registry)=>{
  const el=element('text',text,{'font-family':'원본고딕',...attrs});
  const result=runner(el,fontRegistry);
  return {el,...result};
};

test('partial glyph coverage preserves original local face for other characters',()=>{
 const r=check('한글★가');
 assert.equal(r.changed,true);
 assert.deepEqual(r.children.map(x=>[x.textContent,x.getAttribute('font-family')]),
   [['한글','원본고딕'],['★','나눔고딕'],['가','원본고딕']]);
 assert.deepEqual(r.substitutes,['원본고딕 → 나눔고딕']);
});
test('fully supported local phrase remains one original text node',()=>{
 const r=check('한글가나다');assert.equal(r.changed,false);assert.equal(r.children.length,0);
});
test('document without named local face preserves old bundled fallback',()=>{
 const r=check('한글★',{'font-family':'없는서체'});
 assert.equal(r.changed,false);assert.equal(r.children.length,0);
});
test('one missing combining mark does not split a grapheme cluster',()=>{
 const r=check('한\u0301글');assert.equal(r.changed,false);assert.equal(r.children.length,0);
});
test('explicit textLength keeps existing safe no-split behavior',()=>{
 const r=check('한글★',{'textLength':'100'});assert.equal(r.changed,false);
});
test('multi-position x/dx is never split by font substitution',()=>{
 for(const attrs of [{'x':'1 20'},{'dx':'1,2'},{'rotate':'0 0'}]){
   assert.equal(check('한글★',attrs).changed,false);
 }
});
test('nested text spans are never destructively flattened',()=>{
 const el=element('text','한글★',{'font-family':'원본고딕'});
 el.children.push(element('tspan','기존'));
 const r=runner(el,registry);assert.equal(r.changed,false);assert.equal(el.children.length,1);
});
test('disconnected document DOM does not trigger unsafe normalization',()=>{
 const el=element('text','한글★',{'font-family':'원본고딕'});delete el.ownerDocument;
 const r=runner(el,registry);assert.equal(r.changed,false);
});
test('never outputs undefined for font family if no text is split',()=>{
 const r=check('한글★');
 for(const span of r.children)assert.ok(span.getAttribute('font-family'));
});
test('very long run falls back without creating excessive SVG nodes',()=>{
 const r=check('한'.repeat(2200)+'★');assert.equal(r.changed,false);
});

test('unsupported glyph without a fallback face fails closed',()=>{
 const r=check('한글★',{}, {faces:[local]});
 assert.equal(r.ok,false);assert.equal(r.changed,undefined);
});
test('many alternating font runs retain bounded complexity',()=>{
 const r=check(('한★').repeat(140));
 assert.equal(r.changed,false);
});

// R66-DEV11: exercise the production branch, not just the helper predicate.
test('DEV11: centre-aligned text retains its original unsplit text',()=>{
 const r=check('한글★가',{'text-anchor':'middle'});
 assert.equal(r.changed,false);
 assert.equal(r.children.length,0);
});
test('DEV11: inherited right anchor blocks a partial font split',()=>{
 const parent=element('g','',{'text-anchor':'end'});
 const child=element('text','한글★가',{'font-family':'원본고딕'});
 child.parentElement=parent;
 const r=runner(child,registry);
 assert.equal(r.changed,false);
 assert.equal(r.children.length,0);
});
test('DEV11: complex emoji stays in one unsplit SVG text node',()=>{
 const extended={...bundled,characterSet:new Set([...alphabet+'★👩‍💻🇰🇷'].map(c=>c.codePointAt(0)))};
 const r=check('한글👩‍💻★',{}, {faces:[local,extended]});
 assert.equal(r.changed,false);
 assert.equal(r.children.length,0);
});
test('DEV11: normal Hangul and missing star still split safely',()=>{
 const r=check('한글★가');
 assert.equal(r.changed,true);
 assert.equal(r.children.length,3);
});

test('DEV39: a named bundled body face remains on Hangul, only unsupported punctuation uses another face',()=>{
 const named={name:'BodyFace',family:'학교안심 바른돋움',
  aliases:['학교안심바른돋움'],isFallback:true,bold:false,italic:false,
  characterSet:new Set([...('한글')].map(c=>c.codePointAt(0)))};
 const wide={name:'FullFallback',family:'보조 범용 서체',
  aliases:['보조범용서체'],isFallback:true,bold:false,italic:false,
  characterSet:new Set([...('한글‧')].map(c=>c.codePointAt(0)))};
 const fontRegistry={faces:[named,wide]};
 const r=check('한글‧',{'font-family':'학교안심 바른돋움'},fontRegistry);
 assert.equal(r.changed,true,'do not replace all original Hangul merely to support a punctuation glyph');
 assert.deepEqual(r.children.map(c=>[c.textContent,c.getAttribute('font-family')]),
  [['한글','학교안심 바른돋움'],['‧','보조 범용 서체']]);
 assert.ok(r.substitutes.includes('학교안심 바른돋움 → 보조 범용 서체'));
 assert.equal(r.substitutes.some(x=>x==='학교안심 바른돋움 → 학교안심 바른돋움'),false,
  'a retained named face must not be misreported as a substitution');
});
test('DEV39: do not split generic fallback text with no named source face',()=>{
 const named={name:'BodyFace',family:'학교안심 바른돋움',
  aliases:['학교안심바른돋움'],isFallback:true,bold:false,italic:false,
  characterSet:new Set([...('한글')].map(c=>c.codePointAt(0)))};
 const wide={name:'FullFallback',family:'보조 범용 서체',
  aliases:['보조범용서체'],isFallback:true,bold:false,italic:false,
  characterSet:new Set([...('한글‧')].map(c=>c.codePointAt(0)))};
 const r=check('한글‧',{'font-family':'미설치 서체'}, {faces:[named,wide]});
 assert.equal(r.changed,false);
 assert.equal(r.children.length,0);
});
test('DEV39: an explicit measured-width run is not split by font substitution',()=>{
 const named={name:'BodyFace',family:'학교안심 바른돋움',
  aliases:['학교안심바른돋움'],isFallback:true,bold:false,italic:false,
  characterSet:new Set([...('한글')].map(c=>c.codePointAt(0)))};
 const wide={name:'FullFallback',family:'보조 범용 서체',
  aliases:['보조범용서체'],isFallback:true,bold:false,italic:false,
  characterSet:new Set([...('한글‧')].map(c=>c.codePointAt(0)))};
 const r=check('한글‧',{'font-family':'학교안심 바른돋움','textLength':'72'}, {faces:[named,wide]});
 assert.equal(r.changed,false,'textLength geometry contract must not change');
});
