import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectXlsxPackage,XLSX_LIMITS} from '../src/xlsx-package-guard.mjs';
const fixture=name=>new Uint8Array(readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const err=(data,pattern)=>assert.throws(()=>inspectXlsxPackage(data),pattern);
const clone=x=>Uint8Array.from(x);
function eocdPos(b){for(let i=b.length-22;i>=0;i--)if(b[i]===80&&b[i+1]===75&&b[i+2]===5&&b[i+3]===6)return i;throw Error('missing EOCD');}
function firstCentral(b){const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);return dv.getUint32(eocdPos(b)+16,true);}
function view(b){return new DataView(b.buffer,b.byteOffset,b.byteLength);}

test('real Python-generated XLSX ZIP parts and directory entry pass bounded metadata check',()=>{
 const r=inspectXlsxPackage(fixture('small-real-zip.xlsx'));
 assert.ok(r.entryCount>=3);assert.ok(r.expandedBytes>0);
});
test('deflated XLSX with common OOXML content-type and workbook paths passes',()=>{
 const r=inspectXlsxPackage(fixture('small-deflated.xlsx'));assert.ok(r.compressedBytes>0);
});
test('random bytes, truncated file and renamed non-Office ZIP are rejected',()=>{
 for(const bytes of [new Uint8Array(24),fixture('non-office.zip'),fixture('small-deflated.xlsx').slice(0,64)])
  assert.throws(()=>inspectXlsxPackage(bytes),/XLSX_/);
});
test('upper bound on input archive bytes before central parser',()=>{
 assert.throws(()=>inspectXlsxPackage(fixture('small-deflated.xlsx'),{...XLSX_LIMITS,inputBytes:32}),/XLSX_INPUT_BYTES_LIMIT/);
});
test('central total expanded-byte budget blocks forged oversized uncompressed size',()=>{
 const bytes=clone(fixture('small-deflated.xlsx')),dv=view(bytes),p=firstCentral(bytes);
 dv.setUint32(p+24,0x02000000,true);
 assert.throws(()=>inspectXlsxPackage(bytes,{...XLSX_LIMITS,entryBytes:0x04000000,totalExpandedBytes:0x01000000}),/XLSX_ZIP_(?:EXPANDED_BYTES|COMPRESSION_RATIO)_LIMIT/);
});
test('central entry expanded cap catches large declared entry',()=>{
 const b=clone(fixture('small-deflated.xlsx')),p=firstCentral(b);
 view(b).setUint32(p+24,XLSX_LIMITS.entryBytes+1,true);
 err(b,/XLSX_ZIP_ENTRY_BYTES_LIMIT/);
});
test('entry count cap prevents excessive ZIP traversal',()=>{
 const b=fixture('small-deflated.xlsx');
 assert.throws(()=>inspectXlsxPackage(b,{...XLSX_LIMITS,entries:1}),/XLSX_ZIP_ENTRY_COUNT_LIMIT/);
});
test('ZIP64 sentinel and encrypted entry are rejected',()=>{
 const base=fixture('small-deflated.xlsx');
 const a=clone(base);view(a).setUint16(eocdPos(a)+10,0xffff,true);err(a,/XLSX_ZIP64_UNSUPPORTED/);
 const b=clone(base),p=firstCentral(b);view(b).setUint16(p+8,1,true);err(b,/XLSX_ZIP_ENCRYPTED_UNSUPPORTED/);
});
test('traversal paths, backslashes and absolute names are rejected',()=>{
 for(const name of ['../xl/a.xml','xl\\workbook','/xl/evil']){
  const b=clone(fixture('small-deflated.xlsx')),p=firstCentral(b),nameBytes=new TextEncoder().encode(name);
  const max=view(b).getUint16(p+28,true);
  // Edit only an existing long enough path to avoid corrupting other fields.
  if(nameBytes.length>max)continue;
  b.set(nameBytes,p+46);
  err(b,/XLSX_ZIP_ENTRY_NAME_INVALID|XLSX_ZIP_LOCAL_HEADER_MISMATCH/);
 }
});
test('invalid central directory offsets and local data bounds are rejected',()=>{
 const a=clone(fixture('small-deflated.xlsx'));view(a).setUint32(eocdPos(a)+16,0,true);
 err(a,/XLSX_ZIP_CENTRAL_DIRECTORY_INVALID/);
 const b=clone(fixture('small-deflated.xlsx'));view(b).setUint32(firstCentral(b)+42,0x7fffffff,true);
 err(b,/XLSX_ZIP_LOCAL_HEADER_INVALID/);
});
test('inconsistency between central directory and local header is rejected',()=>{
 const b=clone(fixture('small-deflated.xlsx')),p=firstCentral(b),dv=view(b);
 dv.setUint16(p+10,0,true);
 err(b,/XLSX_ZIP_LOCAL_HEADER_MISMATCH/);
});
test('compressed bomb by ratio detected independently of file byte budget',()=>{
 const b=clone(fixture('small-deflated.xlsx')),p=firstCentral(b),dv=view(b);
 dv.setUint32(p+20,1,true);dv.setUint32(p+24,1000000,true);
 err(b,/XLSX_ZIP_COMPRESSION_RATIO_LIMIT/);
});
test('reject symlink and special-file entries advertised by Unix mode',()=>{
 const b=clone(fixture('small-deflated.xlsx')),p=firstCentral(b),dv=view(b);
 dv.setUint8(p+5,3);dv.setUint32(p+38,0o120777<<16,true);
 err(b,/XLSX_ZIP_SPECIAL_FILE_UNSUPPORTED/);
});

test('canonical minimal OOXML workbook fixture with relationships is accepted',()=>{
 const result=inspectXlsxPackage(fixture('xlsx-canonical.xlsx'));
 assert.equal(result.entryCount,5);assert.ok(result.expandedBytes>500);
});
