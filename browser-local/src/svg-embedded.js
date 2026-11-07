import {parseSafeSvg} from './svg-security.js';
import {flattenLocalSvgStyles} from './svg-style.js';
import {svgPageSize} from './page-geometry.js';

const NS='http://www.w3.org/2000/svg';
const DATA=/^data:image\/svg\+xml;base64,([a-z0-9+/\s]+={0,2})$/i;
const LOCAL=/^#[\w.-]+$/;
const POSITION=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i;
const DEFAULTS={fill:'#000',stroke:'none',color:'#000','fill-opacity':'1',
 'stroke-opacity':'1','stroke-width':'1','font-family':'serif','font-size':'16',
 'font-weight':'normal','font-style':'normal','text-anchor':'start',
 'letter-spacing':'normal','word-spacing':'normal',visibility:'visible'};

/** Inline only independently sanitized SVG pictures. Raster images stay images;
 * SVG pictures stay vector primitives. No decoded SVG is inserted into a live DOM.
 * Two viewports preserve the image's intrinsic aspect ratio AND the SVG viewBox.
 */
export function parseDocumentSvg(source,parser=new DOMParser()){
 let decodedBytes=0,pictures=0,nextId=0,nodes=0;
 const usedIds=new Set();
 const serialize=node=>new XMLSerializer().serializeToString(node);
 function read(xml){
  const doc=parser.parseFromString(xml,'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.doctype||doc.documentElement?.localName!=='svg')
   throw Error('삽입 SVG 그림의 형식이 잘못되었습니다.');
  for(const node of doc.childNodes)if(node.nodeType===7)throw Error('SVG 외부 처리 지시문은 허용되지 않습니다.');
  const all=[doc.documentElement,...doc.documentElement.querySelectorAll('*')];
  nodes+=all.length;if(nodes>60000)throw Error('SVG 요소 수가 처리 범위를 초과했습니다.');
  for(const el of all)if(el.hasAttribute('id'))usedIds.add(el.getAttribute('id'));
  return doc.documentElement;
 }
 function scopeIds(root){
  const styles=flattenLocalSvgStyles(root);
  if(!styles.ok)throw Error('삽입 SVG 그림 스타일을 보존할 수 없습니다 ('+styles.reason+').');
  const all=[root,...root.querySelectorAll('*')],map=new Map();
  for(const el of all)if(el.hasAttribute('id')){
   const id=el.getAttribute('id');
   if(!/^[\w.-]+$/.test(id)||map.has(id))throw Error('삽입 SVG 그림 식별자가 중복되거나 잘못되었습니다.');
   let renamed;do{renamed='sunrise-picture-'+(++nextId);}while(usedIds.has(renamed));
   usedIds.add(renamed);map.set(id,renamed);el.setAttribute('id',renamed);
  }
  function ref(value){
   if(!LOCAL.test(value)||!map.has(value.slice(1)))throw Error('삽입 SVG 그림의 내부 참조를 확인할 수 없습니다.');
   return '#'+map.get(value.slice(1));
  }
  for(const el of all)for(const attr of Array.from(el.attributes)){
   if(attr.name==='id')continue;
   const name=attr.localName||attr.name;
   if((name==='href'||name==='src')&&attr.value.startsWith('#'))attr.value=ref(attr.value);
   else attr.value=attr.value.replace(/url\s*\(\s*(['"]?)(#[\w.-]+)\1\s*\)/gi,(_,quote,value)=>'url('+ref(value)+')');
  }
 }
 function expand(root,depth){
  for(const image of Array.from(root.querySelectorAll('image'))){
   const refs=Array.from(image.attributes).filter(a=>(a.localName||a.name.split(':').at(-1))==='href');
   const match=refs.length===1?DATA.exec(refs[0].value.trim()):null;
   if(!match)continue; // All other references go through the existing trust boundary.
   if(depth>=4||++pictures>128)throw Error('삽입 SVG 그림의 중첩 또는 개수 제한을 초과했습니다.');
   const encoded=match[1].replace(/\s+/g,'');
   if(encoded.length>5_600_000)throw Error('삽입 SVG 그림의 처리 크기를 초과했습니다.');
   let bytes;
   try{bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}
   catch{throw Error('삽입 SVG 그림의 인코딩이 잘못되었습니다.');}
   decodedBytes+=bytes.length;if(decodedBytes>4_194_304)throw Error('삽입 SVG 그림의 처리 크기를 초과했습니다.');
   const nested=read(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   expand(nested,depth+1);
   // The same security policy checks scripts, events, foreign namespaces,
   // external references, styles, and animation in every decoded document.
   const clean=parseSafeSvg(serialize(nested),parser);
   scopeIds(clean);
   if(!clean.hasAttribute('viewBox')&&!clean.hasAttribute('width')&&!clean.hasAttribute('height'))
    throw Error('삽입 SVG 그림의 원본 크기가 없습니다.');
   const intrinsic=svgPageSize({width:clean.getAttribute('width'),height:clean.getAttribute('height'),viewBox:clean.getAttribute('viewBox')});
   const width=image.getAttribute('width'),height=image.getAttribute('height');
   const x=image.getAttribute('x')||'0',y=image.getAttribute('y')||'0';
   if(!width||!height||![x,y,width,height].every(v=>POSITION.test(v)&&Math.abs(parseFloat(v))<=20000)||parseFloat(width)<=0||parseFloat(height)<=0)
    throw Error('삽입 SVG 그림의 배치 크기를 보존할 수 없습니다.');
   const aspect=image.getAttribute('preserveAspectRatio')||'xMidYMid meet';
   if(!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(aspect))
    throw Error('삽입 SVG 그림의 비율 설정을 보존할 수 없습니다.');
   const doc=root.ownerDocument,group=doc.createElementNS(NS,'g'),viewport=doc.createElementNS(NS,'svg');
   for(const attr of Array.from(image.attributes)){
    if(['href','x','y','width','height','preserveAspectRatio'].includes(attr.localName||attr.name))continue;
    group.setAttributeNS(attr.namespaceURI,attr.name,attr.value);
   }
   for(const [name,value] of Object.entries({...DEFAULTS,x,y,width,height,viewBox:'0 0 '+intrinsic.width+' '+intrinsic.height,preserveAspectRatio:aspect,overflow:'hidden'}))viewport.setAttribute(name,value);
   clean.setAttribute('x','0');clean.setAttribute('y','0');
   clean.setAttribute('width',String(intrinsic.width));clean.setAttribute('height',String(intrinsic.height));
   viewport.appendChild(doc.importNode(clean,true));group.appendChild(viewport);image.replaceWith(group);
  }
 }
 const root=read(source);expand(root,0);
 return parseSafeSvg(serialize(root),parser);
}
