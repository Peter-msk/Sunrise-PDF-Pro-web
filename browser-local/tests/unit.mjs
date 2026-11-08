import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {familyKey,splitFontFamilies,requestedStyle,resolveFont,resolveFontRuns,missingCodepoint,loadPdfFonts,installMeasureFonts} from '../src/pdf-fonts.js';
import {preflightProfessionalSvg,tryProfessionalDocument,localPngBytes} from '../src/svg-professional.js';
import {parseSvgNumberList,validateSvgTransform,validateTextGeometry} from '../src/svg-text-geometry.js';
import {flattenLocalSvgStyles} from '../src/svg-style.js';

const source=readFileSync(new URL('../src/converter.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const korean='한글';
const face=(family='맑은 고딕',bold=false,italic=false)=>({name:'Fake'+(bold?'Bold':'Regular')+(italic?'Italic':''),
 family,aliases:[familyKey(family)],bold,italic,
 characterSet:new Set([...korean+'A B'].map(c=>c.codePointAt(0))),bytes:new Uint8Array([1,2,3])});
const f={faces:[face(),face('맑은 고딕',true)]};
function el(tag,attrs={},children=[],text=''){
 const data={...attrs};
 const node={nodeType:1,localName:tag,children,childNodes:[...(text?[{nodeType:3,nodeValue:text}]:[]),...children],
  textContent:text+children.map(c=>c.textContent).join(''),
  getAttribute:k=>Object.hasOwn(data,k)?data[k]:null,
  hasAttribute:k=>Object.hasOwn(data,k),setAttribute:(k,v)=>{data[k]=String(v)},
  removeAttribute:k=>{delete data[k]},
  remove(){const parent=this.parentNode;if(!parent)return;for(const list of [parent.children,parent.childNodes]){const i=list.indexOf(this);if(i>=0)list.splice(i,1);}}};
 for(const child of children)child.parentNode=node;
 Object.defineProperty(node,'attributes',{get:()=>Object.entries(data).map(([name,value])=>({name,value:String(value)}))});
 return node;
}
async function withDOM(root,callback){
 const previousParser=globalThis.DOMParser,previousSerializer=globalThis.XMLSerializer;
 globalThis.DOMParser=class{parseFromString(){return {documentElement:root,doctype:null,querySelector:()=>null};}};
 globalThis.XMLSerializer=class{serializeToString(){return 'normalized-svg-placeholder';}};
 try{return await callback();}finally{globalThis.DOMParser=previousParser;globalThis.XMLSerializer=previousSerializer;}
}
const checked={svg:'<svg/>',width:794,height:1123};

test('no hard size limit at file input or HWP decoder entry',()=>{
 for(const s of [source,main,html])assert.doesNotMatch(s,/MAX_FILE\s*=|file\.size\s*>\s*20\s*\*|최대\s*20MiB|20MiB 이하/);
 assert.match(source,/file\.slice\(0,8\)\.arrayBuffer\(\)/);
 assert.match(source,/MAX_PAGES=120/);
 assert.match(source,/DETAIL_MAX_PIXELS=12_000_000/);
 assert.match(main,/fontFiles,engine/);
 assert.match(html,/<input id="pdf-font"[^>]*multiple/);
});

test('HWP conversion rejects image export and releases HWP instance',()=>{
 assert.match(source,/options\.engine==='professional'/);
 assert.match(source,/tryProfessionalDocument\(doc,count/);
 assert.match(source,/allowRasterFallback:false/);
 assert.doesNotMatch(source,/vectorFallbackReason=/);
 assert.match(source,/doc\.free\(\)/);
 assert.doesNotMatch(source,/legacy-vector'/);
 assert.doesNotMatch(source,/pdf\.embedPng|renderMode:'raster'/);
 assert.match(source,/options\.engine!=='professional'/);
});

test('only object-preserving HWP export loads local font registry',()=>{
 assert.match(source,/if\(options\.engine==='professional'\)/);
 assert.doesNotMatch(source,/pdf\.embedFont/);
 assert.doesNotMatch(source,/appendVectorPage/);
});

test('font-family parser preserves quoted names; numeric weight and italic classified',()=>{
 assert.deepEqual(splitFontFamilies('"맑은 고딕", Arial, serif'),['"맑은 고딕"','Arial','serif']);
 assert.equal(familyKey('"Ｍａｌｇｕｎ Gothic"'),'malgungothic');
 assert.deepEqual(requestedStyle('700','italic'),{bold:true,italic:true});
 assert.deepEqual(requestedStyle('normal','normal'),{bold:false,italic:false});
 assert.equal(requestedStyle('bolder','normal'),null);
});

test('matching Unicode font family and weight are selected exactly',()=>{
 assert.equal(resolveFont(f,'"맑은 고딕"').name,'FakeRegular');
 assert.equal(resolveFont(f,'맑은 고딕','bold').name,'FakeBold');
 assert.equal(resolveFont(f,'맑은 고딕','400','italic'),null);
 assert.equal(resolveFont(f,'휴먼명조, 맑은 고딕'),null); // no silent second-family substitution
 assert.equal(missingCodepoint(f.faces[0],korean),null);
 assert.equal(missingCodepoint({standard:true},korean),'한'.codePointAt(0));
 assert.equal(missingCodepoint(f.faces[0],'漢字'),'漢'.codePointAt(0));
});

test('R40 font substitution handles enterprise HWP family lists without adding font files',async()=>{
 const sans={...face('Nanum Gothic'),name:'BundledSans',isFallback:true,genericFamily:'sans'};
 const serif={...face('Nanum Myeongjo'),name:'BundledSerif',isFallback:true,genericFamily:'serif'};
 const registry={faces:[sans,serif]};
 const screenshot="'굴림','Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR ExtraLight'";
 assert.equal(resolveFont(registry,screenshot,'normal','normal',korean).name,'BundledSans');
 assert.equal(resolveFont(registry,"'굴림체','HY굴림체','GulimChe','D2Coding'",'normal','normal',korean).name,'BundledSans');
 assert.equal(resolveFont(registry,'알 수 없는 업무용 글꼴','normal','normal',korean).name,'BundledSans');
 assert.equal(resolveFont(registry,'HY명조','normal','normal',korean).name,'BundledSerif');
 assert.equal(resolveFont(registry,'굴림','normal','italic',korean).name,'BundledSans');
 const text=el('text',{'font-family':screenshot,'font-style':'italic'},[],korean);
 const root=el('svg',{},[text]);
 await withDOM(root,()=>{
  const result=preflightProfessionalSvg(checked,{fontRegistry:registry});
  assert.equal(result.ok,true);
  assert.equal(text.getAttribute('font-family'),'Nanum Gothic');
  assert.equal(text.getAttribute('font-style'),'normal');
  assert.deepEqual(result.substituteFamilies,["'굴림' → Nanum Gothic"]);
  assert.equal(result.svg,'normalized-svg-placeholder');
 });
 assert.equal(resolveFont(registry,screenshot,'normal','normal','漢'),null);
});

test('R43 mixed glyph coverage splits one text run without losing Unicode characters',()=>{
 const serif={...face('Nanum Myeongjo'),isFallback:true,genericFamily:'serif'};
 serif.characterSet=new Set(['한','글'].map(c=>c.codePointAt(0)));
 const symbol={...face('Symbols'),name:'FakeSymbols',isFallback:true,genericFamily:'symbol'};
 symbol.characterSet=new Set(['①'].map(c=>c.codePointAt(0)));
 const runs=resolveFontRuns({faces:[serif,symbol]},'HY신문명조','normal','normal','한①글');
 assert.deepEqual(runs?.map(r=>r.text),['한','①','글']);
 assert.equal(resolveFontRuns({faces:[serif,symbol]},'HY신문명조','normal','normal','한★글'),null);
});

test('multiple local font files are parsed, variants tracked, never fetched',async()=>{
 const files=['Malgun-Regular.ttf','Malgun-Bold.otf'].map((name,i)=>({name,async arrayBuffer(){return new Uint8Array([i,1,2,3]).buffer;}}));
 const parser={create:bytes=>({familyName:'맑은 고딕',subfamilyName:bytes[0]?'Bold':'Regular',
  characterSet:[...korean+'A'].map(c=>c.codePointAt(0))})};
 const registry=await loadPdfFonts(files,parser);
 assert.equal(registry.faces.length,2);
 assert.deepEqual(registry.faces.map(x=>x.bold),[false,true]);
 assert.equal(resolveFont(registry,'맑은 고딕','bold').name,'SunriseFont2');
 await assert.rejects(()=>loadPdfFonts([...files,files[0]],parser),/중복 선택/);
 await assert.rejects(()=>loadPdfFonts([{name:'font.woff2',arrayBuffer:async()=>new ArrayBuffer(3)}],parser),/TTF\/OTF/);
});

test('plain ASCII SVG can use standard Helvetica, Hangul without font rejects',async()=>{
 const root=el('svg',{xmlns:'http://www.w3.org/2000/svg'},[el('text',{},[],'HELLO')]);
 await withDOM(root,()=>{
  assert.equal(preflightProfessionalSvg(checked).ok,true);
  root.children[0].childNodes=[{nodeType:3,nodeValue:korean}];
  assert.equal(preflightProfessionalSvg(checked).reason,'FONT_GLYPH_MISSING');
  assert.equal(preflightProfessionalSvg(checked,{fontRegistry:f}).ok,true);
 });
});

test('nested tspan verifies glyphs once per direct text run and preserves SVG',async()=>{
 const span=el('tspan',{'font-weight':'bold'},[],korean);
 const root=el('svg',{},[el('text',{'font-family':'맑은 고딕'},[span],'A')]);
 await withDOM(root,()=>{
  const out=preflightProfessionalSvg(checked,{fontRegistry:f});
  assert.equal(out.ok,true);
  assert.equal(out.textRuns,2);
  assert.equal(out.hasText,true);
 });
});

test('inline SVG style becomes attributes before PDFKit; unsupported style fails closed',async()=>{
 const text=el('text',{style:'font-family: 맑은 고딕; font-weight: bold; fill: #123456'},[],korean);
 const root=el('svg',{},[text]);
 await withDOM(root,()=>{
  const out=preflightProfessionalSvg(checked,{fontRegistry:f});
  assert.equal(out.ok,true);
  assert.equal(out.svg,'normalized-svg-placeholder');
  assert.equal(text.hasAttribute('style'),false);
  assert.equal(text.getAttribute('fill'),'#123456');
  assert.equal(text.getAttribute('font-weight'),'bold');
  text.setAttribute('style','filter: url(#blur)');
  assert.equal(preflightProfessionalSvg(checked,{fontRegistry:f}).ok,false);
 });
});

test('no external SVG images, CSS selectors, unsupported filters, or event handlers',async()=>{
 const img=el('image',{href:'https://external.example/s.gif'});
 const root=el('svg',{},[img]);
 await withDOM(root,()=>{
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_EXTERNAL_RESOURCE');
  img.setAttribute('href','data:image/svg+xml;base64,PHN2Zy8+');
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_EXTERNAL_RESOURCE');
  img.setAttribute('href','data:image/png;base64,iVBORw0KGgo=');
  assert.equal(preflightProfessionalSvg(checked).ok,true);
  img.setAttribute('filter','url(#blur)');
  const unsupportedFilter=preflightProfessionalSvg(checked);
  assert.equal(unsupportedFilter.reason,'SVG_UNSAFE_ATTRIBUTE');
  assert.equal(unsupportedFilter.unsupportedAttribute,'filter');
  img.removeAttribute('filter');img.setAttribute('onclick','evil()');
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_UNSAFE_ATTRIBUTE');
  img.removeAttribute('onclick');img.setAttribute('class','external-style');
  assert.equal(preflightProfessionalSvg(checked).reason,'CLASS_STYLE_UNRESOLVED');
 });
});

test('R43 neutral SVG presentation defaults are safe but filters and event handlers remain blocked',async()=>{
 const root=el('svg',{},[el('rect',{filter:'none','text-rendering':'auto',externalResourcesRequired:'false'})]);
 await withDOM(root,()=>{
  assert.equal(preflightProfessionalSvg(checked).ok,true);
  assert.equal(root.children[0].hasAttribute('filter'),false);
  root.children[0].setAttribute('filter','url(#hiddenFilter)');
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_UNSAFE_ATTRIBUTE');
  root.children[0].removeAttribute('filter');
  root.children[0].setAttribute('onclick','alert(1)');
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_UNSAFE_ATTRIBUTE');
 });
 const image=el('image',{href:'data:image/png;base64,AAAA//AA'});
 await withDOM(el('svg',{},[image]),()=>{
  assert.equal(preflightProfessionalSvg(checked).ok,true);
 });
});

test('embedded image base64 containing double slash is data, while network links remain blocked',async()=>{
 const img=el('image',{href:'data:image/png;base64,////AAAA'});
 await withDOM(el('svg',{},[img]),()=>{
  assert.equal(preflightProfessionalSvg(checked).ok,true);
  img.setAttribute('href','//external.example/image.png');
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_EXTERNAL_RESOURCE');
 });
});

test('local arrow markers are preserved and external marker references are rejected',async()=>{
 const path=el('path',{d:'M0 0L20 20','marker-end':'url(#arrow)'});
 const marker=el('marker',{id:'arrow',markerWidth:'8',markerHeight:'8'},[el('path',{d:'M0 0L8 4L0 8Z'})]);
 await withDOM(el('svg',{},[el('defs',{},[marker]),path]),()=>{
  assert.equal(preflightProfessionalSvg(checked).ok,true);
  path.setAttribute('marker-end','url(//external.example/arrow.svg)');
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_UNSAFE_ATTRIBUTE');
 });
});

test('professional vector success registers selected fonts and reports only text candidates',async()=>{
 const root=el('svg',{},[el('text',{'font-family':'맑은 고딕'},[],korean)]);
 await withDOM(root,async()=>{
  const state={registered:[],called:0};let finish;
  const pending=new Promise(resolve=>finish=resolve);
  class FakePDF{
   addPage(o){state.page=o;return this;}
   registerFont(name,bytes){state.registered.push(name);assert(bytes.byteLength>0);}
   end(){finish(new Blob(['%PDF-1.7\n'+'x'.repeat(200)],{type:'application/pdf'}));}
   destroy(){state.destroyed=true;finish(new Blob([]));}
  }
  const result=await tryProfessionalDocument({renderPageSvgWithProfile:()=>'<svg/>'},1,{
   checkedSvg:()=>checked,rasterPage:async()=>({blob:new Blob(['preview'])}),fontRegistry:f,
   loadLibraries:async()=>({PDFDocument:FakePDF,registerStdFonts:()=>{},Helvetica:{},toBlob:()=>pending,
    SVGtoPDF:(doc,svg,x,y,opts)=>{
      state.called++;assert.equal(opts.width,595.5);
      assert.equal(opts.fontCallback('맑은 고딕',false,false),'FakeRegular');
      assert.equal(opts.fontCallback('맑은 고딕',true,false),'FakeBold');
    }})
  });
  assert.equal(result.renderMode,'professional');
  assert.equal(result.vectorPages,1);
  assert.equal(result.rasterPages,0);
  assert.equal(result.textCandidatePages,1);
  assert.equal(result.searchablePages,null); // not verified by a PDF text extractor
  assert.deepEqual(state.registered,['FakeRegular','FakeBold']);
  assert.equal(state.called,1);
 });
});

test('professional PDF atomically rejects warnings and destroys incomplete output',async()=>{
 const root=el('svg',{},[el('path',{d:'M0 0L10 10'})]);
 await withDOM(root,async()=>{
  let destroyed=0;
  class FakePDF{addPage(){}destroy(){destroyed++}end(){}}
  await assert.rejects(()=>tryProfessionalDocument({renderPageSvgWithProfile:()=>'<svg/>'},1,{
   checkedSvg:()=>checked, rasterPage:async()=>({blob:new Blob(['preview'])}),
   loadLibraries:async()=>({PDFDocument:FakePDF,registerStdFonts:()=>{},Helvetica:{},
    toBlob:()=>new Promise(()=>{}),SVGtoPDF:(doc,svg,x,y,opts)=>opts.warningCallback('unsupported effect')})
  }),/PROFESSIONAL_SVG_WARNING/);
  assert.equal(destroyed,1);
 });
});

test('professional renderer refuses malformed PDF even if output helper resolves',async()=>{
 const root=el('svg',{},[el('path',{d:'M0 0L10 10'})]);
 await withDOM(root,async()=>{
  let ended=0,destroyed=0;
  class FakePDF{addPage(){}end(){ended++}destroy(){destroyed++}}
  await assert.rejects(()=>tryProfessionalDocument({renderPageSvgWithProfile:()=>'<svg/>'},1,{
   checkedSvg:()=>checked,rasterPage:async()=>({blob:new Blob(['preview'])}),
   loadLibraries:async()=>({PDFDocument:FakePDF,registerStdFonts:()=>{},Helvetica:{},
    toBlob:()=>Promise.resolve(new Blob(['NOTPDF'.repeat(30)])),SVGtoPDF:()=>{}})
  }),/PROFESSIONAL_PDF_INVALID_HEADER/);
  assert.equal(ended,1);assert.equal(destroyed,1);
 });
});


test('user font faces are installed for rhwp measurements and removed afterward',async()=>{
 const registered=new Set();
 const fontSet={add:f=>registered.add(f),delete:f=>registered.delete(f)};
 class FakeFontFace{
  constructor(family,bytes,options){this.family=family;this.options=options;this.bytes=bytes;}
  async load(){return this;}
 }
 const release=await installMeasureFonts(f,undefined,fontSet,FakeFontFace);
 assert.equal(registered.size,2);
 assert.deepEqual([...registered].map(x=>x.options.weight),['400','700']);
 release();
 assert.equal(registered.size,0);
});

test('partially loaded fonts are removed when font loading fails',async()=>{
 const registered=new Set();
 const fontSet={add:f=>registered.add(f),delete:f=>registered.delete(f)};
 let n=0;
 class FakeFontFace{async load(){if(++n===2)throw Error('invalid font');return this;}}
 await assert.rejects(()=>installMeasureFonts(f,undefined,fontSet,FakeFontFace),/invalid font/);
 assert.equal(registered.size,0);
});

test('cancelled font installation leaves no browser font registrations',async()=>{
 const installed=new Set(),ctrl=new AbortController();
 const fontSet={add:f=>installed.add(f),delete:f=>installed.delete(f)};
 class FakeFontFace{async load(){ctrl.abort();return this;}}
 await assert.rejects(()=>installMeasureFonts(f,ctrl.signal,fontSet,FakeFontFace),{name:'AbortError'});
 assert.equal(installed.size,0);
});


test('R36 positional text arrays preserve SVG glyph positions and reject corrupt data',()=>{
 assert.deepEqual(parseSvgNumberList('2, -3.5 1e2'),[2,-3.5,100]);
 assert.deepEqual(parseSvgNumberList('5px -2px',{allowPx:true}),[5,-2]);
 assert.equal(parseSvgNumberList('1em', {allowPx:true}),null);
 assert.equal(parseSvgNumberList('NaN'),null);
 assert.equal(parseSvgNumberList('1000001'),null);
 assert.equal(validateSvgTransform('translate(10 20) rotate(15,12,20) scale(1.5)'),true);
 assert.equal(validateSvgTransform('matrix(1 0 0 1 5 10)'),true);
 assert.equal(validateSvgTransform('perspective(1)'),false);
 assert.equal(validateSvgTransform('translate(foo)'),false);
 assert.equal(validateSvgTransform('rotate(10 20)'),false);
 const text=el('text',{x:'3',y:'8',dx:'0',dy:'0',
  'letter-spacing':'0px','word-spacing':'0','text-anchor':'middle',transform:'rotate(13)'},[],'AB');
 assert.equal(validateTextGeometry(text).ok,true);
 assert.equal(validateTextGeometry(text).positionedRuns,4);
 text.setAttribute('x','3 5 7');
 assert.equal(validateTextGeometry(text).reason,'TEXT_POSITION_LIST_INVALID_x');
 text.setAttribute('x','3');text.setAttribute('rotate','3,3');
 assert.equal(validateTextGeometry(text).reason,'GLYPH_ROTATION_UNSUPPORTED');
 text.removeAttribute('rotate');text.setAttribute('textLength','100');
 assert.equal(validateTextGeometry(text).ok,true);
});

test('R43 SVG textLength accepts bounded multi-character Korean while retaining source geometry',()=>{
 const one=el('text',{textLength:'9.1333',lengthAdjust:'spacingAndGlyphs'},[],'C');
 assert.equal(validateTextGeometry(one).ok,true);
 for(const bad of ['0','-1','10%','20000','NaN']){
  one.setAttribute('textLength',bad);
  assert.equal(validateTextGeometry(one).reason,'TEXT_LENGTH_ADJUST_UNSUPPORTED');
 }
 one.setAttribute('textLength','8');one.setAttribute('lengthAdjust','spacing');
 assert.equal(validateTextGeometry(one).ok,true);
 const multi=el('text',{textLength:'80',lengthAdjust:'spacingAndGlyphs'},[],'한글문서');
 assert.equal(validateTextGeometry(multi).ok,true);
 const spaced=el('tspan',{textLength:'120',lengthAdjust:'spacing'},[],'PDF TEXT');
 assert.equal(validateTextGeometry(spaced).ok,true);
 const nested=el('text',{textLength:'80',lengthAdjust:'spacingAndGlyphs'},[el('tspan',{},[],'A')],'A');
 assert.equal(validateTextGeometry(nested).ok,true);
 nested.children[0].setAttribute('dx','5');
 assert.equal(validateTextGeometry(nested).reason,'TEXT_LENGTH_ADJUST_UNSUPPORTED');
 multi.setAttribute('lengthAdjust','unknown');
 assert.equal(validateTextGeometry(multi).ok,false);
});

test('R36 preflight conservatively routes unsupported glyph transforms to page raster',async()=>{
 const span=el('tspan',{dx:'1',rotate:'45'},[],'AB');
 const root=el('svg',{},[el('text',{'font-family':'맑은 고딕'},[span],'A')]);
 await withDOM(root,()=>{
  const bad=preflightProfessionalSvg(checked,{fontRegistry:f});
  assert.equal(bad.reason,'GLYPH_ROTATION_UNSUPPORTED');
  span.removeAttribute('rotate');
  assert.equal(preflightProfessionalSvg(checked,{fontRegistry:f}).ok,true);
  assert.equal(preflightProfessionalSvg(checked,{fontRegistry:f}).positionedRuns,1);
 });
});

test('R36 professional renderer keeps eligible pages vector and only rasterizes rejected pages',async()=>{
 const text=el('text',{'font-family':'맑은 고딕',x:'10',y:'20'},[],korean);
 const root=el('svg',{},[text]);
 await withDOM(root,async()=>{
  const pages=['first','second','third'];let index=0,finish;
  const stats={pages:[],images:[],svgCalls:0,rasterCalls:0};
  const pending=new Promise(ok=>finish=ok);
  class FakePDF{
   registerFont(){}
   addPage(o){stats.pages.push(o);return this;}
   image(source,x,y,options){stats.images.push({source,x,y,options});}
   end(){finish(new Blob(['%PDF-1.7\n'+'v'.repeat(300)],{type:'application/pdf'}));}
   destroy(){stats.destroyed=true;finish(new Blob([]));}
  }
  const result=await tryProfessionalDocument({renderPageSvgWithProfile:i=>pages[i]},3,{
   checkedSvg:()=>{
    if(++index===2)text.setAttribute('class','unsupported-rule');
    else text.removeAttribute('class');
    return checked;
   },
   rasterPage:async()=>{stats.rasterCalls++;return {blob:new Blob(['png'],{type:'image/png'})};},
   allowRasterFallback:true,
   imageBytes:async()=>new Uint8Array([137,80,78,71,13,10,26,10,0]),
   fontRegistry:f,
   loadLibraries:async()=>({PDFDocument:FakePDF,registerStdFonts:()=>{},Helvetica:{},toBlob:()=>pending,
    SVGtoPDF:()=>{stats.svgCalls++;}})
  });
  assert.equal(result.renderMode,'mixed');
  assert.deepEqual([result.vectorPages,result.rasterPages,result.textCandidatePages],[2,1,2]);
  assert.deepEqual(result.fallbackPages,[{page:2,reason:'CLASS_STYLE_UNRESOLVED'}]);
  assert.equal(stats.pages.length,3);
  assert.equal(stats.images.length,1);
  assert.equal(stats.svgCalls,2);
  assert.equal(stats.rasterCalls,2); // fallback page + first-page preview
  assert.equal(result.searchablePages,null);
 });
});

test('R36 all-unsupported professional pages are explicitly classified as raster',async()=>{
 const root=el('svg',{},[el('rect',{class:'complex-css'})]);
 await withDOM(root,async()=>{
  let finish;
  const pending=new Promise(ok=>finish=ok);
  class FakePDF{
   registerFont(){}addPage(){}image(){}
   end(){finish(new Blob(['%PDF-1.7\n'+'i'.repeat(150)],{type:'application/pdf'}));}
   destroy(){finish(new Blob([]));}
  }
  const result=await tryProfessionalDocument({renderPageSvgWithProfile:()=>'<svg/>'},2,{
   checkedSvg:()=>checked,
   rasterPage:async()=>({blob:new Blob(['png'],{type:'image/png'})}),
   allowRasterFallback:true,
   imageBytes:async()=>new Uint8Array([137,80,78,71,13,10,26,10,0]),
   loadLibraries:async()=>({PDFDocument:FakePDF,registerStdFonts:()=>{},Helvetica:{},toBlob:()=>pending,SVGtoPDF:()=>{throw Error('should never render vector');}})
  });
  assert.equal(result.renderMode,'raster');
  assert.deepEqual([result.vectorPages,result.rasterPages],[0,2]);
  assert.equal(result.fallbackPages.length,2);
 });
});

test('R36 local PNG bytes avoid base64 copy and reject invalid images/cancellation',async()=>{
 const signature=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
 assert.deepEqual(await localPngBytes(new Blob([signature],{type:'image/png'})),signature);
 await assert.rejects(()=>localPngBytes(new Blob(['x'],{type:'image/jpeg'})),/PNG_IMAGE_TYPE_INVALID/);
 await assert.rejects(()=>localPngBytes(new Blob(['x'],{type:'image/png'})),/PNG_IMAGE_SIGNATURE_INVALID/);
 const c=new AbortController();c.abort();
 await assert.rejects(()=>localPngBytes(new Blob([signature],{type:'image/png'}),c.signal),{name:'AbortError'});
});


test('R37 local SVG CSS classes become safe presentation attributes',async()=>{
 const css=el('style',{},[],'text.label { fill: #224466; font-family: 맑은 고딕; } .label { font-weight: bold; }');
 const text=el('text',{class:'label'},[],korean);
 const root=el('svg',{},[css,text]);
 await withDOM(root,()=>{
  const result=preflightProfessionalSvg(checked,{fontRegistry:f});
  assert.equal(result.ok,true);
  assert.equal(result.svg,'normalized-svg-placeholder');
  assert.equal(root.children.includes(css),false);
  assert.equal(text.getAttribute('class'),null);
  assert.equal(text.getAttribute('fill'),'#224466');
  assert.equal(text.getAttribute('font-family'),'맑은 고딕');
  assert.equal(text.getAttribute('font-weight'),'bold');
 });
});

test('R37 SVG stylesheet cascade honors ID specificity and inline style priority',async()=>{
 const style=el('style',{},[], 'text { fill: #111111; } .label { fill: #222222; } #main { fill: #333333; }');
 const text=el('text',{id:'main',class:'label',style:'fill: #abcdef',
   'font-family':'맑은 고딕'},[],korean);
 const root=el('svg',{},[style,text]);
 await withDOM(root,()=>{
  const out=preflightProfessionalSvg(checked,{fontRegistry:f});
  assert.equal(out.ok,true);
  assert.equal(text.getAttribute('fill'),'#abcdef');
  assert.equal(text.getAttribute('style'),null);
 });
});

test('R37 SVG styles reject unsupported selectors, external URLs and unresolved classes',async()=>{
 const css=el('style',{},[],'.label:hover { fill: red; }');
 const text=el('text',{class:'label'},[],'ABC');
 const root=el('svg',{},[css,text]);
 await withDOM(root,()=>{
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_STYLESHEET_UNSUPPORTED');
  css.textContent='.label { fill: url(https://evil.example/pixel); }';
  assert.equal(preflightProfessionalSvg(checked).reason,'SVG_STYLESHEET_UNSUPPORTED');
  css.textContent='.unrelated { fill: #123; }';
  assert.equal(preflightProfessionalSvg(checked).reason,'CLASS_STYLE_UNRESOLVED');
  css.textContent='text.label { fill: #123; }';
  assert.equal(preflightProfessionalSvg(checked).ok,true);
 });
});

test('R37 CSS selectors reject linked stylesheets and large styles',()=>{
 const style=el('style',{},[], '@import url(https://site.example/font.css);');
 const root=el('svg',{},[style,el('rect')]);
 assert.equal(flattenLocalSvgStyles(root).reason,'SVG_STYLESHEET_UNSUPPORTED');
 style.textContent='.a { fill: #000; }'.repeat(4000);
 assert.equal(flattenLocalSvgStyles(root).reason,'SVG_STYLESHEET_TOO_LARGE');
});

test('R37 unverified character-position lists or spacing route to page fallback',async()=>{
 const text=el('text',{x:'10 12','font-family':'맑은 고딕'},[],'AB');
 assert.equal(validateTextGeometry(text).reason,'TEXT_MULTI_GLYPH_POSITION_UNVERIFIED');
 text.setAttribute('x','10');text.setAttribute('letter-spacing','2px');
 assert.equal(validateTextGeometry(text).reason,'TEXT_SPACING_FIDELITY_UNVERIFIED');
 text.setAttribute('letter-spacing','0px');
 assert.equal(validateTextGeometry(text).ok,true);
 const root=el('svg',{},[text]);
 await withDOM(root,()=>{
  text.setAttribute('dx','1,2');
  assert.equal(preflightProfessionalSvg(checked,{fontRegistry:f}).reason,'TEXT_MULTI_GLYPH_POSITION_UNVERIFIED');
 });
});


test('R37 multiple embedded styles respect source order and avoid unsafe functions',async()=>{
 const first=el('style',{},[],'.a { stroke: #111111; }');
 const second=el('style',{},[],'.a { stroke: #222222; stroke-width: 2; }');
 const line=el('line',{class:'a'});
 const root=el('svg',{},[first,line,second]);
 await withDOM(root,()=>{
  const result=preflightProfessionalSvg(checked);
  assert.equal(result.ok,true);
  assert.equal(line.getAttribute('stroke'),'#222222');
  assert.equal(line.getAttribute('stroke-width'),'2');
  assert.deepEqual(root.children,[line]);
 });
 const unsafe=el('style',{},[],'.a { fill: var(--external); }');
 const badRoot=el('svg',{},[unsafe,el('rect',{class:'a'})]);
 assert.equal(flattenLocalSvgStyles(badRoot).reason,'SVG_STYLESHEET_UNSUPPORTED');
});

test('R37 unsupported stylesheet attributes fail closed instead of suppressing CSS silently',()=>{
 const style=el('style',{media:'screen'},[],'.a { fill: red; }');
 const root=el('svg',{},[style,el('rect',{class:'a'})]);
 assert.equal(flattenLocalSvgStyles(root).reason,'SVG_STYLESHEET_ATTRIBUTES_UNSUPPORTED');
 style.removeAttribute('media');style.setAttribute('type','text/css');
 assert.equal(flattenLocalSvgStyles(root).ok,true);
});

// R39: the standard PDF button and native-print path must share cancellable input.
test('stable/professional PDF reading uses cancellable local FileReader and progress',()=>{
 const normal=source.slice(source.indexOf('export async function convertToPdf('),source.indexOf('export async function renderNativePrintPages('));
 assert.match(normal,/readDocumentBuffer\(file,signal,progress=>/);
 assert.match(normal,/onProgress\(\{stage:'load',\.\.\.progress\}\)/);
 assert.doesNotMatch(normal,/buf=await file\.arrayBuffer\(\)/);
 assert.match(normal,/if\(e\?\.name==='AbortError'\)throw e/);
});


test('professional document cancellation while PDF bytes are pending destroys the draft',async()=>{
 const root=el('svg',{},[el('path',{d:'M0 0 L10 10'})]);
 await withDOM(root,async()=>{
  const controller=new AbortController();
  let destroyed=0, observedSignal;
  class StalledPDF{
   addPage(){}registerFont(){}
   end(){queueMicrotask(()=>controller.abort());}
   destroy(){destroyed++;}
  }
  const action=tryProfessionalDocument({renderPageSvgWithProfile:()=>'<svg/>'},1,{
   signal:controller.signal,
   checkedSvg:()=>checked,
   rasterPage:async()=>({blob:new Blob(['preview'])}),
   loadLibraries:async()=>({
    PDFDocument:StalledPDF,
    toBlob:(_pdf,signal)=>{
      observedSignal=signal;
      return new Promise((resolve,reject)=>{
        signal.addEventListener('abort',()=>reject(new DOMException('취소','AbortError')),{once:true});
      });
    },
    SVGtoPDF:()=>{}
   })
  });
  await assert.rejects(action, error=>error?.name==='AbortError');
  assert.equal(observedSignal,controller.signal);
  assert.equal(destroyed,1);
 });
});


test('default professional conversion rejects unsupported pages and discards the entire draft',async()=>{
 const text=el('text',{'font-family':'없는 글꼴'},[],korean);
 const root=el('svg',{},[text]);
 await withDOM(root,async()=>{
  const state={destroyed:0,rasters:0,profiles:[]};
  class FakePDF{registerFont(){} addPage(){throw Error('must fail before adding page');} destroy(){state.destroyed++;} end(){}}
  await assert.rejects(()=>tryProfessionalDocument({renderPageSvgWithProfile:(page,profile)=>{
   state.profiles.push([page,profile]);return '<svg/>';
  }},1,{
   checkedSvg:()=>checked,
   rasterPage:async()=>{state.rasters++;return {blob:new Blob(['png'])};},
   loadLibraries:async()=>({PDFDocument:FakePDF,toBlob:()=>new Promise(()=>{}),SVGtoPDF:()=>{}})
  }),/1쪽.*FONT_FAMILY_OR_VARIANT_UNAVAILABLE.*없는 글꼴/);
  assert.deepEqual(state.profiles,[[0,'print']]);
  assert.equal(state.rasters,0);assert.equal(state.destroyed,1);
 });
});
