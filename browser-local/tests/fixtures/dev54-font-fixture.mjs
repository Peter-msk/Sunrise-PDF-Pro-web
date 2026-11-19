/** Minimal SFNT structures for mock parser tests only, not usable fonts. */
const tag=s=>[...s].reduce((n,c)=>(n*256+c.charCodeAt(0))>>>0,0);
const align=n=>Math.ceil(n/4)*4;
export function mockFontBytes({name='Example-Regular',bold=false,rights=0,italic=false,extra=[]}={}){
 const nameTable=new Uint8Array(18+name.length*2),nv=new DataView(nameTable.buffer);
 nv.setUint16(2,1);nv.setUint16(4,18);nv.setUint16(6,3);nv.setUint16(8,1);
 nv.setUint16(10,0x409);nv.setUint16(12,6);nv.setUint16(14,name.length*2);
 for(let i=0;i<name.length;i++)nv.setUint16(18+i*2,name.charCodeAt(i));
 const os=new Uint8Array(64),ov=new DataView(os.buffer);
 ov.setUint16(4,bold?700:400);ov.setUint16(8,rights);ov.setUint16(62,(bold?32:0)|(italic?1:0));
 const entries=[['OS/2',os],['name',nameTable],['head',new Uint8Array(54)],...['glyf','loca','maxp','hhea','hmtx','cmap',...extra].map(s=>[s,new Uint8Array(4)])];
 const count=entries.length;let offset=12+16*count;
 const out=new Uint8Array(offset+entries.reduce((n,[,b])=>n+align(b.length),0)),v=new DataView(out.buffer);
 v.setUint32(0,0x10000);v.setUint16(4,count);
 for(let i=0;i<count;i++){const [s,b]=entries[i],p=12+16*i;v.setUint32(p,tag(s));v.setUint32(p+8,offset);v.setUint32(p+12,b.length);out.set(b,offset);offset+=align(b.length);}
 return out;
}
export function mockCollection(fonts){
 let offset=12+4*fonts.length;
 const out=new Uint8Array(offset+fonts.reduce((n,b)=>n+align(b.length),0)),v=new DataView(out.buffer);
 v.setUint32(0,0x74746366);v.setUint32(4,0x10000);v.setUint32(8,fonts.length);
 for(let i=0;i<fonts.length;i++){
  const b=fonts[i],bv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  v.setUint32(12+i*4,offset);out.set(b,offset);
  for(let j=0;j<bv.getUint16(4);j++){const p=12+16*j;v.setUint32(offset+p+8,offset+bv.getUint32(p+8));}
  offset+=align(b.length);
 }
 return out;
}
