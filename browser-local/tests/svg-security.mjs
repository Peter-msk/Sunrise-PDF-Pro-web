import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSafeSvg} from '../src/svg-security.js';
function node(name,values={},children=[]){
 const el={localName:name,namespaceURI:'http://www.w3.org/2000/svg',children,
  attributes:Object.entries(values).map(([name,value])=>({name,localName:name.split(':').at(-1),value})),
  querySelectorAll(){return this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);},
  remove(){this.removed=true;}};
 return el;
}
function parse(root,extra={}){
 return {parseFromString(){return {documentElement:root,querySelector:()=>null,childNodes:[],...extra};}};
}
test('SVG root event handlers are rejected at the same boundary as child handlers',()=>{
 const root=node('svg',{onload:'alert(1)'});
 assert.throws(()=>parseSafeSvg('',parse(root)),/이벤트/);
});
test('relative, protocol-relative and file image references never escape the document',()=>{
 for(const href of ['../private.png','//host.example/image','file:///private.png','https://host.example/image'])
  assert.throws(()=>parseSafeSvg('',parse(node('svg',{},[node('image',{href})]))),/외부 자원/);
});
test('embedded image bytes and local paint references remain supported',()=>{
 const image=node('image',{'xlink:href':'data:image/png;base64, iVBORw0KGgo='});
 const root=node('svg',{},[image,node('path',{fill:'url(#paint)'})]);
 assert.equal(parseSafeSvg('',parse(root)),root);
 assert.equal(image.attributes[0].value,'data:image/png;base64,iVBORw0KGgo=');
});
test('embedded SVG and executable foreign namespaces cannot enter the print frame',()=>{
 assert.throws(()=>parseSafeSvg('',parse(node('svg',{},[node('image',{href:'data:image/svg+xml;base64,PHN2Zy8+'})]))),/외부 자원/);
 const child=node('div');child.namespaceURI='http://www.w3.org/1999/xhtml';
 assert.throws(()=>parseSafeSvg('',parse(node('svg',{},[child]))),/요소/);
 assert.throws(()=>parseSafeSvg('',parse(node('svg',{},[node('script')]))),/요소/);
});
test('CSS external URLs, escapes and processing instructions fail closed',()=>{
 for(const fill of ['url(../private.svg)','url(data:image/svg+xml;base64,PHN2Zy8+)','u\\72l(https://host.example/a)','u/**/rl(../private.svg)'])
  assert.throws(()=>parseSafeSvg('',parse(node('svg',{fill}))),/스타일|외부 자원/);
 assert.throws(()=>parseSafeSvg('',parse(node('svg'),{childNodes:[{nodeType:7}]})),/처리 지시문/);
 assert.throws(()=>parseSafeSvg('',parse(node('svg'),{doctype:{}})),/형식/);
});
test('ordinary SVG style comments do not block a safe static page',()=>{
 const style=node('style');style.textContent='/* local colors */ path {fill:#123456}';
 const root=node('svg',{},[style]);assert.equal(parseSafeSvg('',parse(root)),root);
});
test('animation is removed without changing static SVG content',()=>{
 const animation=node('animate',{attributeName:'href',to:'https://host.example/image'});
 const root=node('svg',{},[animation,node('path',{d:'M0 0L1 1'})]);
 assert.equal(parseSafeSvg('',parse(root)),root);assert.equal(animation.removed,true);
});
