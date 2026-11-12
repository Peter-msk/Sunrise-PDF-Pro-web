/**
 * R66-DEV18 — metadata-only safety preflight for the existing SheetJS XLSX path.
 * No network, file extraction, decompression, new dependencies or global state.
 * This is not a substitute for SheetJS's own ZIP/XML validation, nor for
 * worker isolation of synchronous parsers.
 */
export const XLSX_LIMITS=Object.freeze({
  inputBytes:96*1024*1024,
  entries:10_000,
  entryBytes:64*1024*1024,
  totalExpandedBytes:256*1024*1024,
  compressionRatio:300,
});
const CEN=0x02014b50, LOCAL=0x04034b50, EOCD=0x06054b50;
const utf8=new TextDecoder('utf-8',{fatal:true});
function reject(code){throw Error(code);}
function uint32(dv,p){return dv.getUint32(p,true);}
function safeName(name){
  if(!name||name.length>1024||name.startsWith('/')||name.startsWith('\\')||
     name.includes('\\')||name.includes('\0')||/^[a-z]:/i.test(name)||
     name.replace(/\/$/,'').split('/').some(part=>part==='.'||part==='..'||!part)||
     /[\u0000-\u001f\u007f]/u.test(name))reject('XLSX_ZIP_ENTRY_NAME_INVALID');
}
/**
 * Examine the central directory before SheetJS starts synchronous parsing.
 * @param {ArrayBuffer|Uint8Array} data XLSX source bytes
 * @param {object} limits injectable conservative limits (tests only)
 * @returns {{entryCount:number,expandedBytes:number,compressedBytes:number}}
 */
export function inspectXlsxPackage(data,limits=XLSX_LIMITS){
  const b=data instanceof Uint8Array?data:new Uint8Array(data);
  const n=b.byteLength;
  if(n<22||n>limits.inputBytes)reject('XLSX_INPUT_BYTES_LIMIT');
  const dv=new DataView(b.buffer,b.byteOffset,n);
  // ZIP EOCD lives in the last 65,557 bytes, including any ZIP comment.
  const lower=Math.max(0,n-65557);
  let eocd=-1;
  for(let p=n-22;p>=lower;p--){
    if(uint32(dv,p)===EOCD&&p+22+dv.getUint16(p+20,true)===n){eocd=p;break;}
  }
  if(eocd<0)reject('XLSX_ZIP_EOCD_MISSING');
  const disk=dv.getUint16(eocd+4,true),cdDisk=dv.getUint16(eocd+6,true),
        diskEntries=dv.getUint16(eocd+8,true),count=dv.getUint16(eocd+10,true),
        cdSize=uint32(dv,eocd+12),cdStart=uint32(dv,eocd+16);
  if(count===0xffff||diskEntries===0xffff||cdSize===0xffffffff||cdStart===0xffffffff)
    reject('XLSX_ZIP64_UNSUPPORTED');
  if(disk!==0||cdDisk!==0||diskEntries!==count)reject('XLSX_ZIP_MULTIDISK_UNSUPPORTED');
  if(count===0||count>limits.entries)reject('XLSX_ZIP_ENTRY_COUNT_LIMIT');
  // Forbid ZIP self-extracting prefix/overlap and trailing ambiguous records.
  if(cdStart<4||cdStart+cdSize!==eocd||cdStart+cdSize>n)
    reject('XLSX_ZIP_CENTRAL_DIRECTORY_INVALID');
  let pos=cdStart,total=0,compressed=0;
  const seen=new Set(),has=new Set(),ranges=[];
  for(let i=0;i<count;i++){
    if(pos+46>eocd||uint32(dv,pos)!==CEN)reject('XLSX_ZIP_CENTRAL_HEADER_INVALID');
    const flags=dv.getUint16(pos+8,true),method=dv.getUint16(pos+10,true),
          size=uint32(dv,pos+20),expanded=uint32(dv,pos+24),
          nameLen=dv.getUint16(pos+28,true),extraLen=dv.getUint16(pos+30,true),
          commentLen=dv.getUint16(pos+32,true),diskNum=dv.getUint16(pos+34,true),
          localPos=uint32(dv,pos+42);
    const next=pos+46+nameLen+extraLen+commentLen;
    if(nameLen===0||next>eocd)reject('XLSX_ZIP_CENTRAL_HEADER_INVALID');
    if((flags&1)!==0||(flags&0x40)!==0)reject('XLSX_ZIP_ENCRYPTED_UNSUPPORTED');
    if(method!==0&&method!==8)reject('XLSX_ZIP_COMPRESSION_UNSUPPORTED');
    if(diskNum!==0)reject('XLSX_ZIP_MULTIDISK_UNSUPPORTED');
    // ZIP entries are never extracted here, yet reject non-file Unix types
    // so later code cannot accidentally treat a package symlink as a file.
    if(dv.getUint8(pos+5)===3){
      const unixMode=(uint32(dv,pos+38)>>>16)&0xffff;
      const fileType=unixMode&0o170000;
      if(fileType!==0&&fileType!==0o100000&&fileType!==0o040000)
        reject('XLSX_ZIP_SPECIAL_FILE_UNSUPPORTED');
    }
    if(size===0xffffffff||expanded===0xffffffff||localPos===0xffffffff)
      reject('XLSX_ZIP64_UNSUPPORTED');
    let name;
    try{name=utf8.decode(b.subarray(pos+46,pos+46+nameLen));}
    catch{reject('XLSX_ZIP_ENTRY_NAME_INVALID');}
    safeName(name);
    // ZIP is case sensitive, but OOXML package parts are case insensitive.
    const canonical=name.toLowerCase();
    if(seen.has(canonical))reject('XLSX_ZIP_DUPLICATE_ENTRY');
    seen.add(canonical);has.add(canonical);
    if(name.endsWith('/')){
      if(expanded!==0)reject('XLSX_ZIP_DIRECTORY_DATA_INVALID');
    }else{
      if(expanded>limits.entryBytes)reject('XLSX_ZIP_ENTRY_BYTES_LIMIT');
      if(expanded>size*limits.compressionRatio && expanded>4096)
        reject('XLSX_ZIP_COMPRESSION_RATIO_LIMIT');
      total+=expanded;
      compressed+=size;
      if(total>limits.totalExpandedBytes)reject('XLSX_ZIP_EXPANDED_BYTES_LIMIT');
    }
    // Check local headers and physically bounded compressed data, without
    // trusting local-header claimed sizes (data descriptors may be used).
    if(localPos+30>cdStart||uint32(dv,localPos)!==LOCAL)
      reject('XLSX_ZIP_LOCAL_HEADER_INVALID');
    const localFlags=dv.getUint16(localPos+6,true),localMethod=dv.getUint16(localPos+8,true),
          localNameLen=dv.getUint16(localPos+26,true),
          localExtraLen=dv.getUint16(localPos+28,true);
    if(localFlags!==flags||localMethod!==method||localNameLen!==nameLen)
      reject('XLSX_ZIP_LOCAL_HEADER_MISMATCH');
    // Stored ZIP entries have no compression; mismatched sizes are invalid.
    if(method===0&&size!==expanded)
      reject('XLSX_ZIP_STORED_SIZE_MISMATCH');
    // Without a data descriptor the local and central headers must agree.
    // With bit 3 set the local header is allowed to contain zero placeholders.
    if(!(flags&0x08)&&(
       uint32(dv,localPos+14)!==uint32(dv,pos+16)||
       uint32(dv,localPos+18)!==size||
       uint32(dv,localPos+22)!==expanded))
      reject('XLSX_ZIP_LOCAL_HEADER_MISMATCH');
    const dataStart=localPos+30+localNameLen+localExtraLen;
    if(dataStart+size>cdStart)reject('XLSX_ZIP_LOCAL_DATA_OUT_OF_BOUNDS');
    const localName=b.subarray(localPos+30,localPos+30+nameLen);
    const centralName=b.subarray(pos+46,pos+46+nameLen);
    if(localName.length!==centralName.length||!localName.every((v,j)=>v===centralName[j]))
      reject('XLSX_ZIP_LOCAL_HEADER_MISMATCH');
    ranges.push([localPos,dataStart+size]);
    pos=next;
  }
  if(pos!==eocd)reject('XLSX_ZIP_CENTRAL_DIRECTORY_INVALID');
  ranges.sort((a,b)=>a[0]-b[0]);
  if(ranges[0][0]!==0)reject('XLSX_ZIP_LOCAL_DATA_OUT_OF_BOUNDS');
  for(let i=1;i<ranges.length;i++){
    if(ranges[i][0]<ranges[i-1][1])reject('XLSX_ZIP_OVERLAPPING_ENTRIES');
  }
  if(!has.has('[content_types].xml')||!has.has('xl/workbook.xml'))
    reject('XLSX_PACKAGE_PARTS_MISSING');
  return {entryCount:count,expandedBytes:total,compressedBytes:compressed};
}
