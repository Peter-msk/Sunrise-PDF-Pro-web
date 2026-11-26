/** DEV54 experimental direct font preparation. Wire bytes remain browser-local.
 * Static TrueType only; a TTC TrueType member is extracted as a standalone
 * SFNT for pdf-lib. CFF/OTC, variations and synthetic styles remain blocked.
 */
const fail=code=>{throw Error('DIRECT_PDF_TEXT_'+code);};
export const directFamilyKey=s=>typeof s==='string'?s.trim().normalize('NFC').toLowerCase():'';
const MAX_FONT=Number.MAX_SAFE_INTEGER,MAX_TABLES=65535,MAX_FACES=0xffffffff;
const TTF=0x00010000,TTC=0x74746366,OTTO=0x4f54544f,OS2=0x4f532f32,HEAD=0x68656164,NAME=0x6e616d65;
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const aligned=n=>Math.ceil(n/4)*4;
const within=(offset,length,total)=>Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=total-length;
function directory(v,base){
 if(!within(base,12,v.byteLength))fail('FONT_TABLE');
 const sig=v.getUint32(base);
 if(sig===OTTO)fail('FONT_CFF_UNSUPPORTED');
 if(sig!==TTF)fail('FONT_FORMAT');
 const count=v.getUint16(base+4);
 if(!count||count>MAX_TABLES||!within(base+12,16*count,v.byteLength))fail('FONT_TABLE');
 const map=new Map();
 for(let i=0;i<count;i++){
  const p=base+12+i*16,tag=v.getUint32(p),offset=v.getUint32(p+8),length=v.getUint32(p+12);
  if(map.has(tag)||!within(offset,length,v.byteLength)||offset%4||
    (length&&offset<base+12+16*count&&offset+length>base))fail('FONT_TABLE');
  map.set(tag,{tag,offset,length});
 }
 const ranges=[...map.values()].filter(t=>t.length).sort((a,b)=>a.offset-b.offset);
 for(let i=1;i<ranges.length;i++)if(ranges[i].offset<ranges[i-1].offset+ranges[i-1].length)fail('FONT_TABLE');
 return map;
}
function postscriptNames(v,map){
 const t=map.get(NAME);if(!t||t.length<6)fail('FONT_NAME');
 const start=t.offset,count=v.getUint16(start+2),storage=v.getUint16(start+4);
 if(6+12*count>t.length||storage<6+12*count||storage>t.length)fail('FONT_NAME');
 const names=new Set();
 for(let i=0;i<count;i++){
  const p=start+6+12*i;
  if(v.getUint16(p+6)!==6)continue;
  const platform=v.getUint16(p),encoding=v.getUint16(p+2),length=v.getUint16(p+8),offset=storage+v.getUint16(p+10);
  if(!within(offset,length,t.length)||length>254||!length)fail('FONT_NAME');
  let s='';
  if(platform===0||platform===3){
   if(length%2)fail('FONT_NAME');
   for(let j=0;j<length;j+=2)s+=String.fromCharCode(v.getUint16(start+offset+j));
  }else if(platform===1&&encoding===0){
   for(let j=0;j<length;j++)s+=String.fromCharCode(v.getUint8(start+offset+j));
  }else continue;
  if(!/^[!-~]+$/.test(s)||/[\[\](){}<>/%]/.test(s))fail('FONT_NAME');
  names.add(s);
 }
 return names;
}
function checkRights(v,map){
 const t=map.get(OS2);
 if(!t||t.length<64)fail('FONT_TABLE');
 const weight=v.getUint16(t.offset+4),rights=v.getUint16(t.offset+8),selection=v.getUint16(t.offset+62);
 // Reject restricted, bitmap-only, preview/print-only (editable PDF policy),
 // reserved permissions, conflicting permission bits. Full font embedding
 // respects no-subsetting.
 if((rights&~0x0108)!==0)fail('FONT_RESTRICTED');
 return {weight,bold:Boolean(selection&32),italic:Boolean(selection&1),oblique:Boolean(selection&512)};
}
function checkStatic(map){
 const tags=['fvar','gvar','CFF ','CFF2','COLR','CPAL','CBDT','CBLC','sbix','SVG '];
 const num=s=>[...s].reduce((n,c)=>(n*256+c.charCodeAt(0))>>>0,0);
 if(tags.some(s=>map.has(num(s))))fail('FONT_VARIANT_UNSUPPORTED');
 for(const s of ['head','name','OS/2','glyf','loca','maxp','hhea','hmtx','cmap'])
  if(!map.has(num(s)))fail('FONT_TABLE');
 if(map.get(HEAD).length<54)fail('FONT_TABLE');
}
function checksum(bytes,offset,length){
 let sum=0;
 for(let i=0;i<aligned(length);i+=4){
  let word=0;for(let j=0;j<4;j++)word=(word*256+(i+j<length?bytes[offset+i+j]:0))>>>0;
  sum=(sum+word)>>>0;
 }
 return sum;
}
function extract(bytes,map){
 // DSIG signs an original container; reassembling it would invalidate it.
 if(map.has(0x44534947))fail('FONT_SIGNED_COLLECTION');
 const list=[...map.values()].sort((a,b)=>a.tag-b.tag),count=list.length;
 let size=12+count*16;
 for(const t of list)size+=aligned(t.length);
 if(size>MAX_FONT)fail('FONT_BUDGET');
 const out=new Uint8Array(size),v=view(out);
 v.setUint32(0,TTF);v.setUint16(4,count);
 const power=2**Math.floor(Math.log2(count));
 v.setUint16(6,power*16);v.setUint16(8,Math.log2(power));v.setUint16(10,count*16-power*16);
 let next=12+count*16,headOffset=0;
 for(let i=0;i<count;i++){
  const t=list[i],p=12+i*16;
  out.set(bytes.subarray(t.offset,t.offset+t.length),next);
  if(t.tag===HEAD){headOffset=next;v.setUint32(next+8,0);}
  v.setUint32(p,t.tag);v.setUint32(p+4,checksum(out,next,t.length));v.setUint32(p+8,next);v.setUint32(p+12,t.length);
  next+=aligned(t.length);
 }
 v.setUint32(headOffset+8,(0xb1b0afba-checksum(out,0,out.length))>>>0);
 return out;
}
export function prepareDirectFontBytes(bytes,postscriptName){
 if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes.length>MAX_FONT||
   typeof postscriptName!=='string'||!postscriptName||postscriptName.length>127)fail('FONT_INPUT');
 const v=view(bytes),sig=v.getUint32(0);
 let map,collection=false;
 if(sig===TTC){
  collection=true;
  const version=v.getUint32(4),count=v.getUint32(8);
  if(![0x00010000,0x00020000].includes(version)||!count||count>MAX_FACES||
    !within(12,count*4+(version===0x00020000?12:0),bytes.length))fail('FONT_COLLECTION');
  const headerEnd=12+count*4+(version===0x00020000?12:0);
  if(version===0x00020000&&[0,4,8].some(i=>v.getUint32(12+count*4+i)!==0))fail('FONT_SIGNED_COLLECTION');
  const offsets=new Set(),matches=[],directories=[],allMaps=[];
  for(let i=0;i<count;i++){
   const base=v.getUint32(12+i*4);
   if(base<headerEnd||base%4||offsets.has(base)||!within(base,12,bytes.length))fail('FONT_COLLECTION');
   offsets.add(base);
   // Do not guess or extract a CFF collection member.
   if(v.getUint32(base)===OTTO)fail('FONT_CFF_UNSUPPORTED');
   const candidate=directory(v,base);
   directories.push({start:base,end:base+12+16*candidate.size});allMaps.push(candidate);
   if([...candidate.values()].some(t=>t.length&&t.offset<headerEnd))fail('FONT_COLLECTION');
   const names=postscriptNames(v,candidate);
   if(names.has(postscriptName)){if(names.size!==1)fail('FONT_IDENTITY');matches.push(candidate);}
  }
  directories.sort((a,b)=>a.start-b.start);
  for(let i=1;i<directories.length;i++)if(directories[i].start<directories[i-1].end)fail('FONT_COLLECTION');
  for(const candidate of allMaps)for(const t of candidate.values())
   if(t.length&&directories.some(d=>t.offset<d.end&&t.offset+t.length>d.start))fail('FONT_COLLECTION');
  if(matches.length!==1)fail(matches.length?'FONT_AMBIGUOUS':'FONT_COLLECTION_FACE');
  map=matches[0];
 }else map=directory(v,0);
 checkStatic(map);
 const names=postscriptNames(v,map);
 if(names.size!==1||!names.has(postscriptName))fail('FONT_IDENTITY');
 const style=checkRights(v,map);
 return {bytes:collection?extract(bytes,map):bytes,collection,...style};
}
export function validateDirectFace(fontkit,face,family,bold=false){
 if(!face||face.embeddingAllowed!==true||typeof bold!=='boolean')fail('FONT_INPUT');
 const prepared=prepareDirectFontBytes(face.bytes,face.postscriptName);
 if(prepared.weight!==(bold?700:400)||prepared.bold!==bold||prepared.italic||prepared.oblique)fail('FONT_STYLE');
 const font=fontkit.create(prepared.bytes);
 const sub=directFamilyKey(font?.subfamilyName);
 if(!font||directFamilyKey(font.familyName)!==directFamilyKey(family)||font.postscriptName!==face.postscriptName||
  !(bold?['bold','b','bd']:['regular','normal','book','r']).includes(sub)||
  Object.keys(font.variationAxes??{}).length||font.italicAngle)fail('FONT_IDENTITY');
 return {font,...prepared};
}
// Registry entries are explicitly approved by the caller, not inferred from
// OS permission, CSS aliases or a bundled fallback. No queryLocalFonts call.
// Duplicate references are deduped; conflicting candidates are not guessed.
export function createDirectFontResolver(faces,{selections={}}={}){
 if(!Array.isArray(faces))fail('FONT_REGISTRY');
 const entries=[...new Set(faces)].filter(f=>f?.embeddingAllowed===true&&!f.isFallback);
 const selected=new Map(Object.entries(selections));
 return async({family,bold,italic})=>{
  if(typeof bold!=='boolean'||italic!==false||!directFamilyKey(family))fail('FONT_STYLE');
  const k=directFamilyKey(family)+'|'+(bold?'bold':'regular');
  const wanted=selected.get(k);
  const candidates=entries.filter(f=>directFamilyKey(f.family)===directFamilyKey(family)&&f.bold===bold&&f.italic===false&&
   (!wanted||f.postscriptName===wanted));
  if(candidates.length!==1)fail(candidates.length?'FONT_AMBIGUOUS':'FONT_MISSING');
  return candidates[0];
 };
}
