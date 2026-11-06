/**
 * R37 DEV5 — conservative local SVG stylesheet inlining.
 * Only self-contained simple selectors and presentation declarations are
 * accepted; complex CSS is deliberately sent to the image-page fallback.
 * No stylesheet URL, network fetch, selector engine, or global state.
 */
const PRESENTATION=new Set([
  'fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-opacity',
  'stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray',
  'stroke-dashoffset','opacity','color','font-family','font-size',
  'font-style','font-weight','letter-spacing','word-spacing','text-anchor',
  'clip-path','mask','stop-color','stop-opacity','display','visibility'
]);
const SIMPLE_NAME='[a-zA-Z_][a-zA-Z0-9_-]*';
const SIMPLE_NAME_RE=new RegExp(`^${SIMPLE_NAME}$`);
const TAG=new RegExp(`^${SIMPLE_NAME}$`);
const CLASS=new RegExp(`^\\.${SIMPLE_NAME}$`);
const ID=new RegExp(`^#${SIMPLE_NAME}$`);
const TAG_CLASS=new RegExp(`^(${SIMPLE_NAME})\\.(${SIMPLE_NAME})$`);
const MAX_CSS=64*1024,MAX_RULES=512,MAX_ELEMENTS=60000;

function safeValue(value){
  if(!value || /@import|!important|expression\s*\(|(?:https?:|ftp:|\/\/)/i.test(value))return false;
  for(const found of value.matchAll(/url\s*\(\s*([^)]*)\)/gi)){
    const target=found[1].trim().replace(/^['"]|['"]$/g,'');
    if(!/^#[\w.-]+$/.test(target))return false;
  }
  const allowedFunctions=value.replace(/url\s*\(\s*[^)]*\)/gi,'')
    .replace(/(?:rgb|rgba|hsl|hsla)\s*\(\s*[^)]*\)/gi,'');
  if(/[()]/.test(allowedFunctions))return false;
  return true;
}

function readDeclarations(raw){
  const output=new Map();
  for(const segment of raw.split(';')){
    if(!segment.trim())continue;
    const i=segment.indexOf(':');
    if(i<=0)return null;
    const name=segment.slice(0,i).trim().toLowerCase();
    const value=segment.slice(i+1).trim();
    if(!PRESENTATION.has(name)||!safeValue(value))return null;
    output.set(name,value);
  }
  return output.size?output:null;
}

function parseSelector(raw){
  const value=raw.trim();
  if(CLASS.test(value))return {kind:'class',name:value.slice(1),priority:10};
  if(ID.test(value))return {kind:'id',name:value.slice(1),priority:100};
  const compound=TAG_CLASS.exec(value);
  if(compound)return {kind:'tag-class',tag:compound[1],name:compound[2],priority:11};
  if(TAG.test(value))return {kind:'tag',name:value,priority:1};
  return null;
}

function parseCss(text){
  if(text.length>MAX_CSS)return null;
  const input=text.replace(/\/\*[\s\S]*?\*\//g,'');
  if(/\/\*|\*\/|@|\\|[<>]/.test(input))return null;
  const blocks=/\s*([^{}]+)\{([^{}]*)\}\s*/gy;
  let cursor=0,order=0;const rules=[];
  while(cursor<input.length){
    if(!input.slice(cursor).trim())break;
    blocks.lastIndex=cursor;
    const result=blocks.exec(input);
    if(!result || result.index!==cursor)return null;
    const selectors=result[1].split(',');
    const declarations=readDeclarations(result[2]);
    if(!declarations||selectors.length>16)return null;
    for(const selector of selectors){
      const parsed=parseSelector(selector);
      if(!parsed || ++order>MAX_RULES)return null;
      rules.push({...parsed,declarations,order});
    }
    cursor=blocks.lastIndex;
  }
  return rules;
}

function ruleMatches(rule,el,classes){
  switch(rule.kind){
    case 'class':return classes.includes(rule.name);
    case 'id':return el.getAttribute('id')===rule.name;
    case 'tag':return el.localName===rule.name;
    case 'tag-class':return el.localName===rule.tag && classes.includes(rule.name);
    default:return false;
  }
}

/**
 * @param {SVGElement} root parsed SVG DOM. Caller owns this instance.
 * @returns {{ok:boolean,changed:boolean,reason?:string,styleRules?:number}}
 */
export function flattenLocalSvgStyles(root){
  const elements=[],styleNodes=[];
  const stack=[root];
  while(stack.length){
    const el=stack.pop();
    if(elements.length>=MAX_ELEMENTS)return {ok:false,changed:false,reason:'SVG_STYLE_COMPLEXITY'};
    elements.push(el);
    if(el.localName==='style')styleNodes.push(el);
    const children=Array.from(el.children||[]);
    for(let i=children.length-1;i>=0;i--)stack.push(children[i]);
  }
  if(!styleNodes.length){
    if(elements.some(el=>el.hasAttribute?.('class')))
      return {ok:false,changed:false,reason:'CLASS_STYLE_UNRESOLVED'};
    return {ok:true,changed:false,styleRules:0};
  }
  const rules=[];let totalLength=0;
  for(const style of styleNodes){
    if(style.attributes && Array.from(style.attributes).some(attr=>
      !(['type'].includes(attr.name)&&attr.value==='text/css')))
      return {ok:false,changed:false,reason:'SVG_STYLESHEET_ATTRIBUTES_UNSUPPORTED'};
    const css=String(style.textContent||'');
    totalLength+=css.length;
    if(totalLength>MAX_CSS)return {ok:false,changed:false,reason:'SVG_STYLESHEET_TOO_LARGE'};
    const parsed=parseCss(css);
    if(!parsed || rules.length+parsed.length>MAX_RULES)
      return {ok:false,changed:false,reason:'SVG_STYLESHEET_UNSUPPORTED'};
    for(const rule of parsed)rules.push({...rule,order:rules.length+1});
  }
  // Stage all changes first, so unsupported selectors/classes never leave a
  // partially normalized DOM that might accidentally be accepted.
  const staged=[];
  for(const el of elements){
    if(el.localName==='style')continue;
    const raw=el.getAttribute('class');
    const classes=raw===null?[]:raw.trim().split(/\s+/).filter(Boolean);
    if(classes.some(name=>!SIMPLE_NAME_RE.test(name)))
      return {ok:false,changed:false,reason:'SVG_CLASS_NAME_UNSUPPORTED'};
    const matches=rules.filter(rule=>ruleMatches(rule,el,classes));
    // Unresolved classes might refer to unsupported external CSS. Never erase
    // them and silently change document appearance.
    if(classes.some(name=>!matches.some(rule=>
      (rule.kind==='class'||rule.kind==='tag-class')&&rule.name===name)))
      return {ok:false,changed:false,reason:'CLASS_STYLE_UNRESOLVED'};
    const sorted=matches.sort((a,b)=>a.priority-b.priority||a.order-b.order);
    const updates=new Map();
    for(const rule of sorted)for(const [name,value] of rule.declarations)updates.set(name,value);
    staged.push({el,updates,removeClass:raw!==null});
  }
  for(const {el,updates,removeClass} of staged){
    // CSS rules win over SVG presentation attributes; inline style is applied
    // separately by the existing preflight, and wins over these rules.
    for(const [name,value] of updates)el.setAttribute(name,value);
    if(removeClass)el.removeAttribute('class');
  }
  for(const style of styleNodes)style.remove();
  return {ok:true,changed:true,styleRules:rules.length};
}
