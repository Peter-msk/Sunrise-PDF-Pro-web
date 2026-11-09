/** One SVG trust boundary for raster, professional output and print frames. */
const SVG_NS='http://www.w3.org/2000/svg';
const IMAGE=/^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/i;
const LOCAL=/^#[\w.-]+$/;
const ANIMATION=new Set(['animate','animateMotion','animateTransform','set','discard']);
const ACTIVE=new Set(['script','foreignObject','iframe','object','embed','audio','video','link']);
function checkCss(value){
  // Strip complete CSS comments before checking obfuscated URL tokens.
  const css=String(value).replace(/\/\*[\s\S]*?\*\//g,'');
  if(/[@\\]|\/\*|\*\/|expression\s*\(/i.test(css))
    throw Error('문서 SVG에 허용되지 않는 스타일이 있습니다.');
  for(const match of css.matchAll(/url\s*\(\s*([^)]*)\)/gi)){
    const ref=match[1].trim().replace(/^['"]|['"]$/g,'');
    if(!LOCAL.test(ref)&&!IMAGE.test(ref))
      throw Error('문서 SVG의 외부 자원 참조는 허용되지 않습니다.');
  }
}
export function parseSafeSvg(svg,parser=new DOMParser()){
  const doc=parser.parseFromString(svg,'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.doctype||
      doc.documentElement?.localName!=='svg')throw Error('SVG 출력 형식 오류');
  for(const node of doc.childNodes||[])
    if(node.nodeType===7)throw Error('SVG 외부 처리 지시문은 허용되지 않습니다.');
  const root=doc.documentElement;
  const elements=[root,...root.querySelectorAll('*')];
  if(elements.length>60000)throw Error('SVG 요소 수가 처리 범위를 초과했습니다.');
  for(const element of elements){
    if(element.namespaceURI!==SVG_NS||ACTIVE.has(element.localName))
      throw Error('문서 SVG에 허용되지 않는 요소가 있습니다.');
    if(ANIMATION.has(element.localName)){element.remove();continue;}
    for(const attr of Array.from(element.attributes)){
      const name=attr.localName||attr.name;
      let value=attr.value.trim();
      if(/^on/i.test(name)||/^on/i.test(attr.name))
        throw Error('문서 SVG의 이벤트 속성은 허용되지 않습니다.');
      if(name==='href'||name==='src'){
        if(element.localName==='image'&&/^data:image\/gif[;,]/i.test(value))
          throw Error('문서에 포함된 GIF 그림은 현재 PDF 변환에서 지원하지 않습니다.');
        if(/^data:image\/(?:png|jpeg);base64,/i.test(value))value=value.replace(/\s+/g,'');
        if(value&&!LOCAL.test(value)&&!(element.localName==='image'&&IMAGE.test(value)))
          throw Error('문서 SVG의 외부 자원 참조는 허용되지 않습니다.');
        attr.value=value;
      }else if(attr.name!=='xmlns'&&!attr.name.startsWith('xmlns:'))checkCss(value);
    }
    if(element.localName==='style')checkCss(element.textContent||'');
  }
  return root;
}
