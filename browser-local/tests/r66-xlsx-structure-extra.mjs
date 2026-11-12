import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectXlsxPackage} from '../src/xlsx-package-guard.mjs';
const fixture=n=>new Uint8Array(readFileSync(new URL('./fixtures/'+n,import.meta.url)));
const dv=x=>new DataView(x.buffer,x.byteOffset,x.byteLength);
function cen(x){
 for(let i=x.length-22;i>=0;i--)if(dv(x).getUint32(i,true)===0x06054b50&&i+22+dv(x).getUint16(i+20,true)===x.length)
   return dv(x).getUint32(i+16,true);
 throw Error('EOCD missing');
}
const copy=x=>Uint8Array.from(x);

test('standard stored XLSX from fixture passes added local-header checks',()=>{
 const b=fixture('small-real-zip.xlsx');
 assert.ok(inspectXlsxPackage(b).entryCount>=3);
});
test('standard deflate XLSX and canonical workbook pass added local-header checks',()=>{
 assert.ok(inspectXlsxPackage(fixture('small-deflated.xlsx')).entryCount>=3);
 assert.ok(inspectXlsxPackage(fixture('xlsx-canonical.xlsx')).entryCount>=5);
});
test('corrupt local CRC without descriptor is rejected, even if central CRC was untouched',()=>{
 const b=copy(fixture('small-deflated.xlsx'));const d=dv(b),p=cen(b);
 const local=d.getUint32(p+42,true);
 d.setUint32(local+14,d.getUint32(local+14,true)^0x12345678,true);
 assert.throws(()=>inspectXlsxPackage(b),/XLSX_ZIP_LOCAL_HEADER_MISMATCH/);
});
test('corrupt local compressed size without descriptor is rejected',()=>{
 const b=copy(fixture('small-deflated.xlsx'));const d=dv(b),p=cen(b);
 const local=d.getUint32(p+42,true);
 d.setUint32(local+18,d.getUint32(local+18,true)+1,true);
 assert.throws(()=>inspectXlsxPackage(b),/XLSX_ZIP_LOCAL_HEADER_MISMATCH/);
});
test('corrupt local expanded size without descriptor is rejected',()=>{
 const b=copy(fixture('small-deflated.xlsx'));const d=dv(b),p=cen(b);
 const local=d.getUint32(p+42,true);
 d.setUint32(local+22,d.getUint32(local+22,true)+1,true);
 assert.throws(()=>inspectXlsxPackage(b),/XLSX_ZIP_LOCAL_HEADER_MISMATCH/);
});
test('stored method cannot advertise different expanded and compressed sizes',()=>{
 const b=copy(fixture('small-real-zip.xlsx'));const d=dv(b),p=cen(b);
 d.setUint32(p+24,d.getUint32(p+24,true)+1,true);
 assert.throws(()=>inspectXlsxPackage(b),/XLSX_ZIP_STORED_SIZE_MISMATCH/);
});
test('valid general-purpose bit 3 descriptor archive remains accepted',()=>{
 const b=fixture('descriptor.xlsx');
 const d=dv(b),p=cen(b);assert.equal(d.getUint16(p+8,true)&8,8);
 assert.ok(inspectXlsxPackage(b).entryCount>=2);
});
test('existing dangerous ZIP entry name rejection is unchanged',()=>{
 const b=copy(fixture('small-deflated.xlsx'));const d=dv(b),p=cen(b);
 const local=d.getUint32(p+42,true);
 b[p+46]=46; b[p+47]=46; b[p+48]=47;
 b[local+30]=46; b[local+31]=46; b[local+32]=47;
 assert.throws(()=>inspectXlsxPackage(b),/XLSX_ZIP_ENTRY_NAME_INVALID/);
});
