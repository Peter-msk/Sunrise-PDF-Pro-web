import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {describeConversionError,outputModeText} from '../src/user-output-copy.mjs';
import {sitePage} from '../../src/site-home.js';
import {publicPublicationRecord} from '../../src/public-release-copy.js';
import {updatesScript} from '../../src/site-updates.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('converter presentation is HTML + named CSS modules + JS, no inline styles',()=>{
 for(const name of ['converter','file-queue','responsive']){
  const path=new URL('../src/styles/'+name+'.css',import.meta.url);
  assert.ok(existsSync(path),name);
  assert.ok(readFileSync(path,'utf8').length>500,name);
  assert.match(html,new RegExp('href="\\./src/styles/'+name+'\\.css"'));
 }
 assert.doesNotMatch(html,/<style(?:\s|>)/i);
 assert.match(html,/type="module" src="\.\/src\/main\.js"/);
});
test('user title and rendered page contain no engineering revision or exposed QA control',()=>{
 assert.doesNotMatch(html,/build-revision|DEV[0-9]+|WASM|RHWP/);
 assert.doesNotMatch(main,/document\.title\s*\+=|buildLabel/);
 assert.match(html,/id="qa-export"[^>]*\bhidden\b/);
 assert.match(html,/id="preview"/);
 assert.match(html,/id="active-download"/);
 assert.match(html,/id="pdf-engine"/);
});
test('technical failures are rendered as actionable Korean, original exception data kept separately',()=>{
 for(const code of ['DIRECT_PDF_TEXT_FONT_MISSING','PDF_OUTPUT_TRAILER_INCOMPLETE','SVG_RENDER_SOURCE_CHARS_LIMIT']){
  const msg=describeConversionError(code);
  assert.match(msg,/[가-힣]/);
  assert.doesNotMatch(msg,/DIRECT_PDF|PDF_OUTPUT_|SVG_RENDER/);
 }
 assert.equal(outputModeText['direct-trial'],'정밀 변환');
 assert.equal(describeConversionError('문서가 없습니다.'),'문서가 없습니다.');
});
test('public homepage avoids internal engine/release text',()=>{
 for(const section of ['home','features']){
  const page=sitePage(section);
  assert.doesNotMatch(page,/DEV[0-9]+|WASM|RHWP|기존 변환 엔진|글꼴 대체 정보를 확인/);
  assert.match(page,/href="\/local\/"/);
 }
});
test('public updates hide internal build labels without modifying feed payload',async()=>{
 const dom=new JSDOM('<!doctype html><body class="pro-updates-local"><details id="pro-notice-details"></details><details id="pro-release-details"></details><section id="pro-notice-items"></section><section id="pro-release-items"></section></body>',{url:'https://sunrise.test/',runScripts:'outside-only'});
 const items=[{title:'DEV62 PDF 변환 개선',body:'R66 QA 검증 완료',first_published_at:1700000000}];
 dom.window.matchMedia=()=>({matches:false});
 dom.window.fetch=async()=>({ok:true,json:async()=>({announcements:[],releases:items})});
 try{
  dom.window.eval(updatesScript);
  await new Promise(resolve=>setTimeout(resolve,0));
  const rendered=dom.window.document.getElementById('pro-release-items').textContent;
  assert.match(rendered,/PDF 변환 개선/);
  assert.doesNotMatch(rendered,/DEV62|R66|\bQA\b/);
  assert.equal(items[0].title,'DEV62 PDF 변환 개선');
 }finally{dom.window.close();}
});

test('public release API presentation never exposes internal codes; admin copy is unchanged',()=>{
 const release={kind:'release',title:'DEV62 변환 개선',body:'R66 QA 안정화 WASM 작업'};
 const clean=publicPublicationRecord(release);
 assert.equal(clean.title,'변환 개선');
 assert.equal(clean.body,'안정화 작업');
 assert.equal(release.title,'DEV62 변환 개선');
 const server=readFileSync(new URL('../../src/admin/handler.js',import.meta.url),'utf8');
 assert.match(server,/rows\.results\|\|\[\]\)\.map\(publicPublicationRecord\)/);
 assert.match(server,/const r=await db\.prepare\('SELECT \* FROM pro_publications/);
});
